/**
 * Stage 6.7B — resolve private commercial offer by raw token.
 * Read-only prospect experience — no Stripe / acceptance / provisioning.
 * Sequential Prisma writes only (Neon HTTP-safe: no interactive transactions / no updateMany).
 */

import type {
  BillingCadence,
  CommercialOfferLineItem,
  OfferLineKind,
  OfferStatus,
  PlanCode,
  PrismaClient,
} from "@prisma/client";
import { writePlatformAuditEvent } from "@/lib/platform/audit";
import {
  FEATURE_AGENT_APP,
  FEATURE_LIVE_CHAT,
  FEATURE_SEO_FOUNDATION,
  FEATURE_TEAM_MANAGEMENT,
} from "@/lib/platform/catalog/features";
import {
  getPlanDefinition,
  STANDARD_SETUP_FEE_CENTS,
} from "@/lib/platform/catalog/plans";
import { computeOfferTotals } from "@/lib/platform/offers/line-items";
import {
  ADS_MINIMUM_MONTHLY_BUDGET_CENTS,
  COMMERCIAL_OFFER_AUDIT,
  COMMERCIAL_OFFER_ENTITY_TYPE,
  OFFER_LINE_CODES,
} from "@/lib/platform/offers/constants";
import { PRIVATE_OFFER_PLAN_VALUE_LABELS } from "@/lib/platform/offers/private-offer-copy";
import { hashCommercialOfferToken } from "@/lib/platform/offers/token";
import { prisma as defaultPrisma } from "@/lib/prisma";

const RENDERABLE_STATUSES: OfferStatus[] = ["SENT", "VIEWED"];

export type PrivateOfferAcceptedPresentation = {
  offerId: string;
  status: "ACCEPTED";
  preparedFor: {
    contactName: string | null;
    companyName: string | null;
  };
  acceptedAt: string | null;
};

export type PrivateOfferLineView = {
  kind: OfferLineKind;
  code: string;
  description: string;
  amountCents: number;
  quantity: number;
  isRecurring: boolean;
  lineTotalCents: number;
  isDiscount: boolean;
  /** Ads add-ons only — guidance, never added to totals. */
  adSpendSeparate?: boolean;
};

export type PrivateOfferPresentation = {
  offerId: string;
  status: "SENT" | "VIEWED";
  planCode: PlanCode;
  billingCadence: BillingCadence;
  currency: string;
  standardRecurringAmountCents: number;
  negotiatedRecurringAmountCents: number;
  showNegotiatedRecurring: boolean;
  setupFeeCents: number;
  standardSetupFeeCents: number;
  showNegotiatedSetup: boolean;
  includedSeats: number;
  additionalSeats: number;
  trialDays: number | null;
  proposedStartDate: string | null;
  expiresAt: string | null;
  recurringLines: PrivateOfferLineView[];
  oneTimeLines: PrivateOfferLineView[];
  recurringTotalCents: number;
  oneTimeTotalCents: number;
  planValueLabels: string[];
  preparedFor: {
    contactName: string | null;
    companyName: string | null;
  };
  hasAdsAddon: boolean;
  adsMinimumBudgetCents: number;
};

export type ResolvePrivateOfferResult =
  | { ok: true; kind: "proposal"; presentation: PrivateOfferPresentation }
  | {
      ok: true;
      kind: "accepted";
      presentation: PrivateOfferAcceptedPresentation;
    }
  | { ok: false; reason: "unavailable" };

function toLineView(item: CommercialOfferLineItem): PrivateOfferLineView {
  const quantity = item.quantity > 0 ? item.quantity : 1;
  const isDiscount = item.kind === "DISCOUNT";
  const lineTotalCents = item.amountCents * quantity;
  const adSpendSeparate =
    item.code === OFFER_LINE_CODES.GOOGLE_PPC ||
    item.code === OFFER_LINE_CODES.META_ADS
      ? true
      : undefined;
  const description =
    item.code === OFFER_LINE_CODES.CUSTOM_CONSUMER_APP
      ? "Optional branded consumer app"
      : item.description;
  return {
    kind: item.kind,
    code: item.code,
    description,
    amountCents: item.amountCents,
    quantity,
    isRecurring: item.isRecurring,
    lineTotalCents: isDiscount ? -Math.abs(lineTotalCents) : lineTotalCents,
    isDiscount,
    adSpendSeparate,
  };
}

