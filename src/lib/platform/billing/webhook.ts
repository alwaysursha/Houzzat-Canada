/**
 * Stage 6.8B / 6.9 — Stripe webhook reconciliation (payment authority).
 *
 * Neon HTTP-safe: sequential findFirst/findUnique/create/update only.
 * Do not use interactive Prisma transactions or updateMany in this flow.
 *
 * On verified successful initial payment:
 * - reconcile BillingCustomer + Subscription
 * - set ACTIVE or TRIALING only when Stripe state justifies it
 * - preserve Subscription.workspaceId once linked (never force null)
 * - after ACTIVE/TRIALING, invoke provisioning best-effort (failures → FAILED run)
 */

import type { PrismaClient, SubscriptionStatus } from "@prisma/client";
import type Stripe from "stripe";
import { writePlatformAuditEvent } from "@/lib/platform/audit";
import {
  STRIPE_BILLING_AUDIT,
  STRIPE_CHECKOUT_METADATA_KEYS,
  SUBSCRIPTION_ENTITY_TYPE,
} from "@/lib/platform/billing/constants";
import { getStripeClient } from "@/lib/platform/billing/stripe-client";
import { readStripeWebhookSecret } from "@/lib/platform/billing/stripe-env";
import { refundTaxCents } from "@/lib/platform/billing/canadian-tax";
import { checkoutCompletionIsDuplicate } from "@/lib/platform/onboarding/prepared-workspace";
import { tryProvisionAfterBillingActivation } from "@/lib/platform/provisioning";
import { prisma as defaultPrisma } from "@/lib/prisma";

export type StripeWebhookProcessResult = {
  received: true;
  handled: boolean;
  action:
    | "ignored"
    | "checkout_completed"
    | "subscription_synced"
    | "payment_failed"
    | "invoice_paid"
    | "refund_recorded"
    | "credit_note_recorded"
    | "duplicate";
  subscriptionId: string | null;
};

function metaValue(
  metadata: Stripe.Metadata | null | undefined,
  key: string,
): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function mapStripeSubscriptionStatus(
  status: Stripe.Subscription.Status,
): SubscriptionStatus | null {
  switch (status) {
    case "active":
      return "ACTIVE";
    case "trialing":
      return "TRIALING";
    case "past_due":
      return "PAST_DUE";
    case "canceled":
      return "CANCELLED";
    case "incomplete":
    case "incomplete_expired":
      return "INCOMPLETE";
    case "unpaid":
      return "PAST_DUE";
    case "paused":
      return "PAST_DUE";
    default: {
      const _exhaustive: never = status;
      void _exhaustive;
      return null;
    }
  }
}

function unixToDate(seconds: number | null | undefined): Date | null {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000);
}

/**
 * Stripe API 2025+ moved period fields off Subscription in typed shapes.
 * Read defensively when present; otherwise leave null (activation still valid).
 */
function readSubscriptionPeriod(sub: Stripe.Subscription): {
  start: Date | null;
  end: Date | null;
} {
  const raw = sub as Stripe.Subscription & {
    current_period_start?: number | null;
    current_period_end?: number | null;
  };
  return {
    start: unixToDate(raw.current_period_start),
    end: unixToDate(raw.current_period_end),
  };
}

function snapshotObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  return {};
}

function invoiceTaxCents(invoice: Stripe.Invoice): number | null {
  const raw = invoice as Stripe.Invoice & {
    tax?: number | null;
    total_taxes?: Array<{ amount?: number | null }> | null;
  };
  if (Array.isArray(raw.total_taxes)) {
    return raw.total_taxes.reduce((sum, row) => sum + (row.amount ?? 0), 0);
  }
  return typeof raw.tax === "number" ? raw.tax : null;
}

function stripeSubscriptionIdFromInvoice(
  invoice: Stripe.Invoice,
): string | null {
  const details = invoice.parent?.subscription_details;
  if (!details) return null;
  const sub = details.subscription;
  if (typeof sub === "string") return sub;
  return sub?.id ?? null;
}

