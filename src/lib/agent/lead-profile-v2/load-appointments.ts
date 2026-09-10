/**
 * V2 Appointments loader. Auth is hostname → workspace → ACTIVE member →
 * canAccessLead. Does not load shell, timeline, tasks, or other tabs.
 */
import type { AgentOrgContext } from "@/lib/agent";
import { v2CanAccessLead } from "@/lib/agent/lead-profile-v2/access";
import { V2_APPOINTMENTS_TAKE } from "@/lib/agent/lead-profile-v2/appointments-query";
import type { LeadProfileV2AppointmentsPanel } from "@/lib/agent/lead-profile-v2/types";
import { prisma } from "@/lib/prisma";

export const V2_APPOINTMENTS_ACCESS_SELECT = {
  id: true,
  organizationId: true,
  workspaceId: true,
  assignedAgentId: true,
} as const;

export const V2_APPOINTMENT_SELECT = {
  id: true,
  type: true,
  status: true,
  startsAt: true,
  listingMls: true,
  videoJoinUrl: true,
  notes: true,
} as const;

export async function loadLeadProfileV2Appointments(
  ctx: AgentOrgContext,
  leadId: string,
): Promise<LeadProfileV2AppointmentsPanel | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: V2_APPOINTMENTS_ACCESS_SELECT,
  });
  if (!lead || !v2CanAccessLead(ctx, lead)) return null;

  const appointments = await prisma.appointment.findMany({
    where: { leadId: lead.id },
    orderBy: { createdAt: "desc" },
    take: V2_APPOINTMENTS_TAKE,
    select: V2_APPOINTMENT_SELECT,
  });

  return {
    appointments: appointments.map((appointment) => ({
      id: appointment.id,
      type: appointment.type,
      status: appointment.status,
      startsAt: appointment.startsAt?.toISOString() ?? null,
      listingMls: appointment.listingMls,
      videoJoinUrl: appointment.videoJoinUrl,
      notes: appointment.notes,
    })),
  };
}
