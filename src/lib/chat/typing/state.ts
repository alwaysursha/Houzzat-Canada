/**
 * Pure typing-indicator helpers. No Prisma / no I/O.
 */

import {
  TYPING_REFRESH_REMAINING_MS,
  TYPING_TTL_MS,
} from "@/lib/chat/typing/constants";

export function isTypingActive(
  until: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (until == null) return false;
  const ms = until instanceof Date ? until.getTime() : Date.parse(String(until));
  if (!Number.isFinite(ms)) return false;
  return ms > now.getTime();
}

export function nextTypingUntil(now: Date = new Date()): Date {
  return new Date(now.getTime() + TYPING_TTL_MS);
}

/** True when an active heartbeat should skip writing (still fresh enough). */
export function shouldSkipActiveTypingRefresh(
  currentUntil: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (currentUntil == null) return false;
  const ms =
    currentUntil instanceof Date
      ? currentUntil.getTime()
      : Date.parse(String(currentUntil));
  if (!Number.isFinite(ms)) return false;
  return ms > now.getTime() + TYPING_REFRESH_REMAINING_MS;
}

/**
 * Idle/clear may only null out expiries that are not newer than a full TTL
 * ahead of `now` (guards against stale clears racing a newer heartbeat).
 */
export function maxClearableTypingUntil(now: Date = new Date()): Date {
  return new Date(now.getTime() + TYPING_TTL_MS);
}

export function parseTypingActiveBody(
  raw: unknown,
): { ok: true; active: boolean } | { ok: false } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false };
  }
  const keys = Object.keys(raw as object);
  if (keys.length !== 1 || keys[0] !== "active") return { ok: false };
  const active = (raw as { active?: unknown }).active;
  if (typeof active !== "boolean") return { ok: false };
  return { ok: true, active };
}