async function findSubscriptionForCheckout(input: {
  db: PrismaClient;
  session: Stripe.Checkout.Session;
}) {
  const subscriptionId = metaValue(
    input.session.metadata,
    STRIPE_CHECKOUT_METADATA_KEYS.subscriptionId,
  );
  if (subscriptionId) {
    const byId = await input.db.subscription.findUnique({
      where: { id: subscriptionId },
      include: { billingCustomer: true },
    });
    if (byId) return byId;
  }

  if (input.session.id) {
    const bySession = await input.db.subscription.findUnique({
      where: { stripeCheckoutSessionId: input.session.id },
      include: { billingCustomer: true },
    });
    if (bySession) return bySession;
  }

  const offerId = metaValue(
    input.session.metadata,
    STRIPE_CHECKOUT_METADATA_KEYS.offerId,
  );
  if (offerId) {
    return input.db.subscription.findUnique({
      where: { offerId },
      include: { billingCustomer: true },
    });
  }

  return null;
}

async function ensureAuditOnce(input: {
  db: PrismaClient;
  subscriptionId: string;
  action: string;
  summary: string;
  metadata: Record<string, string | number | boolean | null>;
  dedupeKey: string;
}) {
  const existing = await input.db.platformAuditEvent.findFirst({
    where: {
      entityType: SUBSCRIPTION_ENTITY_TYPE,
      entityId: input.subscriptionId,
      action: input.action,
    },
    select: { id: true, metadata: true },
  });
  if (existing) {
    const meta = existing.metadata as { dedupeKey?: string } | null;
    if (meta?.dedupeKey === input.dedupeKey) return { id: existing.id, created: false };
  }

  const row = await writePlatformAuditEvent(
    {
      actorOperatorId: null,
      actorType: "SYSTEM",
      action: input.action,
      entityType: SUBSCRIPTION_ENTITY_TYPE,
      entityId: input.subscriptionId,
      summary: input.summary,
      metadata: {
        ...input.metadata,
        dedupeKey: input.dedupeKey,
      },
    },
    input.db,
  );
  return { id: row.id, created: true };
}

