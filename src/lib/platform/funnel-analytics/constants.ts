/**
 * Phase 2D — Master Admin conversion funnel reporting.
 *
 * Aggregates FunnelEvent only. Never returns customer PII or raw activity rows.
 */

import { SIGNUP_ANALYTICS_TIME_ZONE } from "@/lib/platform/signup-analytics/constants";
import { FUNNEL_ENGAGEMENT_TYPES } from "@/lib/funnel/phase2c";

export const FUNNEL_ANALYTICS_TIME_ZONE = SIGNUP_ANALYTICS_TIME_ZONE;
export const FUNNEL_ANALYTICS_TIME_ZONE_LABEL = "Eastern Time (ET)";

export const FUNNEL_ANALYTICS_ENGAGEMENT_TYPES = FUNNEL_ENGAGEMENT_TYPES;

export type FunnelAnalyticsStageId =
  | "visitor_session_started"
  | "search_results_viewed"
  | "property_card_clicked"
  | "listing_detail_opened"
  | "registration_gate_shown"
  | "registration_started"
  | "registration_completed"
  | "post_registration_continued"
  | "registration_engaged";

/**
 * Stages that are schema-ready but not yet emitted by product instrumentation.
 * Shown as unavailable — never as a zero denominator.
 */
export const FUNNEL_ANALYTICS_UNINSTRUMENTED_STAGES = [
  "visitor_session_started",
] as const satisfies readonly FunnelAnalyticsStageId[];

export const FUNNEL_ANALYTICS_STAGE_ORDER: readonly FunnelAnalyticsStageId[] = [
  "visitor_session_started",
  "search_results_viewed",
  "property_card_clicked",
  "listing_detail_opened",
  "registration_gate_shown",
  "registration_started",
  "registration_completed",
  "post_registration_continued",
  "registration_engaged",
];

export const FUNNEL_ANALYTICS_STAGE_LABELS: Record<
  FunnelAnalyticsStageId,
  string
> = {
  visitor_session_started: "Visitor sessions started",
  search_results_viewed: "Search results viewed",
  property_card_clicked: "Property cards clicked",
  listing_detail_opened: "Listing details opened",
  registration_gate_shown: "Registration gate shown",
  registration_started: "Registration started",
  registration_completed: "Registration completed",
  post_registration_continued: "Post-registration continued",
  registration_engaged: "Registration engaged",
};

/**
 * Primary distinct unit per stage for the funnel visualization.
 * Stages are not assumed strictly sequential.
 */
export const FUNNEL_ANALYTICS_STAGE_PRIMARY_UNIT: Record<
  FunnelAnalyticsStageId,
  "sessions" | "visitors" | "users"
> = {
  visitor_session_started: "sessions",
  search_results_viewed: "sessions",
  property_card_clicked: "visitors",
  listing_detail_opened: "visitors",
  registration_gate_shown: "visitors",
  registration_started: "sessions",
  registration_completed: "users",
  post_registration_continued: "users",
  registration_engaged: "users",
};

export const FUNNEL_ANALYTICS_CLASSIFICATION_NOTES = [
  "Funnel counts come from FunnelEvent aggregates only — never Lead/CRM row dumps.",
  "Event-period stages: counts of events whose occurredAt falls in the selected range (not a sequential journey).",
  "Registration-cohort KPIs/conversions: users who registered in the selected range and later continued (45m) or engaged (7d).",
  "Same-period linked conversions: search→listing and gate→registration require both events in the selected range (cross-midnight may be excluded).",
  "visitor_session_started is schema-ready but not instrumented — shown as unavailable.",
  "Anonymous top-of-funnel events have no UTM columns; acquisition applies to registered converters only.",
  "Gate→completed requires visitorKey on registration_completed; missing keys yield insufficient_data, not a fake 0%.",
  "Engaged users count DISTINCT userId once even when multiple engagement types exist.",
  "FUNNEL_EVENTS_ENABLED defaults off; empty funnel data is expected until tracking is enabled.",
  "Calendar buckets use America/Toronto, matching Phase 1 signup analytics.",
] as const;

export const FUNNEL_ANALYTICS_INDEX_NOTES = [
  'FunnelEvent(workspaceId, eventName, occurredAt)',
  'FunnelEvent(workspaceId, visitorKey, occurredAt)',
  'FunnelEvent(workspaceId, sessionKey, occurredAt)',
  'FunnelEvent(workspaceId, userId, occurredAt)',
] as const;
