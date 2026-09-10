/** Client/server-safe Next Reminder helpers. No Prisma. */

import type { LeadProfileV2NextReminder } from "@/lib/agent/lead-profile-v2/types";

export const V2_NEXT_REMINDER_RESOURCE_KEY = "next-reminder";

export type V2NextReminderStamp = {
  leadId: string;
  epoch: number;
};

export function canApplyV2NextReminderResponse(input: {
  stamp: V2NextReminderStamp;
  current: V2NextReminderStamp;
}): boolean {
  return (
    input.stamp.leadId === input.current.leadId &&
    input.stamp.epoch === input.current.epoch
  );
}

/**
 * Exact current snapshot rule: earliest OPEN AgentTask by dueAt.
 * DONE and CANCELLED are excluded. Appointments and notes are not sources.
 */
export function selectV2NextOpenReminder(
  tasks: Array<{ status: string; dueAt: string; title: string }>,
): LeadProfileV2NextReminder | null {
  const next = tasks
    .filter((task) => task.status === "OPEN")
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
  return next ? { title: next.title, dueAt: next.dueAt } : null;
}

export function toV2NextReminderPanel(
  nextReminder: LeadProfileV2NextReminder | null,
): { nextReminder: LeadProfileV2NextReminder | null } {
  return { nextReminder };
}
