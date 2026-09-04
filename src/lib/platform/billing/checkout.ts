/**
 * Stage 6.8B — create Stripe Embedded Checkout for an ACCEPTED private offer.
 *
 * Neon HTTP-safe: sequential findFirst/findUnique/create/update only.
 * Do not use interactive Prisma transactions or updateMany in this flow.
 *
 * Does NOT create Workspace, entitlements, seat quota, or ProvisioningRun.
 */

import type { BillingCadence, PlanCode, Prisma, PrismaClient } from "@prisma/client";
import type Stripe from "stripe";
import { writePlatformAuditEvent } from "@/lib/platform/audit";
import {
  STRIPE_BILLING_AUDIT,
  STRIPE_CHECKOUT_METADATA_KEYS,
  STRIPE_CHECKOUT_STATUS_PATH,
  SUBSCRIPTION_ENTITY_TYPE,
} from "@/lib/platform/billing/constants";
import {
  computeAcceptedCheckoutAmounts,
  CheckoutAmountError,
} from "@/lib/platform/billing/checkout-amounts";
import { houzzatProCheckoutBrandingSettings } from "@/lib/platform/billing/checkout-branding";
import {
  evaluateAcceptedOfferCheckoutEligibility,
  isPaidSubscriptionStatus,
} from "@/lib/platform/billing/checkout-eligibility";
import { getStripeClient } from "@/lib/platform/billing/stripe-client";
import { resolvePlanEntitlementProfile } from "@/lib/platform/entitlements/profiles";
import { commercialTermsHashFromOfferRow } from "@/lib/platform/offers/commercial-terms-hash";
import { hashCommercialOfferToken } from "@/lib/platform/offers/token";
import { prisma as defaultPrisma } from "@/lib/prisma";

export class OfferCheckoutPublicError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, code: string, status = 400) {
    super(message);
    this.name = "OfferCheckoutPublicError";
    this.status = status;
    this.code = code;
  }
}

export type CreateCheckoutForAcceptedOfferInput = {
  rawToken: string;
  /** Absolute origin for success/cancel return URLs (HouzzatPRO platform). */
  returnOrigin: string;
  prisma?: PrismaClient;
  /** Optional injected Stripe client (tests). */
  stripe?: Stripe;
};

export type CreateCheckoutForAcceptedOfferResult = {
  /** Stripe Checkout Session client_secret for Embedded Checkout mount. */
  clientSecret: string;
  subscriptionId: string;
  offerId: string;
  reusedSubscription: boolean;
  reusedCheckoutSession: boolean;
};

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002",
  );
}

function cadenceToStripeInterval(
  cadence: BillingCadence,
): "month" | "year" {
  switch (cadence) {
    case "MONTHLY":
      return "month";
    case "ANNUAL":
      return "year";
    default: {
      const _exhaustive: never = cadence;
      void _exhaustive;
      throw new OfferCheckoutPublicError(
        "Unsupported billing cadence.",
        "INVALID_CADENCE",
        500,
      );
    }
  }
}

function normalizeReturnOrigin(raw: string): string {
  const trimmed = raw.trim().replace(/\/$/, "");
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    throw new OfferCheckoutPublicError(
      "Invalid return origin.",
      "INVALID_ORIGIN",
      500,
    );
  }
  return trimmed;
}

function buildCommercialSnapshot(input: {
  offerId: string;
  acceptanceId: string;
  commercialTermsHash: string;
  planCode: PlanCode;
  billingCadence: BillingCadence;
  currency: string;
  negotiatedRecurringAmountCents: number;
  setupFeeCents: number;
  includedSeats: number;
  additionalSeats: number;
  trialDays: number | null;
  recurringTotalCents: number;
  oneTimeTotalCents: number;
  lineItems: Array<{
    kind: string;
    code: string;
    description: string;
    amountCents: number;
    isRecurring: boolean;
    quantity: number;
    sortOrder: number;
  }>;
}): Prisma.InputJsonValue {
  return {
    stage: "6.8B",
    offerId: input.offerId,
    acceptanceId: input.acceptanceId,
    commercialTermsHash: input.commercialTermsHash,
    planCode: input.planCode,
    billingCadence: input.billingCadence,
    currency: input.currency,
    negotiatedRecurringAmountCents: input.negotiatedRecurringAmountCents,
    setupFeeCents: input.setupFeeCents,
    includedSeats: input.includedSeats,
    additionalSeats: input.additionalSeats,
    trialDays: input.trialDays,
    recurringTotalCents: input.recurringTotalCents,
    oneTimeTotalCents: input.oneTimeTotalCents,
    lineItems: input.lineItems,
  };
}

