/**
 * V2 Saved Homes list loader. Auth is hostname → workspace → ACTIVE
 * member → canAccessLead. Does not load overview stats, Matchboard seed,
 * buyer-intent history, saved searches, watches, monitors, tours, notes,
 * alerts, emails, timeline, or tasks. Does not hydrate Listing rows.
 */
import type { AgentOrgContext } from "@/lib/agent";
import { v2CanAccessLead } from "@/lib/agent/lead-profile-v2/access";
import { V2_SAVED_HOMES_TAKE } from "@/lib/agent/lead-profile-v2/saved-homes-query";
import type { LeadProfileV2SavedHomesPanel } from "@/lib/agent/lead-profile-v2/types";
import { prisma } from "@/lib/prisma";

export const V2_SAVED_HOMES_ACCESS_SELECT = {
  id: true,
  organizationId: true,
  workspaceId: true,
  assignedAgentId: true,
  customerId: true,
} as const;

/** Exact current Engagement Saved Homes chip fields. */
export const V2_SAVED_HOME_LIST_SELECT = {
  id: true,
  mlsNumber: true,
} as const;

if (V2_SAVED_HOMES_TAKE !== 20) {
  throw new Error(
    "Saved Homes take drifted from the current Engagement take 20",
  );
}

export async function loadLeadProfileV2SavedHomes(
  ctx: AgentOrgContext,
  leadId: string,
): Promise<LeadProfileV2SavedHomesPanel | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: V2_SAVED_HOMES_ACCESS_SELECT,
  });
  if (!lead || !v2CanAccessLead(ctx, lead)) return null;

  if (!lead.customerId) {
    return { savedListings: [] };
  }

  const savedListings = await prisma.savedListing.findMany({
    where: { userId: lead.customerId },
    orderBy: { createdAt: "desc" },
    take: V2_SAVED_HOMES_TAKE,
    select: V2_SAVED_HOME_LIST_SELECT,
  });

  return { savedListings };
}
