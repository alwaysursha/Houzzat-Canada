/**
 * Master Admin resend of a commercial-offer invitation via token rotation.
 * Sequential Prisma writes only — never use interactive transactions.
 * Never recovers a prior secret. Never stores the secret, URL, or hash in audit.
 * Does not change offer terms, Stripe, subscription, or first-send behavior.
 */

import type { OfferStatus, PrismaClient } from "@prisma/client";
import { writePlatformAuditEvent } from "@/lib/platform/audit";
import {
  buildPrivateOfferUrl,
  COMMERCIAL_OFFER_AUDIT,
  COMMERCIAL_OFFER_ENTITY_TYPE,
} from "@/lib/platform/offers/constants";
import { CommercialOfferActionError } from "@/lib/platform/offers/errors";
import {
  createCommercialOfferRawToken,
  hashCommercialOfferToken,
} from "@/lib/platform/offers/token";
import { prisma as defaultPrisma } from "@/lib/prisma";

const RESENDABLE_STATUSES: OfferStatus[] = ["SENT", "VIEWED"];

export type ResendCommercialOfferInvitationResult = {
  outcome: "resent";
  offerId: string;
  status: "SENT" | "VIEWED";
  privateUrl: string;
  rawTokenShownOnce: true;
  newTokenId: string;
  revokedTokenIds: string[];
  revokedCount: number;
  auditEventId: string;
};

function assertResendableStatus(status: OfferStatus): asserts status is
  | "SENT"
  | "VIEWED" {
  if (status === "ACCEPTED") {
    throw new CommercialOfferActionError(
      "Accepted offers cannot have their invitation resent.",
      "OFFER_NOT_RESENDABLE",
      409,
    );
  }
  if (status === "DRAFT") {
    throw new CommercialOfferActionError(
      "Draft offers must be sent before their invitation can be resent.",
      "OFFER_NOT_RESENDABLE",
      409,
    );
  }
  if (status === "CANCELLED" || status === "EXPIRED") {
    throw new CommercialOfferActionError(
      "Cancelled or expired offers cannot have their invitation resent.",
      "OFFER_NOT_RESENDABLE",
      409,
    );
  }
  if (!RESENDABLE_STATUSES.includes(status)) {
    throw new CommercialOfferActionError(
      "This offer cannot have its invitation resent.",
      "OFFER_NOT_RESENDABLE",
      409,
    );
  }
}

function assertOfferExpiryInFuture(expiresAt: Date | null): Date {
  if (!expiresAt) {
    throw new CommercialOfferActionError(
      "This offer has no expiry date.",
      "EXPIRY_REQUIRED",
    );
  }
  if (expiresAt.getTime() <= Date.now()) {
    throw new CommercialOfferActionError(
      "Offer expiry is in the past.",
      "INVALID_EXPIRY",
    );
  }
  return expiresAt;
}

async function revokeTokenRow(
  db: PrismaClient,
  tokenId: string,
): Promise<void> {
  await db.commercialOfferToken.update({
    where: { id: tokenId },
    data: { revokedAt: new Date() },
  });
}

/**
 * Rotate the private offer link for a SENT/VIEWED offer and return the new
 * URL once. Persistence order: mint+persist replacement, re-check acceptance,
 * then revoke prior active rows. Email is a caller side-effect.
 */
