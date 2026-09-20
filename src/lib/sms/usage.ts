/**
 * Per-workspace SMS segment usage + allowance.
 * No message bodies. Idempotent on Twilio Message SID.
 * No Stripe SMS credits.
 */
import type { PlanCode, PrismaClient } from "@prisma/client";
import { getPlanDefinition } from "@/lib/platform/catalog/plans";
import {
  HOUZZAT_LEGACY_ENTITLEMENT_PROFILE,
  HOUZZAT_LEGACY_INCLUDED_SMS_SEGMENTS,
} from "@/lib/platform/entitlements/profiles";
import { prisma } from "@/lib/prisma";
import { estimateSmsSegmentCount } from "@/lib/sms/segments";

export const SMS_USAGE_CATEGORIES = [
  "AUTOMATION",
  "AGENT_INDIVIDUAL",
  "AGENT_MASS",
  "AGENT_NOTIFICATION",
] as const;

export type SmsUsageCategory = (typeof SMS_USAGE_CATEGORIES)[number];

/** Tenant Agent composer + Mass SMS. System automations do not consume this pool. */
export const SMS_MANUAL_USAGE_CATEGORIES: readonly SmsUsageCategory[] = [
  "AGENT_INDIVIDUAL",
  "AGENT_MASS",
];

/** Lead-directed published automations. Independent of manual usage. */
export const SMS_AUTOMATION_USAGE_CATEGORIES: readonly SmsUsageCategory[] = [
  "AUTOMATION",
];

/** Assigned-Agent system notifications. Recorded, never gated by allowance. */
export const SMS_AGENT_NOTIFICATION_USAGE_CATEGORIES: readonly SmsUsageCategory[] =
  ["AGENT_NOTIFICATION"];

export const SMS_USAGE_RECIPIENT_TYPES = ["LEAD", "AGENT"] as const;
export type SmsUsageRecipientType = (typeof SMS_USAGE_RECIPIENT_TYPES)[number];

export const SMS_SEGMENT_COUNT_SOURCES = ["ESTIMATED", "PROVIDER"] as const;
export type SmsSegmentCountSource = (typeof SMS_SEGMENT_COUNT_SOURCES)[number];

export type SmsUsageAllowanceReason =
  | "ALLOWANCE_NOT_CONFIGURED"
  | "ALLOWANCE_EXCEEDED"
  | null;

export type SmsUsagePeriod = {
  start: Date;
  end: Date;
};

export type SmsUsageSnapshot = {
  workspaceId: string;
  period: SmsUsagePeriod;
  usedSegments: number;
  allowanceSegments: number | null;
  remainingSegments: number | null;
  permitted: boolean;
  reason: SmsUsageAllowanceReason;
};

export type SmsUsageEventRow = {
  id: string;
  workspaceId: string;
  periodStart: Date;
  periodEnd: Date;
  category: SmsUsageCategory;
  recipientType: SmsUsageRecipientType;
  twilioMessageSid: string | null;
  messageId: string | null;
  segmentCount: number;
  segmentCountSource: SmsSegmentCountSource;
  finalized: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type SmsUsageDb = {
  smsUsageEvent: {
    findUnique: (args: {
      where: { twilioMessageSid: string };
    }) => Promise<SmsUsageEventRow | null>;
    findMany: (args: {
      where: {
        workspaceId: string;
        periodStart: Date;
        periodEnd: Date;
      };
    }) => Promise<SmsUsageEventRow[]>;
    create: (args: {
      data: Omit<SmsUsageEventRow, "id" | "createdAt" | "updatedAt"> & {
        id?: string;
      };
    }) => Promise<SmsUsageEventRow>;
    update: (args: {
      where: { id: string };
      data: Partial<
        Pick<
          SmsUsageEventRow,
          | "segmentCount"
          | "segmentCountSource"
          | "finalized"
          | "messageId"
          | "updatedAt"
        >
      >;
    }) => Promise<SmsUsageEventRow>;
  };
  workspace?: {
    findUnique: (args: {
      where: { id: string };
      select: { currentSubscriptionId: true };
    }) => Promise<{ currentSubscriptionId: string | null } | null>;
  };
  subscription?: {
    findUnique: (args: {
      where: { id: string };
      select: {
        planCode: true;
        entitlementProfileCode: true;
        currentPeriodStart: true;
        currentPeriodEnd: true;
      };
    }) => Promise<{
      planCode: PlanCode | null;
      entitlementProfileCode: string | null;
      currentPeriodStart: Date | null;
      currentPeriodEnd: Date | null;
    } | null>;
  };
};

export type RecordSmsUsageInput = {
  workspaceId: string;
  category: SmsUsageCategory;
  recipientType: SmsUsageRecipientType;
  twilioMessageSid?: string | null;
  messageId?: string | null;
  body?: string | null;
  segmentCount?: number | null;
  segmentCountSource?: SmsSegmentCountSource;
  now?: Date;
};

function calendarMonthUtc(now: Date): SmsUsagePeriod {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  );
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0),
  );
  return { start, end };
}

