/**
 * Phase 2C — post-registration continuation + meaningful engagement.
 *
 * Attribution windows (documented):
 * - Continuation: 45 minutes from user.createdAt — matches CAPTURE_INTENT_TTL_MS
 *   so only newly registered consumers with a live capture intent are counted.
 * - Engagement: 7 days from user.createdAt — long enough for email verify +
 *   first save/watch/inquiry without treating long-term actives as “new funnel”.
 *
 * Funnel stages (distinct events):
 * A. registration_completed (Phase 2A, signup)
 * B. post_registration_continued (successful capture-intent resume)
 * C. registration_engaged (confirmed product action — not a mere listing view)
 */

import { CAPTURE_INTENT_TTL_MS } from "@/lib/auth/capture-intent";
import {
  isFunnelEventsEnabled,
  type FunnelEventName,
} from "@/lib/funnel/constants";
import {
  buildPostRegistrationContinuedDedupeKey,
  buildRegistrationEngagedDedupeKey,
} from "@/lib/funnel/dedupe";
import {
  writeFunnelEvent,
  type FunnelIngestResult,
  type FunnelWriteInput,
} from "@/lib/funnel/ingest";
import {
  cleanMlsNumber,
  sanitizeFunnelMeta,
} from "@/lib/funnel/sanitize";
import { buildConsumerSignupWhere } from "@/lib/platform/signup-analytics/query";
import { prisma as defaultPrisma } from "@/lib/prisma";
import { isConsumerRole } from "@/lib/roles";
import { resolveRequestTenancy } from "@/lib/tenancy/resolve-request-tenancy";

/** Aligns with capture-intent TTL — leftover intents do not count later. */
export const FUNNEL_CONTINUATION_WINDOW_MS = CAPTURE_INTENT_TTL_MS;

/**
 * First-week product engagement after registration.
 * Separate from continuation so a resumed listing view is not “engaged”.
 */
export const FUNNEL_ENGAGEMENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export const FUNNEL_ENGAGEMENT_TYPES = [
  "SAVE_LISTING",
  "SAVE_SEARCH",
  "PROPERTY_WATCH",
  "AREA_WATCH",
  "REQUEST_VIEWING",
  "CONTACT_AGENT",
] as const;

export type FunnelEngagementType = (typeof FUNNEL_ENGAGEMENT_TYPES)[number];

/** Intent types that may report post_registration_continued after resume success. */
export const FUNNEL_CONTINUATION_INTENT_TYPES = [
  "VIEW_LISTING",
  "SAVE_LISTING",
  "SAVE_SEARCH",
  "PROPERTY_WATCH",
  "AREA_WATCH",
  "REQUEST_VIEWING",
  "CONTACT_AGENT",
  "START_CHAT",
] as const;

export type FunnelContinuationIntentType =
  (typeof FUNNEL_CONTINUATION_INTENT_TYPES)[number];

export function isFunnelEngagementType(
  value: string,
): value is FunnelEngagementType {
  return (FUNNEL_ENGAGEMENT_TYPES as readonly string[]).includes(value);
}

export function isFunnelContinuationIntentType(
  value: string,
): value is FunnelContinuationIntentType {
  return (FUNNEL_CONTINUATION_INTENT_TYPES as readonly string[]).includes(value);
}

/**
 * Sync role gate — AGENT / ADMIN / non-consumer never eligible.
 * Full account eligibility (operator + staff seat) needs
 * {@link resolveFunnelConsumerEligibility}.
 */
export function isEligibleFunnelConsumer(user: { role: string }): boolean {
  return isConsumerRole(user.role);
}

/**
 * Minimal injectable surface for the Phase 1 consumer-population lookup.
 * Production uses Prisma; tests inject fakes (never hits live DB).
 */
export type FunnelEligibilityDb = {
  user: {
    findFirst: (args: {
      // Aligns with Prisma.UserWhereInput; kept structural for test fakes.
      where: {
        id: string;
        role?: unknown;
        workspaceId?: unknown;
        platformOperator?: unknown;
        workspaceMemberships?: unknown;
      };
      select: { id: true };
    }) => Promise<{ id: string } | null>;
  };
};

