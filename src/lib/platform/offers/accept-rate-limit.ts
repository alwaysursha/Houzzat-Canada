/**
 * Best-effort in-memory rate limits for private offer acceptance.
 * Same isolate caveat as Book a Demo — not a global fleet counter.
 */

const IP_WINDOW_MS = 15 * 60_000;
const IP_MAX = 20;
const TOKEN_WINDOW_MS = 60 * 60_000;
const TOKEN_MAX = 12;

type RateBucket = { count: number; resetAt: number };

const rateByIp = new Map<string, RateBucket>();
const rateByTokenHash = new Map<string, RateBucket>();

function prune(map: Map<string, RateBucket>, now: number) {
  if (map.size < 800) return;
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

export function allowOfferAcceptRequest(input: {
  clientIp: string;
  tokenHashPrefix: string;
}): boolean {
  const now = Date.now();
  const ipOk = allow(
    rateByIp,
    input.clientIp || "unknown",
    IP_MAX,
    IP_WINDOW_MS,
    now,
  );
  const tokenOk = allow(
    rateByTokenHash,
    input.tokenHashPrefix || "unknown",
    TOKEN_MAX,
    TOKEN_WINDOW_MS,
    now,
  );
  return ipOk && tokenOk;
}

/** Test-only */
export function clearOfferAcceptRateLimitsForTests(): void {
  rateByIp.clear();
  rateByTokenHash.clear();
}
