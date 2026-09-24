/**
 * Homepage /api/listings/home-rails VOW sold-price access + cache headers.
 * Server remains authoritative — these helpers keep guest vs client responses
 * from sharing a single public cache entry.
 */

export type HomeRailsSoldItem = { soldPrice: number | null };

/** Guest sold prices stay null; clients keep server-provided prices. */
export function redactHomeRailsSoldForAccess<T extends HomeRailsSoldItem>(
  sold: T[],
  isClient: boolean,
): T[] {
  if (isClient) return sold;
  return sold.map((item) => ({ ...item, soldPrice: null }));
}

/**
 * Cache policy:
 * - Authorized client: private, no-store (never CDN/browser-share sold prices).
 * - Guest: short public TTL of redacted payloads only.
 * - Vary: Cookie on both so a guest URL never reuses an authenticated body
 *   (and vice versa) at shared caches that honor Vary.
 */
export function homeRailsCacheHeaders(isClient: boolean): Record<string, string> {
  if (isClient) {
    return {
      "Cache-Control": "private, no-store",
      Vary: "Cookie",
    };
  }
  return {
    "Cache-Control": "public, s-maxage=45, stale-while-revalidate=120",
    Vary: "Cookie",
  };
}

/** Browser fetch init for market rails — clients must not reuse guest HTTP cache. */
export function homeRailsClientFetchInit(isClient: boolean): RequestInit {
  return {
    credentials: "same-origin",
    cache: isClient ? "no-store" : "default",
  };
}
