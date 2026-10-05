import { clientIpFromPublicRequest } from "@/lib/platform/public/book-demo-rate-limit";

const IP_WINDOW_MS = 15 * 60_000;
const IP_MAX = 30;
const TOKEN_WINDOW_MS = 60 * 60_000;
const TOKEN_MAX = 20;

type RateBucket = { count: number; resetAt: number };

const rateByIp = new Map<string, RateBucket>();
const rateByToken = new Map<string, RateBucket>();

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

export function allowPreferenceTokenMutation(input: {
  clientIp: string;
  tokenHashPrefix: string;
}): boolean {
  const now = Date.now();
  return (
    allow(rateByIp, input.clientIp || "unknown", IP_MAX, IP_WINDOW_MS, now) &&
    allow(
      rateByToken,
      input.tokenHashPrefix || "unknown",
      TOKEN_MAX,
      TOKEN_WINDOW_MS,
      now,
    )
  );
}

export { clientIpFromPublicRequest };

export function clearPreferenceTokenRateLimitsForTests(): void {
  rateByIp.clear();
  rateByToken.clear();
}
