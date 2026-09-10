/**
 * V2 Listing Notes list loader. Auth is hostname → workspace → ACTIVE
 * member → canAccessLead. Does not load overview stats, Matchboard seed,
 * buyer-intent history, saved searches, saved homes, watches, area monitors,
 * tours, alerts, emails, timeline, or tasks. Does not hydrate listing rows.
 */
import type { AgentOrgContext } from "@/lib/agent";
import { v2CanAccessLead } from "@/lib/agent/lead-profile-v2/access";
import { V2_LISTING_NOTES_TAKE } from "@/lib/agent/lead-profile-v2/listing-notes-query";
import type { LeadProfileV2ListingNotesPanel } from "@/lib/agent/lead-profile-v2/types";
import { prisma } from "@/lib/prisma";

export const V2_LISTING_NOTES_ACCESS_SELECT = {
  id: true,
  organizationId: true,
  workspaceId: true,
  assignedAgentId: true,
  customerId: true,
} as const;

/** Exact current Engagement Listing Notes fields. */
export const V2_LISTING_NOTE_LIST_SELECT = {
  id: true,
  mlsNumber: true,
  body: true,
} as const;

if (V2_LISTING_NOTES_TAKE !== 15) {
  throw new Error(
    "Listing Notes take drifted from the current Engagement take 15",
  );
}

export async function loadLeadProfileV2ListingNotes(
  ctx: AgentOrgContext,
  leadId: string,
): Promise<LeadProfileV2ListingNotesPanel | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: V2_LISTING_NOTES_ACCESS_SELECT,
  });
  if (!lead || !v2CanAccessLead(ctx, lead)) return null;

  if (!lead.customerId) {
    return { listingNotes: [] };
  }

  const listingNotes = await prisma.listingNote.findMany({
    where: { userId: lead.customerId },
    orderBy: { updatedAt: "desc" },
    take: V2_LISTING_NOTES_TAKE,
    select: V2_LISTING_NOTE_LIST_SELECT,
  });

  return { listingNotes };
}