function planValueLabelsFor(planCode: PlanCode): string[] {
  const plan = getPlanDefinition(planCode);
  const labels: string[] = [
    PRIVATE_OFFER_PLAN_VALUE_LABELS.WEBSITE,
    PRIVATE_OFFER_PLAN_VALUE_LABELS.CRM,
    PRIVATE_OFFER_PLAN_VALUE_LABELS.PROPERTY_SEARCH,
    PRIVATE_OFFER_PLAN_VALUE_LABELS.CMA,
  ];
  if (plan.features[FEATURE_AGENT_APP]) {
    labels.push(PRIVATE_OFFER_PLAN_VALUE_LABELS.AGENT_APP);
  }
  if (plan.features[FEATURE_SEO_FOUNDATION]) {
    labels.push(PRIVATE_OFFER_PLAN_VALUE_LABELS.SEO);
  }
  if (plan.features[FEATURE_TEAM_MANAGEMENT]) {
    labels.push(PRIVATE_OFFER_PLAN_VALUE_LABELS.TEAM);
  }
  if (plan.features[FEATURE_LIVE_CHAT]) {
    labels.push(PRIVATE_OFFER_PLAN_VALUE_LABELS.LIVE_CHAT);
  }
  if (planCode === "BROKERAGE") {
    labels.push(PRIVATE_OFFER_PLAN_VALUE_LABELS.BROKERAGE_CONTROLS);
  }
  return labels;
}

function buildPresentation(input: {
  offer: {
    id: string;
    status: OfferStatus;
    planCode: PlanCode;
    billingCadence: BillingCadence;
    currency: string;
    standardRecurringAmountCents: number;
    negotiatedRecurringAmountCents: number;
    setupFeeCents: number;
    includedSeats: number;
    additionalSeats: number;
    trialDays: number | null;
    proposedStartDate: Date | null;
    expiresAt: Date | null;
  };
  lineItems: CommercialOfferLineItem[];
  prospect: {
    contactName: string;
    businessName: string | null;
    brokerageName: string | null;
  };
}): PrivateOfferPresentation {
  const lines = input.lineItems.map(toLineView);
  const totals = computeOfferTotals(input.lineItems);
  const status =
    input.offer.status === "VIEWED" ? ("VIEWED" as const) : ("SENT" as const);

  return {
    offerId: input.offer.id,
    status,
    planCode: input.offer.planCode,
    billingCadence: input.offer.billingCadence,
    currency: input.offer.currency,
    standardRecurringAmountCents: input.offer.standardRecurringAmountCents,
    negotiatedRecurringAmountCents: input.offer.negotiatedRecurringAmountCents,
    showNegotiatedRecurring:
      input.offer.negotiatedRecurringAmountCents !==
      input.offer.standardRecurringAmountCents,
    setupFeeCents: input.offer.setupFeeCents,
    standardSetupFeeCents: STANDARD_SETUP_FEE_CENTS,
    showNegotiatedSetup:
      input.offer.setupFeeCents !== STANDARD_SETUP_FEE_CENTS,
    includedSeats: input.offer.includedSeats,
    additionalSeats: input.offer.additionalSeats,
    trialDays: input.offer.trialDays,
    proposedStartDate: input.offer.proposedStartDate?.toISOString() ?? null,
    expiresAt: input.offer.expiresAt?.toISOString() ?? null,
    recurringLines: lines.filter((l) => l.isRecurring),
    oneTimeLines: lines.filter((l) => !l.isRecurring),
    recurringTotalCents: totals.recurringTotalCents,
    oneTimeTotalCents: totals.oneTimeTotalCents,
    planValueLabels: planValueLabelsFor(input.offer.planCode),
    preparedFor: {
      contactName: input.prospect.contactName?.trim() || null,
      companyName:
        input.prospect.brokerageName?.trim() ||
        input.prospect.businessName?.trim() ||
        null,
    },
    hasAdsAddon: lines.some(
      (l) =>
        l.code === OFFER_LINE_CODES.GOOGLE_PPC ||
        l.code === OFFER_LINE_CODES.META_ADS,
    ),
    adsMinimumBudgetCents: ADS_MINIMUM_MONTHLY_BUDGET_CENTS,
  };
}

/**
 * Idempotent SENT → VIEWED + audit once. Updates token lastViewedAt on every
 * valid render. Never uses updateMany or interactive transactions.
 */
