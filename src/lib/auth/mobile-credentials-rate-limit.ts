/**
 * Best-effort in-memory rate limits for HouzzatPRO mobile credentials auth.
 *
 * Shared by:
 *   POST /api/mobile/v2/auth/discover
 *   POST /api/mobile/v2/auth/login
 *
 * Dual buckets (same strategy as public book-demo):
 *   - trusted client IP (cf-connecting-ip / x-forwarded-for)
 *   - normalized account email
 *
 * Not keyed solely by email. Does not encode tenant/workspace membership.
 * Not a substitute for Cloudflare WAF at the edge.
 *
 * Production note (Cloudflare Workers): each isolate keeps its own Map.
 * Limits are best-effort per isolate — same caveat as book-demo-rate-limit.
 */
import { clientIpFromPublicRequest } from "@/lib/platform/public/book-demo-rate-limit";
import { normalizeIdentityEmail } from "@/lib/auth/workspace-identity";

const IP_WINDOW_MS = 15 * 60_000;
/** ~15 discover+login pairs (normal Sign In hits both endpoints). */
const IP_MAX = 30;
const EMAIL_WINDOW_MS = 15 * 60_000;
/** ~6 discover+login pairs for one normalized email. */
const EMAIL_MAX = 12;

type RateBucket = { count: number; resetAt: number };

const rateByIp = new Map<string, RateBucket>();
const rateByEmail = new Map<string, RateBucket>();

function prune(map: Map<string, RateBucket>, now: number) {
  if (map.size < 800) return;
  for (const [key, bucket] of map) {
    if (bucket.resetAt <= now) map.delete(key);
  }
}

function touch(
  map: Map<string, RateBucket>,
  key: string,
  max: number,
  windowMs: number,
  now: number,
): { allowed: boolean; retryAfterSec: number } {
  prune(map, now);
  const bucket = map.get(key);
  if (!bucket || bucket.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }
  if (bucket.count >= max) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }
  bucket.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}

export type MobileCredentialsRateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSec: number };

/**
 * Enforce shared discover/login abuse limits.
 * Call only after payload validation — never before (avoids burning budget on junk).
 */
export function allowMobileCredentialsAuthAttempt(input: {
  request: Request;
  email: string;
}): MobileCredentialsRateLimitResult {
  const now = Date.now();
  const clientIp = clientIpFromPublicRequest(input.request) || "unknown";
  const email = normalizeIdentityEmail(input.email) || "unknown";

  const ip = touch(rateByIp, clientIp, IP_MAX, IP_WINDOW_MS, now);
  const account = touch(rateByEmail, email, EMAIL_MAX, EMAIL_WINDOW_MS, now);

  if (!ip.allowed || !account.allowed) {
    return {
      allowed: false,
      retryAfterSec: Math.max(ip.retryAfterSec, account.retryAfterSec, 1),
    };
  }
  return { allowed: true };
}

/** Generic 429 body — never reveals whether the email/account exists. */
export function mobileCredentialsRateLimitedResponse(retryAfterSec: number) {
  const headers = new Headers({
    "Retry-After": String(Math.max(1, retryAfterSec)),
  });
  return Response.json(
    {
      ok: false,
      code: "RATE_LIMITED",
      message: "Too many sign-in attempts. Please try again later.",
    },
    { status: 429, headers },
  );
}

/** Test-only */
export function clearMobileCredentialsRateLimitsForTests(): void {
  rateByIp.clear();
  rateByEmail.clear();
}

export {
  IP_MAX as MOBILE_CREDENTIALS_IP_MAX,
  EMAIL_MAX as MOBILE_CREDENTIALS_EMAIL_MAX,
  clientIpFromPublicRequest,
};
