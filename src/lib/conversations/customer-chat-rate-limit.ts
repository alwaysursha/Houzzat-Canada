/**
 * Best-effort in-memory rate limit for Customer Chat send.
 *
 * Key: authenticated customerUserId + trusted hostname workspaceId.
 * Never keyed by email.
 *
 * Cloudflare Workers: each isolate has its own Map (same caveat as Book a Demo).
 * This is an application-layer brake, not a global fleet counter.
 */
export const CUSTOMER_CHAT_SEND_LIMIT = 20;
export const CUSTOMER_CHAT_SEND_WINDOW_MS = 10 * 60_000;

type RateBucket = { count: number; resetAt: number };

const rateByCustomerWorkspace = new Map<string, RateBucket>();

function prune(map: Map<string, RateBucket>, now: number) {
  if (map.size < 800) return;
  for (const [key, bucket] of map) {
    if (bucket.resetAt <= now) map.delete(key);
  }
}

function rateKey(customerUserId: string, workspaceId: string): string {
  return `${customerUserId.trim()}:${workspaceId.trim()}`;
}

export type CustomerChatSendRateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSec: number };

export function allowCustomerChatSend(input: {
  customerUserId: string;
  workspaceId: string;
  now?: number;
}): CustomerChatSendRateLimitResult {
  const customerUserId = input.customerUserId.trim();
  const workspaceId = input.workspaceId.trim();
  if (!customerUserId || !workspaceId) {
    return { allowed: false, retryAfterSec: 1 };
  }

  const now = input.now ?? Date.now();
  prune(rateByCustomerWorkspace, now);
  const key = rateKey(customerUserId, workspaceId);
  const bucket = rateByCustomerWorkspace.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateByCustomerWorkspace.set(key, {
      count: 1,
      resetAt: now + CUSTOMER_CHAT_SEND_WINDOW_MS,
    });
    return { allowed: true };
  }
  if (bucket.count >= CUSTOMER_CHAT_SEND_LIMIT) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }
  bucket.count += 1;
  return { allowed: true };
}

/** Test-only */
export function clearCustomerChatSendRateLimitsForTests(): void {
  rateByCustomerWorkspace.clear();
}
