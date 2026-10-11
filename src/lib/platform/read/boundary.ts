/**
 * Stage 6.3 — platform read-service boundary.
 *
 * Platform read modules may query control-plane models and aggregate seat
 * consumption via WorkspaceMember / WorkspaceInvite counts only.
 *
 * MUST NOT import or query tenant CRM loaders/models for row-level reads:
 * Lead, LeadNote, LeadEmailLog, Customer, visitor sessions, conversations, etc.
 *
 * Phase 1 exception: `src/lib/platform/signup-analytics` may LEFT JOIN Lead
 * for aggregate-only attribution counts (UTM / click-ID buckets). It must never
 * return Lead rows, PII, or CRM loaders.
 *
 * Phase 2D exception: `src/lib/platform/funnel-analytics` may aggregate
 * FunnelEvent and LEFT JOIN Lead for converter acquisition channel buckets only.
 * It must never return FunnelEvent/Lead/User row payloads or PII.
 */

export const PLATFORM_READ_BOUNDARY = {
  version: "6.3.1",
  allowedAggregateSeatSources: ["WorkspaceMember", "WorkspaceInvite"] as const,
  allowedAggregateSignupAttributionSource: "Lead" as const,
  forbiddenTenantCrmModels: [
    "Lead",
    "LeadNote",
    "LeadEmailLog",
    "AgentTask",
    "ViewingTour",
    "CmaReport",
  ] as const,
} as const;
