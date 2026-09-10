/**
 * V2 Property Watches list loader. Auth is hostname → workspace → ACTIVE
 * member → canAccessLead. Does not load overview stats, Matchboard seed,
 * buyer-intent history, saved searches, saved homes, area monitors, tours,
 * notes, alerts, emails, timeline, or tasks. Does not hydrate Listing rows.
 */
import type { AgentOrgContext } from "@/lib/agent";
import { v2CanAccessLead } from "@/lib/agent/lead-profile-v2/access";
import { V2_PROPERTY_WATCHES_TAKE } from "@/lib/agent/lead-profile-v2/property-watches-query";
import type { LeadProfileV2PropertyWatchesPanel } from "@/lib/agent/lead-profile-v2/types";
import { prisma } from "@/lib/prisma";

export const V2_PROPERTY_WATCHES_ACCESS_SELECT = {
  id: true,
  organizationId: true,
  workspaceId: true,
  assignedAgentId: true,
  customerId: true,
} as const;

/** Exact current Engagement Property Watches chip fields. */
export const V2_PROPERTY_WATCH_LIST_SELECT = {
  id: true,
  mlsNumber: true,
} as const;

if (V2_PROPERTY_WATCHES_TAKE !== 20) {
  throw new Error(
    "Property Watches take drifted from the current Engagement take 20",
  );
}

export async function loadLeadProfileV2PropertyWatches(
  ctx: AgentOrgContext,
  leadId: string,
): Promise<LeadProfileV2PropertyWatchesPanel | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: V2_PROPERTY_WATCHES_ACCESS_SELECT,
  });
  if (!lead || !v2CanAccessLead(ctx, lead)) return null;

  if (!lead.customerId) {
    return { propertyMonitors: [] };
  }

  const propertyMonitors = await prisma.propertyMonitor.findMany({
    where: { userId: lead.customerId },
    orderBy: { createdAt: "desc" },
    take: V2_PROPERTY_WATCHES_TAKE,
    select: V2_PROPERTY_WATCH_LIST_SELECT,
  });

  return { propertyMonitors };
}