/**
 * Genuine consumer account check — same population as Phase 1
 * {@link buildConsumerSignupWhere}:
 * - role BUYER | SELLER
 * - non-null workspaceId
 * - no PlatformOperator row
 * - no WorkspaceMember staff seat
 *
 * Fast path: non-consumer roles skip the DB. Lookup uses User PK + indexed
 * PlatformOperator.userId / WorkspaceMember.userId relations.
 * Lookup failure → ineligible (fail-soft analytics; never throws).
 */
export async function resolveFunnelConsumerEligibility(input: {
  userId: string;
  /** Authenticated User.role from the server session — never client-supplied. */
  role: string;
  db?: FunnelEligibilityDb;
}): Promise<boolean> {
  if (!isEligibleFunnelConsumer({ role: input.role })) return false;
  const userId = input.userId?.trim();
  if (!userId) return false;

  // Phase 1 consumer population + exact user id (session-authoritative).
  const consumerWhere = buildConsumerSignupWhere();
  const where = {
    id: userId,
    role: consumerWhere.role,
    workspaceId: consumerWhere.workspaceId,
    platformOperator: consumerWhere.platformOperator,
    workspaceMemberships: consumerWhere.workspaceMemberships,
  };

  try {
    if (input.db) {
      const row = await input.db.user.findFirst({
        where,
        select: { id: true },
      });
      return Boolean(row);
    }
    const row = await defaultPrisma.user.findFirst({
      where,
      select: { id: true },
    });
    return Boolean(row);
  } catch (error) {
    console.error("[funnel] consumer eligibility lookup failed softly", error);
    return false;
  }
}

export function isWithinFunnelAttributionWindow(
  registeredAt: Date,
  now: Date,
  windowMs: number,
): boolean {
  const elapsed = now.getTime() - registeredAt.getTime();
  // Allow small clock skew backward; reject future-dated createdAt beyond 1m.
  if (elapsed < -60_000) return false;
  return elapsed <= windowMs;
}

export async function resolveFunnelWorkspaceId(input: {
  userWorkspaceId?: string | null;
  request: Request;
}): Promise<string | null> {
  const fromUser = input.userWorkspaceId?.trim();
  if (fromUser) return fromUser;
  const tenancy = await resolveRequestTenancy(input.request);
  return tenancy.ok ? tenancy.workspaceId : null;
}

type Db = Parameters<typeof writeFunnelEvent>[1];

export async function recordPostRegistrationContinuedEvent(input: {
  workspaceId: string;
  userId: string;
  /** Authenticated User.role from the server session — never client-supplied. */
  role: string;
  intentType: FunnelContinuationIntentType;
  mlsNumber?: string | null;
  registeredAt: Date;
  occurredAt?: Date;
  now?: Date;
  env?: NodeJS.ProcessEnv;
  db?: Db;
  eligibilityDb?: FunnelEligibilityDb;
}): Promise<FunnelIngestResult> {
  // Skip eligibility DB work entirely when tracking is disabled.
  if (!isFunnelEventsEnabled(input.env ?? process.env)) {
    return { ok: true, status: "disabled", id: null };
  }

  const eligible = await resolveFunnelConsumerEligibility({
    userId: input.userId,
    role: input.role,
    db: input.eligibilityDb,
  });
  if (!eligible) {
    return { ok: true, status: "disabled", id: null };
  }

  const now = input.now ?? new Date();
  if (
    !isWithinFunnelAttributionWindow(
      input.registeredAt,
      now,
      FUNNEL_CONTINUATION_WINDOW_MS,
    )
  ) {
    return { ok: true, status: "disabled", id: null };
  }

  const workspaceId = input.workspaceId?.trim();
  const userId = input.userId?.trim();
  if (!workspaceId || !userId) {
    return {
      ok: false,
      code: "WORKSPACE_USER_REQUIRED",
      message: "workspaceId and userId are required",
      httpStatus: 400,
    };
  }

  let meta: Record<string, string> | null = null;
  try {
    meta = sanitizeFunnelMeta({
      intentType: input.intentType,
      source: "capture_intent_resume",
    });
  } catch {
    meta = { intentType: input.intentType, source: "capture_intent_resume" };
  }

  const writeInput: FunnelWriteInput = {
    workspaceId,
    eventName: "post_registration_continued" satisfies FunnelEventName,
    occurredAt: input.occurredAt ?? now,
    userId,
    mlsNumber: cleanMlsNumber(input.mlsNumber),
    dedupeKey: buildPostRegistrationContinuedDedupeKey(userId),
    meta,
  };

  return writeFunnelEvent(writeInput, input.db, input.env ?? process.env);
}

