"use client";

/**
 * Shared in-memory cache for the signed-in user's area monitors.
 * Avoids a GET on every WatchAreaButton mount without a heavy global provider.
 */

export type AreaMonitorCacheRow = {
  id: string;
  city: string;
  community: string | null;
  transactionType: string;
  segment: string | null;
};

type CacheState = {
  userKey: string;
  items: AreaMonitorCacheRow[];
  loadedAt: number;
};

let cache: CacheState | null = null;
let inflight: Promise<AreaMonitorCacheRow[]> | null = null;

const listeners = new Set<() => void>();

export function subscribeAreaMonitorsCache(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  for (const listener of listeners) listener();
}

export function invalidateAreaMonitorsCache() {
  cache = null;
  inflight = null;
  emit();
}

export function peekAreaMonitorsCache(
  userKey: string,
): AreaMonitorCacheRow[] | null {
  if (!cache || cache.userKey !== userKey) return null;
  return cache.items;
}

export function patchAreaMonitorsCache(
  userKey: string,
  updater: (items: AreaMonitorCacheRow[]) => AreaMonitorCacheRow[],
) {
  const current = peekAreaMonitorsCache(userKey) ?? [];
  cache = {
    userKey,
    items: updater(current),
    loadedAt: Date.now(),
  };
  emit();
}

export async function loadAreaMonitorsCache(
  userKey: string,
): Promise<AreaMonitorCacheRow[]> {
  const existing = peekAreaMonitorsCache(userKey);
  if (existing) return existing;

  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch("/api/account/area-monitors", {
        credentials: "same-origin",
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { items?: AreaMonitorCacheRow[] };
      const items = data.items ?? [];
      cache = { userKey, items, loadedAt: Date.now() };
      emit();
      return items;
    } catch {
      return [];
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}
