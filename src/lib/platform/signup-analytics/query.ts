import { Prisma, type PrismaClient, type Role } from "@prisma/client";
import {
  SIGNUP_ANALYTICS_CLASSIFICATION_NOTES,
  SIGNUP_ANALYTICS_INDEX_RECOMMENDATIONS,
  SIGNUP_ANALYTICS_TIME_ZONE,
  SIGNUP_ANALYTICS_TIME_ZONE_LABEL,
  SIGNUP_ACQUISITION_CHANNELS,
  type SignupAcquisitionChannel,
} from "@/lib/platform/signup-analytics/constants";
import { classifySignupAcquisition } from "@/lib/platform/signup-analytics/classify";
import {
  enumerateZonedDays,
  resolveSignupAnalyticsRange,
  SignupAnalyticsRangeError,
  type SignupAnalyticsRange,
} from "@/lib/platform/signup-analytics/range";
import type { SignupAnalyticsReport } from "@/lib/platform/signup-analytics/types";
import { prisma as defaultPrisma } from "@/lib/prisma";

export type SignupAnalyticsQueryInput = {
  workspaceId?: string | null;
  preset?: string | null;
  from?: string | null;
  to?: string | null;
  now?: Date;
};

/** Shared consumer filter — authoritative signup population. */
export function buildConsumerSignupWhere(
  workspaceId?: string | null,
  createdAt?: Prisma.DateTimeFilter,
): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {
    workspaceId: workspaceId?.trim()
      ? workspaceId.trim()
      : { not: null },
    role: { in: ["BUYER", "SELLER"] satisfies Role[] },
    // Staff seats and platform operators are never consumer signups.
    platformOperator: { is: null },
    workspaceMemberships: { none: {} },
  };
  if (createdAt) where.createdAt = createdAt;
  return where;
}

type AttributionAggRow = {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  count: number;
};

type DayAggRow = {
  day: string;
  count: number;
};

type TenantAggRow = {
  workspaceId: string;
  count: number;
};

