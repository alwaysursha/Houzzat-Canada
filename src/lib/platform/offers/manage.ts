/**
 * Stage 6.7A — Master Admin commercial offer create / edit / send / cancel.
 * Sequential Prisma writes only — never use interactive transactions.
 * Never touches tenant CRM, Workspace, Subscription, or Stripe.
 */

import type {
  BillingCadence,
  OfferStatus,
  PlanCode,
  PrismaClient,
} from "@prisma/client";
import { writePlatformAuditEvent } from "@/lib/platform/audit";
import {
  buildPrivateOfferUrl,
  COMMERCIAL_OFFER_AUDIT,
  COMMERCIAL_OFFER_ENTITY_TYPE,
} from "@/lib/platform/offers/constants";
import { CommercialOfferActionError } from "@/lib/platform/offers/errors";
import {
  resolveOfferCommercialTerms,
  type OfferAddOnInput,
  type OfferAdjustmentInput,
} from "@/lib/platform/offers/line-items";
import {
  createCommercialOfferRawToken,
  hashCommercialOfferToken,
} from "@/lib/platform/offers/token";
import { serializeOfferSummary } from "@/lib/platform/read/serialize";
import { prisma as defaultPrisma } from "@/lib/prisma";

const PLAN_CODES = ["SOLO", "TEAM", "BROKERAGE"] as const;
const CADENCES = ["MONTHLY", "ANNUAL"] as const;

const EDITABLE_STATUSES: OfferStatus[] = ["DRAFT"];
const CANCELABLE_STATUSES: OfferStatus[] = ["DRAFT", "SENT", "VIEWED"];

export type OfferTermsInput = {
  planCode: PlanCode;
  billingCadence: BillingCadence;
  negotiatedRecurringAmountCents?: number | null;
  setupFeeCents?: number | null;
  additionalSeats?: number | null;
  trialDays?: number | null;
  proposedStartDate?: string | Date | null;
  expiresAt?: string | Date | null;
  addOns?: OfferAddOnInput[] | null;
  adjustments?: OfferAdjustmentInput[] | null;
};

function parseOptionalDate(
  value: string | Date | null | undefined,
  label: string,
): Date | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new CommercialOfferActionError(
      `${label} is not a valid date.`,
      "INVALID_DATE",
    );
  }
  return date;
}

function assertPlanCadence(
  planCode: unknown,
  billingCadence: unknown,
): { planCode: PlanCode; billingCadence: BillingCadence } {
  if (
    typeof planCode !== "string" ||
    !(PLAN_CODES as readonly string[]).includes(planCode)
  ) {
    throw new CommercialOfferActionError(
      "Plan must be SOLO, TEAM, or BROKERAGE.",
      "INVALID_PLAN",
    );
  }
  if (
    typeof billingCadence !== "string" ||
    !(CADENCES as readonly string[]).includes(billingCadence)
  ) {
    throw new CommercialOfferActionError(
      "Billing cadence must be MONTHLY or ANNUAL.",
      "INVALID_CADENCE",
    );
  }
  return {
    planCode: planCode as PlanCode,
    billingCadence: billingCadence as BillingCadence,
  };
}

function assertDraftEditable(status: OfferStatus) {
  if (!EDITABLE_STATUSES.includes(status)) {
    throw new CommercialOfferActionError(
      "Only DRAFT offers can be edited. Cancel and create a new offer to change commercial terms.",
      "OFFER_NOT_EDITABLE",
      409,
    );
  }
}

async function replaceLineItems(
  db: PrismaClient,
  offerId: string,
  lineItems: ReturnType<typeof resolveOfferCommercialTerms>["lineItems"],
) {
  const existing = await db.commercialOfferLineItem.findMany({
    where: { offerId },
    select: { id: true },
  });
  for (const row of existing) {
    await db.commercialOfferLineItem.delete({ where: { id: row.id } });
  }
  for (const item of lineItems) {
    await db.commercialOfferLineItem.create({
      data: { offerId, ...item },
    });
  }
}

