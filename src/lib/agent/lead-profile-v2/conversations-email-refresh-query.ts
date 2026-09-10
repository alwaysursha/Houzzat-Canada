/**
 * Client/server-safe Conversations email-send → Engagement Overview refresh.
 * No Prisma.
 *
 * Legacy: LeadEmailForm onUpdated → CustomerProfile reload() → summary
 * snapshot. Engagement "Emails sent" is data.stats.emails from
 * leadEmailLog.count on that snapshot — not the lazy engagement panel payload.
 * Snapshot reload also nulls engagementPanel (and other lazy tabs).
 *
 * V2: overview stats.emails is the same leadEmailLog.count. POST /api/agent/email
 * calls sendAndLogClientEmail before counting a send. Email send does not write
 * saved searches, saved homes, watches, monitors, tours, listing notes, or
 * customerAlert rows.
 *
 * Conversations send happens on the conversations tab, so the overview is
 * typically not enabled. Invalidate (no GET) unless the engagement tab is
 * currently mounted.
 */

export function v2ConversationsEmailSendWritesLeadEmailLog(): boolean {
  return true;
}

export function v2ConversationsEmailSendMayAffectEngagementOverviewEmails(): boolean {
  return true;
}

export function v2ConversationsEmailSendMayAffectEngagementSubsection(
  resource:
    | "saved-searches"
    | "saved-homes"
    | "property-watches"
    | "area-monitors"
    | "route-planner"
    | "listing-notes"
    | "alerts",
): boolean {
  switch (resource) {
    case "saved-searches":
    case "saved-homes":
    case "property-watches":
    case "area-monitors":
    case "route-planner":
    case "listing-notes":
    case "alerts":
      return false;
    default: {
      const _exhaustive: never = resource;
      return _exhaustive;
    }
  }
}

export function v2ConversationsEmailSentRefreshPlan(tab: string): {
  reloadEmails: true;
  reloadTimeline: true;
  reloadRail: true;
  reloadEngagementOverview: boolean;
  invalidateEngagementOverview: boolean;
  reloadSavedSearches: false;
  reloadSavedHomes: false;
  reloadPropertyWatches: false;
  reloadAreaMonitors: false;
  reloadRoutePlanner: false;
  reloadListingNotes: false;
  reloadAlerts: false;
  reloadShell: false;
} {
  const onEngagement = tab === "engagement";
  return {
    reloadEmails: true,
    reloadTimeline: true,
    reloadRail: true,
    reloadEngagementOverview: onEngagement,
    invalidateEngagementOverview: !onEngagement,
    reloadSavedSearches: false,
    reloadSavedHomes: false,
    reloadPropertyWatches: false,
    reloadAreaMonitors: false,
    reloadRoutePlanner: false,
    reloadListingNotes: false,
    reloadAlerts: false,
    reloadShell: false,
  };
}

export function applyV2ConversationsEmailSentRefresh(input: {
  tab: string;
  reloadEmails: () => void;
  reloadTimeline: () => void;
  reloadRail: () => void;
  reloadEngagementOverview: () => void;
  invalidateEngagementOverview: () => void;
}) {
  const plan = v2ConversationsEmailSentRefreshPlan(input.tab);
  input.reloadEmails();
  input.reloadTimeline();
  input.reloadRail();
  if (plan.reloadEngagementOverview) input.reloadEngagementOverview();
  else input.invalidateEngagementOverview();
}
