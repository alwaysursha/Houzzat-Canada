/**
 * Post-persist customer invitation after Admin sends or resends a commercial offer.
 * Persistence is primary: email failures never roll back send/rotation.
 * First send: idempotency key = CommercialOffer id.
 * Resend: pass commercialOfferTokenId; idempotency key = that token row id.
 * Never persist, audit, or log the secret, private URL, or hash.
 */

import type { PrismaClient } from "@prisma/client";
import { writePlatformAuditEvent } from "@/lib/platform/audit";
import { emailFromHouzzatPro } from "@/lib/email/config";
import { emailEnv } from "@/lib/email/env";
import {
  sendRenderedEmail,
  type SendEmailResult,
} from "@/lib/email/send";
import {
  COMMERCIAL_OFFER_ENTITY_TYPE,
  COMMERCIAL_OFFER_TOKEN_ENTITY_TYPE,
  PRIVATE_OFFER_PATH_PREFIX,
  PRIVATE_OFFER_PUBLIC_ORIGIN,
} from "@/lib/platform/offers/constants";
import { prisma as defaultPrisma } from "@/lib/prisma";
import { renderOfferInvitationEmail } from "./offer-invitation-email-templates";

export const OFFER_INVITATION_EMAIL_AUDIT = {
  ATTEMPTED: "OFFER_INVITATION_EMAIL_ATTEMPTED",
} as const;

export type OfferInvitationEmailAttemptStatus = "sent" | "skipped" | "failed";

export type OfferInvitationNotifyResult = {
  status: OfferInvitationEmailAttemptStatus;
  reason?: string;
};

export type OfferInvitationNotifyInput = {
  offerId: string;
  /** In-memory URL only. Never written to audit or logs. */
  privateUrl: string;
  /**
   * When set, this is a rotation/resend attempt keyed by the new token row
   * (SENT or VIEWED). First send omits this and stays keyed by offer id.
   */
  commercialOfferTokenId?: string;
  prisma?: PrismaClient;
  send?: typeof sendRenderedEmail;
};

const PRIVATE_URL_PREFIX = `${PRIVATE_OFFER_PUBLIC_ORIGIN}${PRIVATE_OFFER_PATH_PREFIX}/`;

function readDemoNotificationEmail(): string | null {
  return emailEnv("HOUZZATPRO_DEMO_NOTIFICATION_EMAIL") ?? null;
}

function isUsablePrivateUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed.startsWith(PRIVATE_URL_PREFIX)) return false;
  const token = trimmed.slice(PRIVATE_URL_PREFIX.length);
  return token.length >= 16 && !token.includes("/");
}

async function hasAttemptForOffer(
  db: PrismaClient,
  offerId: string,
): Promise<boolean> {
  const existing = await db.platformAuditEvent.findFirst({
    where: {
      entityType: COMMERCIAL_OFFER_ENTITY_TYPE,
      entityId: offerId,
      action: OFFER_INVITATION_EMAIL_AUDIT.ATTEMPTED,
    },
    select: { id: true },
  });
  return Boolean(existing);
}

async function hasAttemptForTokenRow(
  db: PrismaClient,
  commercialOfferTokenId: string,
): Promise<boolean> {
  const existing = await db.platformAuditEvent.findFirst({
    where: {
      entityType: COMMERCIAL_OFFER_TOKEN_ENTITY_TYPE,
      entityId: commercialOfferTokenId,
      action: OFFER_INVITATION_EMAIL_AUDIT.ATTEMPTED,
    },
    select: { id: true },
  });
  return Boolean(existing);
}

async function recordAttempt(
  db: PrismaClient,
  input: {
    offerId: string;
    prospectId: string | null;
    status: OfferInvitationEmailAttemptStatus;
    reason?: string;
    commercialOfferTokenId?: string;
  },
): Promise<void> {
  const isResend = Boolean(input.commercialOfferTokenId);
  await writePlatformAuditEvent(
    {
      actorOperatorId: null,
      actorType: "SYSTEM",
      action: OFFER_INVITATION_EMAIL_AUDIT.ATTEMPTED,
      entityType: isResend
        ? COMMERCIAL_OFFER_TOKEN_ENTITY_TYPE
        : COMMERCIAL_OFFER_ENTITY_TYPE,
      entityId: input.commercialOfferTokenId ?? input.offerId,
      summary: isResend
        ? "Commercial offer invitation email attempted after resend"
        : "Commercial offer invitation email attempted",
      metadata: {
        offerId: input.offerId,
        prospectId: input.prospectId,
        status: input.status,
        ...(input.commercialOfferTokenId
          ? { commercialOfferTokenId: input.commercialOfferTokenId }
          : {}),
        ...(input.reason ? { reason: input.reason } : {}),
      },
    },
    db,
  );
}

function mapSendResult(
  result: SendEmailResult,
): OfferInvitationNotifyResult {
  if (result.ok && result.status === "sent") {
    return { status: "sent" };
  }
  if (result.ok && result.status === "skipped") {
    return { status: "skipped", reason: "resend_unconfigured" };
  }
  return { status: "failed", reason: "provider_error" };
}

