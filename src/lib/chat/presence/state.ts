/**
 * Pure agent availability helpers. No Prisma / no I/O.
 *
 * Customer-facing precedence (highest wins):
 * 1. preference AWAY → away (manual Away wins even with fresh presenceUntil)
 * 2. fresh presenceUntil → online (implies AVAILABLE; see #1)
 * 3. else → offline (null/expired presence, or missing profile)
 *
 * Idle / unattended tab: clients must send active:true only on genuine
 * user activity. Stopping heartbeats → offline after TTL (not Online).
 * Optional client idle may POST preference AWAY for an explicit Away badge.
 * Never infer Online from JWT/session existence.
 */

import {
  PRESENCE_REFRESH_REMAINING_MS,
  PRESENCE_TTL_MS,
} from "@/lib/chat/presence/constants";

export type AgentAvailabilityPreference = "AVAILABLE" | "AWAY";

export type CustomerAgentAvailability = "online" | "away" | "offline";

export type AgentPresenceRow = {
  availabilityPreference: AgentAvailabilityPreference;
  presenceUntil: Date | null;
};

export function isPresenceFresh(
  until: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (until == null) return false;
  const ms = until instanceof Date ? until.getTime() : Date.parse(String(until));
  if (!Number.isFinite(ms)) return false;
  return ms > now.getTime();
}

export function nextPresenceUntil(now: Date = new Date()): Date {
  return new Date(now.getTime() + PRESENCE_TTL_MS);
}

/** True when an active heartbeat should skip writing (still fresh enough). */
export function shouldSkipActivePresenceRefresh(
  currentUntil: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (currentUntil == null) return false;
  const ms =
    currentUntil instanceof Date
      ? currentUntil.getTime()
      : Date.parse(String(currentUntil));
  if (!Number.isFinite(ms)) return false;
  return ms > now.getTime() + PRESENCE_REFRESH_REMAINING_MS;
}

/**
 * Idle/clear may only null out expiries that are not newer than a full TTL
 * ahead of `now` (guards against stale clears racing a newer heartbeat).
 */
export function maxClearablePresenceUntil(now: Date = new Date()): Date {
  return new Date(now.getTime() + PRESENCE_TTL_MS);
}

/**
 * Resolve coarse customer-facing availability.
 * Never returns timestamps or preference strings to callers of the API layer.
 */
export function resolveAgentAvailability(
  row: AgentPresenceRow | null | undefined,
  now: Date = new Date(),
): CustomerAgentAvailability {
  if (!row) return "offline";
  switch (row.availabilityPreference) {
    case "AWAY":
      return "away";
    case "AVAILABLE":
      return isPresenceFresh(row.presenceUntil, now) ? "online" : "offline";
    default: {
      const _exhaustive: never = row.availabilityPreference;
      void _exhaustive;
      return "offline";
    }
  }
}

/**
 * Customer transcript helper: unassigned / ineligible → never Online.
 */
export function resolveAssignedAgentAvailability(input: {
  assignedAgentId: string | null | undefined;
  assignedAgentEligible: boolean;
  presence: AgentPresenceRow | null | undefined;
  now?: Date;
}): CustomerAgentAvailability {
  if (!input.assignedAgentId?.trim() || !input.assignedAgentEligible) {
    return "offline";
  }
  return resolveAgentAvailability(input.presence, input.now ?? new Date());
}

export type ParsedPresenceBody =
  | { ok: true; active: boolean; preference?: undefined }
  | {
      ok: true;
      active?: undefined;
      preference: AgentAvailabilityPreference;
    }
  | {
      ok: true;
      active: boolean;
      preference: AgentAvailabilityPreference;
    }
  | { ok: false };

/**
 * Strict body parser. Rejects userId, workspaceId, timestamps, and extras.
 * Allowed shapes:
 * - { active: boolean }
 * - { preference: "AVAILABLE" | "AWAY" }
 * - { active: boolean, preference: "AVAILABLE" | "AWAY" }
 */
export function parseAgentPresenceBody(raw: unknown): ParsedPresenceBody {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false };
  }
  const obj = raw as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length === 0 || keys.length > 2) return { ok: false };

  let active: boolean | undefined;
  let preference: AgentAvailabilityPreference | undefined;

  for (const key of keys) {
    if (key === "active") {
      if (typeof obj.active !== "boolean") return { ok: false };
      active = obj.active;
      continue;
    }
    if (key === "preference") {
      if (obj.preference !== "AVAILABLE" && obj.preference !== "AWAY") {
        return { ok: false };
      }
      preference = obj.preference;
      continue;
    }
    return { ok: false };
  }

  if (active === undefined && preference === undefined) return { ok: false };
  if (active !== undefined && preference !== undefined) {
    return { ok: true, active, preference };
  }
  if (active !== undefined) return { ok: true, active };
  if (preference !== undefined) return { ok: true, preference };
  return { ok: false };
}