export async function resendCommercialOfferInvitation(input: {
  offerId: string;
  operatorId: string;
  prisma?: PrismaClient;
}): Promise<ResendCommercialOfferInvitationResult> {
  const db = input.prisma ?? defaultPrisma;

  // 1. Validate offer is eligible.
  const offer = await db.commercialOffer.findUnique({
    where: { id: input.offerId },
    include: {
      acceptance: { select: { id: true } },
    },
  });
  if (!offer) {
    throw new CommercialOfferActionError("Offer not found.", "NOT_FOUND", 404);
  }
  if (offer.acceptance) {
    throw new CommercialOfferActionError(
      "Accepted offers cannot have their invitation resent.",
      "OFFER_NOT_RESENDABLE",
      409,
    );
  }
  assertResendableStatus(offer.status);
  const offerExpiresAt = assertOfferExpiryInFuture(offer.expiresAt);

  // 2–4. Mint secret, persist hash only, copy offer expiry.
  // Existing token rows stay active through this persist.
  const rawToken = createCommercialOfferRawToken();
  const tokenHash = hashCommercialOfferToken(rawToken);
  const created = await db.commercialOfferToken.create({
    data: {
      offerId: offer.id,
      tokenHash,
      expiresAt: offerExpiresAt,
    },
    select: { id: true },
  });

  // 5. Re-read offer/acceptance after the replacement exists.
  const fresh = await db.commercialOffer.findUnique({
    where: { id: offer.id },
    include: {
      acceptance: { select: { id: true } },
    },
  });
  if (!fresh) {
    await revokeTokenRow(db, created.id);
    throw new CommercialOfferActionError("Offer not found.", "NOT_FOUND", 404);
  }

  // If accepted during rotation: revoke only the new row, leave originals.
  if (fresh.status === "ACCEPTED" || fresh.acceptance) {
    await revokeTokenRow(db, created.id);
    await writePlatformAuditEvent(
      {
        actorOperatorId: input.operatorId,
        actorType: "OPERATOR",
        action: COMMERCIAL_OFFER_AUDIT.INVITATION_RESEND_ABORTED,
        entityType: COMMERCIAL_OFFER_ENTITY_TYPE,
        entityId: offer.id,
        summary: "Aborted offer invitation resend; offer was accepted during rotation",
        metadata: {
          prospectId: offer.prospectId,
          newTokenId: created.id,
          reason: "accepted_during_rotation",
          revokedNewToken: true,
        },
      },
      db,
    );
    throw new CommercialOfferActionError(
      "Accepted offers cannot have their invitation resent.",
      "OFFER_NOT_RESENDABLE",
      409,
    );
  }

  if (fresh.status !== "SENT" && fresh.status !== "VIEWED") {
    await revokeTokenRow(db, created.id);
    await writePlatformAuditEvent(
      {
        actorOperatorId: input.operatorId,
        actorType: "OPERATOR",
        action: COMMERCIAL_OFFER_AUDIT.INVITATION_RESEND_ABORTED,
        entityType: COMMERCIAL_OFFER_ENTITY_TYPE,
        entityId: offer.id,
        summary: `Aborted offer invitation resend; offer status is ${fresh.status}`,
        metadata: {
          prospectId: offer.prospectId,
          newTokenId: created.id,
          reason: "ineligible_during_rotation",
          status: fresh.status,
          revokedNewToken: true,
        },
      },
      db,
    );
    throw new CommercialOfferActionError(
      "This offer cannot have its invitation resent.",
      "OFFER_NOT_RESENDABLE",
      409,
    );
  }

  // 6. Revoke every other currently-unrevoked token for this offer.
  const activeTokens = await db.commercialOfferToken.findMany({
    where: { offerId: offer.id, revokedAt: null },
    select: { id: true },
  });
  const revokedTokenIds: string[] = [];
  for (const token of activeTokens) {
    if (token.id === created.id) continue;
    await revokeTokenRow(db, token.id);
    revokedTokenIds.push(token.id);
  }

  const audit = await writePlatformAuditEvent(
    {
      actorOperatorId: input.operatorId,
      actorType: "OPERATOR",
      action: COMMERCIAL_OFFER_AUDIT.INVITATION_RESENT,
      entityType: COMMERCIAL_OFFER_ENTITY_TYPE,
      entityId: offer.id,
      summary: `Resent commercial offer invitation (was ${fresh.status})`,
      metadata: {
        prospectId: offer.prospectId,
        newTokenId: created.id,
        revokedTokenIds,
        revokedCount: revokedTokenIds.length,
        status: fresh.status,
        expiresAt: offerExpiresAt.toISOString(),
      },
    },
    db,
  );

  return {
    outcome: "resent",
    offerId: offer.id,
    status: fresh.status,
    privateUrl: buildPrivateOfferUrl(rawToken),
    rawTokenShownOnce: true,
    newTokenId: created.id,
    revokedTokenIds,
    revokedCount: revokedTokenIds.length,
    auditEventId: audit.id,
  };
}
