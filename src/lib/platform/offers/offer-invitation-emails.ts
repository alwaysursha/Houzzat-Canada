/**
 * Post-persist customer invitation after Admin first-sends a commercial offer.
 * Persistence is primary: email failures never roll back SENT.
 * Idempotency key = CommercialOffer id.
 * Never persist, audit, or log the raw token / private URL / token hash.
 */

import type { PrismaClient } from "@prisma/client";
import { writePlatformAuditEvent } from "@/lib/platform/audit";
import { emailFromHouzzatPro } from "@/lib/email/config";
import { emailEnv } from "@/lib/email/env";
import {
  sendRenderedEmail,
  type SendEmailResult,
} from "@/lib/email/send";
import { PRIVATE_OFFER_PUBLIC_ORIGIN, PRIVATE_OFFER_PATH_PREFIX } from "@/lib/platform/offers/constants";
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
  /** In-memory first-send URL only. Never written to audit or logs. */
  privateUrl: string;
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
      entityType: "CommercialOffer",
      entityId: offerId,
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
  },
): Promise<void> {
  await writePlatformAuditEvent(
    {
      actorOperatorId: null,
      actorType: "SYSTEM",
      action: OFFER_INVITATION_EMAIL_AUDIT.ATTEMPTED,
      entityType: "CommercialOffer",
      entityId: input.offerId,
      summary: "Commercial offer invitation email attempted",
      metadata: {
        offerId: input.offerId,
        prospectId: input.prospectId,
        status: input.status,
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

/**
 * Send at most one invitation email per CommercialOffer.
 * Never throws — callers may ignore the result.
 */
export async function notifyOfferInvitationEmail(
  input: OfferInvitationNotifyInput,
): Promise<OfferInvitationNotifyResult> {
  const db = input.prisma ?? defaultPrisma;
  const send = input.send ?? sendRenderedEmail;
  let prospectId: string | null = null;

  try {
    if (await hasAttemptForOffer(db, input.offerId)) {
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
        ...result,
      });
      return result;
    }
    prospectId = offer.prospectId;
    if (offer.status !== "SENT") {
      const result = { status: "skipped" as const, reason: "offer_not_sent" };
      await recordAttempt(db, {
        offerId: input.offerId,
        prospectId,
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
        ...result,
      });
    } catch {
      // Audit write failure must not affect offer send.
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
