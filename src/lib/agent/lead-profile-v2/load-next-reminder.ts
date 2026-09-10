/**
 * V2 first-paint Next Reminder loader. Auth is hostname → workspace → ACTIVE
 * member → canAccessLead. Matches current snapshot: one OPEN AgentTask via
 * findFirst (dueAt asc). Does not load the tasks tab, notes, appointments,
 * timeline, or task body.
 */
import type { AgentOrgContext } from "@/lib/agent";
import { v2CanAccessLead } from "@/lib/agent/lead-profile-v2/access";
import { toV2NextReminderPanel } from "@/lib/agent/lead-profile-v2/next-reminder-query";
import type { LeadProfileV2NextReminderPanel } from "@/lib/agent/lead-profile-v2/types";
import { prisma } from "@/lib/prisma";

export const V2_NEXT_REMINDER_ACCESS_SELECT = {
  id: true,
  organizationId: true,
  workspaceId: true,
  assignedAgentId: true,
} as const;

export const V2_NEXT_REMINDER_SELECT = {
  title: true,
  dueAt: true,
} as const;

export async function loadLeadProfileV2NextReminder(
  ctx: AgentOrgContext,
  leadId: string,
): Promise<LeadProfileV2NextReminderPanel | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: V2_NEXT_REMINDER_ACCESS_SELECT,
  });
  if (!lead || !v2CanAccessLead(ctx, lead)) return null;

  const nextTask = await prisma.agentTask.findFirst({
    where: { leadId: lead.id, status: "OPEN" },
    orderBy: { dueAt: "asc" },
    select: V2_NEXT_REMINDER_SELECT,
  });

  return toV2NextReminderPanel(
    nextTask
      ? { title: nextTask.title, dueAt: nextTask.dueAt.toISOString() }
      : null,
  );
}
