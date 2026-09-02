import type { LeadStatus, Prisma } from "@prisma/client";
import { Prisma as PrismaNs } from "@prisma/client";
import type { AgentOrgContext } from "@/lib/agent";
import { agentTaskTenantWhere, leadDeskSql, leadWhereForDesk } from "@/lib/crm-read-scope";
import { resolveDeskView } from "@/lib/agent/brokerage";
import type { AgentStatistics } from "@/lib/agent/statistics-shared";
import { HOT_CANDIDATE_TAKE } from "@/lib/agent/statistics-shared";
import { prisma } from "@/lib/prisma";

export type { AgentStatistics } from "@/lib/agent/statistics-shared";
export {
  formatResponseMins,
  HOT_CANDIDATE_TAKE,
} from "@/lib/agent/statistics-shared";

const PIPELINE_ORDER: LeadStatus[] = [
  "NEW_LEAD",
  "ATTEMPTED_CONTACT",
  "CONTACTED",
  "APPT_SET",
  "APPT_MET",
  "ACTIVE_CLIENT",
  "PENDING_CLIENT",
  "PAST_CLIENT",
];

const PIPELINE_LABEL: Record<LeadStatus, string> = {
  NEW_LEAD: "New",
  ATTEMPTED_CONTACT: "Attempted",
  CONTACTED: "Contacted",
  APPT_SET: "Appt set",
  APPT_MET: "Appt met",
  ACTIVE_CLIENT: "Active",
  PENDING_CLIENT: "Pending",
  PAST_CLIENT: "Past",
};

type DayCountRow = { day: Date; n: bigint | number };
type ResponseAggRow = {
  avg_mins: number | null;
  med_mins: number | null;
  b_lt15: bigint | number;
  b_15_60: bigint | number;
  b_1_4h: bigint | number;
  b_4_24h: bigint | number;
  b_gt24h: bigint | number;
};

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function eachDay(from: Date, to: Date): string[] {
  const keys: string[] = [];
  const cur = new Date(from);
  cur.setHours(12, 0, 0, 0);
  const end = new Date(to);
  end.setHours(12, 0, 0, 0);
  while (cur <= end) {
    keys.push(dayKey(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return keys;
}

function asNumber(value: bigint | number | null | undefined): number {
  if (value == null) return 0;
  return typeof value === "bigint" ? Number(value) : value;
}

export { leadDeskSql } from "@/lib/crm-read-scope";

async function loadLeadCreatedByDay(
  deskSql: PrismaNs.Sql,
  periodStart: Date,
): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<DayCountRow[]>`
    SELECT DATE_TRUNC('day', "createdAt" AT TIME ZONE 'UTC') AS day,
           COUNT(*)::bigint AS n
    FROM "Lead"
    WHERE ${deskSql}
      AND "createdAt" >= ${periodStart}
    GROUP BY 1
    ORDER BY 1
  `;
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(dayKey(new Date(row.day)), asNumber(row.n));
  }
  return map;
}

async function loadResponsesByDay(
  deskSql: PrismaNs.Sql,
  periodStart: Date,
): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<DayCountRow[]>`
    SELECT DATE_TRUNC('day', "firstRespondedAt" AT TIME ZONE 'UTC') AS day,
           COUNT(*)::bigint AS n
    FROM "Lead"
    WHERE ${deskSql}
      AND "firstRespondedAt" IS NOT NULL
      AND "firstRespondedAt" >= ${periodStart}
    GROUP BY 1
    ORDER BY 1
  `;
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(dayKey(new Date(row.day)), asNumber(row.n));
  }
  return map;
}

/**
 * Exact avg / median / histogram over response minutes in range.
 * Replaces the prior capped findMany response sample + JS median (unordered).
 */
