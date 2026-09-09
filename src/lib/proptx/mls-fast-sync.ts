export const MLS_FAST_SYNC_MODE = "fast" as const;
export const MLS_FULL_SYNC_MODE = "full" as const;

export type MlsSyncMode = typeof MLS_FAST_SYNC_MODE | typeof MLS_FULL_SYNC_MODE;

/** Just-listed: 1-day window, newest OriginalEntryTimestamp, 5–8 pages. */
export const MLS_FAST_JUST_LISTED_DAYS = 1;
export const MLS_FAST_JUST_LISTED_PAGES = 8;

/** Recent mods: 1-day ModificationTimestamp floor, newest-first, 8–12 pages. */
export const MLS_FAST_RECENT_DAYS = 1;
export const MLS_FAST_RECENT_PAGES = 12;

export const MLS_FAST_SYNC_LOCK_NAME = "houzzat-mls-fast-sync.lock";
export const MLS_SLOW_SYNC_LOCK_NAME = "houzzat-mls-sync.lock";

export function isMlsFastSyncMode(
  mode: MlsSyncMode | string | undefined,
): mode is typeof MLS_FAST_SYNC_MODE {
  return mode === MLS_FAST_SYNC_MODE;
}

export function resolveMlsSyncMode(input: {
  argv?: readonly string[];
  env?: NodeJS.ProcessEnv;
}): MlsSyncMode {
  const argv = input.argv ?? [];
  if (
    argv.includes("--fast") ||
    input.env?.["MLS_SYNC_MODE"] === MLS_FAST_SYNC_MODE
  ) {
    return MLS_FAST_SYNC_MODE;
  }
  return MLS_FULL_SYNC_MODE;
}

/**
 * Fast mode must never read or write MlsSyncCursor watermarks.
 * Slow sync is the only Property/Media cursor owner.
 */
export function assertMlsSyncCursorAccess(
  mode: MlsSyncMode,
  resource: string,
  operation: "get" | "set",
): void {
  switch (mode) {
    case MLS_FAST_SYNC_MODE:
      throw new Error(
        `MLS fast sync must not ${operation} MlsSyncCursor resource=${resource}`,
      );
    case MLS_FULL_SYNC_MODE:
      return;
    default: {
      const _exhaustive: never = mode;
      throw new Error(`Unhandled MLS sync mode: ${String(_exhaustive)}`);
    }
  }
}