export async function getSignupAnalyticsReport(
  input: SignupAnalyticsQueryInput = {},
  db: PrismaClient = defaultPrisma,
): Promise<SignupAnalyticsReport> {
  const workspaceId = input.workspaceId?.trim() || null;
  if (workspaceId) {
    const exists = await db.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true },
    });
    if (!exists) {
      throw new SignupAnalyticsQueryError("Workspace not found", 404, "WORKSPACE_NOT_FOUND");
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
  const todayRange = resolveSignupAnalyticsRange({ preset: "today", now });
  const d7 = resolveSignupAnalyticsRange({ preset: "7d", now });
  const d30 = resolveSignupAnalyticsRange({ preset: "30d", now });

  const rangeFilter = createdAtFilter(range);
  const base = buildConsumerSignupWhere(workspaceId);
  const inRangeWhere = buildConsumerSignupWhere(workspaceId, rangeFilter);

  const [
    inRange,
    allTime,
    today,
    last7Days,
    last30Days,
    emailVerified,
    phoneOtpVerified,
    phoneAgentConfirmed,
    tenantRows,
    workspaces,
    attributionRows,
    dayRows,
  ] = await Promise.all([
    db.user.count({ where: inRangeWhere }),
    db.user.count({ where: base }),
    db.user.count({
      where: buildConsumerSignupWhere(
        workspaceId,
        createdAtFilter(todayRange),
      ),
    }),
    db.user.count({
      where: buildConsumerSignupWhere(workspaceId, createdAtFilter(d7)),
    }),
    db.user.count({
      where: buildConsumerSignupWhere(workspaceId, createdAtFilter(d30)),
    }),
    db.user.count({
      where: {
        ...inRangeWhere,
        emailVerified: { not: null },
      },
    }),
    db.user.count({
      where: {
        ...inRangeWhere,
        phoneOtpVerifiedAt: { not: null },
      },
    }),
    db.user.count({
      where: {
        ...inRangeWhere,
        phoneVerifiedAt: { not: null },
      },
    }),
    aggregateByTenant(db, inRangeWhere),
    db.workspace.findMany({
      select: { id: true, name: true, slug: true },
      orderBy: { name: "asc" },
    }),
    aggregateAttribution(db, workspaceId, range),
    aggregateTrend(db, workspaceId, range),
  ]);

  const workspaceById = new Map(
    workspaces.map((w) => [w.id, w] as const),
  );

  const byTenant = tenantRows
    .map((row) => {
      const ws = workspaceById.get(row.workspaceId);
      return {
        workspaceId: row.workspaceId,
        workspaceName: ws?.name?.trim() || row.workspaceId,
        workspaceSlug: ws?.slug ?? null,
        count: row.count,
      };
    })
    .sort((a, b) => b.count - a.count || a.workspaceName.localeCompare(b.workspaceName));

  const acquisitionMap = emptyAcquisitionMap();
  const utmSources = new Map<string, number>();
  const utmMediums = new Map<string, number>();
  const utmCampaigns = new Map<string, number>();
  let withGclid = 0;
  let withGbraid = 0;
  let withWbraid = 0;
  let withAnyClickId = 0;

  for (const row of attributionRows) {
    const channel = classifySignupAcquisition({
      utmSource: row.utmSource,
      utmMedium: row.utmMedium,
      utmCampaign: row.utmCampaign,
      gclid: row.gclid,
      gbraid: row.gbraid,
      wbraid: row.wbraid,
    });
    acquisitionMap[channel] += row.count;

    bumpDimension(utmSources, row.utmSource, row.count);
    bumpDimension(utmMediums, row.utmMedium, row.count);
    bumpDimension(utmCampaigns, row.utmCampaign, row.count);
    if (row.gclid) withGclid += row.count;
    if (row.gbraid) withGbraid += row.count;
    if (row.wbraid) withWbraid += row.count;
    if (row.gclid || row.gbraid || row.wbraid) withAnyClickId += row.count;
  }
  // LEFT JOIN includes users with no Lead (null UTMs → unknown).
  const acquisition = SIGNUP_ACQUISITION_CHANNELS.map((channel) => ({
    channel,
    count: acquisitionMap[channel],
  }));

  const dayMap = new Map(dayRows.map((r) => [r.day, r.count]));
  const trendDays =
    range.from != null
      ? enumerateZonedDays(range.from, range.to, range.timeZone)
      : dayRows.map((r) => r.day).sort();
  const trend = trendDays.map((date) => ({
    date,
    count: dayMap.get(date) ?? 0,
  }));

  let tenantDetail: SignupAnalyticsReport["tenantDetail"] = null;
  if (workspaceId) {
    const ws = workspaceById.get(workspaceId);
    tenantDetail = {
      workspaceId,
      workspaceName: ws?.name?.trim() || workspaceId,
      workspaceSlug: ws?.slug ?? null,
      inRange,
      allTime,
      emailVerified,
      phoneOtpVerified,
      phoneAgentConfirmed,
      acquisition,
    };
  }

  return {
    meta: {
      timeZone: SIGNUP_ANALYTICS_TIME_ZONE,
      timeZoneLabel: SIGNUP_ANALYTICS_TIME_ZONE_LABEL,
      preset: range.preset,
      from: range.from ? range.from.toISOString() : null,
      to: range.to.toISOString(),
      workspaceId,
      generatedAt: now.toISOString(),
      classificationNotes: [...SIGNUP_ANALYTICS_CLASSIFICATION_NOTES],
      indexRecommendations: [...SIGNUP_ANALYTICS_INDEX_RECOMMENDATIONS],
    },
    totals: {
      inRange,
      allTime,
      currentPeriod: {
        today,
        last7Days,
        last30Days,
      },
    },
    verification: {
      emailVerified,
      emailUnverified: Math.max(0, inRange - emailVerified),
      phoneOtpVerified,
      phoneOtpUnverified: Math.max(0, inRange - phoneOtpVerified),
      phoneAgentConfirmed,
    },
    acquisition,
    attributionDimensions: {
      utmSources: topDimensions(utmSources),
      utmMediums: topDimensions(utmMediums),
      utmCampaigns: topDimensions(utmCampaigns),
      clickIds: { withGclid, withGbraid, withWbraid, withAnyClickId },
    },
    byTenant,
    workspaces: workspaces.map((w) => ({
      id: w.id,
      name: w.name?.trim() || w.id,
      slug: w.slug ?? null,
    })),
    trend,
    tenantDetail,
  };
}

export class SignupAnalyticsQueryError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "SignupAnalyticsQueryError";
    this.status = status;
    this.code = code;
  }
}