export function resolveSmsUsagePeriod(
  subscription: {
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
  } | null,
  now: Date = new Date(),
): SmsUsagePeriod {
  if (
    subscription?.currentPeriodStart &&
    subscription?.currentPeriodEnd &&
    subscription.currentPeriodEnd > subscription.currentPeriodStart
  ) {
    return {
      start: subscription.currentPeriodStart,
      end: subscription.currentPeriodEnd,
    };
  }
  return calendarMonthUtc(now);
}

export function resolveIncludedSmsSegments(subscription: {
  planCode: PlanCode | null;
  entitlementProfileCode: string | null;
} | null): number | null {
  if (!subscription) return null;
  if (
    subscription.entitlementProfileCode === HOUZZAT_LEGACY_ENTITLEMENT_PROFILE
  ) {
    return HOUZZAT_LEGACY_INCLUDED_SMS_SEGMENTS;
  }
  if (subscription.planCode) {
    return getPlanDefinition(subscription.planCode).includedSmsSegmentsPerMonth;
  }
  return null;
}

export function evaluateSmsAllowance(input: {
  allowanceSegments: number | null;
  usedSegments: number;
  requestedSegments?: number;
}): {
  remainingSegments: number | null;
  permitted: boolean;
  reason: SmsUsageAllowanceReason;
} {
  if (input.allowanceSegments == null) {
    return {
      remainingSegments: null,
      permitted: false,
      reason: "ALLOWANCE_NOT_CONFIGURED",
    };
  }
  const remaining = Math.max(0, input.allowanceSegments - input.usedSegments);
  const requested = Math.max(0, input.requestedSegments ?? 1);
  if (remaining < requested) {
    return {
      remainingSegments: remaining,
      permitted: false,
      reason: "ALLOWANCE_EXCEEDED",
    };
  }
  return {
    remainingSegments: remaining,
    permitted: true,
    reason: null,
  };
}

async function loadSubscription(
  db: SmsUsageDb,
  workspaceId: string,
) {
  if (!db.workspace?.findUnique || !db.subscription?.findUnique) return null;
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { currentSubscriptionId: true },
  });
  if (!workspace?.currentSubscriptionId) return null;
  return db.subscription.findUnique({
    where: { id: workspace.currentSubscriptionId },
    select: {
      planCode: true,
      entitlementProfileCode: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
    },
  });
}

