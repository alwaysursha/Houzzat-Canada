/**
 * Best-effort rate limits for public checkout payment status / continue.
 */

const IP_WINDOW_MS = 60_000;
const IP_MAX = 60;
const SESSION_WINDOW_MS = 60_000;
const SESSION_MAX = 30;

type RateBucket = { count: number; resetAt: number };

const rateByIp = new Map<string, RateBucket>();
const rateBySession = new Map<string, RateBucket>();

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

export function allowCheckoutPaymentStatusRequest(input: {
  clientIp: string;
  sessionIdPrefix: string;
}): boolean {
  const now = Date.now();
  const ipOk = allow(
    rateByIp,
    input.clientIp || "unknown",
    IP_MAX,
    IP_WINDOW_MS,
    now,
  );
  const sessionOk = allow(
    rateBySession,
    input.sessionIdPrefix || "unknown",
    SESSION_MAX,
    SESSION_WINDOW_MS,
    now,
  );
  return ipOk && sessionOk;
}

export function clearCheckoutPaymentStatusRateLimitsForTests() {
  rateByIp.clear();
  rateBySession.clear();
}