async function loadOfferForWrite(db: PrismaClient, offerId: string) {
  const offer = await db.commercialOffer.findUnique({
    where: { id: offerId },
    include: {
      lineItems: { orderBy: { sortOrder: "asc" } },
      tokens: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!offer) {
    throw new CommercialOfferActionError("Offer not found.", "NOT_FOUND", 404);
  }
  return offer;
}

export async function createDraftCommercialOffer(input: {
  prospectId: string;
  operatorId: string;
  terms: OfferTermsInput;
  prisma?: PrismaClient;
}) {
  const db = input.prisma ?? defaultPrisma;
  const prospect = await db.platformProspect.findUnique({
    where: { id: input.prospectId },
    select: { id: true },
  });
  if (!prospect) {
    throw new CommercialOfferActionError(
      "Prospect not found.",
      "PROSPECT_NOT_FOUND",
      404,
    );
  }

  const { planCode, billingCadence } = assertPlanCadence(
    input.terms.planCode,
    input.terms.billingCadence,
  );
  const terms = resolveOfferCommercialTerms({
    planCode,
    billingCadence,
    negotiatedRecurringAmountCents:
      input.terms.negotiatedRecurringAmountCents,
    setupFeeCents: input.terms.setupFeeCents,
    additionalSeats: input.terms.additionalSeats,
    trialDays: input.terms.trialDays,
    proposedStartDate: parseOptionalDate(
      input.terms.proposedStartDate,
      "Proposed start date",
    ),
    expiresAt: parseOptionalDate(input.terms.expiresAt, "Expiry date"),
    addOns: input.terms.addOns,
    adjustments: input.terms.adjustments,
  });

  if (terms.expiresAt && terms.expiresAt.getTime() <= Date.now()) {
    throw new CommercialOfferActionError(
      "Expiry must be in the future.",
      "INVALID_EXPIRY",
    );
  }

  const offer = await db.commercialOffer.create({
    data: {
      prospectId: input.prospectId,
      createdByOperatorId: input.operatorId,
      status: "DRAFT",
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
      expiresAt: terms.expiresAt,
      version: 1,
    },
  });

  for (const item of terms.lineItems) {
    await db.commercialOfferLineItem.create({
      data: { offerId: offer.id, ...item },
    });
  }

  const audit = await writePlatformAuditEvent(
    {
      actorOperatorId: input.operatorId,
      actorType: "OPERATOR",
      action: COMMERCIAL_OFFER_AUDIT.CREATED,
      entityType: COMMERCIAL_OFFER_ENTITY_TYPE,
      entityId: offer.id,
      summary: `Created DRAFT offer ${terms.planCode} ${terms.billingCadence}`,
      metadata: {
        prospectId: input.prospectId,
        planCode: terms.planCode,
        billingCadence: terms.billingCadence,
        negotiatedRecurringAmountCents: terms.negotiatedRecurringAmountCents,
        setupFeeCents: terms.setupFeeCents,
        additionalSeats: terms.additionalSeats,
        recurringTotalCents: terms.recurringTotalCents,
        oneTimeTotalCents: terms.oneTimeTotalCents,
      },
    },
    db,
  );

  return {
    offerId: offer.id,
    status: offer.status as OfferStatus,
    auditEventId: audit.id,
    recurringTotalCents: terms.recurringTotalCents,
    oneTimeTotalCents: terms.oneTimeTotalCents,
  };
}

export async function updateDraftCommercialOffer(input: {
  offerId: string;
  operatorId: string;
  terms: OfferTermsInput;
  prisma?: PrismaClient;
}) {
  const db = input.prisma ?? defaultPrisma;
  const existing = await loadOfferForWrite(db, input.offerId);
  assertDraftEditable(existing.status);

  const { planCode, billingCadence } = assertPlanCadence(
    input.terms.planCode,
    input.terms.billingCadence,
  );
  const terms = resolveOfferCommercialTerms({
    planCode,
    billingCadence,
    negotiatedRecurringAmountCents:
      input.terms.negotiatedRecurringAmountCents,
    setupFeeCents: input.terms.setupFeeCents,
    additionalSeats: input.terms.additionalSeats,
    trialDays: input.terms.trialDays,
    proposedStartDate: parseOptionalDate(
      input.terms.proposedStartDate,
      "Proposed start date",
    ),
    expiresAt: parseOptionalDate(input.terms.expiresAt, "Expiry date"),
    addOns: input.terms.addOns,
    adjustments: input.terms.adjustments,
  });

  if (terms.expiresAt && terms.expiresAt.getTime() <= Date.now()) {
    throw new CommercialOfferActionError(
      "Expiry must be in the future.",
      "INVALID_EXPIRY",
    );
  }

  await db.commercialOffer.update({
    where: { id: existing.id },
    data: {
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
      expiresAt: terms.expiresAt,
      version: { increment: 1 },
    },
  });

  await replaceLineItems(db, existing.id, terms.lineItems);

  const audit = await writePlatformAuditEvent(
    {
      actorOperatorId: input.operatorId,
      actorType: "OPERATOR",
      action: COMMERCIAL_OFFER_AUDIT.UPDATED,
      entityType: COMMERCIAL_OFFER_ENTITY_TYPE,
      entityId: existing.id,
      summary: `Updated DRAFT offer ${terms.planCode} ${terms.billingCadence}`,
      metadata: {
        prospectId: existing.prospectId,
        planCode: terms.planCode,
        billingCadence: terms.billingCadence,
        negotiatedRecurringAmountCents: terms.negotiatedRecurringAmountCents,
        setupFeeCents: terms.setupFeeCents,
        additionalSeats: terms.additionalSeats,
        versionFrom: existing.version,
      },
    },
    db,
  );

  return {
    offerId: existing.id,
    status: "DRAFT" as const,
    auditEventId: audit.id,
    recurringTotalCents: terms.recurringTotalCents,
    oneTimeTotalCents: terms.oneTimeTotalCents,
  };
}

/**
 * Ensure prospect reflects a sent offer without marking WON.
 * Idempotent: skips if already OFFER_SENT or terminal WON/LOST stay untouched for WON.
 */
async function ensureProspectOfferSentSideEffects(input: {
  db: PrismaClient;
  prospectId: string;
  offerId: string;
  operatorId: string;
}) {
  const prospect = await input.db.platformProspect.findUnique({
    where: { id: input.prospectId },
    select: { id: true, status: true },
  });
  if (!prospect) return { activityId: null as string | null };

  if (prospect.status !== "OFFER_SENT" && prospect.status !== "WON") {
    await input.db.platformProspect.update({
      where: { id: prospect.id },
      data: { status: "OFFER_SENT" },
    });
  }

  const existingActivity = await input.db.platformProspectActivity.findFirst({
    where: {
      prospectId: prospect.id,
      type: "OFFER_LINKED",
      body: { contains: input.offerId },
    },
    select: { id: true },
  });
  if (existingActivity) {
    return { activityId: existingActivity.id };
  }

  const activity = await input.db.platformProspectActivity.create({
    data: {
      prospectId: prospect.id,
      type: "OFFER_LINKED",
      operatorId: input.operatorId,
      body: `Commercial offer linked: ${input.offerId}`,
      completedAt: new Date(),
    },
    select: { id: true },
  });
  return { activityId: activity.id };
}

export type SendCommercialOfferResult =
  | {
      outcome: "sent";
      offerId: string;
      status: "SENT";
      privateUrl: string;
      rawTokenShownOnce: true;
      alreadySent: false;
      auditEventId: string;
      activityId: string | null;
    }
  | {
      outcome: "already_sent";
      offerId: string;
      status: "SENT";
      privateUrl: null;
      rawTokenShownOnce: false;
      alreadySent: true;
      auditEventId: null;
      activityId: string | null;
    };

/**
 * Idempotent send:
 * - First successful send mints one token (hash only), flips DRAFT→SENT, returns raw URL once.
 * - Repeat send on SENT does not mint another token and never returns a raw token.
 */
export async function sendCommercialOffer(input: {
  offerId: string;
  operatorId: string;
  prisma?: PrismaClient;
}): Promise<SendCommercialOfferResult> {
  const db = input.prisma ?? defaultPrisma;
  const offer = await loadOfferForWrite(db, input.offerId);

  if (offer.status === "CANCELLED" || offer.status === "EXPIRED") {
    throw new CommercialOfferActionError(
      "Cancelled or expired offers cannot be sent.",
      "OFFER_NOT_SENDABLE",
      409,
    );
  }
  if (offer.status === "ACCEPTED") {
    throw new CommercialOfferActionError(
      "Accepted offers cannot be re-sent.",
      "OFFER_NOT_SENDABLE",
      409,
    );
  }

  if (offer.status === "SENT" || offer.status === "VIEWED") {
    const side = await ensureProspectOfferSentSideEffects({
      db,
      prospectId: offer.prospectId,
      offerId: offer.id,
      operatorId: input.operatorId,
    });
    return {
      outcome: "already_sent",
      offerId: offer.id,
      status: "SENT",
      privateUrl: null,
      rawTokenShownOnce: false,
      alreadySent: true,
      auditEventId: null,
      activityId: side.activityId,
    };
  }

  if (offer.status !== "DRAFT") {
    throw new CommercialOfferActionError(
      "Only DRAFT offers can be sent.",
      "OFFER_NOT_SENDABLE",
      409,
    );
  }

  if (!offer.expiresAt) {
    throw new CommercialOfferActionError(
      "Set an expiry date before sending.",
      "EXPIRY_REQUIRED",
    );
  }
  if (offer.expiresAt.getTime() <= Date.now()) {
    throw new CommercialOfferActionError(
      "Offer expiry is in the past.",
      "INVALID_EXPIRY",
    );
  }

  // Revoke any orphan draft tokens from a prior partial failure.
  const orphanTokens = offer.tokens.filter((t) => !t.revokedAt);
  for (const token of orphanTokens) {
    await db.commercialOfferToken.update({
      where: { id: token.id },
      data: { revokedAt: new Date() },
    });
  }

  const rawToken = createCommercialOfferRawToken();
  const tokenHash = hashCommercialOfferToken(rawToken);

  await db.commercialOfferToken.create({
    data: {
      offerId: offer.id,
      tokenHash,
      expiresAt: offer.expiresAt,
    },
  });

  const updated = await db.commercialOffer.updateMany({
    where: { id: offer.id, status: "DRAFT" },
    data: {
      status: "SENT",
      sentAt: new Date(),
    },
  });

  if (updated.count === 0) {
    // Concurrent send won — revoke the token we just created and return idempotent already_sent.
    await db.commercialOfferToken.updateMany({
      where: { offerId: offer.id, tokenHash },
      data: { revokedAt: new Date() },
    });
    const side = await ensureProspectOfferSentSideEffects({
      db,
      prospectId: offer.prospectId,
      offerId: offer.id,
      operatorId: input.operatorId,
    });
    return {
      outcome: "already_sent",
      offerId: offer.id,
      status: "SENT",
      privateUrl: null,
      rawTokenShownOnce: false,
      alreadySent: true,
      auditEventId: null,
      activityId: side.activityId,
    };
  }

  const side = await ensureProspectOfferSentSideEffects({
    db,
    prospectId: offer.prospectId,
    offerId: offer.id,
    operatorId: input.operatorId,
  });

  const audit = await writePlatformAuditEvent(
    {
      actorOperatorId: input.operatorId,
      actorType: "OPERATOR",
      action: COMMERCIAL_OFFER_AUDIT.SENT,
      entityType: COMMERCIAL_OFFER_ENTITY_TYPE,
      entityId: offer.id,
      summary: `Sent commercial offer ${offer.planCode} ${offer.billingCadence}`,
      metadata: {
        prospectId: offer.prospectId,
        planCode: offer.planCode,
        billingCadence: offer.billingCadence,
        negotiatedRecurringAmountCents: offer.negotiatedRecurringAmountCents,
        setupFeeCents: offer.setupFeeCents,
        expiresAt: offer.expiresAt.toISOString(),
        // Never include raw token or tokenHash
      },
    },
    db,
  );

  return {
    outcome: "sent",
    offerId: offer.id,
    status: "SENT",
    privateUrl: buildPrivateOfferUrl(rawToken),
    rawTokenShownOnce: true,
    alreadySent: false,
    auditEventId: audit.id,
    activityId: side.activityId,
  };
}

export async function cancelCommercialOffer(input: {
  offerId: string;
  operatorId: string;
  prisma?: PrismaClient;
}) {
  const db = input.prisma ?? defaultPrisma;
  const offer = await loadOfferForWrite(db, input.offerId);

  if (offer.status === "CANCELLED") {
    return {
      outcome: "already_cancelled" as const,
      offerId: offer.id,
      status: "CANCELLED" as const,
      auditEventId: null as string | null,
    };
  }

  if (offer.status === "ACCEPTED") {
    throw new CommercialOfferActionError(
      "Accepted offers cannot be cancelled.",
      "OFFER_NOT_CANCELABLE",
      409,
    );
  }

  if (!CANCELABLE_STATUSES.includes(offer.status)) {
    throw new CommercialOfferActionError(
      "This offer cannot be cancelled.",
      "OFFER_NOT_CANCELABLE",
      409,
    );
  }

  await db.commercialOffer.update({
    where: { id: offer.id },
    data: { status: "CANCELLED" },
  });

  await db.commercialOfferToken.updateMany({
    where: { offerId: offer.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  const audit = await writePlatformAuditEvent(
    {
      actorOperatorId: input.operatorId,
      actorType: "OPERATOR",
      action: COMMERCIAL_OFFER_AUDIT.CANCELLED,
      entityType: COMMERCIAL_OFFER_ENTITY_TYPE,
      entityId: offer.id,
      summary: `Cancelled commercial offer (was ${offer.status})`,
      metadata: {
        prospectId: offer.prospectId,
        fromStatus: offer.status,
      },
    },
    db,
  );

  return {
    outcome: "cancelled" as const,
    offerId: offer.id,
    status: "CANCELLED" as const,
    auditEventId: audit.id,
  };
}

/** Test helper — serialize without tokenHash (same as API). */
export function serializeOfferForApi(
  offer: Parameters<typeof serializeOfferSummary>[0],
) {
  return serializeOfferSummary(offer);
}
