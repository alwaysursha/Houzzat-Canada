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
  | "shortlist"
  | "account";

export const MORE_UTILITY_META: Record<
  Exclude<MoreUtilityId, "account">,
  { title: string; webPath: string; summary: string; nextStage: string }
> = {
  statistics: {
    title: "Statistics",
    webPath: "/agent/statistics",
    summary:
      "Desk KPIs from canonical agent Statistics: leads, pipeline, sources, response time, emails, appointments, and tasks.",
    nextStage: "Statistics desk picker / SHOWING split (optional)",
  },
  inbox: {
    title: "Communications",
    webPath: "/agent/inbox",
    summary:
      "Sent email activity across your leads (LeadEmailLog). Same records as Lead Profile → Conversations. Inbound email is not canonical yet.",
    nextStage: "Inbound email / Phase 3.5",
  },
  cma: {
    title: "CMA",
    webPath: "/agent/cma",
    summary:
      "Advanced comparative market analysis: sold comps, competition, agent recommendation, and tenant-branded client link/email.",
    nextStage: "PDF download (Worker-compatible PDF engine approval)",
  },
  team: {
    title: "Team",
    webPath: "/agent/team",
    summary:
      "Workspace roster, invites, roles, and membership management (WorkspaceMember).",
    nextStage: "Native Team Desk (Stage 5.13)",
  },
  notifications: {
    title: "Notifications",
    webPath: "/agent/notifications",
    summary:
      "Staff push and email preference controls for your desk. Same User.pushNotificationPrefs as web. No biometrics.",
    nextStage: "Notification push device registration on RN (optional)",
  },
  search: {
    title: "Properties",
    webPath: "/agent/search",
    summary:
      "MLS search, multi-select shortlist, and email-to-lead from native Properties.",
    nextStage: "Stage 5.3 — Native Properties Search",
  },
  shortlist: {
    title: "Shortlist",
    webPath: "/account/saved",
    summary:
      "Your saved homes — same canonical SavedListing records as Houzzat consumer.",
    nextStage: "Stage 5.5 — Native Shortlist",
  },
};
