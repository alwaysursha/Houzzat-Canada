/**
 * V2 Area Monitors list loader. Auth is hostname → workspace → ACTIVE
 * member → canAccessLead. Does not load overview stats, Matchboard seed,
 * buyer-intent history, saved searches, saved homes, property watches, tours,
 * notes, alerts, emails, timeline, or tasks. Does not join place/geo tables.
 */
import type { AgentOrgContext } from "@/lib/agent";
import { v2CanAccessLead } from "@/lib/agent/lead-profile-v2/access";
import { V2_AREA_MONITORS_TAKE } from "@/lib/agent/lead-profile-v2/area-monitors-query";
import type { LeadProfileV2AreaMonitorsPanel } from "@/lib/agent/lead-profile-v2/types";
import { prisma } from "@/lib/prisma";

export const V2_AREA_MONITORS_ACCESS_SELECT = {
  id: true,
  organizationId: true,
  workspaceId: true,
  assignedAgentId: true,
  customerId: true,
} as const;

/** Exact current Engagement Area Monitors label fields. */
export const V2_AREA_MONITOR_LIST_SELECT = {
  id: true,
  name: true,
  city: true,
} as const;

if (V2_AREA_MONITORS_TAKE !== 10) {
  throw new Error(
    "Area Monitors take drifted from the current Engagement take 10",
  );
}

export async function loadLeadProfileV2AreaMonitors(
  ctx: AgentOrgContext,
  leadId: string,
): Promise<LeadProfileV2AreaMonitorsPanel | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: V2_AREA_MONITORS_ACCESS_SELECT,
  });
  if (!lead || !v2CanAccessLead(ctx, lead)) return null;

  if (!lead.customerId) {
    return { areaMonitors: [] };
  }

  const areaMonitors = await prisma.areaMonitor.findMany({
    where: { userId: lead.customerId },
    orderBy: { createdAt: "desc" },
    take: V2_AREA_MONITORS_TAKE,
    select: V2_AREA_MONITOR_LIST_SELECT,
  });

  return { areaMonitors };
}
