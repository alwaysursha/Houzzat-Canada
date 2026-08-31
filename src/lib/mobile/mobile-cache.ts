/**
 * Lightweight, in-memory cache and fetcher for Mobile Agent CRM.
 * Provides instant 0ms cached transitions with background SWR refreshing.
 */

type CacheEntry<T> = {
  data: T;
  timestamp: number;
};

const memoryCache = new Map<string, CacheEntry<any>>();

export async function fetchWithMobileCache<T>(
  url: string,
  options?: { ttlMs?: number; forceRefresh?: boolean },
): Promise<T> {
  const ttl = options?.ttlMs ?? 60_000; // 1 min default fresh TTL
  const cached = memoryCache.get(url);

  if (!options?.forceRefresh && cached && Date.now() - cached.timestamp < ttl) {
    return cached.data as T;
  }

  const res = await fetch(url, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("UNAUTHORIZED");
    }
    throw new Error(`Failed to fetch ${url}: ${res.status}`);
  }

  const json = (await res.json()) as T;
  memoryCache.set(url, { data: json, timestamp: Date.now() });
  return json;
}

export function getCachedMobileData<T>(url: string): T | null {
  const cached = memoryCache.get(url);
  return cached ? (cached.data as T) : null;
}

export function invalidateMobileCache(urlPrefix?: string): void {
  if (!urlPrefix) {
    memoryCache.clear();
    return;
  }
  for (const key of memoryCache.keys()) {
    if (key.startsWith(urlPrefix)) {
      memoryCache.delete(key);
    }
  }
}
