/**
 * Phase 1 — Master Admin tenant signup analytics.
 *
 * Timezone: all calendar buckets (today / day trend / custom ranges) use
 * America/Toronto (HouzzatPRO default). Instant comparisons use UTC Date
 * bounds derived from that zone.
 */

import { HOUZZATPRO_DEFAULT_TIME_ZONE } from "@/lib/platform/datetime";

export const SIGNUP_ANALYTICS_TIME_ZONE = HOUZZATPRO_DEFAULT_TIME_ZONE;
export const SIGNUP_ANALYTICS_TIME_ZONE_LABEL = "Eastern Time (ET)";

/** Consumer User.role values created by website sign-up. */
export const SIGNUP_ANALYTICS_CONSUMER_ROLES = ["BUYER", "SELLER"] as const;

export type SignupAcquisitionChannel =
  | "google_ads"
  | "organic"
  | "direct"
  | "referral"
  | "social"
  | "unknown";

export const SIGNUP_ACQUISITION_CHANNELS = [
  "google_ads",
  "organic",
  "direct",
  "referral",
  "social",
  "unknown",
] as const satisfies readonly SignupAcquisitionChannel[];

/**
 * Recommended indexes before high-volume production use (not applied here):
 * - User(workspaceId, createdAt)
 * - User(role, createdAt) where role in (BUYER, SELLER)
 * - Lead(workspaceId, customerId) already unique/indexed
 */
export const SIGNUP_ANALYTICS_INDEX_RECOMMENDATIONS = [
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS "User_workspaceId_createdAt_idx" ON "User" ("workspaceId", "createdAt")',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS "User_role_createdAt_idx" ON "User" ("role", "createdAt")',
] as const;

export const SIGNUP_ANALYTICS_CLASSIFICATION_NOTES = [
  "Authoritative count: User rows with non-null workspaceId and role BUYER|SELLER.",
  "Excluded: PlatformOperator users and WorkspaceMember (staff seat) users.",
  "Sign-up always creates role=BUYER; SELLER flag may also be set via intent.",
  "Lead rows are never counted as signups; Lead is left-joined only for aggregate attribution.",
  "Test accounts are not excluded (no reliable first-class flag).",
  "Missing attribution surfaces as unknown — never invented.",
  "Phone OTP verified uses phoneOtpVerifiedAt only; phoneVerifiedAt is agent-confirmed CRM status, not OTP.",
  "Today / Last 7 Days / Last 30 Days KPIs are always current-period and independent of the selected range.",
] as const;
