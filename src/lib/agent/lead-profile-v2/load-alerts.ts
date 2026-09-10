/**
 * V2 Alerts inbox loader. Auth is hostname → workspace → ACTIVE
 * member → canAccessLead. Does not load overview stats, Matchboard seed,
 * buyer-intent history, saved searches, saved homes, watches, area monitors,
 * tours, listing notes, emails, timeline, or tasks. Does not hydrate listing
 * rows or unused alert text fields.
 */
import type { AgentOrgContext } from "@/lib/agent";
import { v2CanAccessLead } from "@/lib/agent/lead-profile-v2/access";
import { V2_ALERTS_TAKE } from "@/lib/agent/lead-profile-v2/alerts-query";
import type { LeadProfileV2AlertsPanel } from "@/lib/agent/lead-profile-v2/types";
import { prisma } from "@/lib/prisma";

export const V2_ALERTS_ACCESS_SELECT = {
  id: true,
  organizationId: true,
  workspaceId: true,
  assignedAgentId: true,
  customerId: true,
} as const;

/** Exact current Engagement Alerts inbox fields. */
export const V2_ALERT_LIST_SELECT = {
  id: true,
  title: true,
  kind: true,
} as const;

if (V2_ALERTS_TAKE !== 15) {
  throw new Error(
    "Alerts inbox take drifted from the current Engagement take 15",
  );
}

export async function loadLeadProfileV2Alerts(
  ctx: AgentOrgContext,
  leadId: string,
): Promise<LeadProfileV2AlertsPanel | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: V2_ALERTS_ACCESS_SELECT,
  });
  if (!lead || !v2CanAccessLead(ctx, lead)) return null;

  if (!lead.customerId) {
    return { alerts: [] };
  }

  const alerts = await prisma.customerAlert.findMany({
    where: { userId: lead.customerId },
    orderBy: { createdAt: "desc" },
    take: V2_ALERTS_TAKE,
    select: V2_ALERT_LIST_SELECT,
  });

  return { alerts };
}
