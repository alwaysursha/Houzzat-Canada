/**
 * Best-effort in-memory rate limits for public funnel ingest.
 * Per-isolate only (same caveat as book-demo-rate-limit).
 */

import { clientIpFromPublicRequest } from "@/lib/platform/public/book-demo-rate-limit";

const IP_WINDOW_MS = 60_000;
const IP_MAX = 120;
const VISITOR_WINDOW_MS = 60_000;
const VISITOR_MAX = 60;

type RateBucket = { count: number; resetAt: number };

const rateByIp = new Map<string, RateBucket>();
const rateByVisitor = new Map<string, RateBucket>();

function prune(map: Map<string, RateBucket>, now: number) {
  if (map.size < 2000) return;
  for (const [key, bucket] of map) {
    if (bucket.resetAt <= now) map.delete(key);
  }
}

function allow(
  map: Map<string, RateBucket>,
  key: string,
  max: number,
  windowMs: number,
  now: number,
): boolean {
  prune(map, now);
  const bucket = map.get(key);
  if (!bucket || bucket.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= max) return false;
  bucket.count += 1;
  return true;
}

export { clientIpFromPublicRequest };

export function allowFunnelIngest(input: {
  clientIp: string;
  visitorKey: string;
}): boolean {
  const now = Date.now();
  const ipOk = allow(
    rateByIp,
    input.clientIp || "unknown",
    IP_MAX,
    IP_WINDOW_MS,
    now,
  );
  const visitorOk = allow(
    rateByVisitor,
    input.visitorKey || "unknown",
    VISITOR_MAX,
    VISITOR_WINDOW_MS,
    now,
  );
  return ipOk && visitorOk;
}

/** Test-only */
export function clearFunnelRateLimitsForTests(): void {
  rateByIp.clear();
  rateByVisitor.clear();
}
