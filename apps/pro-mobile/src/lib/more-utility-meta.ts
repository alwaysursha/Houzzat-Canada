/**
 * Stage 5.2 — More utility metadata (no React Native imports; safe for Node tests).
 */

export type MoreUtilityId =
  | "statistics"
  | "inbox"
  | "cma"
  | "team"
  | "notifications"
  | "search"
  | "account";

export const MORE_UTILITY_META: Record<
  Exclude<MoreUtilityId, "account">,
  { title: string; webPath: string; summary: string; nextStage: string }
> = {
  statistics: {
    title: "Statistics",
    webPath: "/agent/statistics",
    summary:
      "Desk KPIs and performance charts for your book. This module needs a dedicated native stage.",
    nextStage: "Native Statistics",
  },
  inbox: {
    title: "Communications",
    webPath: "/agent/inbox",
    summary:
      "Workspace communications inbox. Lead-scoped Conversations already work inside Lead Detail.",
    nextStage: "Native Communications Inbox",
  },
  cma: {
    title: "CMA",
    webPath: "/agent/cma",
    summary:
      "Comparative market analysis tools. Substantial listing/comp workflows belong in a later stage.",
    nextStage: "Native CMA",
  },
  team: {
    title: "Team",
    webPath: "/agent/team",
    summary:
      "Team seats and brokerage roster. OWNER/ADMIN Team is partly available in Command Centre.",
    nextStage: "Native Team Desk",
  },
  notifications: {
    title: "Notifications",
    webPath: "/agent/notifications",
    summary:
      "Staff push/email preference controls. No mobile-only inbox and no biometrics in this stage.",
    nextStage: "Native Notification Preferences",
  },
  search: {
    title: "Properties",
    webPath: "/agent/search",
    summary:
      "MLS search, multi-select shortlist, and email-to-lead from native Properties.",
    nextStage: "Stage 5.3 — Native Properties Search",
  },
};