async function reconcileCheckoutCompleted(input: {
  db: PrismaClient;
  stripe: Stripe;
  session: Stripe.Checkout.Session;
}): Promise<StripeWebhookProcessResult> {
  const subscriptionRow = await findSubscriptionForCheckout({
    db: input.db,
    session: input.session,
  });

  if (!subscriptionRow) {
    return {
      received: true,
      handled: false,
      action: "ignored",
      subscriptionId: null,
    };
  }

  const stripeSubscriptionId =
    typeof input.session.subscription === "string"
      ? input.session.subscription
      : input.session.subscription?.id ?? null;

  const stripeCustomerId =
    typeof input.session.customer === "string"
      ? input.session.customer
      : input.session.customer?.id ?? null;

  let stripeSubscription: Stripe.Subscription | null = null;
  if (stripeSubscriptionId) {
    stripeSubscription = await input.stripe.subscriptions.retrieve(
      stripeSubscriptionId,
    );
  }

  const mappedStatus = stripeSubscription
    ? mapStripeSubscriptionStatus(stripeSubscription.status)
    : null;

  // Only elevate to ACTIVE/TRIALING from verified Stripe subscription state.
  // checkout.session.completed alone with unpaid/no subscription must not activate.
  const nextStatus: SubscriptionStatus =
    mappedStatus === "ACTIVE" || mappedStatus === "TRIALING"
      ? mappedStatus
      : subscriptionRow.status === "ACTIVE" ||
          subscriptionRow.status === "TRIALING"
        ? subscriptionRow.status
        : "PENDING_PAYMENT";

  const alreadyComplete = checkoutCompletionIsDuplicate({
    status: subscriptionRow.status,
    stripeSubscriptionId: subscriptionRow.stripeSubscriptionId,
    stripeCheckoutSessionId: subscriptionRow.stripeCheckoutSessionId,
    incomingSubscriptionId: stripeSubscriptionId,
    incomingSessionId: input.session.id,
  });

  if (stripeCustomerId && !subscriptionRow.billingCustomer.stripeCustomerId) {
    await input.db.billingCustomer.update({
      where: { id: subscriptionRow.billingCustomerId },
      data: { stripeCustomerId },
    });
  } else if (
    stripeCustomerId &&
    subscriptionRow.billingCustomer.stripeCustomerId &&
    subscriptionRow.billingCustomer.stripeCustomerId !== stripeCustomerId
  ) {
    // Keep existing stripeCustomerId — do not overwrite mismatched ids silently.
  }

  const period = stripeSubscription
    ? readSubscriptionPeriod(stripeSubscription)
    : { start: null, end: null };

  if (!alreadyComplete) {
    const snapshot = snapshotObject(subscriptionRow.commercialSnapshotJson);
    const confirmedTax = input.session.total_details?.amount_tax;
    await input.db.subscription.update({
      where: { id: subscriptionRow.id },
      data: {
        status: nextStatus,
        ...(typeof confirmedTax === "number"
          ? {
              commercialSnapshotJson: {
                ...snapshot,
                taxConfirmation: {
                  source: "checkout.session.completed",
                  status: "confirmed",
                  taxCents: confirmedTax,
                  subtotalCents: input.session.amount_subtotal ?? null,
                  totalCents: input.session.amount_total ?? null,
                },
              },
            }
          : {}),
        stripeCheckoutSessionId: input.session.id,
        stripeSubscriptionId:
          stripeSubscriptionId ?? subscriptionRow.stripeSubscriptionId,
        currentPeriodStart: period.start,
        currentPeriodEnd: period.end,
        trialEndsAt: unixToDate(stripeSubscription?.trial_end),
        cancelAtPeriodEnd: stripeSubscription?.cancel_at_period_end ?? false,
        // Preserve linked workspace after Stage 6.9 provisioning.
        workspaceId: subscriptionRow.workspaceId,
      },
    });
  }

  await ensureAuditOnce({
    db: input.db,
    subscriptionId: subscriptionRow.id,
    action: STRIPE_BILLING_AUDIT.CHECKOUT_COMPLETED,
    summary: "Stripe Checkout session completed",
    dedupeKey: `checkout_completed:${input.session.id}`,
    metadata: {
      offerId: subscriptionRow.offerId,
      subscriptionId: subscriptionRow.id,
      checkoutSessionId: input.session.id,
      stripeSubscriptionId,
      paymentStatus: input.session.payment_status,
      status: nextStatus,
    },
  });

  if (nextStatus === "ACTIVE" || nextStatus === "TRIALING") {
    await ensureAuditOnce({
      db: input.db,
      subscriptionId: subscriptionRow.id,
      action: STRIPE_BILLING_AUDIT.SUBSCRIPTION_ACTIVATED,
      summary: `Subscription ${nextStatus.toLowerCase()} after verified Stripe payment`,
      dedupeKey: `subscription_activated:${subscriptionRow.id}:${nextStatus}`,
      metadata: {
        offerId: subscriptionRow.offerId,
        subscriptionId: subscriptionRow.id,
        status: nextStatus,
        stripeSubscriptionId,
        workspaceId: subscriptionRow.workspaceId,
      },
    });

    // Provisioning is separate from billing reconcile: failures must not
    // demote Subscription or cause Stripe to retry duplicate workspaces.
    await tryProvisionAfterBillingActivation({
      subscriptionId: subscriptionRow.id,
      prisma: input.db,
    });
  }

  return {
    received: true,
    handled: true,
    action: alreadyComplete ? "duplicate" : "checkout_completed",
    subscriptionId: subscriptionRow.id,
  };
}

async function reconcileSubscriptionUpdated(input: {
  db: PrismaClient;
  stripeSubscription: Stripe.Subscription;
}): Promise<StripeWebhookProcessResult> {
  const subscriptionId = metaValue(
    input.stripeSubscription.metadata,
    STRIPE_CHECKOUT_METADATA_KEYS.subscriptionId,
  );

  let row = subscriptionId
    ? await input.db.subscription.findUnique({
        where: { id: subscriptionId },
      })
    : null;

  if (!row) {
    row = await input.db.subscription.findUnique({
      where: { stripeSubscriptionId: input.stripeSubscription.id },
    });
  }

  if (!row) {
    return {
      received: true,
      handled: false,
      action: "ignored",
      subscriptionId: null,
    };
  }

  const mapped = mapStripeSubscriptionStatus(input.stripeSubscription.status);
  if (!mapped) {
    return {
      received: true,
      handled: false,
      action: "ignored",
      subscriptionId: row.id,
    };
  }

  // Do not demote an ACTIVE/TRIALING sub to PENDING_PAYMENT from incidental updates.
  const nextStatus =
    mapped === "PENDING_PAYMENT" &&
    (row.status === "ACTIVE" || row.status === "TRIALING")
      ? row.status
      : mapped;

  if (
    row.status === nextStatus &&
    row.stripeSubscriptionId === input.stripeSubscription.id
  ) {
    return {
      received: true,
      handled: true,
      action: "duplicate",
      subscriptionId: row.id,
    };
  }

  const period = readSubscriptionPeriod(input.stripeSubscription);

  await input.db.subscription.update({
    where: { id: row.id },
    data: {
      status: nextStatus,
      stripeSubscriptionId: input.stripeSubscription.id,
      currentPeriodStart: period.start,
      currentPeriodEnd: period.end,
      trialEndsAt: unixToDate(input.stripeSubscription.trial_end),
      cancelAtPeriodEnd: input.stripeSubscription.cancel_at_period_end,
      canceledAt: unixToDate(input.stripeSubscription.canceled_at),
      // Preserve linked workspace after Stage 6.9 provisioning.
      workspaceId: row.workspaceId,
    },
  });

  if (nextStatus === "ACTIVE" || nextStatus === "TRIALING") {
    await ensureAuditOnce({
      db: input.db,
      subscriptionId: row.id,
      action: STRIPE_BILLING_AUDIT.SUBSCRIPTION_ACTIVATED,
      summary: `Subscription ${nextStatus.toLowerCase()} after Stripe subscription sync`,
      dedupeKey: `subscription_activated:${row.id}:${nextStatus}`,
      metadata: {
        offerId: row.offerId,
        subscriptionId: row.id,
        status: nextStatus,
        stripeSubscriptionId: input.stripeSubscription.id,
        workspaceId: row.workspaceId,
      },
    });

    await tryProvisionAfterBillingActivation({
      subscriptionId: row.id,
      prisma: input.db,
    });
  }

  return {
    received: true,
    handled: true,
    action: "subscription_synced",
    subscriptionId: row.id,
  };
}

