/**
 * V2 Engagement overview loader: stat cards + 45-day buyer intent + the
 * single Matchboard saved-search seed (ordered candidates[0], no usability
 * filter). Buyer-intent receives the same bounded take-10 candidate set as
 * Legacy engagement — loadBuyerIntent scans until first usable. Auth is
 * hostname → workspace → ACTIVE member → canAccessLead.
 *
 * Does NOT hydrate the Saved Searches list, saved homes, watches, monitors,
 * tours, listing notes, alert rows, email bodies, timeline, tasks, or
 * appointments.
 *
 * Buyer-intent reuse: loadBuyerIntent is already bounded (45 days, take 20
 * visitors / 40 SEARCH / 40 listing views / 40 LISTING_VIEW events / 12 MLS).
 * It does not select email HTML, analytics meta JSON, or unbounded history.
 * V2 does not call the current full Engagement panel loader.
 */
import type { AgentOrgContext } from "@/lib/agent";
import { loadBuyerIntent } from "@/lib/agent/buyer-intent";
import { v2CanAccessLead } from "@/lib/agent/lead-profile-v2/access";
import {
  V2_ENGAGEMENT_MATCHBOARD_CANDIDATE_TAKE,
  V2_ENGAGEMENT_VIEWS_WINDOW_MS,
  selectV2MatchboardSearchSeed,
  toV2BuyerIntentSavedSearchInput,
} from "@/lib/agent/lead-profile-v2/engagement-overview-query";
import type { LeadProfileV2EngagementOverview } from "@/lib/agent/lead-profile-v2/types";
import { prisma } from "@/lib/prisma";

export const V2_ENGAGEMENT_OVERVIEW_ACCESS_SELECT = {
  id: true,
  organizationId: true,
  workspaceId: true,
  assignedAgentId: true,
  customerId: true,
  customer: { select: { id: true, name: true } },
} as const;

/** Candidate scan columns — Matchboard DTO only, no homepage/primary flags. */
export const V2_ENGAGEMENT_SAVED_SEARCH_SELECT = {
  id: true,
  name: true,
  emailAlerts: true,
  smsAlerts: true,
  query: true,
} as const;

const MATCHBOARD_SEARCH_ORDER_BY = [
  { isHomepageActive: "desc" as const },
  { isPrimary: "desc" as const },
  { updatedAt: "desc" as const },
];

if (V2_ENGAGEMENT_MATCHBOARD_CANDIDATE_TAKE !== 10) {
  throw new Error(
    "Matchboard candidate scan drifted from the current Engagement take 10",
  );
}

export async function loadLeadProfileV2EngagementOverview(
  ctx: AgentOrgContext,
  leadId: string,
): Promise<LeadProfileV2EngagementOverview | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: V2_ENGAGEMENT_OVERVIEW_ACCESS_SELECT,
  });
  if (!lead || !v2CanAccessLead(ctx, lead)) return null;

  const customerId = lead.customerId;
  const viewSince = new Date(Date.now() - V2_ENGAGEMENT_VIEWS_WINDOW_MS);

  if (!customerId) {
    const [emails, buyerIntent] = await Promise.all([
      prisma.leadEmailLog.count({ where: { leadId: lead.id } }),
      loadBuyerIntent({ customerId: null, customerName: null }),
    ]);
    return {
      stats: { views24h: 0, saves: 0, alerts: 0, emails },
      buyerIntent,
      matchboardSearch: null,
    };
  }

  const [emails, alerts, saves, views24h, candidates] = await Promise.all([
    prisma.leadEmailLog.count({ where: { leadId: lead.id } }),
    prisma.customerAlert.count({ where: { userId: customerId } }),
    prisma.savedListing.count({ where: { userId: customerId } }),
    prisma.listingView.count({
      where: { userId: customerId, createdAt: { gte: viewSince } },
    }),
    prisma.savedSearch.findMany({
      where: { userId: customerId },
      orderBy: MATCHBOARD_SEARCH_ORDER_BY,
      take: V2_ENGAGEMENT_MATCHBOARD_CANDIDATE_TAKE,
      select: V2_ENGAGEMENT_SAVED_SEARCH_SELECT,
    }),
  ]);

  const matchboardSearch = selectV2MatchboardSearchSeed(candidates);

  const buyerIntent = await loadBuyerIntent({
    customerId,
    customerName: lead.customer?.name ?? null,
    savedSearches: toV2BuyerIntentSavedSearchInput(candidates),
  });

  return {
    stats: { views24h, saves, alerts, emails },
    buyerIntent,
    matchboardSearch,
  };
}
