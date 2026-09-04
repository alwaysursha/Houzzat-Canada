/**
 * Stage 6.8A — private offer acceptance (no Stripe / Workspace / Subscription).
 * Neon HTTP-safe sequential writes. OfferAcceptance.offerId UNIQUE is idempotency authority.
 *
 * Reconciliation strategy:
 * 1) Compute server commercialTermsHash + legal versions.
 * 2) If OfferAcceptance exists for offerId → reconcile offer ACCEPTED + prospect WON + audit once → success.
 * 3) Else create OfferAcceptance; on unique race, reload existing and reconcile.
 * 4) Transition offer SENT|VIEWED → ACCEPTED (findFirst + update; never updateMany).
 * 5) Prospect → WON with STATUS_CHANGE when needed.
 * 6) COMMERCIAL_OFFER_ACCEPTED audit once (findFirst gate).
 * Token is NOT revoked so the same private URL can show the accepted state.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { writePlatformAuditEvent } from "@/lib/platform/audit";
import {
  HOUZZATPRO_PRIVACY_VERSION,
  HOUZZATPRO_TERMS_VERSION,
} from "@/lib/platform/legal/versions";
import {
  COMMERCIAL_OFFER_AUDIT,
  COMMERCIAL_OFFER_ENTITY_TYPE,
} from "@/lib/platform/offers/constants";
import { commercialTermsHashFromOfferRow } from "@/lib/platform/offers/commercial-terms-hash";
import { hashCommercialOfferToken } from "@/lib/platform/offers/token";
import { normalizeProspectEmail } from "@/lib/platform/prospects/normalize-email";
import { prisma as defaultPrisma } from "@/lib/prisma";

export class OfferAcceptPublicError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, code: string, status = 400) {
    super(message);
    this.name = "OfferAcceptPublicError";
    this.status = status;
    this.code = code;
  }
}

export type AcceptPrivateOfferInput = {
  rawToken: string;
  email: string;
  acceptTerms: boolean;
  acceptPrivacy: boolean;
  acceptCommercialTerms: boolean;
  ipAddress?: string | null;
  userAgent?: string | null;
  prisma?: PrismaClient;
};

export type AcceptPrivateOfferResult = {
  outcome: "accepted" | "already_accepted";
  offerId: string;
  acceptanceId: string;
  termsVersion: string;
  privacyVersion: string;
};

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002",
  );
}

async function ensureAcceptedAudit(
  db: PrismaClient,
  input: {
    offerId: string;
    acceptanceId: string;
    termsVersion: string;
    privacyVersion: string;
  },
) {
  const existing = await db.platformAuditEvent.findFirst({
    where: {
      entityType: COMMERCIAL_OFFER_ENTITY_TYPE,
      entityId: input.offerId,
      action: COMMERCIAL_OFFER_AUDIT.ACCEPTED,
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  const row = await writePlatformAuditEvent(
    {
      actorOperatorId: null,
      actorType: "SYSTEM",
      action: COMMERCIAL_OFFER_AUDIT.ACCEPTED,
      entityType: COMMERCIAL_OFFER_ENTITY_TYPE,
      entityId: input.offerId,
      summary: "Private commercial offer accepted",
      metadata: {
        offerId: input.offerId,
        acceptanceId: input.acceptanceId,
        termsVersion: input.termsVersion,
        privacyVersion: input.privacyVersion,
      },
    },
    db,
  );
  return row.id;
}

async function reconcileAcceptedState(
  db: PrismaClient,
  input: {
    offerId: string;
    prospectId: string;
    acceptanceId: string;
    acceptedEmail: string;
    acceptedAt: Date;
    termsVersion: string;
    privacyVersion: string;
    commercialTermsHash: string;
    acceptedSnapshot: Prisma.InputJsonValue;
  },
): Promise<void> {
  const offer = await db.commercialOffer.findUnique({
    where: { id: input.offerId },
    select: {
      id: true,
      status: true,
      acceptedAt: true,
      acceptedByEmail: true,
    },
  });
  if (!offer) {
    throw new OfferAcceptPublicError(
      "This private offer is no longer available.",
      "OFFER_UNAVAILABLE",
      404,
    );
  }

  if (offer.status !== "ACCEPTED") {
    if (offer.status === "SENT" || offer.status === "VIEWED") {
      await db.commercialOffer.update({
        where: { id: input.offerId },
        data: {
          status: "ACCEPTED",
          acceptedAt: offer.acceptedAt ?? input.acceptedAt,
          acceptedByEmail: offer.acceptedByEmail ?? input.acceptedEmail,
          acceptedSnapshotJson: input.acceptedSnapshot,
        },
      });
    } else {
      throw new OfferAcceptPublicError(
        "This private offer is no longer available.",
        "OFFER_UNAVAILABLE",
        409,
      );
    }
  } else if (!offer.acceptedAt || !offer.acceptedByEmail) {
    await db.commercialOffer.update({
      where: { id: input.offerId },
      data: {
        acceptedAt: offer.acceptedAt ?? input.acceptedAt,
        acceptedByEmail: offer.acceptedByEmail ?? input.acceptedEmail,
        acceptedSnapshotJson: input.acceptedSnapshot,
      },
    });
  }

  const prospect = await db.platformProspect.findUnique({
    where: { id: input.prospectId },
    select: { id: true, status: true },
  });
  if (prospect && prospect.status !== "WON") {
    const fromStatus = prospect.status;
    await db.platformProspect.update({
      where: { id: prospect.id },
      data: { status: "WON" },
    });
    await db.platformProspectActivity.create({
      data: {
        prospectId: prospect.id,
        type: "STATUS_CHANGE",
        body: `${fromStatus} → WON (commercial offer accepted)`,
        operatorId: null,
      },
    });
  }

  await ensureAcceptedAudit(db, {
    offerId: input.offerId,
    acceptanceId: input.acceptanceId,
    termsVersion: input.termsVersion,
    privacyVersion: input.privacyVersion,
  });
}

/**
 * Accept a private commercial offer.
 * Does NOT create Stripe / Subscription / Workspace / entitlements / provisioning.
 */
