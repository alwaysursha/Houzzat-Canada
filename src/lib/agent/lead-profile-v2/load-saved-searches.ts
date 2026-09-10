/**
 * V2 Saved Searches list loader. Auth is hostname → workspace → ACTIVE
 * member → canAccessLead. Does not load overview stats, Matchboard seed,
 * buyer-intent history, saved homes, watches, monitors, tours, notes, alerts,
 * emails, timeline, or tasks.
 */
import type { AgentOrgContext } from "@/lib/agent";
import { v2CanAccessLead } from "@/lib/agent/lead-profile-v2/access";
import { V2_SAVED_SEARCHES_TAKE } from "@/lib/agent/lead-profile-v2/saved-searches-query";
import type { LeadProfileV2SavedSearchesPanel } from "@/lib/agent/lead-profile-v2/types";
import { prisma } from "@/lib/prisma";

export const V2_SAVED_SEARCHES_ACCESS_SELECT = {
  id: true,
  organizationId: true,
  workspaceId: true,
  assignedAgentId: true,
  customerId: true,
} as const;

export const V2_SAVED_SEARCH_LIST_SELECT = {
  id: true,
  name: true,
  emailAlerts: true,
  smsAlerts: true,
  isHomepageActive: true,
  query: true,
} as const;

export async function loadLeadProfileV2SavedSearches(
  ctx: AgentOrgContext,
  leadId: string,
): Promise<LeadProfileV2SavedSearchesPanel | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: V2_SAVED_SEARCHES_ACCESS_SELECT,
  });
  if (!lead || !v2CanAccessLead(ctx, lead)) return null;

  if (!lead.customerId) {
    return { savedSearches: [] };
  }

  const savedSearches = await prisma.savedSearch.findMany({
    where: { userId: lead.customerId },
    orderBy: [
      { isHomepageActive: "desc" },
      { isPrimary: "desc" },
      { updatedAt: "desc" },
    ],
    take: V2_SAVED_SEARCHES_TAKE,
    select: V2_SAVED_SEARCH_LIST_SELECT,
  });

  return { savedSearches };
}