function createdAtFilter(
  range: SignupAnalyticsRange,
): Prisma.DateTimeFilter | undefined {
  if (!range.from) {
    return { lt: range.to };
  }
  return { gte: range.from, lt: range.to };
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

async function aggregateByTenant(
  db: PrismaClient,
  where: Prisma.UserWhereInput,
): Promise<TenantAggRow[]> {
  const rows = await db.user.groupBy({
    by: ["workspaceId"],
    where,
    _count: { _all: true },
  });
  return rows
    .filter((r): r is typeof r & { workspaceId: string } => Boolean(r.workspaceId))
    .map((r) => ({ workspaceId: r.workspaceId, count: r._count._all }));
}

async function aggregateAttribution(
  db: PrismaClient,
  workspaceId: string | null,
  range: SignupAnalyticsRange,
): Promise<AttributionAggRow[]> {
  // Aggregate-only join: never returns Lead row payloads to clients.
  const rows = workspaceId
    ? await db.$queryRaw<AttributionAggRow[]>`
        SELECT
          l."utmSource" AS "utmSource",
          l."utmMedium" AS "utmMedium",
          l."utmCampaign" AS "utmCampaign",
          NULLIF(BTRIM(COALESCE(l."captureContext"->>'gclid', '')), '') AS gclid,
          NULLIF(BTRIM(COALESCE(l."captureContext"->>'gbraid', '')), '') AS gbraid,
          NULLIF(BTRIM(COALESCE(l."captureContext"->>'wbraid', '')), '') AS wbraid,
          COUNT(*)::int AS count
        FROM "User" u
        LEFT JOIN "Lead" l
          ON l."workspaceId" = u."workspaceId"
         AND l."customerId" = u.id
        WHERE u."workspaceId" = ${workspaceId}
          AND u.role IN ('BUYER', 'SELLER')
          AND NOT EXISTS (
            SELECT 1 FROM "PlatformOperator" po WHERE po."userId" = u.id
          )
          AND NOT EXISTS (
            SELECT 1 FROM "WorkspaceMember" wm WHERE wm."userId" = u.id
          )
          AND u."createdAt" < ${range.to}
          ${range.from ? Prisma.sql`AND u."createdAt" >= ${range.from}` : Prisma.empty}
        GROUP BY 1, 2, 3, 4, 5, 6
      `
    : await db.$queryRaw<AttributionAggRow[]>`
        SELECT
          l."utmSource" AS "utmSource",
          l."utmMedium" AS "utmMedium",
          l."utmCampaign" AS "utmCampaign",
          NULLIF(BTRIM(COALESCE(l."captureContext"->>'gclid', '')), '') AS gclid,
          NULLIF(BTRIM(COALESCE(l."captureContext"->>'gbraid', '')), '') AS gbraid,
          NULLIF(BTRIM(COALESCE(l."captureContext"->>'wbraid', '')), '') AS wbraid,
          COUNT(*)::int AS count
        FROM "User" u
        LEFT JOIN "Lead" l
          ON l."workspaceId" = u."workspaceId"
         AND l."customerId" = u.id
        WHERE u."workspaceId" IS NOT NULL
          AND u.role IN ('BUYER', 'SELLER')
          AND NOT EXISTS (
            SELECT 1 FROM "PlatformOperator" po WHERE po."userId" = u.id
          )
          AND NOT EXISTS (
            SELECT 1 FROM "WorkspaceMember" wm WHERE wm."userId" = u.id
          )
          AND u."createdAt" < ${range.to}
          ${range.from ? Prisma.sql`AND u."createdAt" >= ${range.from}` : Prisma.empty}
        GROUP BY 1, 2, 3, 4, 5, 6
      `;
  return rows.map((r) => ({
    ...r,
    count: Number(r.count) || 0,
  }));
}

function bumpDimension(
  map: Map<string, number>,
  value: string | null | undefined,
  count: number,
): void {
  const key = value?.trim();
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + count);
}

function topDimensions(
  map: Map<string, number>,
  limit = 25,
): Array<{ value: string; count: number }> {
  return [...map.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, limit);
}

async function aggregateTrend(
  db: PrismaClient,
  workspaceId: string | null,
  range: SignupAnalyticsRange,
): Promise<DayAggRow[]> {
  const rows = workspaceId
    ? await db.$queryRaw<DayAggRow[]>`
        SELECT
          to_char(
            (u."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${SIGNUP_ANALYTICS_TIME_ZONE},
            'YYYY-MM-DD'
          ) AS day,
          COUNT(*)::int AS count
        FROM "User" u
        WHERE u."workspaceId" = ${workspaceId}
          AND u.role IN ('BUYER', 'SELLER')
          AND NOT EXISTS (
            SELECT 1 FROM "PlatformOperator" po WHERE po."userId" = u.id
          )
          AND NOT EXISTS (
            SELECT 1 FROM "WorkspaceMember" wm WHERE wm."userId" = u.id
          )
          AND u."createdAt" < ${range.to}
          ${range.from ? Prisma.sql`AND u."createdAt" >= ${range.from}` : Prisma.empty}
        GROUP BY 1
        ORDER BY 1
      `
    : await db.$queryRaw<DayAggRow[]>`
        SELECT
          to_char(
            (u."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${SIGNUP_ANALYTICS_TIME_ZONE},
            'YYYY-MM-DD'
          ) AS day,
          COUNT(*)::int AS count
        FROM "User" u
        WHERE u."workspaceId" IS NOT NULL
          AND u.role IN ('BUYER', 'SELLER')
          AND NOT EXISTS (
            SELECT 1 FROM "PlatformOperator" po WHERE po."userId" = u.id
          )
          AND NOT EXISTS (
            SELECT 1 FROM "WorkspaceMember" wm WHERE wm."userId" = u.id
          )
          AND u."createdAt" < ${range.to}
          ${range.from ? Prisma.sql`AND u."createdAt" >= ${range.from}` : Prisma.empty}
        GROUP BY 1
        ORDER BY 1
      `;
  return rows.map((r) => ({
    day: r.day,
    count: Number(r.count) || 0,
  }));
}
