/**
 * V2 Route Planner list loader. Auth is hostname → workspace → ACTIVE
 * member → canAccessLead. Does not load overview stats, Matchboard seed,
 * buyer-intent history, saved searches, saved homes, watches, area monitors,
 * listing notes, alerts, emails, timeline, or tasks. Does not hydrate listings.
 * Nested stops are take-capped (ROUTE_PLANNER_MAX_STOPS). Stored totals may
 * exceed that; the UI labels truncated tours as "N of total" so count and
 * list never disagree.
 */
import type { AgentOrgContext } from "@/lib/agent";
import { v2CanAccessLead } from "@/lib/agent/lead-profile-v2/access";
import {
  V2_ROUTE_PLANNER_STOPS_TAKE,
  V2_ROUTE_PLANNER_TOUR_TAKE,
  mapV2RoutePlannerTours,
} from "@/lib/agent/lead-profile-v2/route-planner-query";
import type { LeadProfileV2RoutePlannerPanel } from "@/lib/agent/lead-profile-v2/types";
import { prisma } from "@/lib/prisma";

export const V2_ROUTE_PLANNER_ACCESS_SELECT = {
  id: true,
  organizationId: true,
  workspaceId: true,
  assignedAgentId: true,
  customerId: true,
} as const;

export const V2_ROUTE_PLANNER_TOUR_SELECT = {
  id: true,
  name: true,
  status: true,
  _count: { select: { stops: true } },
  stops: {
    orderBy: { sortOrder: "asc" as const },
    take: V2_ROUTE_PLANNER_STOPS_TAKE,
    select: { mlsNumber: true },
  },
} as const;

if (V2_ROUTE_PLANNER_TOUR_TAKE !== 8) {
  throw new Error(
    "Route Planner tour take drifted from the current Engagement take 8",
  );
}

if (V2_ROUTE_PLANNER_STOPS_TAKE !== 10) {
  throw new Error(
    "Route Planner stop take drifted from ROUTE_PLANNER_MAX_STOPS",
  );
}

export async function loadLeadProfileV2RoutePlanner(
  ctx: AgentOrgContext,
  leadId: string,
): Promise<LeadProfileV2RoutePlannerPanel | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: V2_ROUTE_PLANNER_ACCESS_SELECT,
  });
  if (!lead || !v2CanAccessLead(ctx, lead)) return null;

  if (!lead.customerId) {
    return { tours: [] };
  }

  const rows = await prisma.viewingTour.findMany({
    where: { userId: lead.customerId },
    orderBy: { updatedAt: "desc" },
    take: V2_ROUTE_PLANNER_TOUR_TAKE,
    select: V2_ROUTE_PLANNER_TOUR_SELECT,
  });

  return mapV2RoutePlannerTours(rows);
}
