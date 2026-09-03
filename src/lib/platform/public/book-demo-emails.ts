/**
 * Stage 6.6C — Book a Demo email notifications (post-persist).
 * Persistence is primary: email failures never roll back intake.
 * Idempotency key = PlatformProspectActivity id for this intake event.
 */

import type { PrismaClient } from "@prisma/client";
import { writePlatformAuditEvent } from "@/lib/platform/audit";
import {
  buildMasterAdminProspectUrl,
  renderBookDemoConfirmationEmail,
  renderBookDemoInternalNotificationEmail,
  type BookDemoEmailFields,
} from "@/lib/platform/public/book-demo-email-templates";
import { emailFromHouzzatPro } from "@/lib/email/config";
import { emailEnv } from "@/lib/email/env";
import {
  sendRenderedEmail,
  type SendEmailResult,
} from "@/lib/email/send";
import { prisma as defaultPrisma } from "@/lib/prisma";

export const BOOK_DEMO_EMAIL_AUDIT = {
  INTERNAL_ATTEMPTED: "DEMO_INTERNAL_EMAIL_ATTEMPTED",
  CONFIRMATION_ATTEMPTED: "DEMO_CONFIRMATION_EMAIL_ATTEMPTED",
} as const;

export type BookDemoEmailAttemptStatus = "sent" | "skipped" | "failed";

export type BookDemoNotifyInput = {
  prospectId: string;
  activityId: string;
  fields: BookDemoEmailFields;
  prisma?: PrismaClient;
  /** Test seam — defaults to sendRenderedEmail. */
  send?: typeof sendRenderedEmail;
};

export type BookDemoNotifyResult = {
  internal: {
    status: BookDemoEmailAttemptStatus;
    reason?: string;
  };
  confirmation: {
    status: BookDemoEmailAttemptStatus;
    reason?: string;
  };
};

function readDemoNotificationEmail(): string | null {
  return emailEnv("HOUZZATPRO_DEMO_NOTIFICATION_EMAIL") ?? null;
}

async function hasAttemptForActivity(
  db: PrismaClient,
  input: {
    prospectId: string;
    activityId: string;
    action: string;
  },
): Promise<boolean> {
  const existing = await db.platformAuditEvent.findFirst({
    where: {
      entityType: "PlatformProspect",
      entityId: input.prospectId,
      action: input.action,
      metadata: {
        path: ["activityId"],
        equals: input.activityId,
      },
    },
    select: { id: true },
  });
  return Boolean(existing);
}

async function recordAttempt(
  db: PrismaClient,
  input: {
    prospectId: string;
    activityId: string;
    action: string;
    status: BookDemoEmailAttemptStatus;
    reason?: string;
  },
): Promise<void> {
  await writePlatformAuditEvent(
    {
      actorOperatorId: null,
      actorType: "SYSTEM",
      action: input.action,
      entityType: "PlatformProspect",
      entityId: input.prospectId,
      summary:
        input.action === BOOK_DEMO_EMAIL_AUDIT.INTERNAL_ATTEMPTED
          ? "Demo internal notification email attempted"
          : "Demo confirmation email attempted",
      metadata: {
        prospectId: input.prospectId,
        activityId: input.activityId,
        status: input.status,
        ...(input.reason ? { reason: input.reason } : {}),
        // Never include raw token, secrets, message bodies, or full provider payloads.
      },
    },
    db,
  );
}

function mapSendResult(
  result: SendEmailResult,
): { status: BookDemoEmailAttemptStatus; reason?: string } {
  if (result.ok && result.status === "sent") {
    return { status: "sent" };
  }
  if (result.ok && result.status === "skipped") {
    return { status: "skipped", reason: "resend_unconfigured" };
  }
  return {
    status: "failed",
    reason: "provider_error",
  };
}

/**
 * Send at most one internal + one confirmation email per intake activityId.
 * Never throws — callers may ignore the result.
 */
