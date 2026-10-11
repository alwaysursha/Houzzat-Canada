/**
 * Phase 2A — tenant-scoped visitor→registration funnel analytics.
 *
 * Consent / retention (document before production enable):
 * - FunnelEvent stores opaque visitor/session keys and listing MLS only — not
 *   names, emails, or phone numbers.
 * - First-party product analytics for Master Admin conversion measurement.
 * - If a cookie/consent banner is introduced for analytics, gate the public
 *   ingest client the same way as ActivityBeacon.
 * - Recommended retention: aggregate reporting retained; consider pruning raw
 *   FunnelEvent rows older than 24 months once volume warrants it (not automated here).
 * - FUNNEL_EVENTS_ENABLED defaults off until explicitly enabled for testing.
 */

export const FUNNEL_EVENT_NAMES = [
  "visitor_session_started",
  "search_results_viewed",
  "property_card_clicked",
  "listing_detail_opened",
  "registration_gate_shown",
  "registration_started",
  "registration_completed",
  "post_registration_continued",
  "registration_engaged",
] as const;

export type FunnelEventName = (typeof FUNNEL_EVENT_NAMES)[number];

/** Client ingest must never accept these (server-authoritative only). */
export const FUNNEL_SERVER_ONLY_EVENT_NAMES = [
  "registration_completed",
] as const satisfies readonly FunnelEventName[];

export const FUNNEL_CLIENT_EVENT_NAMES = FUNNEL_EVENT_NAMES.filter(
  (name) =>
    !(FUNNEL_SERVER_ONLY_EVENT_NAMES as readonly string[]).includes(name),
) as FunnelEventName[];

/** Allowlisted meta keys only — never email/phone/name. */
export const FUNNEL_META_ALLOWED_KEYS = [
  "intentType",
  "pathClass",
  "source",
  "searchHash",
] as const;

export const FUNNEL_MAX_KEY_LEN = 120;
export const FUNNEL_MAX_MLS_LEN = 40;
export const FUNNEL_MAX_DEDUPE_LEN = 200;
export const FUNNEL_MAX_META_JSON_CHARS = 500;
export const FUNNEL_OCCURRED_AT_SKEW_MS = 24 * 60 * 60 * 1000;

/**
 * Set FUNNEL_EVENTS_ENABLED=1 (or true/on) to enable writes.
 * Default: disabled — ingest no-ops without failing the site.
 */
export function isFunnelEventsEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const flag = env.FUNNEL_EVENTS_ENABLED?.trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "on";
}
