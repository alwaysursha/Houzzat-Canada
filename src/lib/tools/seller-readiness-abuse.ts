/**
 * Server-side abuse controls for Seller Readiness public intake.
 * Rate limits are best-effort in-memory (same model as Book a Demo).
 */

import { clientIpFromPublicRequest } from "@/lib/platform/public/book-demo-rate-limit";
import { normalizeProspectEmail } from "@/lib/platform/prospects/normalize-email";

export const SELLER_READINESS_HONEYPOT_FIELD = "companyUrl";

export const SELLER_READINESS_GENERIC_ERROR =
  "Unable to save your request. Please check your details and try again.";

export const SELLER_READINESS_RATE_LIMIT_ERROR =
  "Too many requests. Please try again later.";

const IP_WINDOW_MS = 15 * 60_000;
const IP_MAX = 5;
const EMAIL_WINDOW_MS = 60 * 60_000;
const EMAIL_MAX = 3;

type RateBucket = { count: number; resetAt: number };

const rateByIp = new Map<string, RateBucket>();
const rateByEmail = new Map<string, RateBucket>();

/** Common throwaway / bot inbox domains — not an exhaustive blocklist. */
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "sharklasers.com",
  "grr.la",
  "yopmail.com",
  "trashmail.com",
  "tempmail.com",
  "temp-mail.org",
  "10minutemail.com",
  "discard.email",
  "getnada.com",
  "maildrop.cc",
]);

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

export { clientIpFromPublicRequest };

export function allowSellerReadinessRequest(input: {
  clientIp: string;
  email: string;
}): boolean {
  const now = Date.now();
  const ipOk = allow(
    rateByIp,
    input.clientIp || "unknown",
    IP_MAX,
    IP_WINDOW_MS,
    now,
  );
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
export function clearSellerReadinessRateLimitsForTests(): void {
  rateByIp.clear();
  rateByEmail.clear();
}

export function isHoneypotTripped(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return value.trim().length > 0;
}

export function isDisposableEmailDomain(email: string): boolean {
  const normalized = normalizeProspectEmail(email);
  const at = normalized.lastIndexOf("@");
  if (at < 0) return true;
  const domain = normalized.slice(at + 1);
  if (!domain || !domain.includes(".")) return true;
  return DISPOSABLE_EMAIL_DOMAINS.has(domain);
}

/**
 * Reasonable public-form validation. Does not require phone.
 * Avoids ASCII-only name rules so international customers pass.
 */
export function validateSellerReadinessFields(input: {
  address: string;
  name: string;
  email: string;
  score: number;
}): { ok: true } | { ok: false; reason: string } {
  const address = input.address.trim();
  const name = input.name.trim();
  const email = normalizeProspectEmail(input.email);

  if (address.length < 5 || address.length > 200) {
    return { ok: false, reason: "address" };
  }
  if (name.length < 2 || name.length > 80) {
    return { ok: false, reason: "name" };
  }
  // At least one unicode letter (blocks pure digit / symbol spam names).
  if (!/\p{L}/u.test(name)) {
    return { ok: false, reason: "name" };
  }
  if (name.includes("@") || /https?:\/\//i.test(name)) {
    return { ok: false, reason: "name" };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return { ok: false, reason: "email" };
  }
  if (isDisposableEmailDomain(email)) {
    return { ok: false, reason: "email" };
  }
  if (
    typeof input.score !== "number" ||
    !Number.isFinite(input.score) ||
    input.score < 0 ||
    input.score > 100
  ) {
    return { ok: false, reason: "score" };
  }
  return { ok: true };
}
