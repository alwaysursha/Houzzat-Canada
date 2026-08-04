import type { LeadStatus, Prisma } from "@prisma/client";
import type { AgentOrgContext } from "@/lib/agent";
import { leadScopeWhere } from "@/lib/agent";
import { resolveDeskView } from "@/lib/agent/brokerage";
import type { AgentStatistics } from "@/lib/agent/statistics-shared";
import { prisma } from "@/lib/prisma";

export type { AgentStatistics } from "@/lib/agent/statistics-shared";
export { formatResponseMins } from "@/lib/agent/statistics-shared";

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

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
    : sorted[mid]!;
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}

export async function loadAgentStatistics(
  ctx: AgentOrgContext,
  rangeDays = 30,
): Promise<AgentStatistics> {
  const desk = await resolveDeskView(ctx);
  const focusAgentId = desk.deskAgentId;
  const scopeTeam = leadScopeWhere(ctx, ctx.canSeeTeamLeads ? "team" : "mine");
  const scopeMine = leadScopeWhere(ctx, "mine");

  const leadWhere: Prisma.LeadWhereInput = focusAgentId
    ? { organizationId: ctx.organizationId, assignedAgentId: focusAgentId }
    : ctx.canSeeTeamLeads
      ? scopeTeam
      : { ...scopeMine, assignedAgentId: ctx.user.id };

  const scopeLabel = focusAgentId
    ? "Selected agent desk"
    : ctx.canSeeTeamLeads
      ? "Team overview"
      : "My desk";

  const now = new Date();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const periodStart = new Date(now);
  periodStart.setDate(periodStart.getDate() - (rangeDays - 1));
  periodStart.setHours(0, 0, 0, 0);
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const customerIds = (
    await prisma.lead.findMany({
      where: { ...leadWhere, customerId: { not: null } },
      select: { customerId: true },
      distinct: ["customerId"],
      take: 2000,
    })
  )
    .map((l) => l.customerId)
    .filter((id): id is string => Boolean(id));

  const [
    leadsTotal,
    leadsPeriod,
    leadsToday,
    newWaiting,
    pipelineGroups,
    sourceGroups,
    tagGroups,
    intentGroups,
    periodLeads,
    respondedLeads,
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
    prisma.lead.findMany({
      where: { ...leadWhere, createdAt: { gte: periodStart } },
      select: { createdAt: true, firstRespondedAt: true },
      take: 5000,
    }),
    prisma.lead.findMany({
      where: {
        ...leadWhere,
        firstRespondedAt: { not: null, gte: periodStart },
      },
      select: { createdAt: true, firstRespondedAt: true },
      take: 3000,
    }),
    prisma.leadEmailLog.count({
      where: {
        createdAt: { gte: periodStart },
        lead: leadWhere,
      },
    }),
    prisma.agentTask.count({
      where: {
        organizationId: ctx.organizationId,
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
    customerIds.length
      ? prisma.activityEvent.count({
          where: {
            type: "LISTING_VIEW",
            createdAt: { gte: periodStart },
            userId: { in: customerIds },
          },
        })
      : Promise.resolve(0),
    customerIds.length
      ? prisma.activityEvent.count({
          where: {
            type: "SEARCH",
            createdAt: { gte: periodStart },
            userId: { in: customerIds },
          },
        })
      : Promise.resolve(0),
    customerIds.length
      ? prisma.savedListing.count({
          where: {
            userId: { in: customerIds },
            createdAt: { gte: periodStart },
          },
        })
      : Promise.resolve(0),
    customerIds.length
      ? prisma.activityEvent.groupBy({
          by: ["type"],
          where: {
            createdAt: { gte: periodStart },
            userId: { in: customerIds },
            type: { not: "HEARTBEAT" },
          },
          _count: { _all: true },
          orderBy: { _count: { type: "desc" } },
          take: 8,
        })
      : Promise.resolve([]),
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
      take: 80,
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const responseMins = respondedLeads
    .map((l) => {
      if (!l.firstRespondedAt) return null;
      const mins =
        (l.firstRespondedAt.getTime() - l.createdAt.getTime()) / 60_000;
      return mins >= 0 ? mins : null;
    })
    .filter((n): n is number => n != null);

  const touched =
    leadsTotal -
    newWaiting;
  const responseRate =
    leadsTotal > 0
      ? Math.round(((leadsTotal - newWaiting) / leadsTotal) * 100)
      : 0;

  const days = eachDay(periodStart, now);
  const leadsDayMap = new Map<string, number>();
  const responseDayMap = new Map<string, number>();
  for (const key of days) {
    leadsDayMap.set(key, 0);
    responseDayMap.set(key, 0);
  }
  for (const l of periodLeads) {
    const k = dayKey(l.createdAt);
    if (leadsDayMap.has(k)) leadsDayMap.set(k, (leadsDayMap.get(k) ?? 0) + 1);
  }
  for (const l of respondedLeads) {
    if (!l.firstRespondedAt) continue;
    const k = dayKey(l.firstRespondedAt);
    if (responseDayMap.has(k))
      responseDayMap.set(k, (responseDayMap.get(k) ?? 0) + 1);
  }

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

  const buckets = [
    { label: "< 15m", test: (m: number) => m < 15 },
    { label: "15–60m", test: (m: number) => m >= 15 && m < 60 },
    { label: "1–4h", test: (m: number) => m >= 60 && m < 240 },
    { label: "4–24h", test: (m: number) => m >= 240 && m < 1440 },
    { label: "> 24h", test: (m: number) => m >= 1440 },
  ];
  const responseBuckets = buckets.map((b) => ({
    label: b.label,
    count: responseMins.filter(b.test).length,
  }));

  // Lightweight hot estimate without N+1: score + recent status weight
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

  void touched;

  return {
    scopeLabel,
    rangeDays,
    kpis: {
      leadsTotal,
      leadsPeriod,
      leadsToday,
      newWaiting,
      responseRate,
      avgResponseMins: avg(responseMins),
      medianResponseMins: median(responseMins),
      listingViewsPeriod,
      searchesPeriod,
      emailsPeriod,
      tasksCompletedPeriod,
      appointmentsPeriod,
      hotLeads,
      savesPeriod,
    },
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
    responseBuckets,
  };
}
