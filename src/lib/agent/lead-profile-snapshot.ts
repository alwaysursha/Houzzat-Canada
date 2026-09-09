import type { AgentOrgContext } from "@/lib/agent";
import { buyerIntentFromSavedSearches, type BuyerIntentSnapshot } from "@/lib/agent/buyer-intent";
import {
  HOT_VIEW_WINDOW_MS,
  hotnessFromSignals,
  type HotnessSnapshot,
} from "@/lib/agent/hotness";
import {
  FIRST_PAINT_TIMELINE_DAYS,
  loadPagedLeadTimeline,
  type LeadTimelinePage,
} from "@/lib/agent/lead-profile-timeline";
import {
  loadLeadSummary,
  type LeadProfileShell,
} from "@/lib/agent/lead-summary";
import { prisma } from "@/lib/prisma";

export type LeadProfileHot = {
  hotness: number;
  views24h: number;
  distinctListings24h: number;
  isOnline: boolean;
  binge: boolean;
  lastSeenAt: string | null;
  slaHoursOpen: number | null;
};

export type LeadProfileSnapshot = LeadProfileShell & {
  stats: {
    emails: number;
    alerts: number;
    saves: number;
    savedSearches: number;
  };
  hot: LeadProfileHot;
  lookingFor: BuyerIntentSnapshot;
  timeline: LeadTimelinePage;
  nextReminder: { title: string; dueAt: string } | null;
  timelineWindowDays: number;
};

function serializeHot(hot: HotnessSnapshot): LeadProfileHot {
  return {
    hotness: hot.hotness,
    views24h: hot.views24h,
    distinctListings24h: hot.distinctListings24h,
    isOnline: hot.isOnline,
    binge: hot.binge,
    lastSeenAt: hot.lastSeenAt?.toISOString() ?? null,
    slaHoursOpen: hot.slaHoursOpen,
  };
}

async function loadFirstPaintSignals(input: {
  leadId: string;
  customerId: string | null;
  status: string;
  score: number;
  createdAt: Date;
  firstRespondedAt: Date | null;
  customerName: string | null;
  savedSearchQuery: unknown;
  savedSearchName: string | null;
}): Promise<{
  stats: LeadProfileSnapshot["stats"];
  hot: LeadProfileHot;
  lookingFor: BuyerIntentSnapshot;
  nextReminder: LeadProfileSnapshot["nextReminder"];
}> {
  const viewSince = new Date(Date.now() - HOT_VIEW_WINDOW_MS);
  const customerId = input.customerId;

  const [
    emailCount,
    alertCount,
    saveCount,
    searchCount,
    viewCount,
    viewGroups,
    lastEvent,
    visitor,
    nextTask,
  ] = await Promise.all([
    prisma.leadEmailLog.count({ where: { leadId: input.leadId } }),
    customerId
      ? prisma.customerAlert.count({ where: { userId: customerId } })
      : Promise.resolve(0),
    customerId
      ? prisma.savedListing.count({ where: { userId: customerId } })
      : Promise.resolve(0),
    customerId
      ? prisma.savedSearch.count({ where: { userId: customerId } })
      : Promise.resolve(0),
    customerId
      ? prisma.listingView.count({
          where: { userId: customerId, createdAt: { gte: viewSince } },
        })
      : Promise.resolve(0),
    customerId
      ? prisma.listingView.groupBy({
          by: ["mlsNumber"],
          where: { userId: customerId, createdAt: { gte: viewSince } },
          _count: { _all: true },
          orderBy: { _count: { mlsNumber: "desc" } },
          take: 40,
        })
      : Promise.resolve([]),
    customerId
      ? prisma.activityEvent.findFirst({
          where: { userId: customerId, type: { not: "HEARTBEAT" } },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        })
      : Promise.resolve(null),
    customerId
      ? prisma.siteVisitor.findFirst({
          where: { userId: customerId },
          orderBy: { lastSeenAt: "desc" },
          select: { lastSeenAt: true },
        })
      : Promise.resolve(null),
    prisma.agentTask.findFirst({
      where: { leadId: input.leadId, status: "OPEN" },
      orderBy: { dueAt: "asc" },
      select: { title: true, dueAt: true },
    }),
  ]);

  const lastSeenAt = [lastEvent?.createdAt, visitor?.lastSeenAt]
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  const hot = hotnessFromSignals(
    {
      leadId: input.leadId,
      customerId,
      status: input.status,
      score: input.score,
      createdAt: input.createdAt,
      firstRespondedAt: input.firstRespondedAt,
    },
    {
      views24h: viewCount,
      distinctListings24h: viewGroups.length,
      lastSeenAt,
    },
  );

  const lookingFor = buyerIntentFromSavedSearches({
    customerName: input.customerName,
    savedSearches:
      input.savedSearchName || input.savedSearchQuery
        ? [{ name: input.savedSearchName || "Saved search", query: input.savedSearchQuery }]
        : [],
  });

  return {
    stats: {
      emails: emailCount,
      alerts: alertCount,
      saves: saveCount,
      savedSearches: searchCount,
    },
    hot: serializeHot(hot),
    lookingFor,
    nextReminder: nextTask
      ? { title: nextTask.title, dueAt: nextTask.dueAt.toISOString() }
      : null,
  };
}

export async function loadLeadProfileSnapshot(
  ctx: AgentOrgContext,
  leadId: string,
): Promise<LeadProfileSnapshot | null> {
  const shell = await loadLeadSummary(ctx, leadId);
  if (!shell) return null;
  const customerId = shell.lead.customer?.id ?? null;

  const [signals, timeline] = await Promise.all([
    loadFirstPaintSignals({
      leadId,
      customerId,
      status: shell.lead.status,
      score: shell.lead.score,
      createdAt: new Date(shell.lead.createdAt),
      firstRespondedAt: shell.lead.firstRespondedAt
        ? new Date(shell.lead.firstRespondedAt)
        : null,
      customerName: shell.lead.customer?.name ?? null,
      savedSearchQuery: shell.savedSearchQuery,
      savedSearchName: shell.savedSearchLabel,
    }),
    loadPagedLeadTimeline({
      leadId,
      customerId,
      scope: "recent",
    }),
  ]);

  return {
    ...shell,
    stats: signals.stats,
    hot: signals.hot,
    lookingFor: signals.lookingFor,
    timeline,
    nextReminder: signals.nextReminder,
    timelineWindowDays: FIRST_PAINT_TIMELINE_DAYS,
  };
}
