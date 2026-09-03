/**
 * Stage 6.3 — platform read-service boundary.
 *
 * Platform read modules may query control-plane models and aggregate seat
 * consumption via WorkspaceMember / WorkspaceInvite counts only.
 *
 * MUST NOT import or query tenant CRM loaders/models for row-level reads:
 * Lead, LeadNote, LeadEmailLog, Customer, visitor sessions, conversations, etc.
 */

export const PLATFORM_READ_BOUNDARY = {
  version: "6.3",
  allowedAggregateSeatSources: ["WorkspaceMember", "WorkspaceInvite"] as const,
  forbiddenTenantCrmModels: [
    "Lead",
    "LeadNote",
    "LeadEmailLog",
    "AgentTask",
    "ViewingTour",
    "CmaReport",
  ] as const,
} as const;
