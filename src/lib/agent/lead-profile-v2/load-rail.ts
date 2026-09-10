/**
 * V2 rail counts + hotness loader. Auth is hostname → workspace → ACTIVE
 * member → canAccessLead. Does not load Shell identity, timeline, email
 * rows, alert rows, listing notes, tours, saved-search query JSON,
 * Looking For, Next Reminder, or listing rows. Reuses hotnessFromSignals
 * — no new scoring algorithm. Alerts/Emails are count-only.
 */
import type { AgentOrgContext } from "@/lib/agent";
import {
  HOT_VIEW_WINDOW_MS,
  hotnessFromSignals,
  type HotnessSnapshot,
} from "@/lib/agent/hotness";
import { v2CanAccessLead } from "@/lib/agent/lead-profile-v2/access";
import { V2_RAIL_VIEW_GROUP_TAKE } from "@/lib/agent/lead-profile-v2/rail-query";
import type { LeadProfileV2RailPanel } from "@/lib/agent/lead-profile-v2/types";
import { prisma } from "@/lib/prisma";

export const V2_RAIL_ACCESS_SELECT = {
  id: true,
  organizationId: true,
  workspaceId: true,
  assignedAgentId: true,
  customerId: true,
  status: true,
  score: true,
  createdAt: true,
  firstRespondedAt: true,
} as const;

if (V2_RAIL_VIEW_GROUP_TAKE !== 40) {
  throw new Error(
    "Rail view group take drifted from the current first-paint take 40",
  );
}

function serializeHot(hot: HotnessSnapshot): LeadProfileV2RailPanel["hot"] {
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

export async function loadLeadProfileV2Rail(
  ctx: AgentOrgContext,
  leadId: string,
): Promise<LeadProfileV2RailPanel | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: V2_RAIL_ACCESS_SELECT,
  });
  if (!lead || !v2CanAccessLead(ctx, lead)) return null;

  const customerId = lead.customerId;
  const viewSince = new Date(Date.now() - HOT_VIEW_WINDOW_MS);

  const [
    saveCount,
    searchCount,
    viewCount,
    viewGroups,
    lastEvent,
    visitor,
    emailCount,
    alertCount,
  ] = await Promise.all([
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
          take: V2_RAIL_VIEW_GROUP_TAKE,
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
    prisma.leadEmailLog.count({ where: { leadId: lead.id } }),
    customerId
      ? prisma.customerAlert.count({ where: { userId: customerId } })
      : Promise.resolve(0),
  ]);

  const lastSeenAt =
    [lastEvent?.createdAt, visitor?.lastSeenAt]
      .filter((d): d is Date => Boolean(d))
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  const hot = hotnessFromSignals(
    {
      leadId: lead.id,
      customerId,
      status: lead.status,
      score: lead.score,
      createdAt: lead.createdAt,
      firstRespondedAt: lead.firstRespondedAt,
    },
    {
      views24h: viewCount,
      distinctListings24h: viewGroups.length,
      lastSeenAt,
    },
  );

  return {
    stats: {
      saves: saveCount,
      savedSearches: searchCount,
      alerts: alertCount,
      emails: emailCount,
    },
    hot: serializeHot(hot),
  };
}
