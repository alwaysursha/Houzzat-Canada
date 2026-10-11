/** Durable-enough in-process voice upload rate limit (same pattern as reactions). */

const LIMIT = 20;
const WINDOW_MS = 60_000;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function allowVoiceNoteUpload(input: {
  userId: string;
  workspaceId: string;
  now?: number;
}): { allowed: true } | { allowed: false; retryAfterSec: number } {
  const userId = input.userId.trim();
  const workspaceId = input.workspaceId.trim();
  if (!userId || !workspaceId) {
    return { allowed: false, retryAfterSec: 1 };
  }
  const now = input.now ?? Date.now();
  if (buckets.size > 2000) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }
  const key = `${userId}:${workspaceId}:voice`;
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }
  if (bucket.count >= LIMIT) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }
  bucket.count += 1;
  return { allowed: true };
}

export function clearVoiceNoteUploadRateLimitsForTests(): void {
  buckets.clear();
}
