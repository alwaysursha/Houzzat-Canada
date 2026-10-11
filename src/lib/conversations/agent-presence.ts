/**
 * Authenticated agent presence heartbeat / preference (own AgentProfile only).
 */

import type { AgentOrgContext } from "@/lib/agent";
import { allowAgentPresenceUpdate } from "@/lib/chat/presence/rate-limit";
import {
  parseAgentPresenceBody,
  resolveAgentAvailability,
  type CustomerAgentAvailability,
} from "@/lib/chat/presence/state";
import {
  applyAgentPresenceHeartbeat,
  clearAgentPresenceHeartbeat,
  loadAgentPresenceState,
  setAgentAvailabilityPreference,
  type AgentPresenceDb,
} from "@/lib/chat/presence/update";

export type AgentPresenceUpdateResult =
  | {
      ok: true;
      data: {
        ok: true;
        availability: CustomerAgentAvailability;
        updated: boolean;
        skipped: boolean;
      };
    }
  | { ok: false; status: number; body: unknown };

export async function handleAgentPresenceUpdate(
  db: AgentPresenceDb,
  ctx: AgentOrgContext,
  request: Request,
): Promise<AgentPresenceUpdateResult> {
  let raw: unknown = null;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, status: 400, body: { error: "Invalid payload" } };
  }
  const parsed = parseAgentPresenceBody(raw);
  if (!parsed.ok) {
    return { ok: false, status: 400, body: { error: "Invalid payload" } };
  }

  const rate = allowAgentPresenceUpdate({ userId: ctx.user.id });
  if (!rate.allowed) {
    return {
      ok: false,
      status: 429,
      body: {
        error: "Too many presence updates.",
        code: "RATE_LIMITED",
        retryAfterSec: rate.retryAfterSec,
      },
    };
  }

  const userId = ctx.user.id;
  let updated = false;
  let skipped = false;

  if (parsed.preference !== undefined) {
    const pref = await setAgentAvailabilityPreference(db, {
      userId,
      preference: parsed.preference,
    });
    updated = updated || pref.updated;
  }

  if (parsed.active === true) {
    // After AWAY preference in the same request, heartbeat is a no-op by design.
    const beat = await applyAgentPresenceHeartbeat(db, { userId });
    updated = updated || beat.updated;
    skipped = skipped || beat.skipped;
  } else if (parsed.active === false) {
    const clear = await clearAgentPresenceHeartbeat(db, { userId });
    updated = updated || clear.updated;
    skipped = skipped || clear.skipped;
  }

  const presence = await loadAgentPresenceState(db, userId);
  const availability = resolveAgentAvailability(presence);

  return {
    ok: true,
    data: {
      ok: true,
      availability,
      updated,
      skipped,
    },
  };
}
