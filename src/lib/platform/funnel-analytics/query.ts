import { Prisma, type PrismaClient } from "@prisma/client";
import { isFunnelEventsEnabled } from "@/lib/funnel/constants";
import {
  FUNNEL_CONTINUATION_WINDOW_MS,
  FUNNEL_ENGAGEMENT_WINDOW_MS,
} from "@/lib/funnel/phase2c";
import {
  FUNNEL_ANALYTICS_CLASSIFICATION_NOTES,
  FUNNEL_ANALYTICS_ENGAGEMENT_TYPES,
  FUNNEL_ANALYTICS_INDEX_NOTES,
  FUNNEL_ANALYTICS_STAGE_LABELS,
  FUNNEL_ANALYTICS_STAGE_ORDER,
  FUNNEL_ANALYTICS_STAGE_PRIMARY_UNIT,
  FUNNEL_ANALYTICS_TIME_ZONE,
  FUNNEL_ANALYTICS_TIME_ZONE_LABEL,
  FUNNEL_ANALYTICS_UNINSTRUMENTED_STAGES,
  type FunnelAnalyticsStageId,
} from "@/lib/platform/funnel-analytics/constants";
import {
  buildCompletedToContinuedConversion,
  buildCompletedToEngagedConversion,
  buildGateToCompletedConversion,
  buildSearchToListingDetailConversion,
  isEngagementObservationComplete,
} from "@/lib/platform/funnel-analytics/conversions";
import type {
  FunnelAnalyticsReport,
  FunnelStageMetric,
} from "@/lib/platform/funnel-analytics/types";
import {
  SIGNUP_ACQUISITION_CHANNELS,
  type SignupAcquisitionChannel,
} from "@/lib/platform/signup-analytics/constants";
import { classifySignupAcquisition } from "@/lib/platform/signup-analytics/classify";
import {
  resolveSignupAnalyticsRange,
  SignupAnalyticsRangeError,
  type SignupAnalyticsRange,
} from "@/lib/platform/signup-analytics/range";
import { SignupAnalyticsQueryError } from "@/lib/platform/signup-analytics/query";
import { prisma as defaultPrisma } from "@/lib/prisma";

export type FunnelAnalyticsQueryInput = {
  workspaceId?: string | null;
  preset?: string | null;
  from?: string | null;
  to?: string | null;
  now?: Date;
  env?: NodeJS.ProcessEnv;
};

type StageAggRow = {
  eventName: string;
  eventCount: number;
  distinctVisitors: number;
  distinctSessions: number;
  distinctUsers: number;
};

type EngagementTypeRow = {
  engagementType: string | null;
  distinctUsers: number;
};

type CohortCountRow = {
  count: number;
};

type AttributionAggRow = {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  count: number;
};

const UNINSTRUMENTED = new Set<string>(FUNNEL_ANALYTICS_UNINSTRUMENTED_STAGES);

