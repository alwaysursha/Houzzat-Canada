/**
 * Client-safe agent presence helpers (no Prisma).
 * Heartbeats must follow genuine interaction — never poll/fetch alone.
 */

/** How often to refresh active:true while the agent is interacting. */
export const PRESENCE_CLIENT_HEARTBEAT_MS = 40_000;

/** Stop heartbeats / clear presence after this much idle time. */
export const PRESENCE_CLIENT_IDLE_MS = 60_000;

/** Collapse bursty interaction events into one activity mark. */
export const PRESENCE_ACTIVITY_THROTTLE_MS = 1_000;

export const AGENT_PRESENCE_ROUTE = "/api/agent/presence";

export type AgentAvailabilityPreference = "AVAILABLE" | "AWAY";

export type PresencePostBody =
  | { active: boolean }
  | { preference: AgentAvailabilityPreference }
  | { active: boolean; preference: AgentAvailabilityPreference };

export type PresencePostResult =
  | {
      ok: true;
      availability: "online" | "away" | "offline";
      updated: boolean;
      skipped: boolean;
      retryAfterSec?: undefined;
    }
  | { ok: false; status: number; retryAfterSec?: number };

export function preferenceFromAvailability(
  availability: "online" | "away" | "offline",
): AgentAvailabilityPreference {
  return availability === "away" ? "AWAY" : "AVAILABLE";
}

export function shouldSendPresenceHeartbeat(input: {
  now: number;
  lastSentAt: number | null;
  heartbeatMs?: number;
}): boolean {
  if (input.lastSentAt == null) return true;
  const heartbeatMs = input.heartbeatMs ?? PRESENCE_CLIENT_HEARTBEAT_MS;
  return input.now - input.lastSentAt >= heartbeatMs;
}

export async function postAgentPresence(
  body: PresencePostBody,
  init?: { keepalive?: boolean; signal?: AbortSignal },
): Promise<PresencePostResult> {
  try {
    const res = await fetch(AGENT_PRESENCE_ROUTE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: Boolean(init?.keepalive),
      signal: init?.signal,
    });
    if (res.status === 429) {
      const retryRaw = res.headers.get("Retry-After");
      const retryAfterSec = Math.max(1, Number(retryRaw) || 1);
      return { ok: false, status: 429, retryAfterSec };
    }
    if (!res.ok) {
      return { ok: false, status: res.status };
    }
    const json = (await res.json()) as {
      ok?: unknown;
      availability?: unknown;
      updated?: unknown;
      skipped?: unknown;
    };
    if (
      json.ok !== true ||
      (json.availability !== "online" &&
        json.availability !== "away" &&
        json.availability !== "offline")
    ) {
      return { ok: false, status: res.status };
    }
    return {
      ok: true,
      availability: json.availability,
      updated: Boolean(json.updated),
      skipped: Boolean(json.skipped),
    };
  } catch {
    return { ok: false, status: 0 };
  }
}