async function loadResponseAggregates(
  deskSql: PrismaNs.Sql,
  periodStart: Date,
): Promise<{
  avgResponseMins: number | null;
  medianResponseMins: number | null;
  responseBuckets: AgentStatistics["responseBuckets"];
}> {
  const rows = await prisma.$queryRaw<ResponseAggRow[]>`
    SELECT
      AVG(mins) AS avg_mins,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY mins) AS med_mins,
      COUNT(*) FILTER (WHERE mins < 15)::bigint AS b_lt15,
      COUNT(*) FILTER (WHERE mins >= 15 AND mins < 60)::bigint AS b_15_60,
      COUNT(*) FILTER (WHERE mins >= 60 AND mins < 240)::bigint AS b_1_4h,
      COUNT(*) FILTER (WHERE mins >= 240 AND mins < 1440)::bigint AS b_4_24h,
      COUNT(*) FILTER (WHERE mins >= 1440)::bigint AS b_gt24h
    FROM (
      SELECT EXTRACT(EPOCH FROM ("firstRespondedAt" - "createdAt")) / 60.0 AS mins
      FROM "Lead"
      WHERE ${deskSql}
        AND "firstRespondedAt" IS NOT NULL
        AND "firstRespondedAt" >= ${periodStart}
    ) t
    WHERE mins >= 0
  `;
  const row = rows[0];
  if (!row || (row.avg_mins == null && asNumber(row.b_lt15) === 0)) {
    return {
      avgResponseMins: null,
      medianResponseMins: null,
      responseBuckets: [
        { label: "< 15m", count: 0 },
        { label: "15–60m", count: 0 },
        { label: "1–4h", count: 0 },
        { label: "4–24h", count: 0 },
        { label: "> 24h", count: 0 },
      ],
    };
  }
  return {
    avgResponseMins:
      row.avg_mins == null ? null : Math.round(Number(row.avg_mins)),
    medianResponseMins:
      row.med_mins == null ? null : Math.round(Number(row.med_mins)),
    responseBuckets: [
      { label: "< 15m", count: asNumber(row.b_lt15) },
      { label: "15–60m", count: asNumber(row.b_15_60) },
      { label: "1–4h", count: asNumber(row.b_1_4h) },
      { label: "4–24h", count: asNumber(row.b_4_24h) },
      { label: "> 24h", count: asNumber(row.b_gt24h) },
    ],
  };
}

export type StatisticsScope = {
  leadWhere: Prisma.LeadWhereInput;
  deskSql: PrismaNs.Sql;
  scopeLabel: string;
  focusAgentId: string | null;
  organizationId: string;
  userId: string;
  canSeeTeamLeads: boolean;
};

export async function resolveStatisticsScope(
  ctx: AgentOrgContext,
  options?: { deskCookie?: string | null },
): Promise<StatisticsScope> {
  const desk = await resolveDeskView({
    user: ctx.user,
    organizationId: ctx.organizationId,
    workspaceId: ctx.workspaceId,
    canSeeTeamLeads: ctx.canSeeTeamLeads,
    ...(options && "deskCookie" in options
      ? { deskCookie: options.deskCookie ?? null }
      : {}),
  });
  const focusAgentId = desk.deskAgentId;
  const leadWhere = leadWhereForDesk(ctx, focusAgentId);

  const scopeLabel = focusAgentId
    ? "Selected agent desk"
    : ctx.canSeeTeamLeads
      ? "Team overview"
      : "My desk";

  return {
    leadWhere,
    deskSql: leadDeskSql(ctx, focusAgentId),
    scopeLabel,
    focusAgentId,
    organizationId: ctx.organizationId,
    userId: ctx.user.id,
    canSeeTeamLeads: ctx.canSeeTeamLeads,
  };
}

/** Cheap first-paint KPIs + groupBy charts (no large findMany). */
export async function loadAgentStatisticsKpis(
  ctx: AgentOrgContext,
  rangeDays = 30,
  options?: { deskCookie?: string | null },
): Promise<
  Pick<AgentStatistics, "scopeLabel" | "rangeDays" | "kpis" | "responseBuckets"> & {
    pipeline: AgentStatistics["pipeline"];
    sources: AgentStatistics["sources"];
    inquiryTags: AgentStatistics["inquiryTags"];
    intentMix: AgentStatistics["intentMix"];
    activityByType: AgentStatistics["activityByType"];
    funnel: AgentStatistics["funnel"];
  }
