/**
 * Post-persist customer email after Admin schedules a demo.
 * Persistence is primary: email failures never roll back scheduling.
 * Idempotency key = PlatformProspectActivity id for this schedule event.
 */

import type { PrismaClient } from "@prisma/client";
import { writePlatformAuditEvent } from "@/lib/platform/audit";
import { emailFromHouzzatPro } from "@/lib/email/config";
import { emailEnv } from "@/lib/email/env";
import {
  sendRenderedEmail,
  type SendEmailResult,
} from "@/lib/email/send";
import { prisma as defaultPrisma } from "@/lib/prisma";
import {
  renderDemoRescheduledEmail,
  renderDemoScheduledEmail,
  type DemoScheduledEmailVariant,
} from "./demo-scheduled-email-templates";

export const DEMO_SCHEDULED_EMAIL_AUDIT = {
  ATTEMPTED: "DEMO_SCHEDULED_EMAIL_ATTEMPTED",
} as const;

export type DemoScheduledEmailAttemptStatus = "sent" | "skipped" | "failed";

export type DemoScheduledNotifyResult = {
  status: DemoScheduledEmailAttemptStatus;
  reason?: string;
  variant?: DemoScheduledEmailVariant;
};

export type DemoScheduledNotifyInput = {
  prospectId: string;
  activityId: string;
  prisma?: PrismaClient;
  send?: typeof sendRenderedEmail;
};

function readDemoNotificationEmail(): string | null {
  return emailEnv("HOUZZATPRO_DEMO_NOTIFICATION_EMAIL") ?? null;
}

function instantMs(value: Date | string | null | undefined): number | null {
  if (value == null) return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

async function hasAttemptForActivity(
  db: PrismaClient,
  input: { prospectId: string; activityId: string },
): Promise<boolean> {
  const existing = await db.platformAuditEvent.findFirst({
    where: {
      entityType: "PlatformProspect",
      entityId: input.prospectId,
      action: DEMO_SCHEDULED_EMAIL_AUDIT.ATTEMPTED,
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
    status: DemoScheduledEmailAttemptStatus;
    reason?: string;
    variant?: DemoScheduledEmailVariant;
  },
): Promise<void> {
  await writePlatformAuditEvent(
    {
      actorOperatorId: null,
      actorType: "SYSTEM",
      action: DEMO_SCHEDULED_EMAIL_AUDIT.ATTEMPTED,
      entityType: "PlatformProspect",
      entityId: input.prospectId,
      summary: "Demo scheduled customer email attempted",
      metadata: {
        prospectId: input.prospectId,
        activityId: input.activityId,
        status: input.status,
        ...(input.reason ? { reason: input.reason } : {}),
        ...(input.variant ? { variant: input.variant } : {}),
      },
    },
    db,
  );
}

function mapSendResult(
  result: SendEmailResult,
): { status: DemoScheduledEmailAttemptStatus; reason?: string } {
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
 * Send at most one customer schedule/reschedule email per DEMO_SCHEDULED activityId.
 * Never throws — callers may ignore the result.
 */
export async function notifyDemoScheduledEmail(
  input: DemoScheduledNotifyInput,
): Promise<DemoScheduledNotifyResult> {
  const db = input.prisma ?? defaultPrisma;
  const send = input.send ?? sendRenderedEmail;

  try {
    if (
      await hasAttemptForActivity(db, {
        prospectId: input.prospectId,
        activityId: input.activityId,
      })
    ) {
      return { status: "skipped", reason: "already_attempted" };
    }

    const prospect = await db.platformProspect.findUnique({
      where: { id: input.prospectId },
      select: { id: true, email: true, contactName: true },
    });
    if (!prospect?.email?.trim()) {
      const result = { status: "failed" as const, reason: "missing_email" };
      await recordAttempt(db, {
        prospectId: input.prospectId,
        activityId: input.activityId,
        ...result,
      });
      return result;
    }

    const activity = await db.platformProspectActivity.findUnique({
      where: { id: input.activityId },
      select: {
        id: true,
        prospectId: true,
        type: true,
        scheduledAt: true,
      },
    });
    if (
      !activity ||
      activity.prospectId !== input.prospectId ||
      activity.type !== "DEMO_SCHEDULED"
    ) {
      const result = { status: "failed" as const, reason: "missing_activity" };
      await recordAttempt(db, {
        prospectId: input.prospectId,
        activityId: input.activityId,
        ...result,
      });
      return result;
    }
    if (!activity.scheduledAt) {
      const result = {
        status: "failed" as const,
        reason: "missing_scheduled_at",
      };
      await recordAttempt(db, {
        prospectId: input.prospectId,
        activityId: input.activityId,
        ...result,
      });
      return result;
    }

    const previous = await db.platformProspectActivity.findFirst({
      where: {
        prospectId: input.prospectId,
        type: "DEMO_SCHEDULED",
        id: { not: input.activityId },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, scheduledAt: true },
    });

    const previousMs = instantMs(previous?.scheduledAt);
    const nextMs = instantMs(activity.scheduledAt);
    if (previous && previousMs != null && nextMs != null && previousMs === nextMs) {
      const result = {
        status: "skipped" as const,
        reason: "duplicate_datetime",
      };
      await recordAttempt(db, {
        prospectId: input.prospectId,
        activityId: input.activityId,
        ...result,
      });
      return result;
    }

    const variant: DemoScheduledEmailVariant = previous
      ? "rescheduled"
      : "scheduled";
    const rendered =
      variant === "scheduled"
        ? renderDemoScheduledEmail({
            contactName: prospect.contactName,
            scheduledAt: activity.scheduledAt,
          })
        : renderDemoRescheduledEmail({
            contactName: prospect.contactName,
            scheduledAt: activity.scheduledAt,
          });

    const sendResult = await send({
      to: prospect.email,
      rendered,
      from: emailFromHouzzatPro(),
      replyTo: readDemoNotificationEmail() ?? undefined,
    });
    const mapped = mapSendResult(sendResult);
    await recordAttempt(db, {
      prospectId: input.prospectId,
      activityId: input.activityId,
      status: mapped.status,
      reason: mapped.reason,
      variant,
    });
    return { ...mapped, variant };
  } catch (error) {
    console.error(
      "[platform-demo-schedule] customer email failed",
      error instanceof Error ? error.message : "error",
    );
    const result = {
      status: "failed" as const,
      reason: "unexpected_error",
    };
    try {
      await recordAttempt(db, {
        prospectId: input.prospectId,
        activityId: input.activityId,
        ...result,
      });
    } catch {
      // Audit write failure must not affect scheduling.
    }
    return result;
  }
}