export async function getFunnelAnalyticsReport(
  input: FunnelAnalyticsQueryInput = {},
  db: PrismaClient = defaultPrisma,
): Promise<FunnelAnalyticsReport> {
  const workspaceId = input.workspaceId?.trim() || null;
  if (workspaceId) {
    const exists = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true },
    });
    if (!exists) {
      throw new SignupAnalyticsQueryError(
        "Workspace not found",
        404,
        "WORKSPACE_NOT_FOUND",
      );
    }
  }

  let range: SignupAnalyticsRange;
  try {
    range = resolveSignupAnalyticsRange({
      preset: input.preset,
      from: input.from,
      to: input.to,
      now: input.now,
    });
  } catch (error) {
    if (error instanceof SignupAnalyticsRangeError) {
      throw new SignupAnalyticsQueryError(
        error.message,
        error.status,
        error.code,
      );
    }
    throw error;
  }

  const now = input.now ?? new Date();
  const env = input.env ?? process.env;
  const trackingEnabled = isFunnelEventsEnabled(env);

  const [
    stageRows,
    engagementTypeRows,
    gateConverted,
    gateDenom,
    completedIdentity,
    continuedOfRegistered,
    engagedOfRegistered,
    newestRegistrationAt,
    searchConverted,
    searchDenom,
    attributionRows,
    workspaces,
  ] = await Promise.all([
    aggregateStages(db, workspaceId, range),
    aggregateEngagementByType(db, workspaceId, range),
    countGateToCompleted(db, workspaceId, range),
    countDistinctKeys(db, workspaceId, range, "registration_gate_shown", "visitor"),
    countCompletedIdentityCoverage(db, workspaceId, range),
    countCompletedWhoAlsoHave(
      db,
      workspaceId,
      range,
      "post_registration_continued",
      FUNNEL_CONTINUATION_WINDOW_MS,
    ),
    countCompletedWhoAlsoHave(
      db,
      workspaceId,
      range,
      "registration_engaged",
      FUNNEL_ENGAGEMENT_WINDOW_MS,
    ),
    findNewestRegistrationCompletedAt(db, workspaceId, range),
    countSearchToListing(db, workspaceId, range),
    countDistinctKeys(db, workspaceId, range, "search_results_viewed", "session"),
    aggregateConverterAttribution(db, workspaceId, range),
    db.workspace.findMany({
      select: { id: true, name: true, slug: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const byEvent = new Map(
    stageRows.map((r) => [r.eventName, r] as const),
  );

  const stages: FunnelStageMetric[] = FUNNEL_ANALYTICS_STAGE_ORDER.map(
    (id) => buildStageMetric(id, byEvent.get(id)),
  );

  // Registration-cohort KPIs (not event-period continued/engaged totals).
  const registeredUsers = completedIdentity.completedUsers;
  const continuedUsers = continuedOfRegistered;
  const engagedUsers = engagedOfRegistered;

  const observationComplete = isEngagementObservationComplete({
    newestRegistrationAt,
    now,
  });
  const engagedConversion = buildCompletedToEngagedConversion({
    engagedUsers,
    registeredUsers,
    observationComplete,
  });

  const conversions = [
    buildGateToCompletedConversion({
      convertedVisitors: gateConverted,
      gateVisitors: gateDenom,
      identity: completedIdentity,
    }),
    buildCompletedToContinuedConversion({
      continuedUsers,
      registeredUsers,
    }),
    engagedConversion,
    buildSearchToListingDetailConversion({
      convertedSessions: searchConverted,
      searchSessions: searchDenom,
    }),
  ];

  const engagementMap = new Map(
    engagementTypeRows.map((r) => [
      (r.engagementType ?? "").trim(),
      Number(r.distinctUsers) || 0,
    ]),
  );
  const engagementByType = FUNNEL_ANALYTICS_ENGAGEMENT_TYPES.map((type) => ({
    type,
    distinctUsers: engagementMap.get(type) ?? 0,
  }));

  const acquisitionMap = emptyAcquisitionMap();
  for (const row of attributionRows) {
    const channel = classifySignupAcquisition({
      utmSource: row.utmSource,
      utmMedium: row.utmMedium,
      utmCampaign: row.utmCampaign,
      gclid: row.gclid,
      gbraid: row.gbraid,
      wbraid: row.wbraid,
    });
    acquisitionMap[channel] += Number(row.count) || 0;
  }
  const acquisitionOfConverters = SIGNUP_ACQUISITION_CHANNELS.map(
    (channel) => ({
      channel,
      count: acquisitionMap[channel],
    }),
  );

  const engagementRateKind =
    engagedConversion.status !== "available"
      ? ("unavailable" as const)
      : observationComplete
        ? ("finalized" as const)
        : ("observed_to_date" as const);

  const engagementRateLabel =
    engagementRateKind === "unavailable"
      ? "Unavailable — no registration cohort in range"
      : engagementRateKind === "finalized"
        ? "Finalized 7-day cohort engagement rate"
        : "Observed-to-date cohort engagement rate (7-day window not fully elapsed for all registrations)";

  return {
    meta: {
      timeZone: FUNNEL_ANALYTICS_TIME_ZONE,
      timeZoneLabel: FUNNEL_ANALYTICS_TIME_ZONE_LABEL,
      preset: range.preset,
      from: range.from ? range.from.toISOString() : null,
      to: range.to.toISOString(),
      workspaceId,
      generatedAt: now.toISOString(),
      trackingEnabled,
      classificationNotes: [...FUNNEL_ANALYTICS_CLASSIFICATION_NOTES],
      indexNotes: [...FUNNEL_ANALYTICS_INDEX_NOTES],
    },
    kpis: {
      registeredUsers,
      continuedUsers,
      engagedUsers,
      engagementRate: engagedConversion.rate,
      engagementRateKind,
      engagementRateLabel,
    },
    stages,
    conversions,
    engagementByType,
    acquisitionOfConverters,
    workspaces: workspaces.map((w) => ({
      id: w.id,
      name: w.name?.trim() || w.id,
      slug: w.slug ?? null,
    })),
  };
}

function buildStageMetric(
  id: FunnelAnalyticsStageId,
  row: StageAggRow | undefined,
): FunnelStageMetric {
  const primaryUnit = FUNNEL_ANALYTICS_STAGE_PRIMARY_UNIT[id];
  if (UNINSTRUMENTED.has(id)) {
    return {
      id,
      label: FUNNEL_ANALYTICS_STAGE_LABELS[id],
      status: "unavailable",
      unavailableReason:
        "Not instrumented yet — event is schema-ready but never emitted by the product.",
      primaryUnit,
      primaryCount: null,
      eventCount: 0,
      distinctVisitors: 0,
      distinctSessions: 0,
      distinctUsers: 0,
    };
  }

  const eventCount = Number(row?.eventCount) || 0;
  const distinctVisitors = Number(row?.distinctVisitors) || 0;
  const distinctSessions = Number(row?.distinctSessions) || 0;
  const distinctUsers = Number(row?.distinctUsers) || 0;
  const primaryCount =
    primaryUnit === "sessions"
      ? distinctSessions
      : primaryUnit === "visitors"
        ? distinctVisitors
        : distinctUsers;

  return {
    id,
    label: FUNNEL_ANALYTICS_STAGE_LABELS[id],
    status: "available",
    unavailableReason: null,
    primaryUnit,
    primaryCount,
    eventCount,
    distinctVisitors,
    distinctSessions,
    distinctUsers,
  };
}

function emptyAcquisitionMap(): Record<SignupAcquisitionChannel, number> {
  return {
    google_ads: 0,
    organic: 0,
    direct: 0,
    referral: 0,
    social: 0,
    unknown: 0,
  };
}

function workspaceFilter(
  workspaceId: string | null,
): Prisma.Sql {
  return workspaceId
    ? Prisma.sql`AND fe."workspaceId" = ${workspaceId}`
    : Prisma.empty;
}

function occurredFilter(range: SignupAnalyticsRange): Prisma.Sql {
  if (range.from) {
    return Prisma.sql`AND fe."occurredAt" >= ${range.from} AND fe."occurredAt" < ${range.to}`;
  }
  return Prisma.sql`AND fe."occurredAt" < ${range.to}`;
}

/**
 * All-tenants distinct identity counting must use (workspaceId, key) so the
 * same visitorKey/sessionKey/userId in two workspaces counts twice.
 * Single-tenant filters keep the same semantics (workspaceId is constant).
 */
async function aggregateStages(
  db: PrismaClient,
  workspaceId: string | null,
  range: SignupAnalyticsRange,
): Promise<StageAggRow[]> {
  const rows = await db.$queryRaw<StageAggRow[]>`
    SELECT
      fe."eventName"::text AS "eventName",
      COUNT(*)::int AS "eventCount",
      COUNT(DISTINCT (fe."workspaceId", fe."visitorKey")) FILTER (WHERE fe."visitorKey" IS NOT NULL)::int AS "distinctVisitors",
      COUNT(DISTINCT (fe."workspaceId", fe."sessionKey")) FILTER (WHERE fe."sessionKey" IS NOT NULL)::int AS "distinctSessions",
      COUNT(DISTINCT (fe."workspaceId", fe."userId")) FILTER (WHERE fe."userId" IS NOT NULL)::int AS "distinctUsers"
    FROM "FunnelEvent" fe
    WHERE TRUE
      ${workspaceFilter(workspaceId)}
      ${occurredFilter(range)}
    GROUP BY fe."eventName"
  `;
  return rows.map((r) => ({
    eventName: r.eventName,
    eventCount: Number(r.eventCount) || 0,
    distinctVisitors: Number(r.distinctVisitors) || 0,
    distinctSessions: Number(r.distinctSessions) || 0,
    distinctUsers: Number(r.distinctUsers) || 0,
  }));
}

async function aggregateEngagementByType(
  db: PrismaClient,
  workspaceId: string | null,
  range: SignupAnalyticsRange,
): Promise<EngagementTypeRow[]> {
  const rows = await db.$queryRaw<EngagementTypeRow[]>`
    SELECT
      NULLIF(BTRIM(COALESCE(fe."meta"->>'intentType', '')), '') AS "engagementType",
      COUNT(DISTINCT (fe."workspaceId", fe."userId")) FILTER (WHERE fe."userId" IS NOT NULL)::int AS "distinctUsers"
    FROM "FunnelEvent" fe
    WHERE fe."eventName" = 'registration_engaged'::"FunnelEventName"
      ${workspaceFilter(workspaceId)}
      ${occurredFilter(range)}
    GROUP BY 1
  `;
  return rows.map((r) => ({
    engagementType: r.engagementType,
    distinctUsers: Number(r.distinctUsers) || 0,
  }));
}

async function countDistinctKeys(
  db: PrismaClient,
  workspaceId: string | null,
  range: SignupAnalyticsRange,
  eventName: string,
  key: "visitor" | "session",
): Promise<number> {
  const rows =
    key === "visitor"
      ? await db.$queryRaw<CohortCountRow[]>`
          SELECT COUNT(DISTINCT (fe."workspaceId", fe."visitorKey"))::int AS count
          FROM "FunnelEvent" fe
          WHERE fe."eventName" = ${eventName}::"FunnelEventName"
            AND fe."visitorKey" IS NOT NULL
            ${workspaceFilter(workspaceId)}
            ${occurredFilter(range)}
        `
      : await db.$queryRaw<CohortCountRow[]>`
          SELECT COUNT(DISTINCT (fe."workspaceId", fe."sessionKey"))::int AS count
          FROM "FunnelEvent" fe
          WHERE fe."eventName" = ${eventName}::"FunnelEventName"
            AND fe."sessionKey" IS NOT NULL
            ${workspaceFilter(workspaceId)}
            ${occurredFilter(range)}
        `;
  return Number(rows[0]?.count) || 0;
}

async function countGateToCompleted(
  db: PrismaClient,
  workspaceId: string | null,
  range: SignupAnalyticsRange,
): Promise<number> {
  const rows = await db.$queryRaw<CohortCountRow[]>`
    SELECT COUNT(DISTINCT (g."workspaceId", g."visitorKey"))::int AS count
    FROM "FunnelEvent" g
    WHERE g."eventName" = 'registration_gate_shown'::"FunnelEventName"
      AND g."visitorKey" IS NOT NULL
      ${workspaceId ? Prisma.sql`AND g."workspaceId" = ${workspaceId}` : Prisma.empty}
      ${
        range.from
          ? Prisma.sql`AND g."occurredAt" >= ${range.from} AND g."occurredAt" < ${range.to}`
          : Prisma.sql`AND g."occurredAt" < ${range.to}`
      }
      AND EXISTS (
        SELECT 1
        FROM "FunnelEvent" c
        WHERE c."eventName" = 'registration_completed'::"FunnelEventName"
          AND c."visitorKey" = g."visitorKey"
          AND c."workspaceId" = g."workspaceId"
          AND c."occurredAt" < ${range.to}
          ${range.from ? Prisma.sql`AND c."occurredAt" >= ${range.from}` : Prisma.empty}
      )
  `;
  return Number(rows[0]?.count) || 0;
}

/**
 * Registration-cohort outcome: users who completed in [from,to) and have a
 * later event in the same workspace within `windowMs` after completion.
 * Never includes users who registered before the selected period.
 * Distinct identity is (workspaceId, userId) so all-tenants totals do not
 * collapse the same userId across workspaces.
 */
async function countCompletedWhoAlsoHave(
  db: PrismaClient,
  workspaceId: string | null,
  range: SignupAnalyticsRange,
  laterEvent: "post_registration_continued" | "registration_engaged",
  windowMs: number,
): Promise<number> {
  const rows = await db.$queryRaw<CohortCountRow[]>`
    SELECT COUNT(DISTINCT (c."workspaceId", c."userId"))::int AS count
    FROM "FunnelEvent" c
    WHERE c."eventName" = 'registration_completed'::"FunnelEventName"
      AND c."userId" IS NOT NULL
      ${workspaceId ? Prisma.sql`AND c."workspaceId" = ${workspaceId}` : Prisma.empty}
      ${
        range.from
          ? Prisma.sql`AND c."occurredAt" >= ${range.from} AND c."occurredAt" < ${range.to}`
          : Prisma.sql`AND c."occurredAt" < ${range.to}`
      }
      AND EXISTS (
        SELECT 1
        FROM "FunnelEvent" later
        WHERE later."eventName" = ${laterEvent}::"FunnelEventName"
          AND later."userId" = c."userId"
          AND later."workspaceId" = c."workspaceId"
          AND later."occurredAt" >= c."occurredAt"
          AND (
            EXTRACT(EPOCH FROM (later."occurredAt" - c."occurredAt")) * 1000
          ) <= ${windowMs}
      )
  `;
  return Number(rows[0]?.count) || 0;
}

async function countCompletedIdentityCoverage(
  db: PrismaClient,
  workspaceId: string | null,
  range: SignupAnalyticsRange,
): Promise<{ completedUsers: number; completedUsersWithVisitorKey: number }> {
  const rows = await db.$queryRaw<
    Array<{ completedUsers: number; completedUsersWithVisitorKey: number }>
  >`
    SELECT
      COUNT(DISTINCT (c."workspaceId", c."userId")) FILTER (WHERE c."userId" IS NOT NULL)::int AS "completedUsers",
      COUNT(DISTINCT (c."workspaceId", c."userId")) FILTER (
        WHERE c."userId" IS NOT NULL AND c."visitorKey" IS NOT NULL
      )::int AS "completedUsersWithVisitorKey"
    FROM "FunnelEvent" c
    WHERE c."eventName" = 'registration_completed'::"FunnelEventName"
      ${workspaceId ? Prisma.sql`AND c."workspaceId" = ${workspaceId}` : Prisma.empty}
      ${
        range.from
          ? Prisma.sql`AND c."occurredAt" >= ${range.from} AND c."occurredAt" < ${range.to}`
          : Prisma.sql`AND c."occurredAt" < ${range.to}`
      }
  `;
  return {
    completedUsers: Number(rows[0]?.completedUsers) || 0,
    completedUsersWithVisitorKey:
      Number(rows[0]?.completedUsersWithVisitorKey) || 0,
  };
}

async function findNewestRegistrationCompletedAt(
  db: PrismaClient,
  workspaceId: string | null,
  range: SignupAnalyticsRange,
): Promise<Date | null> {
  const rows = await db.$queryRaw<Array<{ newest: Date | null }>>`
    SELECT MAX(c."occurredAt") AS newest
    FROM "FunnelEvent" c
    WHERE c."eventName" = 'registration_completed'::"FunnelEventName"
      AND c."userId" IS NOT NULL
      ${workspaceId ? Prisma.sql`AND c."workspaceId" = ${workspaceId}` : Prisma.empty}
      ${
        range.from
          ? Prisma.sql`AND c."occurredAt" >= ${range.from} AND c."occurredAt" < ${range.to}`
          : Prisma.sql`AND c."occurredAt" < ${range.to}`
      }
  `;
  const newest = rows[0]?.newest;
  return newest ? new Date(newest) : null;
}

async function countSearchToListing(
  db: PrismaClient,
  workspaceId: string | null,
  range: SignupAnalyticsRange,
): Promise<number> {
  const rows = await db.$queryRaw<CohortCountRow[]>`
    SELECT COUNT(DISTINCT (s."workspaceId", s."sessionKey"))::int AS count
    FROM "FunnelEvent" s
    WHERE s."eventName" = 'search_results_viewed'::"FunnelEventName"
      AND s."sessionKey" IS NOT NULL
      ${workspaceId ? Prisma.sql`AND s."workspaceId" = ${workspaceId}` : Prisma.empty}
      ${
        range.from
          ? Prisma.sql`AND s."occurredAt" >= ${range.from} AND s."occurredAt" < ${range.to}`
          : Prisma.sql`AND s."occurredAt" < ${range.to}`
      }
      AND EXISTS (
        SELECT 1
        FROM "FunnelEvent" d
        WHERE d."eventName" = 'listing_detail_opened'::"FunnelEventName"
          AND d."sessionKey" = s."sessionKey"
          AND d."workspaceId" = s."workspaceId"
          AND d."occurredAt" < ${range.to}
          ${range.from ? Prisma.sql`AND d."occurredAt" >= ${range.from}` : Prisma.empty}
      )
  `;
  return Number(rows[0]?.count) || 0;
}

/**
 * Acquisition for users with registration_completed in range (Lead UTMs).
 * Aggregate-only — never returns Lead payloads.
 * Distinct converter identity is (workspaceId, userId).
 */
async function aggregateConverterAttribution(
  db: PrismaClient,
  workspaceId: string | null,
  range: SignupAnalyticsRange,
): Promise<AttributionAggRow[]> {
  const rows = await db.$queryRaw<AttributionAggRow[]>`
    SELECT
      l."utmSource" AS "utmSource",
      l."utmMedium" AS "utmMedium",
      l."utmCampaign" AS "utmCampaign",
      NULLIF(BTRIM(COALESCE(l."captureContext"->>'gclid', '')), '') AS gclid,
      NULLIF(BTRIM(COALESCE(l."captureContext"->>'gbraid', '')), '') AS gbraid,
      NULLIF(BTRIM(COALESCE(l."captureContext"->>'wbraid', '')), '') AS wbraid,
      COUNT(DISTINCT (fe."workspaceId", fe."userId"))::int AS count
    FROM "FunnelEvent" fe
    INNER JOIN "User" u ON u.id = fe."userId"
    LEFT JOIN "Lead" l
      ON l."workspaceId" = fe."workspaceId"
     AND l."customerId" = fe."userId"
    WHERE fe."eventName" = 'registration_completed'::"FunnelEventName"
      AND fe."userId" IS NOT NULL
      ${workspaceId ? Prisma.sql`AND fe."workspaceId" = ${workspaceId}` : Prisma.empty}
      ${
        range.from
          ? Prisma.sql`AND fe."occurredAt" >= ${range.from} AND fe."occurredAt" < ${range.to}`
          : Prisma.sql`AND fe."occurredAt" < ${range.to}`
      }
      AND u.role IN ('BUYER', 'SELLER')
      AND NOT EXISTS (
        SELECT 1 FROM "PlatformOperator" po WHERE po."userId" = u.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM "WorkspaceMember" wm WHERE wm."userId" = u.id
      )
    GROUP BY 1, 2, 3, 4, 5, 6
  `;
  return rows.map((r) => ({
    ...r,
    count: Number(r.count) || 0,
  }));
}