> {
  const scope = await resolveStatisticsScope(ctx, options);
  const { leadWhere, deskSql, scopeLabel, focusAgentId } = scope;

  const now = new Date();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const periodStart = new Date(now);
  periodStart.setDate(periodStart.getDate() - (rangeDays - 1));
  periodStart.setHours(0, 0, 0, 0);
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const customerLeadFilter = { leads: { some: leadWhere } };

  const [
    leadsTotal,
    leadsPeriod,
    leadsToday,
    newWaiting,
    pipelineGroups,
    sourceGroups,
    tagGroups,
    intentGroups,
    responseAgg,
    emailsPeriod,
    tasksCompletedPeriod,
    appointmentsPeriod,
    listingViewsPeriod,
    searchesPeriod,
    savesPeriod,
    activityByType,
    hotCandidates,
  ] = await Promise.all([
    prisma.lead.count({ where: leadWhere }),
    prisma.lead.count({
      where: { ...leadWhere, createdAt: { gte: periodStart } },
    }),
    prisma.lead.count({
      where: { ...leadWhere, createdAt: { gte: startOfToday } },
    }),
    prisma.lead.count({
      where: { ...leadWhere, status: "NEW_LEAD" },
    }),
    prisma.lead.groupBy({
      by: ["status"],
      where: leadWhere,
      _count: { _all: true },
    }),
    prisma.lead.groupBy({
      by: ["source"],
      where: { ...leadWhere, createdAt: { gte: periodStart } },
      _count: { _all: true },
      orderBy: { _count: { source: "desc" } },
    }),
    prisma.lead.groupBy({
      by: ["inquiryTag"],
      where: {
        ...leadWhere,
        inquiryTag: { not: null },
        createdAt: { gte: periodStart },
      },
      _count: { _all: true },
    }),
    prisma.lead.groupBy({
      by: ["intent"],
      where: leadWhere,
      _count: { _all: true },
    }),
    loadResponseAggregates(deskSql, periodStart),
    prisma.leadEmailLog.count({
      where: {
        createdAt: { gte: periodStart },
        lead: leadWhere,
      },
    }),
    prisma.agentTask.count({
      where: {
        ...agentTaskTenantWhere(ctx),
        status: "DONE",
        completedAt: { gte: periodStart },
        ...(focusAgentId
          ? { assigneeId: focusAgentId }
          : ctx.canSeeTeamLeads
            ? {}
            : { assigneeId: ctx.user.id }),
      },
    }),
    prisma.appointment.count({
      where: {
        createdAt: { gte: periodStart },
        lead: leadWhere,
      },
    }),
    prisma.activityEvent.count({
      where: {
        type: "LISTING_VIEW",
        createdAt: { gte: periodStart },
        user: customerLeadFilter,
      },
    }),
    prisma.activityEvent.count({
      where: {
        type: "SEARCH",
        createdAt: { gte: periodStart },
        user: customerLeadFilter,
      },
    }),
    prisma.savedListing.count({
      where: {
        createdAt: { gte: periodStart },
        user: customerLeadFilter,
      },
    }),
    prisma.activityEvent.groupBy({
      by: ["type"],
      where: {
        createdAt: { gte: periodStart },
        type: { not: "HEARTBEAT" },
        user: customerLeadFilter,
      },
      _count: { _all: true },
      orderBy: { _count: { type: "desc" } },
      take: 8,
    }),
    prisma.lead.findMany({
      where: {
        ...leadWhere,
        status: { in: ["NEW_LEAD", "ATTEMPTED_CONTACT", "CONTACTED"] },
      },
      select: {
        id: true,
        score: true,
        status: true,
        customerId: true,
        createdAt: true,
        firstRespondedAt: true,
      },
      take: HOT_CANDIDATE_TAKE,
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const responseRate =
    leadsTotal > 0
      ? Math.round(((leadsTotal - newWaiting) / leadsTotal) * 100)
      : 0;

  const pipelineMap = new Map(
    pipelineGroups.map((g) => [g.status, g._count._all]),
  );
  const pipeline = PIPELINE_ORDER.map((status) => ({
    status,
    label: PIPELINE_LABEL[status],
    count: pipelineMap.get(status) ?? 0,
  }));

  const funnelStages: Array<{ stage: string; statuses: LeadStatus[] }> = [
    { stage: "New / inbound", statuses: ["NEW_LEAD"] },
    {
      stage: "Working",
      statuses: ["ATTEMPTED_CONTACT", "CONTACTED"],
    },
    { stage: "Appointment", statuses: ["APPT_SET", "APPT_MET"] },
    {
      stage: "Client",
      statuses: ["ACTIVE_CLIENT", "PENDING_CLIENT"],
    },
  ];
  const funnelRaw = funnelStages.map((s) => ({
    stage: s.stage,
    count: s.statuses.reduce((sum, st) => sum + (pipelineMap.get(st) ?? 0), 0),
  }));
  const funnelTop = Math.max(...funnelRaw.map((f) => f.count), 1);
  const funnel = funnelRaw.map((f) => ({
    ...f,
    pct: Math.round((f.count / funnelTop) * 100),
  }));

  let hotLeads = 0;
  if (hotCandidates.length > 0) {
    const ids = hotCandidates
      .map((l) => l.customerId)
      .filter((id): id is string => Boolean(id));
    const views =
      ids.length > 0
        ? await prisma.activityEvent.groupBy({
            by: ["userId"],
            where: {
              userId: { in: ids },
              type: "LISTING_VIEW",
              createdAt: { gte: dayAgo },
            },
            _count: { _all: true },
          })
        : [];
    const viewMap = new Map(
      views.filter((v) => v.userId).map((v) => [v.userId!, v._count._all]),
    );
    for (const lead of hotCandidates) {
      let hot = lead.score;
      const v = lead.customerId ? (viewMap.get(lead.customerId) ?? 0) : 0;
      hot += Math.min(40, v * 3);
      if (lead.status === "NEW_LEAD" && !lead.firstRespondedAt) hot += 15;
      if (hot >= 60) hotLeads += 1;
    }
  }

  return {
    scopeLabel,
    rangeDays,
    kpis: {
      leadsTotal,
      leadsPeriod,
      leadsToday,
      newWaiting,
      responseRate,
      avgResponseMins: responseAgg.avgResponseMins,
      medianResponseMins: responseAgg.medianResponseMins,
      listingViewsPeriod,
      searchesPeriod,
      emailsPeriod,
      tasksCompletedPeriod,
      appointmentsPeriod,
      hotLeads,
      savesPeriod,
    },
    pipeline,
    sources: sourceGroups.map((g) => ({
      source: g.source,
      label: g.source.replaceAll("_", " "),
      count: g._count._all,
    })),
    inquiryTags: tagGroups
      .filter((g) => g.inquiryTag)
      .map((g) => ({
        tag: g.inquiryTag!,
        label: g.inquiryTag!.replaceAll("_", " "),
        count: g._count._all,
      })),
    intentMix: intentGroups.map((g) => ({
      intent: g.intent,
      label: g.intent === "SELLER" ? "Seller" : "Buyer",
      count: g._count._all,
    })),
    activityByType: activityByType.map((g) => ({
      type: g.type,
      label: g.type.replaceAll("_", " "),
      count: g._count._all,
    })),
    funnel,
    responseBuckets: responseAgg.responseBuckets,
  };
}

/** Day-series chart data (SQL date buckets — no raw Lead samples). */
export async function loadAgentStatisticsSeries(
  ctx: AgentOrgContext,
  rangeDays = 30,
  options?: { deskCookie?: string | null },
): Promise<Pick<AgentStatistics, "leadsByDay">> {
  const scope = await resolveStatisticsScope(ctx, options);
  const now = new Date();
  const periodStart = new Date(now);
  periodStart.setDate(periodStart.getDate() - (rangeDays - 1));
  periodStart.setHours(0, 0, 0, 0);

  const [leadsDayMap, responseDayMap] = await Promise.all([
    loadLeadCreatedByDay(scope.deskSql, periodStart),
    loadResponsesByDay(scope.deskSql, periodStart),
  ]);

  const days = eachDay(periodStart, now);
  return {
    leadsByDay: days.map((date) => {
      const d = new Date(`${date}T12:00:00Z`);
      return {
        date,
        label: d.toLocaleDateString("en-CA", {
          month: "short",
          day: "numeric",
        }),
        leads: leadsDayMap.get(date) ?? 0,
        responses: responseDayMap.get(date) ?? 0,
      };
    }),
  };
}

/**
 * Full statistics payload for the dashboard.
 * Prefer page-level KPI + Suspense series split; this remains for parity/tests.
 */
export async function loadAgentStatistics(
  ctx: AgentOrgContext,
  rangeDays = 30,
  options?: { deskCookie?: string | null },
): Promise<AgentStatistics> {
  const [kpisPart, seriesPart] = await Promise.all([
    loadAgentStatisticsKpis(ctx, rangeDays, options),
    loadAgentStatisticsSeries(ctx, rangeDays, options),
  ]);

  return {
    scopeLabel: kpisPart.scopeLabel,
    rangeDays: kpisPart.rangeDays,
    kpis: kpisPart.kpis,
    leadsByDay: seriesPart.leadsByDay,
    pipeline: kpisPart.pipeline,
    sources: kpisPart.sources,
    inquiryTags: kpisPart.inquiryTags,
    intentMix: kpisPart.intentMix,
    activityByType: kpisPart.activityByType,
    funnel: kpisPart.funnel,
    responseBuckets: kpisPart.responseBuckets,
  };
}
