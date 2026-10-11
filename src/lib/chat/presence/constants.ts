/**
 * Agent presence TTL (Chat V1).
 * Online requires AVAILABLE preference + unexpired presenceUntil.
 * JWT/session existence never implies Online.
 */

/** Presence expires ~90s after the last accepted heartbeat. */
export const PRESENCE_TTL_MS = 90_000;

/**
 * Skip DB refresh when remaining TTL is above this threshold.
 * Keeps heartbeats from writing on every poll tick.
 */
export const PRESENCE_REFRESH_REMAINING_MS = 45_000;

/** Soft burst control per agent (in-process; not cross-isolate). */
export const PRESENCE_RATE_LIMIT = 60;
export const PRESENCE_RATE_WINDOW_MS = 60_000;