export async function inspectSmsAllowance(
  workspaceId: string,
  input: {
    db?: SmsUsageDb;
    requestedSegments?: number;
    now?: Date;
    categories?: readonly SmsUsageCategory[];
  } = {},
): Promise<SmsUsageSnapshot> {
  const id = workspaceId.trim();
  const now = input.now ?? new Date();
  const db = input.db ?? (prisma as unknown as SmsUsageDb);
  const subscription = id ? await loadSubscription(db, id) : null;
  const period = resolveSmsUsagePeriod(subscription, now);
  const allowanceSegments = resolveIncludedSmsSegments(subscription);
  const rows = id
    ? await db.smsUsageEvent.findMany({
        where: {
          workspaceId: id,
          periodStart: period.start,
          periodEnd: period.end,
        },
      })
    : [];
  const scoped = input.categories
    ? rows.filter((row) => input.categories!.includes(row.category))
    : rows;
  const usedSegments = scoped.reduce((sum, row) => sum + row.segmentCount, 0);
  const gate = evaluateSmsAllowance({
    allowanceSegments,
    usedSegments,
    requestedSegments: input.requestedSegments,
  });
  return {
    workspaceId: id,
    period,
    usedSegments,
    allowanceSegments,
    remainingSegments: gate.remainingSegments,
    permitted: gate.permitted,
    reason: gate.reason,
  };
}

export async function recordSmsUsageEvent(
  input: RecordSmsUsageInput,
  db: SmsUsageDb = prisma as unknown as SmsUsageDb,
): Promise<SmsUsageEventRow | null> {
  const workspaceId = input.workspaceId.trim();
  const sid = input.twilioMessageSid?.trim() || null;
  if (!workspaceId || !sid) return null;

  const existing = await db.smsUsageEvent.findUnique({
    where: { twilioMessageSid: sid },
  });
  if (existing) {
    const patch: Partial<SmsUsageEventRow> = {};
    if (!existing.messageId && input.messageId?.trim()) {
      patch.messageId = input.messageId.trim();
    }
    if (Object.keys(patch).length === 0) return existing;
    return db.smsUsageEvent.update({
      where: { id: existing.id },
      data: patch,
    });
  }

  const now = input.now ?? new Date();
  const subscription = await loadSubscription(db, workspaceId);
  const period = resolveSmsUsagePeriod(subscription, now);
  const estimated =
    input.segmentCount && input.segmentCount > 0
      ? input.segmentCount
      : estimateSmsSegmentCount(input.body ?? "");
  const source: SmsSegmentCountSource =
    input.segmentCountSource ??
    (input.segmentCount && input.segmentCount > 0 ? "PROVIDER" : "ESTIMATED");

  try {
    return await db.smsUsageEvent.create({
      data: {
        workspaceId,
        periodStart: period.start,
        periodEnd: period.end,
        category: input.category,
        recipientType: input.recipientType,
        twilioMessageSid: sid,
        messageId: input.messageId?.trim() || null,
        segmentCount: Math.max(1, estimated),
        segmentCountSource: source,
        finalized: source === "PROVIDER",
      },
    });
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
    if (code === "P2002") {
      return db.smsUsageEvent.findUnique({ where: { twilioMessageSid: sid } });
    }
    throw error;
  }
}

export async function finalizeSmsUsageFromProvider(
  twilioMessageSid: string,
  numSegments: number,
  db: SmsUsageDb = prisma as unknown as SmsUsageDb,
): Promise<SmsUsageEventRow | null> {
  const sid = twilioMessageSid.trim();
  if (!sid || !Number.isInteger(numSegments) || numSegments < 1) return null;
  const existing = await db.smsUsageEvent.findUnique({
    where: { twilioMessageSid: sid },
  });
  if (!existing) return null;
  if (
    existing.finalized &&
    existing.segmentCountSource === "PROVIDER" &&
    existing.segmentCount === numSegments
  ) {
    return existing;
  }
  return db.smsUsageEvent.update({
    where: { id: existing.id },
    data: {
      segmentCount: numSegments,
      segmentCountSource: "PROVIDER",
      finalized: true,
    },
  });
}

export function prismaSmsUsageDb(client: PrismaClient): SmsUsageDb {
  return client as unknown as SmsUsageDb;
}

export function hasSmsUsageDelegate(db: unknown): db is SmsUsageDb {
  return Boolean(
    db &&
      typeof db === "object" &&
      "smsUsageEvent" in db &&
      (db as SmsUsageDb).smsUsageEvent,
  );
}