export async function acceptPrivateOfferByRawToken(
  input: AcceptPrivateOfferInput,
): Promise<AcceptPrivateOfferResult> {
  const db = input.prisma ?? defaultPrisma;
  const raw = input.rawToken?.trim();
  if (!raw || raw.length < 16 || raw.length > 256) {
    throw new OfferAcceptPublicError(
      "This private offer is no longer available.",
      "OFFER_UNAVAILABLE",
      404,
    );
  }

  if (!input.acceptTerms || !input.acceptPrivacy || !input.acceptCommercialTerms) {
    throw new OfferAcceptPublicError(
      "Please confirm all required acknowledgements to continue.",
      "ACKNOWLEDGEMENTS_REQUIRED",
      400,
    );
  }

  const email = normalizeProspectEmail(input.email ?? "");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new OfferAcceptPublicError(
      "Please enter a valid email address.",
      "INVALID_EMAIL",
      400,
    );
  }

  const tokenHash = hashCommercialOfferToken(raw);
  const token = await db.commercialOfferToken.findUnique({
    where: { tokenHash },
    include: {
      offer: {
        include: {
          lineItems: { orderBy: { sortOrder: "asc" } },
          prospect: { select: { id: true, email: true, status: true } },
          acceptance: true,
        },
      },
    },
  });

  if (!token || token.revokedAt) {
    throw new OfferAcceptPublicError(
      "This private offer is no longer available.",
      "OFFER_UNAVAILABLE",
      404,
    );
  }

  const now = Date.now();
  if (token.expiresAt.getTime() <= now) {
    throw new OfferAcceptPublicError(
      "This private offer is no longer available.",
      "OFFER_UNAVAILABLE",
      404,
    );
  }

  const offer = token.offer;
  if (!offer) {
    throw new OfferAcceptPublicError(
      "This private offer is no longer available.",
      "OFFER_UNAVAILABLE",
      404,
    );
  }

  if (offer.expiresAt && offer.expiresAt.getTime() <= now) {
    throw new OfferAcceptPublicError(
      "This private offer is no longer available.",
      "OFFER_UNAVAILABLE",
      404,
    );
  }

  if (offer.status === "CANCELLED" || offer.status === "EXPIRED" || offer.status === "DRAFT") {
    throw new OfferAcceptPublicError(
      "This private offer is no longer available.",
      "OFFER_UNAVAILABLE",
      404,
    );
  }

  if (offer.status !== "SENT" && offer.status !== "VIEWED" && offer.status !== "ACCEPTED") {
    throw new OfferAcceptPublicError(
      "This private offer is no longer available.",
      "OFFER_UNAVAILABLE",
      404,
    );
  }

  const prospectEmail = normalizeProspectEmail(offer.prospect.email);
  if (email !== prospectEmail) {
    throw new OfferAcceptPublicError(
      "The email address does not match this private offer.",
      "EMAIL_MISMATCH",
      400,
    );
  }

  const termsVersion = HOUZZATPRO_TERMS_VERSION;
  const privacyVersion = HOUZZATPRO_PRIVACY_VERSION;
  const commercialTermsHash = commercialTermsHashFromOfferRow(offer);
  const acceptedSnapshot = {
    offerId: offer.id,
    version: offer.version,
    planCode: offer.planCode,
    billingCadence: offer.billingCadence,
    currency: offer.currency,
    negotiatedRecurringAmountCents: offer.negotiatedRecurringAmountCents,
    setupFeeCents: offer.setupFeeCents,
    includedSeats: offer.includedSeats,
    additionalSeats: offer.additionalSeats,
    trialDays: offer.trialDays,
    commercialTermsHash,
    termsVersion,
    privacyVersion,
  } satisfies Prisma.InputJsonObject;

  // Idempotent path when acceptance already exists.
  if (offer.acceptance) {
    await reconcileAcceptedState(db, {
      offerId: offer.id,
      prospectId: offer.prospectId,
      acceptanceId: offer.acceptance.id,
      acceptedEmail: offer.acceptance.acceptedEmail,
      acceptedAt: offer.acceptance.acceptedAt,
      termsVersion: offer.acceptance.termsVersion,
      privacyVersion: offer.acceptance.privacyVersion,
      commercialTermsHash: offer.acceptance.commercialTermsHash,
      acceptedSnapshot,
    });
    return {
      outcome: "already_accepted",
      offerId: offer.id,
      acceptanceId: offer.acceptance.id,
      termsVersion: offer.acceptance.termsVersion,
      privacyVersion: offer.acceptance.privacyVersion,
    };
  }

  if (offer.status === "ACCEPTED") {
    // Acceptance row missing but status ACCEPTED — create/reconcile using UNIQUE.
  }

  const acceptedAt = new Date();
  let acceptanceId: string;

  try {
    const created = await db.offerAcceptance.create({
      data: {
        offerId: offer.id,
        acceptedAt,
        acceptedEmail: email,
        termsVersion,
        privacyVersion,
        commercialTermsHash,
        ipAddress: input.ipAddress?.slice(0, 64) || null,
        userAgent: input.userAgent?.slice(0, 512) || null,
      },
      select: { id: true },
    });
    acceptanceId = created.id;
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const existing = await db.offerAcceptance.findUnique({
      where: { offerId: offer.id },
    });
    if (!existing) throw error;
    await reconcileAcceptedState(db, {
      offerId: offer.id,
      prospectId: offer.prospectId,
      acceptanceId: existing.id,
      acceptedEmail: existing.acceptedEmail,
      acceptedAt: existing.acceptedAt,
      termsVersion: existing.termsVersion,
      privacyVersion: existing.privacyVersion,
      commercialTermsHash: existing.commercialTermsHash,
      acceptedSnapshot,
    });
    return {
      outcome: "already_accepted",
      offerId: offer.id,
      acceptanceId: existing.id,
      termsVersion: existing.termsVersion,
      privacyVersion: existing.privacyVersion,
    };
  }

  await reconcileAcceptedState(db, {
    offerId: offer.id,
    prospectId: offer.prospectId,
    acceptanceId,
    acceptedEmail: email,
    acceptedAt,
    termsVersion,
    privacyVersion,
    commercialTermsHash,
    acceptedSnapshot,
  });

  return {
    outcome: "accepted",
    offerId: offer.id,
    acceptanceId,
    termsVersion,
    privacyVersion,
  };
}
