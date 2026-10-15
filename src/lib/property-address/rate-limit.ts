/**
 * Best-effort in-memory rate limit for public address resolve.
 * Per-isolate only (same caveat as funnel / book-demo limits).
 */

import { clientIpFromPublicRequest } from "@/lib/platform/public/book-demo-rate-limit";

const IP_WINDOW_MS = 60_000;
const IP_MAX = 30;

type RateBucket = { count: number; resetAt: number };

const rateByIp = new Map<string, RateBucket>();

function prune(map: Map<string, RateBucket>, now: number) {
  if (map.size < 2000) return;
  for (const [key, bucket] of map) {
    if (bucket.resetAt <= now) map.delete(key);
  }
}

export { clientIpFromPublicRequest };

export function allowPropertyAddressResolve(clientIp: string): boolean {
  const now = Date.now();
  prune(rateByIp, now);
  const key = clientIp || "unknown";
  const bucket = rateByIp.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateByIp.set(key, { count: 1, resetAt: now + IP_WINDOW_MS });
    return true;
  }
  if (bucket.count >= IP_MAX) return false;
  bucket.count += 1;
  return true;
}

/** Test-only */
export function clearPropertyAddressResolveRateLimitsForTests(): void {
  rateByIp.clear();
}
