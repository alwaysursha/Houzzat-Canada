import { ONLINE_MS } from "@/lib/agent/hotness";
import { isConsumerRole } from "@/lib/roles";

export type LeadOnlineSource = "sign-in" | "beacon";

/** Same window as presence / returned-online. */
export const LEAD_ONLINE_SIGNIN_DEDUP_MS = ONLINE_MS;

const recentSignInNotifyAt = new Map<string, number>();

/** Best-effort same-isolate stamp so the follow-up beacon cannot race the SIGN_IN row. */
export function markLeadOnlineSignIn(userId: string, at = Date.now()): void {
  recentSignInNotifyAt.set(userId, at);
}

export function hasRecentLeadOnlineSignIn(
  userId: string,
  now = Date.now(),
): boolean {
  const at = recentSignInNotifyAt.get(userId);
  if (at == null) return false;
  if (now - at >= LEAD_ONLINE_SIGNIN_DEDUP_MS) {
    recentSignInNotifyAt.delete(userId);
    return false;
  }
  return true;
}

export function resetLeadOnlineSignInMemoryForTests(): void {
  recentSignInNotifyAt.clear();
}

export function isLeadOnlineConsumerRole(
  role: string | null | undefined,
): boolean {
  return isConsumerRole(role);
}

/**
 * Whether this invocation should look up assigned agents and send lead_online.
 * Sign-in always emits for consumer roles (assignment checked later).
 * Beacon still requires the 3-minute inactivity window, then skips if sign-in
 * already notified in that window.
 */
export function shouldEmitLeadOnline(input: {
  source: LeadOnlineSource;
  role?: string | null;
  previousLastSeenAt: Date | null;
  recentSignInAt: Date | null;
  now?: Date;
}): boolean {
  if (input.source === "sign-in") {
    if (input.role !== undefined) {
      return isLeadOnlineConsumerRole(input.role);
    }
    return true;
  }

  const now = (input.now ?? new Date()).getTime();
  const wasOffline =
    !input.previousLastSeenAt ||
    now - input.previousLastSeenAt.getTime() >= ONLINE_MS;
  if (!wasOffline) return false;

  if (
    input.recentSignInAt &&
    now - input.recentSignInAt.getTime() < LEAD_ONLINE_SIGNIN_DEDUP_MS
  ) {
    return false;
  }

  return true;
}

/** Assigned-agent fan-out only — never the customer, never duplicates. */
export function uniqueAssignedAgentIds(
  leads: Array<{ assignedAgentId: string | null }>,
  customerUserId: string,
): string[] {
  const seen = new Set<string>();
  for (const lead of leads) {
    const agentId = lead.assignedAgentId;
    if (!agentId || agentId === customerUserId || seen.has(agentId)) continue;
    seen.add(agentId);
  }
  return [...seen];
}