export async function recordPostRegistrationContinuedEventSafe(
  input: Parameters<typeof recordPostRegistrationContinuedEvent>[0],
): Promise<void> {
  try {
    await recordPostRegistrationContinuedEvent(input);
  } catch (error) {
    console.error("[funnel] post_registration_continued failed softly", error);
  }
}

export async function recordRegistrationEngagedEvent(input: {
  workspaceId: string;
  userId: string;
  /** Authenticated User.role from the server session — never client-supplied. */
  role: string;
  engagementType: FunnelEngagementType;
  mlsNumber?: string | null;
  registeredAt: Date;
  occurredAt?: Date;
  now?: Date;
  env?: NodeJS.ProcessEnv;
  db?: Db;
  eligibilityDb?: FunnelEligibilityDb;
}): Promise<FunnelIngestResult> {
  // Skip eligibility DB work entirely when tracking is disabled.
  if (!isFunnelEventsEnabled(input.env ?? process.env)) {
    return { ok: true, status: "disabled", id: null };
  }

  const eligible = await resolveFunnelConsumerEligibility({
    userId: input.userId,
    role: input.role,
    db: input.eligibilityDb,
  });
  if (!eligible) {
    return { ok: true, status: "disabled", id: null };
  }

  const now = input.now ?? new Date();
  if (
    !isWithinFunnelAttributionWindow(
      input.registeredAt,
      now,
      FUNNEL_ENGAGEMENT_WINDOW_MS,
    )
  ) {
    return { ok: true, status: "disabled", id: null };
  }

  const workspaceId = input.workspaceId?.trim();
  const userId = input.userId?.trim();
  if (!workspaceId || !userId) {
    return {
      ok: false,
      code: "WORKSPACE_USER_REQUIRED",
      message: "workspaceId and userId are required",
      httpStatus: 400,
    };
  }

  let meta: Record<string, string> | null = null;
  try {
    meta = sanitizeFunnelMeta({
      intentType: input.engagementType,
      source: "engagement",
    });
  } catch {
    meta = { intentType: input.engagementType, source: "engagement" };
  }

  return writeFunnelEvent(
    {
      workspaceId,
      eventName: "registration_engaged",
      occurredAt: input.occurredAt ?? now,
      userId,
      mlsNumber: cleanMlsNumber(input.mlsNumber),
      dedupeKey: buildRegistrationEngagedDedupeKey(
        userId,
        input.engagementType,
      ),
      meta,
    },
    input.db,
    input.env ?? process.env,
  );
}

export async function recordRegistrationEngagedEventSafe(
  input: Parameters<typeof recordRegistrationEngagedEvent>[0],
): Promise<void> {
  try {
    await recordRegistrationEngagedEvent(input);
  } catch (error) {
    console.error("[funnel] registration_engaged failed softly", error);
  }
}

/**
 * Fire-and-forget engagement recording from authenticated API routes.
 * Never awaits in the request path beyond scheduling the task.
 */
export function scheduleRegistrationEngaged(input: {
  request: Request;
  user: {
    id: string;
    workspaceId: string | null;
    createdAt: Date;
    role: string;
  };
  engagementType: FunnelEngagementType;
  mlsNumber?: string | null;
  /** Optional env override for tests — production uses process.env. */
  env?: NodeJS.ProcessEnv;
}): void {
  // Flag-off: no async work, no tenancy resolve, no eligibility DB, no writes.
  if (!isFunnelEventsEnabled(input.env ?? process.env)) return;

  // Sync role gate — avoid scheduling for AGENT/ADMIN; full seat check is async.
  if (!isEligibleFunnelConsumer({ role: input.user.role })) return;

  void (async () => {
    try {
      const workspaceId = await resolveFunnelWorkspaceId({
        userWorkspaceId: input.user.workspaceId,
        request: input.request,
      });
      if (!workspaceId) return;
      await recordRegistrationEngagedEventSafe({
        workspaceId,
        userId: input.user.id,
        role: input.user.role,
        engagementType: input.engagementType,
        mlsNumber: input.mlsNumber,
        registeredAt: input.user.createdAt,
        env: input.env ?? process.env,
      });
    } catch (error) {
      console.error("[funnel] scheduleRegistrationEngaged failed softly", error);
    }
  })();
}

/** Test helper — flag must be on for writes in unit tests. */
export function phase2cWritesEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isFunnelEventsEnabled(env);
}