async function reconcilePaymentFailed(input: {
  db: PrismaClient;
  invoice: Stripe.Invoice;
}): Promise<StripeWebhookProcessResult> {
  const stripeSubscriptionId = stripeSubscriptionIdFromInvoice(input.invoice);

  if (!stripeSubscriptionId) {
    return {
      received: true,
      handled: false,
      action: "ignored",
      subscriptionId: null,
    };
  }

  const row = await input.db.subscription.findUnique({
    where: { stripeSubscriptionId },
  });
  if (!row) {
    return {
      received: true,
      handled: false,
      action: "ignored",
      subscriptionId: null,
    };
  }

  const nextStatus: SubscriptionStatus =
    row.status === "PENDING_PAYMENT" ? "INCOMPLETE" : "PAST_DUE";

  if (row.status !== "ACTIVE" && row.status !== "TRIALING") {
    await input.db.subscription.update({
      where: { id: row.id },
      data: {
        status: nextStatus,
        pastDueSince: row.pastDueSince ?? new Date(),
        workspaceId: row.workspaceId,
      },
    });
  } else {
    await input.db.subscription.update({
      where: { id: row.id },
      data: {
        status: "PAST_DUE",
        pastDueSince: row.pastDueSince ?? new Date(),
        workspaceId: row.workspaceId,
      },
    });
  }

  await ensureAuditOnce({
    db: input.db,
    subscriptionId: row.id,
    action: STRIPE_BILLING_AUDIT.PAYMENT_FAILED,
    summary: "Stripe invoice payment failed",
    dedupeKey: `payment_failed:${input.invoice.id}`,
    metadata: {
      offerId: row.offerId ?? null,
      subscriptionId: row.id,
      invoiceId: input.invoice.id ?? null,
      stripeSubscriptionId,
    },
  });

  return {
    received: true,
    handled: true,
    action: "payment_failed",
    subscriptionId: row.id,
  };
}