async function recordPrivateOfferView(input: {
  db: PrismaClient;
  offerId: string;
  tokenId: string;
  offerStatus: OfferStatus;
}): Promise<"SENT" | "VIEWED"> {
  const now = new Date();

  if (input.offerStatus === "SENT") {
    const stillSent = await input.db.commercialOffer.findFirst({
      where: { id: input.offerId, status: "SENT" },
      select: { id: true },
    });
    if (stillSent) {
      await input.db.commercialOffer.update({
        where: { id: input.offerId },
        data: {
          status: "VIEWED",
          viewedAt: now,
        },
      });
    }
  }

  // Ensure a single VIEWED audit even if a prior request transitioned status
  // but failed before writing the audit event.
  const existingAudit = await input.db.platformAuditEvent.findFirst({
    where: {
      entityType: COMMERCIAL_OFFER_ENTITY_TYPE,
      entityId: input.offerId,
      action: COMMERCIAL_OFFER_AUDIT.VIEWED,
    },
    select: { id: true },
  });
  if (!existingAudit) {
    await writePlatformAuditEvent(
      {
        actorOperatorId: null,
        actorType: "SYSTEM",
        action: COMMERCIAL_OFFER_AUDIT.VIEWED,
        entityType: COMMERCIAL_OFFER_ENTITY_TYPE,
        entityId: input.offerId,
        summary: "Private commercial offer viewed",
        metadata: {
          // Never include raw token or tokenHash
          offerId: input.offerId,
        },
      },
      input.db,
    );
  }

  await input.db.commercialOfferToken.update({
    where: { id: input.tokenId },
    data: { lastViewedAt: now },
  });

  return "VIEWED";
}

/**
 * Resolve a private offer for rendering.
 * Invalid/expired/revoked/cancelled/draft/accepted → indistinguishable unavailable.
 */
export async function resolvePrivateOfferByRawToken(input: {
  rawToken: string;
  prisma?: PrismaClient;
}): Promise<ResolvePrivateOfferResult> {
  const db = input.prisma ?? defaultPrisma;
  const raw = input.rawToken?.trim();
  if (!raw || raw.length < 16 || raw.length > 256) {
    return { ok: false, reason: "unavailable" };
  }

  const tokenHash = hashCommercialOfferToken(raw);
  const token = await db.commercialOfferToken.findUnique({
    where: { tokenHash },
    include: {
      offer: {
        include: {
          lineItems: { orderBy: { sortOrder: "asc" } },
          prospect: {
            select: {
              contactName: true,
              businessName: true,
              brokerageName: true,
            },
          },
        },
      },
    },
  });

  if (!token) {
    return { ok: false, reason: "unavailable" };
  }

  const now = Date.now();
  if (token.revokedAt) {
    return { ok: false, reason: "unavailable" };
  }

  const offer = token.offer;
  if (!offer) {
    return { ok: false, reason: "unavailable" };
  }

  // ACCEPTED: same unrevoked token may show confirmation (token not revoked on accept).
  // Expired tokens still allowed for accepted confirmation; cancelled/revoked stay opaque.
  if (offer.status === "ACCEPTED") {
    return {
      ok: true,
      kind: "accepted",
      presentation: {
        offerId: offer.id,
        status: "ACCEPTED",
        preparedFor: {
          contactName: offer.prospect.contactName?.trim() || null,
          companyName:
            offer.prospect.brokerageName?.trim() ||
            offer.prospect.businessName?.trim() ||
            null,
        },
        acceptedAt: offer.acceptedAt?.toISOString() ?? null,
      },
    };
  }

  if (token.expiresAt.getTime() <= now) {
    return { ok: false, reason: "unavailable" };
  }
  if (offer.expiresAt && offer.expiresAt.getTime() <= now) {
    return { ok: false, reason: "unavailable" };
  }
  if (!RENDERABLE_STATUSES.includes(offer.status)) {
    // DRAFT / CANCELLED / EXPIRED → opaque unavailable.
    return { ok: false, reason: "unavailable" };
  }

  await recordPrivateOfferView({
    db,
    offerId: offer.id,
    tokenId: token.id,
    offerStatus: offer.status,
  });

  const presentation = buildPresentation({
    offer: {
      ...offer,
      status: offer.status === "SENT" ? "VIEWED" : offer.status,
    },
    lineItems: offer.lineItems,
    prospect: offer.prospect,
  });

  return { ok: true, kind: "proposal", presentation };
}
