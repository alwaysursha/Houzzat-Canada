/**
 * Stage 4.5.1 — HTTP-safe Mobile v2 lead write helpers.
 *
 * PrismaNeonHttp (Workers) rejects internal transactions used by:
 * - nested relation writes (e.g. lead.update({ activities: { create } }))
 * - some batch shapes (updateMany / createMany) on older compiler paths
 *
 * These helpers preserve Stage 4.5 / web CRM semantics using flat sequential
 * Prisma calls only. Do not use for web /agent routes unless intentionally
 * migrated — web behavior stays on the existing helpers.
 */

import {
  ATTEMPTED_CONTACT_REMINDER_MS,
  ATTEMPTED_CONTACT_REMINDER_TITLE,
  CALL_NEW_LEAD_TASK_TITLE,
} from "@/lib/agent/lead-intake";
import { resolveChildCrmOwnership } from "@/lib/crm-ownership";
import { prisma } from "@/lib/prisma";

/**
 * Response SLA clock — same rules as markLeadFirstResponse, but a single
 * flat update (no updateMany).
 */
export async function markLeadFirstResponseHttpSafe(
  leadId: string,
  opts: { status: string; firstRespondedAt: Date | null },
): Promise<void> {
  if (opts.firstRespondedAt) return;
  if (opts.status !== "ATTEMPTED_CONTACT") return;

  await prisma.lead.update({
    where: { id: leadId },
    data: { firstRespondedAt: new Date() },
  });
}

/** Cancel OPEN agent tasks with a given title via per-row updates. */
export async function cancelOpenAgentTasksByTitleHttpSafe(
  leadId: string,
  title: string,
): Promise<number> {
  const openTasks = await prisma.agentTask.findMany({
    where: {
      leadId,
      status: "OPEN",
      title,
    },
    select: { id: true },
  });

  for (const task of openTasks) {
    await prisma.agentTask.update({
      where: { id: task.id },
      data: { status: "CANCELLED" },
    });
  }

  return openTasks.length;
}

/**
 * Attempted Contact side effects — same as onLeadAttemptedContact:
 * cancel Call New + existing reminders, create 24h follow-up task.
 * Flat sequential writes only.
 */
export async function onLeadAttemptedContactHttpSafe(input: {
  leadId: string;
  assigneeId: string;
  organizationId: string;
  createdById?: string | null;
}) {
  await cancelOpenAgentTasksByTitleHttpSafe(
    input.leadId,
    CALL_NEW_LEAD_TASK_TITLE,
  );
  await cancelOpenAgentTasksByTitleHttpSafe(
    input.leadId,
    ATTEMPTED_CONTACT_REMINDER_TITLE,
  );

  const ownership = await resolveChildCrmOwnership({
    organizationId: input.organizationId,
    leadId: input.leadId,
  });

  return prisma.agentTask.create({
    data: {
      organizationId: ownership.organizationId,
      workspaceId: ownership.workspaceId,
      leadId: input.leadId,
      assigneeId: input.assigneeId,
      createdById: input.createdById ?? null,
      type: "CALL",
      status: "OPEN",
      title: ATTEMPTED_CONTACT_REMINDER_TITLE,
      body: "Lead marked Attempted Contact. Follow up within 24 hours.",
      dueAt: new Date(Date.now() + ATTEMPTED_CONTACT_REMINDER_MS),
    },
  });
}