export async function notifyBookDemoEmails(
  input: BookDemoNotifyInput,
): Promise<BookDemoNotifyResult> {
  const db = input.prisma ?? defaultPrisma;
  const send = input.send ?? sendRenderedEmail;
  const from = emailFromHouzzatPro();
  const replyTo = readDemoNotificationEmail();

  const out: BookDemoNotifyResult = {
    internal: { status: "skipped", reason: "not_run" },
    confirmation: { status: "skipped", reason: "not_run" },
  };

  // --- Internal notification ---
  try {
    if (
      await hasAttemptForActivity(db, {
        prospectId: input.prospectId,
        activityId: input.activityId,
        action: BOOK_DEMO_EMAIL_AUDIT.INTERNAL_ATTEMPTED,
      })
    ) {
      out.internal = { status: "skipped", reason: "already_attempted" };
    } else {
      const to = readDemoNotificationEmail();
      if (!to) {
        out.internal = {
          status: "skipped",
          reason: "missing_notification_email",
        };
        console.error(
          "[platform-public-book-demo] HOUZZATPRO_DEMO_NOTIFICATION_EMAIL is not configured",
        );
        await recordAttempt(db, {
          prospectId: input.prospectId,
          activityId: input.activityId,
          action: BOOK_DEMO_EMAIL_AUDIT.INTERNAL_ATTEMPTED,
          status: "skipped",
          reason: "missing_notification_email",
        });
      } else {
        const rendered = renderBookDemoInternalNotificationEmail({
          fields: input.fields,
          prospectId: input.prospectId,
        });
        const sendResult = await send({
          to,
          rendered,
          from,
        });
        out.internal = mapSendResult(sendResult);
        await recordAttempt(db, {
          prospectId: input.prospectId,
          activityId: input.activityId,
          action: BOOK_DEMO_EMAIL_AUDIT.INTERNAL_ATTEMPTED,
          status: out.internal.status,
          reason: out.internal.reason,
        });
      }
    }
  } catch (error) {
    console.error(
      "[platform-public-book-demo] internal notification failed",
      error instanceof Error ? error.message : "error",
    );
    out.internal = { status: "failed", reason: "unexpected_error" };
    try {
      await recordAttempt(db, {
        prospectId: input.prospectId,
        activityId: input.activityId,
        action: BOOK_DEMO_EMAIL_AUDIT.INTERNAL_ATTEMPTED,
        status: "failed",
        reason: "unexpected_error",
      });
    } catch {
      // Audit write failure must not affect intake.
    }
  }

  // --- Prospect confirmation ---
  try {
    if (
      await hasAttemptForActivity(db, {
        prospectId: input.prospectId,
        activityId: input.activityId,
        action: BOOK_DEMO_EMAIL_AUDIT.CONFIRMATION_ATTEMPTED,
      })
    ) {
      out.confirmation = { status: "skipped", reason: "already_attempted" };
    } else {
      const rendered = renderBookDemoConfirmationEmail({
        contactName: input.fields.contactName,
      });
      const sendResult = await send({
        to: input.fields.email,
        rendered,
        from,
        replyTo: replyTo ?? undefined,
      });
      out.confirmation = mapSendResult(sendResult);
      await recordAttempt(db, {
        prospectId: input.prospectId,
        activityId: input.activityId,
        action: BOOK_DEMO_EMAIL_AUDIT.CONFIRMATION_ATTEMPTED,
        status: out.confirmation.status,
        reason: out.confirmation.reason,
      });
    }
  } catch (error) {
    console.error(
      "[platform-public-book-demo] confirmation email failed",
      error instanceof Error ? error.message : "error",
    );
    out.confirmation = { status: "failed", reason: "unexpected_error" };
    try {
      await recordAttempt(db, {
        prospectId: input.prospectId,
        activityId: input.activityId,
        action: BOOK_DEMO_EMAIL_AUDIT.CONFIRMATION_ATTEMPTED,
        status: "failed",
        reason: "unexpected_error",
      });
    } catch {
      // ignore
    }
  }

  return out;
}

export { buildMasterAdminProspectUrl };