async function ensureBillingCustomer(input: {
  db: PrismaClient;
  stripe: Stripe;
  prospectId: string;
  email: string;
}): Promise<{ id: string; stripeCustomerId: string }> {
  let customer = await input.db.billingCustomer.findFirst({
    where: { prospectId: input.prospectId },
    select: {
      id: true,
      email: true,
      stripeCustomerId: true,
    },
  });

  if (!customer) {
    try {
      customer = await input.db.billingCustomer.create({
        data: {
          prospectId: input.prospectId,
          email: input.email,
          source: "STRIPE",
          workspaceId: null,
          stripeCustomerId: null,
        },
        select: {
          id: true,
          email: true,
          stripeCustomerId: true,
        },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      customer = await input.db.billingCustomer.findFirst({
        where: { prospectId: input.prospectId },
        select: {
          id: true,
          email: true,
          stripeCustomerId: true,
        },
      });
      if (!customer) throw error;
    }
  }

  if (customer.stripeCustomerId) {
    return { id: customer.id, stripeCustomerId: customer.stripeCustomerId };
  }

  const stripeCustomer = await input.stripe.customers.create({
    email: input.email,
    metadata: {
      prospectId: input.prospectId,
      billingCustomerId: customer.id,
    },
  });

  const updated = await input.db.billingCustomer.update({
    where: { id: customer.id },
    data: { stripeCustomerId: stripeCustomer.id },
    select: { id: true, stripeCustomerId: true },
  });

  if (!updated.stripeCustomerId) {
    throw new OfferCheckoutPublicError(
      "Unable to prepare billing customer.",
      "BILLING_CUSTOMER_ERROR",
      500,
    );
  }

  return { id: updated.id, stripeCustomerId: updated.stripeCustomerId };
}

async function ensurePendingSubscription(input: {
  db: PrismaClient;
  offerId: string;
  billingCustomerId: string;
  planCode: PlanCode;
  billingCadence: BillingCadence;
  currency: string;
  recurringAmountCents: number;
  setupFeeCents: number;
  includedSeats: number;
  additionalSeats: number;
  commercialSnapshot: Prisma.InputJsonValue;
}): Promise<{ id: string; reused: boolean; stripeCheckoutSessionId: string | null }> {
  const existing = await input.db.subscription.findUnique({
    where: { offerId: input.offerId },
    select: {
      id: true,
      status: true,
      stripeCheckoutSessionId: true,
      workspaceId: true,
    },
  });

  if (existing) {
    if (isPaidSubscriptionStatus(existing.status)) {
      throw new OfferCheckoutPublicError(
        "Subscription payment for this offer is already complete.",
        "ALREADY_PAID",
        409,
      );
    }
    if (existing.workspaceId) {
      throw new OfferCheckoutPublicError(
        "This offer is already linked to a workspace.",
        "WORKSPACE_ALREADY_LINKED",
        409,
      );
    }

    const reconciled = await input.db.subscription.update({
      where: { id: existing.id },
      data: {
        billingCustomerId: input.billingCustomerId,
        source: "STRIPE",
        status: "PENDING_PAYMENT",
        planCode: input.planCode,
        entitlementProfileCode: resolvePlanEntitlementProfile(input.planCode).code,
        billingCadence: input.billingCadence,
        currency: input.currency,
        recurringAmountCents: input.recurringAmountCents,
        setupFeeCents: input.setupFeeCents,
        includedSeats: input.includedSeats,
        additionalSeats: input.additionalSeats,
        commercialSnapshotJson: input.commercialSnapshot,
        workspaceId: null,
      },
      select: {
        id: true,
        stripeCheckoutSessionId: true,
      },
    });

    return {
      id: reconciled.id,
      reused: true,
      stripeCheckoutSessionId: reconciled.stripeCheckoutSessionId,
    };
  }

  try {
    const created = await input.db.subscription.create({
      data: {
        offerId: input.offerId,
        billingCustomerId: input.billingCustomerId,
        workspaceId: null,
        source: "STRIPE",
        status: "PENDING_PAYMENT",
        planCode: input.planCode,
        entitlementProfileCode: resolvePlanEntitlementProfile(input.planCode).code,
        billingCadence: input.billingCadence,
        currency: input.currency,
        recurringAmountCents: input.recurringAmountCents,
        setupFeeCents: input.setupFeeCents,
        includedSeats: input.includedSeats,
        additionalSeats: input.additionalSeats,
        commercialSnapshotJson: input.commercialSnapshot,
      },
      select: {
        id: true,
        stripeCheckoutSessionId: true,
      },
    });
    return {
      id: created.id,
      reused: false,
      stripeCheckoutSessionId: created.stripeCheckoutSessionId,
    };
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const raced = await input.db.subscription.findUnique({
      where: { offerId: input.offerId },
      select: {
        id: true,
        status: true,
        stripeCheckoutSessionId: true,
        workspaceId: true,
      },
    });
    if (!raced) throw error;
    if (isPaidSubscriptionStatus(raced.status)) {
      throw new OfferCheckoutPublicError(
        "Subscription payment for this offer is already complete.",
        "ALREADY_PAID",
        409,
      );
    }
    return {
      id: raced.id,
      reused: true,
      stripeCheckoutSessionId: raced.stripeCheckoutSessionId,
    };
  }
}

async function ensureCheckoutCreatedAudit(input: {
  db: PrismaClient;
  subscriptionId: string;
  offerId: string;
  prospectId: string;
  checkoutSessionId: string;
}) {
  const existing = await input.db.platformAuditEvent.findFirst({
    where: {
      entityType: SUBSCRIPTION_ENTITY_TYPE,
      entityId: input.subscriptionId,
      action: STRIPE_BILLING_AUDIT.CHECKOUT_CREATED,
    },
    select: { id: true, metadata: true },
  });
  if (existing) {
    const meta = existing.metadata as { checkoutSessionId?: string } | null;
    if (meta?.checkoutSessionId === input.checkoutSessionId) return existing.id;
  }

  const row = await writePlatformAuditEvent(
    {
      actorOperatorId: null,
      actorType: "SYSTEM",
      action: STRIPE_BILLING_AUDIT.CHECKOUT_CREATED,
      entityType: SUBSCRIPTION_ENTITY_TYPE,
      entityId: input.subscriptionId,
      summary: "Stripe Checkout session created for accepted offer",
      metadata: {
        offerId: input.offerId,
        subscriptionId: input.subscriptionId,
        prospectId: input.prospectId,
        checkoutSessionId: input.checkoutSessionId,
      },
    },
    input.db,
  );
  return row.id;
}

/**
 * Create (or reuse) Stripe Checkout for an accepted private offer token.
 */
export async function createCheckoutForAcceptedOffer(
  input: CreateCheckoutForAcceptedOfferInput,
): Promise<CreateCheckoutForAcceptedOfferResult> {
  const db = input.prisma ?? defaultPrisma;
  const stripe = input.stripe ?? getStripeClient();
  const returnOrigin = normalizeReturnOrigin(input.returnOrigin);

  const raw = input.rawToken?.trim();
  if (!raw || raw.length < 16 || raw.length > 256) {
    throw new OfferCheckoutPublicError(
      "This private offer is no longer available.",
      "OFFER_UNAVAILABLE",
      404,
    );
  }

  const tokenHash = hashCommercialOfferToken(raw);
  const token = await db.commercialOfferToken.findUnique({
    where: { tokenHash },
    include: {
      offer: {
        include: {
          lineItems: { orderBy: { sortOrder: "asc" } },
          acceptance: true,
          subscription: {
            select: { id: true, status: true, stripeCheckoutSessionId: true },
          },
          prospect: {
            select: { id: true, email: true },
          },
        },
      },
    },
  });

  if (!token || token.revokedAt) {
    throw new OfferCheckoutPublicError(
      "This private offer is no longer available.",
      "OFFER_UNAVAILABLE",
      404,
    );
  }

  const offer = token.offer;
  if (!offer || offer.status === "CANCELLED") {
    throw new OfferCheckoutPublicError(
      "This private offer is no longer available.",
      "OFFER_UNAVAILABLE",
      404,
    );
  }

  const eligibility = evaluateAcceptedOfferCheckoutEligibility({
    offerStatus: offer.status,
    acceptance: offer.acceptance
      ? { commercialTermsHash: offer.acceptance.commercialTermsHash }
      : null,
    offerForHash: {
      id: offer.id,
      version: offer.version,
      planCode: offer.planCode,
      billingCadence: offer.billingCadence,
      currency: offer.currency,
      negotiatedRecurringAmountCents: offer.negotiatedRecurringAmountCents,
      setupFeeCents: offer.setupFeeCents,
      includedSeats: offer.includedSeats,
      additionalSeats: offer.additionalSeats,
      trialDays: offer.trialDays,
      proposedStartDate: offer.proposedStartDate,
      expiresAt: offer.expiresAt,
      lineItems: offer.lineItems,
    },
    lineItems: offer.lineItems,
    existingSubscriptionStatus: offer.subscription?.status ?? null,
  });

  if (!eligibility.eligible) {
    switch (eligibility.reason) {
      case "already_paid":
        throw new OfferCheckoutPublicError(
          "Subscription payment for this offer is already complete.",
          "ALREADY_PAID",
          409,
        );
      case "hash_mismatch":
        throw new OfferCheckoutPublicError(
          "This private offer is no longer available.",
          "OFFER_UNAVAILABLE",
          404,
        );
      case "acceptance_missing":
      case "not_accepted":
      case "unavailable":
      case "invalid_amounts":
        throw new OfferCheckoutPublicError(
          "This private offer is no longer available.",
          "OFFER_UNAVAILABLE",
          404,
        );
      case "eligible":
        break;
      default: {
        const _exhaustive: never = eligibility.reason;
        void _exhaustive;
        throw new OfferCheckoutPublicError(
          "This private offer is no longer available.",
          "OFFER_UNAVAILABLE",
          404,
        );
      }
    }
  }

  if (!offer.acceptance) {
    throw new OfferCheckoutPublicError(
      "This private offer is no longer available.",
      "OFFER_UNAVAILABLE",
      404,
    );
  }

  let amounts;
  try {
    amounts = computeAcceptedCheckoutAmounts(offer.lineItems);
  } catch (error) {
    if (error instanceof CheckoutAmountError) {
      throw new OfferCheckoutPublicError(
        "This private offer is no longer available.",
        "OFFER_UNAVAILABLE",
        404,
      );
    }
    throw error;
  }

  const commercialTermsHash = commercialTermsHashFromOfferRow({
    id: offer.id,
    version: offer.version,
    planCode: offer.planCode,
    billingCadence: offer.billingCadence,
    currency: offer.currency,
    negotiatedRecurringAmountCents: offer.negotiatedRecurringAmountCents,
    setupFeeCents: offer.setupFeeCents,
    includedSeats: offer.includedSeats,
    additionalSeats: offer.additionalSeats,
    trialDays: offer.trialDays,
    proposedStartDate: offer.proposedStartDate,
    expiresAt: offer.expiresAt,
    lineItems: offer.lineItems,
  });

  const billingEmail =
    offer.acceptance.acceptedEmail.trim().toLowerCase() ||
    offer.prospect.email.trim().toLowerCase();

  const billingCustomer = await ensureBillingCustomer({
    db,
    stripe,
    prospectId: offer.prospectId,
    email: billingEmail,
  });

  const commercialSnapshot = buildCommercialSnapshot({
    offerId: offer.id,
    acceptanceId: offer.acceptance.id,
    commercialTermsHash,
    planCode: offer.planCode,
    billingCadence: offer.billingCadence,
    currency: offer.currency,
    negotiatedRecurringAmountCents: offer.negotiatedRecurringAmountCents,
    setupFeeCents: offer.setupFeeCents,
    includedSeats: offer.includedSeats,
    additionalSeats: offer.additionalSeats,
    trialDays: offer.trialDays,
    recurringTotalCents: amounts.recurringTotalCents,
    oneTimeTotalCents: amounts.oneTimeTotalCents,
    lineItems: offer.lineItems.map((item) => ({
      kind: item.kind,
      code: item.code,
      description: item.description,
      amountCents: item.amountCents,
      isRecurring: item.isRecurring,
      quantity: item.quantity,
      sortOrder: item.sortOrder,
    })),
  });

  const subscription = await ensurePendingSubscription({
    db,
    offerId: offer.id,
    billingCustomerId: billingCustomer.id,
    planCode: offer.planCode,
    billingCadence: offer.billingCadence,
    currency: offer.currency,
    recurringAmountCents: amounts.recurringTotalCents,
    setupFeeCents: offer.setupFeeCents,
    includedSeats: offer.includedSeats,
    additionalSeats: offer.additionalSeats,
    commercialSnapshot,
  });

  // Reuse an open embedded Checkout Session when possible (idempotent UX).
  if (subscription.stripeCheckoutSessionId) {
    try {
      const existingSession = await stripe.checkout.sessions.retrieve(
        subscription.stripeCheckoutSessionId,
      );
      if (
        existingSession.status === "open" &&
        existingSession.ui_mode === "embedded" &&
        typeof existingSession.client_secret === "string" &&
        existingSession.client_secret.length > 0
      ) {
        return {
          clientSecret: existingSession.client_secret,
          subscriptionId: subscription.id,
          offerId: offer.id,
          reusedSubscription: subscription.reused,
          reusedCheckoutSession: true,
        };
      }
    } catch {
      // Fall through — create a fresh session.
    }
  }

  const interval = cadenceToStripeInterval(offer.billingCadence);
  const currency = offer.currency.toLowerCase();

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    {
      quantity: 1,
      price_data: {
        currency,
        unit_amount: amounts.recurringTotalCents,
        recurring: { interval },
        product_data: {
          name: `HouzzatPRO ${offer.planCode}`,
          description: `${offer.billingCadence.toLowerCase()} subscription`,
        },
      },
    },
  ];

  if (amounts.oneTimeTotalCents > 0) {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency,
        unit_amount: amounts.oneTimeTotalCents,
        product_data: {
          name: "HouzzatPRO setup and one-time fees",
        },
      },
    });
  }

  const returnUrl = `${returnOrigin}${STRIPE_CHECKOUT_STATUS_PATH}?session_id={CHECKOUT_SESSION_ID}`;

  const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData =
    {
      metadata: {
        [STRIPE_CHECKOUT_METADATA_KEYS.offerId]: offer.id,
        [STRIPE_CHECKOUT_METADATA_KEYS.subscriptionId]: subscription.id,
        [STRIPE_CHECKOUT_METADATA_KEYS.prospectId]: offer.prospectId,
      },
    };

  if (offer.trialDays != null && offer.trialDays > 0) {
    subscriptionData.trial_period_days = offer.trialDays;
  }

  const createParams = {
    mode: "subscription" as const,
    ui_mode: "embedded" as const,
    customer: billingCustomer.stripeCustomerId,
    client_reference_id: subscription.id,
    return_url: returnUrl,
    line_items: lineItems,
    subscription_data: subscriptionData,
    metadata: {
      [STRIPE_CHECKOUT_METADATA_KEYS.offerId]: offer.id,
      [STRIPE_CHECKOUT_METADATA_KEYS.subscriptionId]: subscription.id,
      [STRIPE_CHECKOUT_METADATA_KEYS.prospectId]: offer.prospectId,
    },
    // Blend Stripe embed with HouzzatPRO palette (same approach as theminiwear).
    branding_settings: houzzatProCheckoutBrandingSettings(),
  };

  const session = await stripe.checkout.sessions.create(
    createParams as Stripe.Checkout.SessionCreateParams,
  );

  if (!session.client_secret) {
    throw new OfferCheckoutPublicError(
      "Unable to start Checkout right now. Please try again shortly.",
      "CHECKOUT_SESSION_ERROR",
      502,
    );
  }

  await db.subscription.update({
    where: { id: subscription.id },
    data: {
      stripeCheckoutSessionId: session.id,
      status: "PENDING_PAYMENT",
      workspaceId: null,
    },
  });

  await ensureCheckoutCreatedAudit({
    db,
    subscriptionId: subscription.id,
    offerId: offer.id,
    prospectId: offer.prospectId,
    checkoutSessionId: session.id,
  });

  return {
    clientSecret: session.client_secret,
    subscriptionId: subscription.id,
    offerId: offer.id,
    reusedSubscription: subscription.reused,
    reusedCheckoutSession: false,
  };
}