async function reconcileInvoicePaid(input: {
  db: PrismaClient;
  invoice: Stripe.Invoice;
}): Promise<StripeWebhookProcessResult> {
  const invoiceId = input.invoice.id ?? null;
  const stripeSubscriptionId = stripeSubscriptionIdFromInvoice(input.invoice);
  if (!invoiceId || !stripeSubscriptionId) {
    return { received: true, handled: false, action: "ignored", subscriptionId: null };
  }
  const row = await input.db.subscription.findUnique({
    where: { stripeSubscriptionId },
  });
  if (!row) {
    return { received: true, handled: false, action: "ignored", subscriptionId: null };
  }
  const snapshot = snapshotObject(row.commercialSnapshotJson);
  const estimated = snapshot.tax;
  const estimatedTax =
    estimated && typeof estimated === "object" && !Array.isArray(estimated)
      ? (estimated as { taxCents?: unknown }).taxCents
      : null;
  const chargedTax = invoiceTaxCents(input.invoice);
  const nextSnapshot = {
    ...snapshot,
    taxConfirmation: {
      source: "invoice.paid",
      invoiceId,
      subtotalCents: input.invoice.subtotal ?? null,
      taxCents: chargedTax,
      totalCents: input.invoice.total ?? null,
      estimatedTaxCents: typeof estimatedTax === "number" ? estimatedTax : null,
      matchesEstimate:
        typeof estimatedTax === "number" && chargedTax != null
          ? chargedTax === estimatedTax
          : null,
    },
  };
  await input.db.subscription.update({
    where: { id: row.id },
    data: { commercialSnapshotJson: nextSnapshot },
  });
  await ensureAuditOnce({
    db: input.db,
    subscriptionId: row.id,
    action: STRIPE_BILLING_AUDIT.INVOICE_PAID,
    summary: "Stripe invoice paid",
    dedupeKey: `invoice_paid:${invoiceId}`,
    metadata: {
      invoiceId,
      subtotalCents: input.invoice.subtotal ?? null,
      taxCents: chargedTax,
      totalCents: input.invoice.total ?? null,
      estimatedTaxCents: typeof estimatedTax === "number" ? estimatedTax : null,
    },
  });
  return {
    received: true,
    handled: true,
    action: "invoice_paid",
    subscriptionId: row.id,
  };
}

function legacyChargeInvoiceId(charge: Stripe.Charge): string | null {
  const chargeInvoice = (
    charge as Stripe.Charge & {
      invoice?: string | { id?: string | null } | null;
    }
  ).invoice;
  if (typeof chargeInvoice === "string" && chargeInvoice.length > 0) {
    return chargeInvoice;
  }
  if (chargeInvoice && typeof chargeInvoice === "object" && chargeInvoice.id) {
    return chargeInvoice.id;
  }
  return null;
}

/**
 * Current Stripe charges no longer include `invoice`. Keep the legacy field
 * for older webhook payloads, then resolve the invoice through Invoice Payments.
 */
async function invoiceIdForCharge(input: {
  stripe: Stripe;
  charge: Stripe.Charge;
}): Promise<string | null> {
  const legacy = legacyChargeInvoiceId(input.charge);
  if (legacy) return legacy;
  const paymentIntent = input.charge.payment_intent;
  const paymentIntentId =
    typeof paymentIntent === "string" ? paymentIntent : paymentIntent?.id ?? null;
  if (!paymentIntentId) return null;
  const payments = await input.stripe.invoicePayments.list({
    payment: { type: "payment_intent", payment_intent: paymentIntentId },
    limit: 1,
  });
  const invoice = payments.data[0]?.invoice;
  if (!invoice) return null;
  if (typeof invoice === "string") return invoice;
  return typeof invoice.id === "string" ? invoice.id : null;
}

function creditNoteTaxCents(creditNote: Stripe.CreditNote): number | null {
  const raw = creditNote as Stripe.CreditNote & {
    tax?: number | null;
    total_taxes?: Array<{ amount?: number | null }> | null;
  };
  if (Array.isArray(raw.total_taxes)) {
    return raw.total_taxes.reduce((sum, row) => sum + (row.amount ?? 0), 0);
  }
  return typeof raw.tax === "number" ? raw.tax : null;
}

async function subscriptionIdForStripeInvoice(input: {
  db: PrismaClient;
  stripe: Stripe;
  invoiceId: string | null;
}): Promise<{ subscriptionId: string; snapshot: Record<string, unknown> } | null> {
  if (!input.invoiceId) return null;
  const invoice = await input.stripe.invoices.retrieve(input.invoiceId);
  const stripeSubscriptionId = stripeSubscriptionIdFromInvoice(invoice);
  if (!stripeSubscriptionId) return null;
  const row = await input.db.subscription.findUnique({
    where: { stripeSubscriptionId },
  });
  if (!row) return null;
  return { subscriptionId: row.id, snapshot: snapshotObject(row.commercialSnapshotJson) };
}

