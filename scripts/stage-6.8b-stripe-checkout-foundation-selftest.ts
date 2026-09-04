/**
 * Stage 6.8B — Stripe Checkout foundation selftest.
 * Run: pnpm stage-6.8b-stripe-checkout-foundation:selftest
 *
 * No production Stripe calls. No Workspace provisioning. Fake Prisma + Stripe.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BROWSER_SUCCESS_CANNOT_ACTIVATE,
  CheckoutAmountError,
  computeAcceptedCheckoutAmounts,
  createCheckoutForAcceptedOffer,
  evaluateAcceptedOfferCheckoutEligibility,
  OfferCheckoutPublicError,
  processStripeWebhook,
  STRIPE_BILLING_AUDIT,
} from "../src/lib/platform/billing";
import {
  commercialTermsHashFromOfferRow,
  createCommercialOfferRawToken,
  hashCommercialOfferToken,
  resolveOfferCommercialTerms,
} from "../src/lib/platform/offers";
import { COMMERCIAL_OFFER_AUDIT } from "../src/lib/platform/offers/constants";

const root = process.cwd();
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

type FakeLine = {
  id: string;
  offerId: string;
  kind: string;
  code: string;
  description: string;
  amountCents: number;
  isRecurring: boolean;
  quantity: number;
  sortOrder: number;
};

type FakeState = {
  prospects: Map<string, Record<string, unknown>>;
  offers: Map<string, Record<string, unknown>>;
  lines: FakeLine[];
  tokens: Array<{
    id: string;
    offerId: string;
    tokenHash: string;
    expiresAt: Date;
    revokedAt: Date | null;
  }>;
  acceptances: Map<string, Record<string, unknown>>;
  billingCustomers: Map<string, Record<string, unknown>>;
  subscriptions: Map<string, Record<string, unknown>>;
  audits: Array<{ action: string; entityId: string; metadata: unknown }>;
  workspaces: number;
  entitlements: number;
  seatQuotas: number;
  provisioningRuns: number;
  nextId: number;
  stripeCustomers: number;
  stripeSessions: Array<Record<string, unknown>>;
  stripeSubscriptions: Map<string, Record<string, unknown>>;
};

function emptyState(): FakeState {
  return {
    prospects: new Map(),
    offers: new Map(),
    lines: [],
    tokens: [],
    acceptances: new Map(),
    billingCustomers: new Map(),
    subscriptions: new Map(),
    audits: [],
    workspaces: 0,
    entitlements: 0,
    seatQuotas: 0,
    provisioningRuns: 0,
    nextId: 1,
    stripeCustomers: 0,
    stripeSessions: [],
    stripeSubscriptions: new Map(),
  };
}

function seedAcceptedOffer(
  state: FakeState,
  opts?: {
    planCode?: "SOLO" | "TEAM" | "BROKERAGE";
    cadence?: "MONTHLY" | "ANNUAL";
    additionalSeats?: number;
    setupFeeCents?: number;
    negotiatedRecurringAmountCents?: number;
    addOns?: Array<{ code: "CUSTOM_CONSUMER_APP"; amountCents?: number }>;
    status?: string;
    withAcceptance?: boolean;
  },
) {
  const planCode = opts?.planCode ?? "TEAM";
  const cadence = opts?.cadence ?? "MONTHLY";
  const additionalSeats = opts?.additionalSeats ?? 0;
  const terms = resolveOfferCommercialTerms({
    planCode,
    billingCadence: cadence,
    negotiatedRecurringAmountCents: opts?.negotiatedRecurringAmountCents,
    setupFeeCents: opts?.setupFeeCents ?? 0,
    additionalSeats,
    addOns: opts?.addOns ?? [],
  });

  const prospectId = `pros_${state.nextId++}`;
  const offerId = `off_${state.nextId++}`;
  const raw = createCommercialOfferRawToken();

  state.prospects.set(prospectId, {
    id: prospectId,
    email: "alex@brokerage.test",
    contactName: "Alex Rivera",
    businessName: "Rivera Realty",
    brokerageName: "Rivera Brokerage",
    status: "WON",
  });

  const offer = {
    id: offerId,
    prospectId,
    status: opts?.status ?? "ACCEPTED",
    planCode: terms.planCode,
    billingCadence: terms.billingCadence,
    currency: terms.currency,
    standardRecurringAmountCents: terms.standardRecurringAmountCents,
    negotiatedRecurringAmountCents: terms.negotiatedRecurringAmountCents,
    setupFeeCents: terms.setupFeeCents,
    includedSeats: terms.includedSeats,
    additionalSeats: terms.additionalSeats,
    trialDays: terms.trialDays,
    proposedStartDate: terms.proposedStartDate,
    expiresAt: terms.expiresAt ?? new Date(Date.now() + 7 * 86400000),
    version: 1,
    acceptedAt: new Date(),
    acceptedByEmail: "alex@brokerage.test",
  };
  state.offers.set(offerId, offer);

  for (const item of terms.lineItems) {
    state.lines.push({
      id: `li_${state.nextId++}`,
      offerId,
      kind: String(item.kind),
      code: String(item.code),
      description: String(item.description),
      amountCents: Number(item.amountCents),
      isRecurring: Boolean(item.isRecurring),
      quantity: Number(item.quantity ?? 1),
      sortOrder: Number(item.sortOrder ?? 0),
    });
  }

  state.tokens.push({
    id: `tok_${state.nextId++}`,
    offerId,
    tokenHash: hashCommercialOfferToken(raw),
    expiresAt: new Date(Date.now() + 14 * 86400000),
    revokedAt: null,
  });

  if (opts?.withAcceptance !== false && (opts?.status ?? "ACCEPTED") === "ACCEPTED") {
    const hash = commercialTermsHashFromOfferRow({
      id: offerId,
      version: 1,
      planCode: terms.planCode,
      billingCadence: terms.billingCadence,
      currency: terms.currency,
      negotiatedRecurringAmountCents: terms.negotiatedRecurringAmountCents,
      setupFeeCents: terms.setupFeeCents,
      includedSeats: terms.includedSeats,
      additionalSeats: terms.additionalSeats,
      trialDays: terms.trialDays,
      proposedStartDate: terms.proposedStartDate,
      expiresAt: offer.expiresAt,
      lineItems: state.lines.filter((l) => l.offerId === offerId),
    });
    state.acceptances.set(offerId, {
      id: `acc_${state.nextId++}`,
      offerId,
      acceptedEmail: "alex@brokerage.test",
      commercialTermsHash: hash,
      termsVersion: "houzzatpro-terms-2026-09",
      privacyVersion: "houzzatpro-privacy-2026-09",
    });
  }

  return {
    raw,
    offerId,
    prospectId,
    terms,
    totals: {
      recurringTotalCents: terms.recurringTotalCents,
      oneTimeTotalCents: terms.oneTimeTotalCents,
    },
  };
}

function createFakeStripe(state: FakeState) {
  return {
    customers: {
      async create() {
        const id = `cus_${state.nextId++}`;
        state.stripeCustomers += 1;
        return { id };
      },
    },
    checkout: {
      sessions: {
        async create(params: Record<string, unknown>) {
          const id = `cs_${state.nextId++}`;
          const session = {
            id,
            client_secret: `cs_test_secret_${id}`,
            ui_mode: params.ui_mode ?? "embedded",
            status: "open",
            metadata: params.metadata ?? {},
            subscription: null,
            customer: params.customer,
            payment_status: "unpaid",
            line_items: params.line_items,
            return_url: params.return_url,
            branding_settings: params.branding_settings,
            url: null,
          };
          state.stripeSessions.push(session);
          return session;
        },
        async retrieve(id: string) {
          const session = state.stripeSessions.find((s) => s.id === id);
          if (!session) throw new Error("session missing");
          return session;
        },
      },
    },
    subscriptions: {
      async retrieve(id: string) {
        const sub = state.stripeSubscriptions.get(id);
        if (!sub) throw new Error("stripe sub missing");
        return sub;
      },
    },
    webhooks: {
      constructEvent(rawBody: string, _sig: string, _secret: string) {
        return JSON.parse(rawBody) as {
          type: string;
          data: { object: Record<string, unknown> };
        };
      },
    },
  };
}

function createFakePrisma(state: FakeState) {
  const id = (p: string) => `${p}_${state.nextId++}`;

  const loadOffer = (offerId: string) => {
    const offer = state.offers.get(offerId);
    if (!offer) return null;
    const sub = [...state.subscriptions.values()].find(
      (s) => s.offerId === offerId,
    );
    return {
      ...offer,
      lineItems: state.lines
        .filter((l) => l.offerId === offerId)
        .sort((a, b) => a.sortOrder - b.sortOrder),
      prospect: state.prospects.get(String(offer.prospectId)),
      acceptance: state.acceptances.get(offerId)
        ? { ...state.acceptances.get(offerId) }
        : null,
      subscription: sub
        ? {
            id: sub.id,
            status: sub.status,
            stripeCheckoutSessionId: sub.stripeCheckoutSessionId,
          }
        : null,
    };
  };

  return {
    commercialOfferToken: {
      async findUnique({ where }: { where: { tokenHash: string } }) {
        const token = state.tokens.find((t) => t.tokenHash === where.tokenHash);
        if (!token) return null;
        return { ...token, offer: loadOffer(token.offerId) };
      },
    },
    commercialOffer: {
      async findUnique({ where }: { where: { id: string } }) {
        return loadOffer(where.id);
      },
    },
    billingCustomer: {
      async findFirst({ where }: { where: { prospectId?: string } }) {
        if (where.prospectId) {
          for (const row of state.billingCustomers.values()) {
            if (row.prospectId === where.prospectId) return { ...row };
          }
        }
        return null;
      },
      async create({ data }: { data: Record<string, unknown> }) {
        const row = { id: id("bc"), ...data };
        state.billingCustomers.set(String(row.id), row);
        return { ...row };
      },
      async update({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) {
        const row = state.billingCustomers.get(where.id);
        if (!row) throw new Error("missing billing customer");
        Object.assign(row, data);
        return { ...row };
      },
    },
    subscription: {
      async findUnique({
        where,
      }: {
        where: {
          offerId?: string;
          id?: string;
          stripeCheckoutSessionId?: string;
          stripeSubscriptionId?: string;
        };
      }) {
        if (where.offerId) {
          const hit = [...state.subscriptions.values()].find(
            (s) => s.offerId === where.offerId,
          );
          return hit
            ? {
                ...hit,
                billingCustomer: state.billingCustomers.get(
                  String(hit.billingCustomerId),
                ),
              }
            : null;
        }
        if (where.id) {
          const hit = state.subscriptions.get(where.id);
          return hit
            ? {
                ...hit,
                billingCustomer: state.billingCustomers.get(
                  String(hit.billingCustomerId),
                ),
              }
            : null;
        }
        if (where.stripeCheckoutSessionId) {
          const hit = [...state.subscriptions.values()].find(
            (s) => s.stripeCheckoutSessionId === where.stripeCheckoutSessionId,
          );
          return hit
            ? {
                ...hit,
                billingCustomer: state.billingCustomers.get(
                  String(hit.billingCustomerId),
                ),
              }
            : null;
        }
        if (where.stripeSubscriptionId) {
          const hit = [...state.subscriptions.values()].find(
            (s) => s.stripeSubscriptionId === where.stripeSubscriptionId,
          );
          return hit
            ? {
                ...hit,
                billingCustomer: state.billingCustomers.get(
                  String(hit.billingCustomerId),
                ),
              }
            : null;
        }
        return null;
      },
      async create({ data }: { data: Record<string, unknown> }) {
        if (
          data.offerId &&
          [...state.subscriptions.values()].some((s) => s.offerId === data.offerId)
        ) {
          const err = new Error("Unique") as Error & { code: string };
          err.code = "P2002";
          throw err;
        }
        const row = {
          id: id("sub"),
          stripeCheckoutSessionId: null,
          stripeSubscriptionId: null,
          workspaceId: null,
          ...data,
        };
        state.subscriptions.set(String(row.id), row);
        return {
          id: row.id,
          stripeCheckoutSessionId: row.stripeCheckoutSessionId,
        };
      },
      async update({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) {
        const row = state.subscriptions.get(where.id);
        if (!row) throw new Error("missing subscription");
        Object.assign(row, data);
        return { ...row };
      },
    },
    platformAuditEvent: {
      async findFirst({
        where,
      }: {
        where: { entityId?: string; action?: string };
      }) {
        const hit = state.audits.find(
          (a) =>
            (!where.entityId || a.entityId === where.entityId) &&
            (!where.action || a.action === where.action),
        );
        return hit
          ? { id: "aud_existing", metadata: hit.metadata }
          : null;
      },
      async create({
        data,
      }: {
        data: { action: string; entityId: string; metadata?: unknown };
      }) {
        state.audits.push({
          action: data.action,
          entityId: data.entityId,
          metadata: data.metadata ?? null,
        });
        return { id: id("aud") };
      },
    },
    workspace: {
      async create() {
        state.workspaces += 1;
        throw new Error("workspace forbidden in 6.8B");
      },
    },
    workspaceEntitlement: {
      async create() {
        state.entitlements += 1;
        throw new Error("entitlements forbidden in 6.8B");
      },
    },
    workspaceSeatQuota: {
      async create() {
        state.seatQuotas += 1;
        throw new Error("seat quota forbidden in 6.8B");
      },
    },
    provisioningRun: {
      async create() {
        state.provisioningRuns += 1;
        throw new Error("ProvisioningRun forbidden in 6.8B");
      },
    },
  };
}

async function main() {
  console.log("\n=== STAGE 6.8B — STRIPE CHECKOUT FOUNDATION ===\n");

  // 0. Source guards
  {
    const checkout = read("src/lib/platform/billing/checkout.ts");
    const webhook = read("src/lib/platform/billing/webhook.ts");
    const route = read("src/app/api/stripe/webhook/route.ts");
    const statusPage = read(
      "src/app/(marketing)/subscribe/payment/status/page.tsx",
    );
    assert.ok(!/\$transaction/.test(checkout));
    assert.ok(!/\.updateMany\s*\(/.test(checkout));
    assert.ok(!/\$transaction/.test(webhook));
    assert.ok(!/\.updateMany\s*\(/.test(webhook));
    assert.ok(route.includes("processStripeWebhook"));
    assert.ok(statusPage.includes("BROWSER_SUCCESS_CANNOT_ACTIVATE"));
    assert.ok(
      !statusPage.includes("status: \"ACTIVE\"") &&
        !statusPage.includes("subscription.update"),
    );
    assert.equal(
      BROWSER_SUCCESS_CANNOT_ACTIVATE.includes("not payment authority"),
      true,
    );
    assert.ok(!checkout.toLowerCase().includes("from '@/lib/agent"));
    console.log("[0] Neon HTTP + browser-success guards... PASS");
  }

  // 1. Totals authority — monthly / annual / setup / seats / add-on
  {
    const monthly = resolveOfferCommercialTerms({
      planCode: "TEAM",
      billingCadence: "MONTHLY",
      setupFeeCents: 25_000,
      additionalSeats: 2,
    });
    const amounts = computeAcceptedCheckoutAmounts(monthly.lineItems);
    assert.equal(amounts.recurringTotalCents, monthly.recurringTotalCents);
    assert.equal(amounts.oneTimeTotalCents, monthly.oneTimeTotalCents);
    assert.ok(amounts.oneTimeTotalCents === 25_000);
    assert.ok(amounts.recurringTotalCents > monthly.negotiatedRecurringAmountCents);

    const annual = resolveOfferCommercialTerms({
      planCode: "TEAM",
      billingCadence: "ANNUAL",
      additionalSeats: 1,
      addOns: [{ code: "CUSTOM_CONSUMER_APP" }],
    });
    const annualAmounts = computeAcceptedCheckoutAmounts(annual.lineItems);
    assert.equal(annualAmounts.recurringTotalCents, annual.recurringTotalCents);

    assert.throws(
      () =>
        resolveOfferCommercialTerms({
          planCode: "SOLO",
          billingCadence: "MONTHLY",
          additionalSeats: 1,
        }),
      /SOLO|additional/i,
    );
    console.log("[1] Checkout totals + Solo seats rule... PASS");
  }

  // 2. Eligibility gates
  {
    const state = emptyState();
    const seeded = seedAcceptedOffer(state, { status: "VIEWED", withAcceptance: false });
    const offer = state.offers.get(seeded.offerId)!;
    const lines = state.lines.filter((l) => l.offerId === seeded.offerId);
    const notAccepted = evaluateAcceptedOfferCheckoutEligibility({
      offerStatus: "VIEWED",
      acceptance: null,
      offerForHash: {
        id: String(offer.id),
        version: 1,
        planCode: String(offer.planCode),
        billingCadence: String(offer.billingCadence),
        currency: String(offer.currency),
        negotiatedRecurringAmountCents: Number(
          offer.negotiatedRecurringAmountCents,
        ),
        setupFeeCents: Number(offer.setupFeeCents),
        includedSeats: Number(offer.includedSeats),
        additionalSeats: Number(offer.additionalSeats),
        trialDays: null,
        proposedStartDate: null,
        expiresAt: offer.expiresAt as Date,
        lineItems: lines,
      },
      lineItems: lines,
      existingSubscriptionStatus: null,
    });
    assert.equal(notAccepted.eligible, false);
    assert.equal(notAccepted.reason, "not_accepted");

    const acceptedSeed = seedAcceptedOffer(state);
    const acceptedOffer = state.offers.get(acceptedSeed.offerId)!;
    const acceptedLines = state.lines.filter(
      (l) => l.offerId === acceptedSeed.offerId,
    );
    const acceptance = state.acceptances.get(acceptedSeed.offerId)!;
    const ok = evaluateAcceptedOfferCheckoutEligibility({
      offerStatus: "ACCEPTED",
      acceptance: {
        commercialTermsHash: String(acceptance.commercialTermsHash),
      },
      offerForHash: {
        id: String(acceptedOffer.id),
        version: 1,
        planCode: String(acceptedOffer.planCode),
        billingCadence: String(acceptedOffer.billingCadence),
        currency: String(acceptedOffer.currency),
        negotiatedRecurringAmountCents: Number(
          acceptedOffer.negotiatedRecurringAmountCents,
        ),
        setupFeeCents: Number(acceptedOffer.setupFeeCents),
        includedSeats: Number(acceptedOffer.includedSeats),
        additionalSeats: Number(acceptedOffer.additionalSeats),
        trialDays: null,
        proposedStartDate: null,
        expiresAt: acceptedOffer.expiresAt as Date,
        lineItems: acceptedLines,
      },
      lineItems: acceptedLines,
      existingSubscriptionStatus: null,
    });
    assert.equal(ok.eligible, true);
    assert.equal(ok.recurringTotalCents, acceptedSeed.totals.recurringTotalCents);

    const hashMismatch = evaluateAcceptedOfferCheckoutEligibility({
      offerStatus: "ACCEPTED",
      acceptance: { commercialTermsHash: "deadbeef" },
      offerForHash: {
        id: String(acceptedOffer.id),
        version: 1,
        planCode: String(acceptedOffer.planCode),
        billingCadence: String(acceptedOffer.billingCadence),
        currency: String(acceptedOffer.currency),
        negotiatedRecurringAmountCents: Number(
          acceptedOffer.negotiatedRecurringAmountCents,
        ),
        setupFeeCents: Number(acceptedOffer.setupFeeCents),
        includedSeats: Number(acceptedOffer.includedSeats),
        additionalSeats: Number(acceptedOffer.additionalSeats),
        trialDays: null,
        proposedStartDate: null,
        expiresAt: acceptedOffer.expiresAt as Date,
        lineItems: acceptedLines,
      },
      lineItems: acceptedLines,
      existingSubscriptionStatus: null,
    });
    assert.equal(hashMismatch.eligible, false);
    assert.equal(hashMismatch.reason, "hash_mismatch");

    const paid = evaluateAcceptedOfferCheckoutEligibility({
      offerStatus: "ACCEPTED",
      acceptance: {
        commercialTermsHash: String(acceptance.commercialTermsHash),
      },
      offerForHash: {
        id: String(acceptedOffer.id),
        version: 1,
        planCode: String(acceptedOffer.planCode),
        billingCadence: String(acceptedOffer.billingCadence),
        currency: String(acceptedOffer.currency),
        negotiatedRecurringAmountCents: Number(
          acceptedOffer.negotiatedRecurringAmountCents,
        ),
        setupFeeCents: Number(acceptedOffer.setupFeeCents),
        includedSeats: Number(acceptedOffer.includedSeats),
        additionalSeats: Number(acceptedOffer.additionalSeats),
        trialDays: null,
        proposedStartDate: null,
        expiresAt: acceptedOffer.expiresAt as Date,
        lineItems: acceptedLines,
      },
      lineItems: acceptedLines,
      existingSubscriptionStatus: "ACTIVE",
    });
    assert.equal(paid.eligible, false);
    assert.equal(paid.reason, "already_paid");
    console.log("[2] Eligibility gates... PASS");
  }

  // 3. Invalid token + non-accepted checkout denied
  {
    const state = emptyState();
    const stripe = createFakeStripe(state);
    const db = createFakePrisma(state) as never;
    await assert.rejects(
      () =>
        createCheckoutForAcceptedOffer({
          rawToken: "not-a-real-token-xxxxxx",
          returnOrigin: "https://houzzatpro.com",
          prisma: db,
          stripe: stripe as never,
        }),
      (err: unknown) =>
        err instanceof OfferCheckoutPublicError && err.code === "OFFER_UNAVAILABLE",
    );

    const viewed = seedAcceptedOffer(state, {
      status: "VIEWED",
      withAcceptance: false,
    });
    await assert.rejects(
      () =>
        createCheckoutForAcceptedOffer({
          rawToken: viewed.raw,
          returnOrigin: "https://houzzatpro.com",
          prisma: db,
          stripe: stripe as never,
        }),
      (err: unknown) =>
        err instanceof OfferCheckoutPublicError && err.code === "OFFER_UNAVAILABLE",
    );
    console.log("[3] Invalid / non-accepted checkout denied... PASS");
  }

  // 4. Checkout create + idempotent subscription reuse
  {
    const state = emptyState();
    const seeded = seedAcceptedOffer(state, {
      cadence: "ANNUAL",
      setupFeeCents: 50_000,
      additionalSeats: 1,
    });
    const stripe = createFakeStripe(state);
    const db = createFakePrisma(state) as never;

    const first = await createCheckoutForAcceptedOffer({
      rawToken: seeded.raw,
      returnOrigin: "https://houzzatpro.com",
      prisma: db,
      stripe: stripe as never,
    });
    assert.ok(first.clientSecret.startsWith("cs_test_secret_"));
    assert.equal(state.subscriptions.size, 1);
    assert.equal(state.stripeSessions.length, 1);
    assert.equal(state.workspaces, 0);
    assert.equal(state.entitlements, 0);
    assert.equal(state.seatQuotas, 0);
    assert.equal(state.provisioningRuns, 0);

    const sub = [...state.subscriptions.values()][0]!;
    assert.equal(sub.status, "PENDING_PAYMENT");
    assert.equal(sub.workspaceId, null);
    assert.equal(sub.source, "STRIPE");
    assert.equal(sub.recurringAmountCents, seeded.totals.recurringTotalCents);
    assert.ok(
      state.audits.some((a) => a.action === STRIPE_BILLING_AUDIT.CHECKOUT_CREATED),
    );

    const session = state.stripeSessions[0]! as {
      ui_mode?: string;
      return_url?: string;
      line_items?: Array<{
        price_data?: { unit_amount?: number; recurring?: { interval: string } };
      }>;
    };
    assert.equal(session.ui_mode, "embedded");
    assert.ok(
      String(session.return_url).includes("/subscribe/payment/status?session_id="),
    );
    assert.equal(
      (session as { branding_settings?: { button_color?: string } })
        .branding_settings?.button_color,
      "#059669",
    );
    const recurringLine = session.line_items?.[0];
    const oneTimeLine = session.line_items?.[1];
    assert.equal(
      recurringLine?.price_data?.unit_amount,
      seeded.totals.recurringTotalCents,
    );
    assert.equal(recurringLine?.price_data?.recurring?.interval, "year");
    assert.equal(
      oneTimeLine?.price_data?.unit_amount,
      seeded.totals.oneTimeTotalCents,
    );
    const snap = sub.commercialSnapshotJson as {
      recurringTotalCents: number;
      oneTimeTotalCents: number;
    };
    assert.equal(snap.recurringTotalCents, seeded.totals.recurringTotalCents);
    assert.equal(snap.oneTimeTotalCents, seeded.totals.oneTimeTotalCents);

    const second = await createCheckoutForAcceptedOffer({
      rawToken: seeded.raw,
      returnOrigin: "https://houzzatpro.com",
      prisma: db,
      stripe: stripe as never,
    });
    assert.equal(state.subscriptions.size, 1);
    assert.equal(second.subscriptionId, first.subscriptionId);
    assert.equal(second.reusedCheckoutSession, true);
    assert.equal(state.stripeSessions.length, 1);
    console.log("[4] Checkout create + subscription idempotency... PASS");
  }

  // 5. Webhook activates; browser success cannot; failed does not activate
  {
    const state = emptyState();
    const seeded = seedAcceptedOffer(state);
    const stripe = createFakeStripe(state);
    const db = createFakePrisma(state) as never;
    const created = await createCheckoutForAcceptedOffer({
      rawToken: seeded.raw,
      returnOrigin: "https://houzzatpro.com",
      prisma: db,
      stripe: stripe as never,
    });

    const subBefore = state.subscriptions.get(created.subscriptionId)!;
    assert.equal(subBefore.status, "PENDING_PAYMENT");

    // Browser success alone — no webhook — still PENDING
    assert.equal(subBefore.status, "PENDING_PAYMENT");
    assert.equal(subBefore.workspaceId, null);

    const stripeSubId = `sub_stripe_${state.nextId++}`;
    state.stripeSubscriptions.set(stripeSubId, {
      id: stripeSubId,
      status: "active",
      trial_end: null,
      cancel_at_period_end: false,
      canceled_at: null,
      metadata: {
        offerId: seeded.offerId,
        subscriptionId: created.subscriptionId,
        prospectId: seeded.prospectId,
      },
    });

    const sessionId = String(subBefore.stripeCheckoutSessionId);
    const eventBody = JSON.stringify({
      type: "checkout.session.completed",
      data: {
        object: {
          id: sessionId,
          metadata: {
            offerId: seeded.offerId,
            subscriptionId: created.subscriptionId,
            prospectId: seeded.prospectId,
          },
          subscription: stripeSubId,
          customer: "cus_test",
          payment_status: "paid",
        },
      },
    });

    const firstWh = await processStripeWebhook({
      rawBody: eventBody,
      signatureHeader: "t=1,v1=test",
      prisma: db,
      stripe: stripe as never,
      webhookSecret: "whsec_test",
    });
    assert.equal(firstWh.handled, true);
    const subAfter = state.subscriptions.get(created.subscriptionId)!;
    assert.equal(subAfter.status, "ACTIVE");
    assert.equal(subAfter.workspaceId, null);
    assert.equal(subAfter.stripeSubscriptionId, stripeSubId);
    assert.ok(
      state.audits.some(
        (a) => a.action === STRIPE_BILLING_AUDIT.SUBSCRIPTION_ACTIVATED,
      ),
    );

    const secondWh = await processStripeWebhook({
      rawBody: eventBody,
      signatureHeader: "t=1,v1=test",
      prisma: db,
      stripe: stripe as never,
      webhookSecret: "whsec_test",
    });
    assert.equal(secondWh.action, "duplicate");
    assert.equal(state.subscriptions.size, 1);
    assert.equal(state.workspaces, 0);

    // Failed checkout / cancelled session does not activate a fresh pending sub
    const state2 = emptyState();
    const seeded2 = seedAcceptedOffer(state2);
    const stripe2 = createFakeStripe(state2);
    const db2 = createFakePrisma(state2) as never;
    const pending = await createCheckoutForAcceptedOffer({
      rawToken: seeded2.raw,
      returnOrigin: "https://houzzatpro.com",
      prisma: db2,
      stripe: stripe2 as never,
    });
    const cancelledEvent = JSON.stringify({
      type: "checkout.session.completed",
      data: {
        object: {
          id: state2.subscriptions.get(pending.subscriptionId)!
            .stripeCheckoutSessionId,
          metadata: {
            offerId: seeded2.offerId,
            subscriptionId: pending.subscriptionId,
            prospectId: seeded2.prospectId,
          },
          subscription: null,
          customer: "cus_x",
          payment_status: "unpaid",
        },
      },
    });
    await processStripeWebhook({
      rawBody: cancelledEvent,
      signatureHeader: "t=1,v1=test",
      prisma: db2,
      stripe: stripe2 as never,
      webhookSecret: "whsec_test",
    });
    assert.equal(
      state2.subscriptions.get(pending.subscriptionId)!.status,
      "PENDING_PAYMENT",
    );
    console.log("[5] Webhook activation + idempotency + unpaid guard... PASS");
  }

  // 6. UX CTA present; frozen legal/acceptance not redesigned away
  {
    const acceptedUi = read(
      "src/components/platform/public/PrivateOfferProposal.tsx",
    );
    const cta = read(
      "src/components/platform/public/PrivateOfferCheckoutButton.tsx",
    );
    const embedded = read(
      "src/components/platform/public/PrivateOfferEmbeddedCheckout.tsx",
    );
    const checkoutPage = read(
      "src/app/(marketing)/subscribe/[token]/checkout/page.tsx",
    );
    const chromeGate = read(
      "src/lib/platform/offers/private-offer-request.ts",
    );
    const copy = read("src/lib/platform/offers/private-offer-copy.ts");
    const checkoutSrc = read("src/lib/platform/billing/checkout.ts");
    const apiRoute = read(
      "src/app/api/platform/public/offers/[token]/checkout/route.ts",
    );
    assert.ok(acceptedUi.includes("PrivateOfferCheckoutButton"));
    assert.ok(acceptedUi.includes("checkoutEligible"));
    assert.ok(cta.includes("/checkout"));
    assert.ok(!cta.includes("checkoutUrl"));
    assert.ok(!cta.includes("window.location.assign"));
    assert.ok(embedded.includes("EmbeddedCheckoutProvider"));
    assert.ok(checkoutPage.includes("PrivateOfferEmbeddedCheckout"));
    assert.ok(chromeGate.includes("PRIVATE_OFFER_PATH_PREFIX"));
    assert.ok(!chromeGate.includes('tokenPart.includes("/")'));
    assert.ok(copy.includes("Complete Subscription"));
    assert.ok(checkoutSrc.includes('ui_mode: "embedded"'));
    assert.ok(checkoutSrc.includes("return_url"));
    assert.ok(checkoutSrc.includes("branding_settings"));
    assert.ok(checkoutSrc.includes("houzzatProCheckoutBrandingSettings"));
    assert.ok(!checkoutSrc.includes("success_url"));
    assert.ok(!checkoutSrc.includes("cancel_url"));
    assert.ok(apiRoute.includes("clientSecret"));
    assert.ok(!apiRoute.includes("checkoutUrl"));
    assert.ok(embedded.includes("lg:grid-cols-"));
    assert.ok(embedded.includes("Order summary"));
    assert.ok(embedded.includes("bg-[#f4f6f5]"));
    assert.ok(copy.includes(PRIVATE_OFFER_ACCEPTED_TITLE_SNIPPET()));
    assert.ok(
      !read("src/lib/platform/legal/content/houzzatpro-terms.ts").includes(
        "STRIPE_CHECKOUT",
      ),
    );
    assert.ok(
      !read("src/app/api/platform/public/offers/[token]/accept/route.ts").includes(
        "createCheckout",
      ),
    );
    console.log("[6] Accepted UX CTA + embedded chrome... PASS");
  }

  // 7. Metadata safety + no CRM imports in billing
  {
    const checkout = read("src/lib/platform/billing/checkout.ts");
    assert.ok(checkout.includes("offerId"));
    assert.ok(checkout.includes("subscriptionId"));
    assert.ok(checkout.includes("prospectId"));
    assert.ok(!/commercialToken|rawToken|notesInternal|contactName/.test(
      checkout.split("metadata:")[1] ?? "",
    ));
    assert.ok(!/from ["']@\/lib\/agent/.test(checkout));
    assert.ok(!COMMERCIAL_OFFER_AUDIT.ACCEPTED.includes("STRIPE"));
    void CheckoutAmountError;
    console.log("[7] Metadata + CRM isolation... PASS");
  }

  console.log("\nSTAGE 6.8B SELFTEST: ALL PASS\n");
}

function PRIVATE_OFFER_ACCEPTED_TITLE_SNIPPET() {
  return "Offer Accepted";
}

main().catch((error) => {
  console.error("\nSTAGE 6.8B SELFTEST FAILED\n");
  console.error(error);
  process.exit(1);
});
