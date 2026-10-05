import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Preference-link TTL: 90 days.
 *
 * Links in older legitimate alerts should still work, but this is a bearer
 * credential that can change communication preferences. 90 days is long enough
 * for weekly/monthly listing mail sitting in an inbox, and short enough that
 * forgotten emails do not remain an unbounded preference-edit capability.
 * Tokens are not immortal: expiration + email-change revocation + cleanup.
 */
export const PREFERENCE_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export function createPreferenceRawToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashPreferenceToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function preferenceTokenHashesEqual(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, "hex");
    const bufB = Buffer.from(b, "hex");
    if (bufA.length !== bufB.length || bufA.length === 0) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}