async function reconcileRefund(input: {
  db: PrismaClient;
  stripe: Stripe;
  charge: Stripe.Charge;
}): Promise<StripeWebhookProcessResult> {
  const invoiceId = await invoiceIdForCharge({
    stripe: input.stripe,
    charge: input.charge,
  });
  const linked = await subscriptionIdForStripeInvoice({
    db: input.db,
    stripe: input.stripe,
    invoiceId,
  });
  if (!linked) {
    return { received: true, handled: false, action: "ignored", subscriptionId: null };
  }
  const tax = linked.snapshot.tax;
  const taxRecord =
    tax && typeof tax === "object" && !Array.isArray(tax)
      ? (tax as { taxCents?: unknown; firstGrossCents?: unknown })
      : null;
  const taxCents = typeof taxRecord?.taxCents === "number" ? taxRecord.taxCents : 0;
  const grossCents =
    typeof taxRecord?.firstGrossCents === "number" ? taxRecord.firstGrossCents : 0;
  const refundedTax = refundTaxCents({
    refundCents: input.charge.amount_refunded,
    grossCents,
    taxCents,
  });
  await ensureAuditOnce({
    db: input.db,
    subscriptionId: linked.subscriptionId,
    action: STRIPE_BILLING_AUDIT.REFUND_RECORDED,
    summary: "Stripe refund recorded",
    dedupeKey: `refund:${input.charge.id}:${input.charge.amount_refunded}`,
    metadata: {
      chargeId: input.charge.id,
      refundedCents: input.charge.amount_refunded,
      refundedTaxCents: refundedTax,
      invoiceId,
    },
  });
  return {
    received: true,
    handled: true,
    action: "refund_recorded",
    subscriptionId: linked.subscriptionId,
  };
}

async function reconcileCreditNote(input: {
  db: PrismaClient;
  stripe: Stripe;
  creditNote: Stripe.CreditNote;
}): Promise<StripeWebhookProcessResult> {
  const invoiceId =
    typeof input.creditNote.invoice === "string"
      ? input.creditNote.invoice
      : input.creditNote.invoice?.id ?? null;
  const linked = await subscriptionIdForStripeInvoice({
    db: input.db,
    stripe: input.stripe,
    invoiceId,
  });
  if (!linked) {
    return { received: true, handled: false, action: "ignored", subscriptionId: null };
  }
  await ensureAuditOnce({
    db: input.db,
    subscriptionId: linked.subscriptionId,
    action: STRIPE_BILLING_AUDIT.CREDIT_NOTE_RECORDED,
    summary: "Stripe credit note recorded",
    dedupeKey: `credit_note:${input.creditNote.id}`,
    metadata: {
      creditNoteId: input.creditNote.id,
      amountCents: input.creditNote.amount,
      taxCents: creditNoteTaxCents(input.creditNote),
      invoiceId,
    },
  });
  return {
    received: true,
    handled: true,
    action: "credit_note_recorded",
    subscriptionId: linked.subscriptionId,
  };
}

/**
 * Verify signature and process a Stripe webhook payload.
 * Browser success redirects must never call this path's activation logic.
 */
export async function processStripeWebhook(input: {
  rawBody: string | Buffer;
  signatureHeader: string | null;
  prisma?: PrismaClient;
  stripe?: Stripe;
  webhookSecret?: string;
}): Promise<StripeWebhookProcessResult> {
  const db = input.prisma ?? defaultPrisma;
  const stripe = input.stripe ?? getStripeClient();
  const secret = input.webhookSecret ?? readStripeWebhookSecret();

  if (!input.signatureHeader) {
    throw new Error("Missing Stripe-Signature header");
  }

  const event = stripe.webhooks.constructEvent(
    input.rawBody,
    input.signatureHeader,
    secret,
  );

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      return reconcileCheckoutCompleted({ db, stripe, session });
    }
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;
      return reconcileCheckoutCompleted({ db, stripe, session });
    }
    case "customer.subscription.updated":
    case "customer.subscription.created":
    case "customer.subscription.deleted": {
      const stripeSubscription = event.data.object as Stripe.Subscription;
      return reconcileSubscriptionUpdated({ db, stripeSubscription });
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      return reconcilePaymentFailed({ db, invoice });
    }
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      return reconcileInvoicePaid({ db, invoice });
    }
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      return reconcileRefund({ db, stripe, charge });
    }
    case "credit_note.created": {
      const creditNote = event.data.object as Stripe.CreditNote;
      return reconcileCreditNote({ db, stripe, creditNote });
    }
    default:
      return {
        received: true,
        handled: false,
        action: "ignored",
        subscriptionId: null,
      };
  }
}

/**
 * Intentionally NOT exported for public browser success routes.
 * Activation must only run via verified webhooks.
 */
export const BROWSER_SUCCESS_CANNOT_ACTIVATE =
  "Browser Checkout success redirect is not payment authority" as const;