function offerStatusAllowsInvitation(
  status: string,
  isResend: boolean,
): boolean {
  if (status === "SENT") return true;
  return isResend && status === "VIEWED";
}

/**
 * Send an invitation email.
 * First send: at most one attempt per CommercialOffer (SENT only).
 * Resend: at most one attempt per token row (SENT or VIEWED).
 * Never throws — callers may ignore the result.
 */
export async function notifyOfferInvitationEmail(
  input: OfferInvitationNotifyInput,
): Promise<OfferInvitationNotifyResult> {
  const db = input.prisma ?? defaultPrisma;
  const send = input.send ?? sendRenderedEmail;
  const commercialOfferTokenId = input.commercialOfferTokenId?.trim() || undefined;
  const isResend = Boolean(commercialOfferTokenId);
  let prospectId: string | null = null;

  try {
    if (isResend && commercialOfferTokenId) {
      if (await hasAttemptForTokenRow(db, commercialOfferTokenId)) {
        return { status: "skipped", reason: "already_attempted" };
      }
    } else if (await hasAttemptForOffer(db, input.offerId)) {
      return { status: "skipped", reason: "already_attempted" };
    }

    if (!isUsablePrivateUrl(input.privateUrl)) {
      const result = {
        status: "failed" as const,
        reason: "invalid_offer_url",
      };
      await recordAttempt(db, {
        offerId: input.offerId,
        prospectId: null,
        commercialOfferTokenId,
        ...result,
      });
      return result;
    }

    const offer = await db.commercialOffer.findUnique({
      where: { id: input.offerId },
      select: {
        id: true,
        prospectId: true,
        status: true,
        expiresAt: true,
      },
    });
    if (!offer) {
      const result = { status: "failed" as const, reason: "missing_offer" };
      await recordAttempt(db, {
        offerId: input.offerId,
        prospectId: null,
        commercialOfferTokenId,
        ...result,
      });
      return result;
    }
    prospectId = offer.prospectId;
    if (!offerStatusAllowsInvitation(offer.status, isResend)) {
      const result = { status: "skipped" as const, reason: "offer_not_sent" };
      await recordAttempt(db, {
        offerId: input.offerId,
        prospectId,
        commercialOfferTokenId,
        ...result,
      });
      return result;
    }

    const prospect = await db.platformProspect.findUnique({
      where: { id: offer.prospectId },
      select: { email: true, contactName: true },
    });
    if (!prospect?.email?.trim()) {
      const result = { status: "failed" as const, reason: "missing_email" };
      await recordAttempt(db, {
        offerId: input.offerId,
        prospectId,
        commercialOfferTokenId,
        ...result,
      });
      return result;
    }

    const rendered = renderOfferInvitationEmail({
      contactName: prospect.contactName ?? "",
      offerUrl: input.privateUrl.trim(),
      expiresAt: offer.expiresAt,
    });
    const sendResult = await send({
      to: prospect.email,
      rendered,
      from: emailFromHouzzatPro(),
      replyTo: readDemoNotificationEmail() ?? undefined,
    });
    const mapped = mapSendResult(sendResult);
    await recordAttempt(db, {
      offerId: input.offerId,
      prospectId,
      commercialOfferTokenId,
      status: mapped.status,
      reason: mapped.reason,
    });
    return mapped;
  } catch (error) {
    console.error(
      "[platform-offer-send] invitation email failed",
      error instanceof Error ? error.message : "error",
    );
    const result = {
      status: "failed" as const,
      reason: "unexpected_error",
    };
    try {
      await recordAttempt(db, {
        offerId: input.offerId,
        prospectId,
        commercialOfferTokenId,
        ...result,
      });
    } catch {
      // Audit write failure must not affect offer send/resend.
    }
    return result;
  }
}

export function offerInvitationSendNotice(input: {
  outcome: string;
  emailStatus: OfferInvitationEmailAttemptStatus;
}): string {
  if (input.outcome !== "sent") {
    return "Offer was already sent. The private link is not shown again.";
  }
  if (input.emailStatus === "sent") {
    return "Your proposal was emailed to the prospect. This private link is shown once — store it securely if you also want a copy.";
  }
  if (input.emailStatus === "failed") {
    return "Offer sent. The invitation email could not be delivered. This private link is shown once — share it securely with the prospect.";
  }
  return "Offer sent. This private link is shown once. Store/share it securely.";
}

export function offerInvitationResendNotice(input: {
  emailStatus: OfferInvitationEmailAttemptStatus;
}): string {
  if (input.emailStatus === "sent") {
    return "Invitation emailed to the prospect. The previous private link is no longer valid. This new private link is shown once — store it securely if you also want a copy.";
  }
  if (input.emailStatus === "failed") {
    return "The invitation email could not be delivered. The previous private link is no longer valid. Copy Secure Link below and share it with the prospect.";
  }
  return "The previous private link is no longer valid. This new private link is shown once. Store/share it securely.";
}
