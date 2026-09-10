/**
 * V2 Task & Reminders loader. Auth is hostname → workspace → ACTIVE member →
 * canAccessLead. Does not load shell, timeline, hotness, or other tabs.
 */
import type { AgentOrgContext } from "@/lib/agent";
import { v2CanAccessLead } from "@/lib/agent/lead-profile-v2/access";
import { V2_TASKS_TAKE } from "@/lib/agent/lead-profile-v2/tasks-query";
import type { LeadProfileV2TasksPanel } from "@/lib/agent/lead-profile-v2/types";
import { prisma } from "@/lib/prisma";

export const V2_TASKS_ACCESS_SELECT = {
  id: true,
  organizationId: true,
  workspaceId: true,
  assignedAgentId: true,
} as const;

export const V2_TASKS_SELECT = {
  id: true,
  type: true,
  status: true,
  title: true,
  dueAt: true,
} as const;

export const V2_FOLLOW_UP_NOTE_SELECT = {
  id: true,
  body: true,
  category: true,
  pinned: true,
  createdAt: true,
  author: { select: { name: true, email: true } },
} as const;

export async function loadLeadProfileV2Tasks(
  ctx: AgentOrgContext,
  leadId: string,
): Promise<LeadProfileV2TasksPanel | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: V2_TASKS_ACCESS_SELECT,
  });
  if (!lead || !v2CanAccessLead(ctx, lead)) return null;

  const [tasks, notes] = await Promise.all([
    prisma.agentTask.findMany({
      where: { leadId: lead.id },
      orderBy: [{ status: "asc" }, { dueAt: "asc" }],
      take: V2_TASKS_TAKE,
      select: V2_TASKS_SELECT,
    }),
    prisma.leadNote.findMany({
      where: { leadId: lead.id },
      orderBy: [
        { pinned: "desc" },
        { pinnedAt: "desc" },
        { createdAt: "desc" },
      ],
      take: V2_TASKS_TAKE,
      select: V2_FOLLOW_UP_NOTE_SELECT,
    }),
  ]);

  return {
    tasks: tasks.map((task) => ({
      id: task.id,
      type: task.type,
      status: task.status,
      title: task.title,
      dueAt: task.dueAt.toISOString(),
    })),
    notes: notes.map((note) => ({
      id: note.id,
      body: note.body,
      category: note.category,
      pinned: note.pinned,
      createdAt: note.createdAt.toISOString(),
      author: note.author,
    })),
  };
}
