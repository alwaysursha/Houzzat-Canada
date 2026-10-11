/** Ephemeral chat typing indicators (Conversation.*TypingUntil). */

export const TYPING_TTL_MS = 5_000;

/**
 * Skip DB refresh when remaining TTL is above this threshold.
 * Keeps heartbeats from writing every poll tick.
 */
export const TYPING_REFRESH_REMAINING_MS = 2_000;

export const TYPING_RATE_LIMIT = 60;
export const TYPING_RATE_WINDOW_MS = 60_000;
