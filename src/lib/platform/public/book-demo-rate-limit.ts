/**
 * Best-effort in-memory rate limits for public Book a Demo.
 * Not a substitute for Cloudflare WAF / Turnstile at launch.
 *
 * Production note (Cloudflare Workers): each isolate keeps its own Map.
 * Limits are therefore best-effort per isolate and do NOT provide a global
 * shared counter across the fleet. Turnstile is the primary human-verification
 * control; do not introduce KV/Durable Objects without owner approval.
 */

const IP_WINDOW_MS = 15 * 60_000;
const IP_MAX = 8;
const EMAIL_WINDOW_MS = 60 * 60_000;
const EMAIL_MAX = 4;

type RateBucket = { count: number; resetAt: number };

const rateByIp = new Map<string, RateBucket>();
const rateByEmail = new Map<string, RateBucket>();

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

export function clientIpFromPublicRequest(request: Request): string {
  const cf = request.headers.get("cf-connecting-ip");
  if (cf?.trim()) return cf.trim().slice(0, 64);
  const xff = request.headers.get("x-forwarded-for");
  if (xff?.trim()) return xff.split(",")[0]!.trim().slice(0, 64);
  return "unknown";
}

export function allowBookDemoRequest(input: {
  clientIp: string;
  email: string;
}): boolean {
  const now = Date.now();
  const ipOk = allow(rateByIp, input.clientIp || "unknown", IP_MAX, IP_WINDOW_MS, now);
  const emailOk = allow(
    rateByEmail,
    input.email || "unknown",
    EMAIL_MAX,
    EMAIL_WINDOW_MS,
    now,
  );
  return ipOk && emailOk;
}

/** Test-only */
export function clearBookDemoRateLimitsForTests(): void {
  rateByIp.clear();
  rateByEmail.clear();
}
