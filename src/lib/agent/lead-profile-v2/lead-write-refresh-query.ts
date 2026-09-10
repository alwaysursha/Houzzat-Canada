/**
 * Client/server-safe Claim / Pipeline / Reassign refresh helpers. No Prisma.
 *
 * Server facts (PATCH /api/agent/leads + POST /api/agent/team reassign):
 * - Claim (assignee actually changes) → create Call New Lead (cancels prior OPEN same title).
 * - Pipeline → ATTEMPTED_CONTACT: cancel Call New + existing 24h reminder, create 24h follow-up.
 * - Pipeline NEW_LEAD → other (not ATTEMPTED_CONTACT): cancel OPEN Call New only.
 * - Other pipeline transitions: no AgentTask writes.
 * - POST /api/agent/team reassign: notify only, no AgentTask create/cancel.
 *
 * PipelineStatusMenu onUpdated has no next-status payload. V2 therefore
 * refreshes Next Reminder / Tasks on every successful pipeline update so
 * qualifying transitions cannot go stale.
 */

export type V2LeadWriteKind = "claim" | "pipeline" | "reassign";

export function v2LeadWriteMayAffectOpenAgentTasks(
  kind: V2LeadWriteKind,
): boolean {
  switch (kind) {
    case "claim":
      return true;
    case "pipeline":
      return true;
    case "reassign":
      return false;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/** Exact PATCH /api/agent/leads task side effects for a status transition. */
export function v2PipelineTransitionAffectsOpenAgentTasks(input: {
  from: string;
  to: string;
}): boolean {
  if (input.from === input.to) return false;
  if (input.to === "ATTEMPTED_CONTACT" && input.from !== "ATTEMPTED_CONTACT") {
    return true;
  }
  if (input.from === "NEW_LEAD" && input.to !== "NEW_LEAD") return true;
  return false;
}

export function applyV2IdentityLeadWriteRefresh(input: {
  reloadShell: () => void;
  reloadTimeline: () => void;
  reloadRail: () => void;
}) {
  input.reloadShell();
  input.reloadTimeline();
  input.reloadRail();
}

export function applyV2TaskAffectingLeadWriteRefresh(input: {
  tab: string;
  reloadShell: () => void;
  reloadTimeline: () => void;
  reloadRail: () => void;
  reloadNextReminder: () => void;
  reloadTasks: () => void;
  invalidateTasks: () => void;
}) {
  applyV2IdentityLeadWriteRefresh(input);
  input.reloadNextReminder();
  if (input.tab === "reminders") input.reloadTasks();
  else input.invalidateTasks();
}
