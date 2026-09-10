/**
 * V2 Activity loader. Auth is hostname → workspace → ACTIVE member → canAccessLead.
 * Reuses the current bounded paged timeline primitive (4 days / 40 rows, explicit
 * selects). Does not load shell, snapshot, hotness, or other tabs.
 */
import type { TimelineScope } from "@/lib/agent/activity-filters";
import type { AgentOrgContext } from "@/lib/agent";
import {
  FIRST_PAINT_TIMELINE_DAYS,
  TIMELINE_PAGE_SIZE,
  loadPagedLeadTimeline,
} from "@/lib/agent/lead-profile-timeline";
import { v2CanAccessLead } from "@/lib/agent/lead-profile-v2/access";
import {
  V2_TIMELINE_PAGE_SIZE,
  V2_TIMELINE_RECENT_DAYS,
} from "@/lib/agent/lead-profile-v2/timeline-query";
import type { LeadProfileV2TimelinePage } from "@/lib/agent/lead-profile-v2/types";
import { prisma } from "@/lib/prisma";

export const V2_TIMELINE_ACCESS_SELECT = {
  id: true,
  customerId: true,
  organizationId: true,
  workspaceId: true,
  assignedAgentId: true,
} as const;

if (V2_TIMELINE_RECENT_DAYS !== FIRST_PAINT_TIMELINE_DAYS) {
  throw new Error(
    "V2 timeline recent window drifted from the current Activity contract",
  );
}
if (V2_TIMELINE_PAGE_SIZE !== TIMELINE_PAGE_SIZE) {
  throw new Error(
    "V2 timeline page size drifted from the current Activity contract",
  );
}

export async function loadLeadProfileV2Timeline(
  ctx: AgentOrgContext,
  leadId: string,
  input: {
    scope: TimelineScope;
    before: Date | null;
    filterIds: string[] | null;
  },
): Promise<LeadProfileV2TimelinePage | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: V2_TIMELINE_ACCESS_SELECT,
  });
  if (!lead || !v2CanAccessLead(ctx, lead)) return null;

  return loadPagedLeadTimeline({
    leadId: lead.id,
    customerId: lead.customerId,
    scope: input.scope,
    take: V2_TIMELINE_PAGE_SIZE,
    before: input.before,
    filterIds: input.filterIds,
  });
}
