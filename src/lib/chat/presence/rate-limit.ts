/**
 * In-process agent presence rate limit (same pattern as typing).
 * Not globally durable across Vercel isolates — burst control only.
 * Authoritative presence state lives in AgentProfile columns.
 */

import {
  PRESENCE_RATE_LIMIT,
  PRESENCE_RATE_WINDOW_MS,
} from "@/lib/chat/presence/constants";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function allowAgentPresenceUpdate(input: {
  userId: string;
  now?: number;
}): { allowed: true } | { allowed: false; retryAfterSec: number } {
  const userId = input.userId.trim();
  if (!userId) {
    return { allowed: false, retryAfterSec: 1 };
  }
  const now = input.now ?? Date.now();
  if (buckets.size > 2000) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }
  const key = `${userId}:presence`;
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + PRESENCE_RATE_WINDOW_MS });
    return { allowed: true };
  }
  if (bucket.count >= PRESENCE_RATE_LIMIT) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }
  bucket.count += 1;
  return { allowed: true };
}

export function clearAgentPresenceRateLimitsForTests(): void {
  buckets.clear();
}
