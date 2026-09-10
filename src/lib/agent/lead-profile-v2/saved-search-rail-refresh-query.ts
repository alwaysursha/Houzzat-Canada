/**
 * Client/server-safe Matchboard / Saved Search → rail refresh helpers. No Prisma.
 *
 * Rail-visible fields (load-rail):
 * - Heart: savedListing.count
 * - Eye: listingView 24h count
 * - Search: savedSearch.count
 * - Tiles: Views / Saves / Alerts (customerAlert.count) / Emails (leadEmailLog.count)
 * - Email Opens ring: emails > 0 ? hotness : 0
 *
 * Server facts:
 * - POST /api/agent/searches without searchId creates a savedSearch (count +1).
 * - POST with searchId / PATCH /api/agent/searches update in place (count unchanged).
 * - emailAlerts / smsAlerts / isHomepageActive do not write customerAlert or
 *   leadEmailLog; they do not change rail counts.
 * - POST /api/agent/shortlist-email → sendAndLogClientEmail → leadEmailLog.create
 *   on success, including stubbed/skipped send.
 *
 * EngagementMatchboard.onUpdated is () => void with no created/action payload.
 * Create, update, and shortlist all share that callback. V2 therefore reloads
 * rail on every Matchboard onUpdated so create + shortlist cannot go stale.
 * SavedSearchEditor only PATCHes an existing search — no rail reload.
 */

export type V2MatchboardUiAction =
  | "view_all_matches"
  | "edit_criteria"
  | "cancel_edit"
  | "refresh_listings"
  | "save_criteria"
  | "sync_from_intent"
  | "email_shortlist";

export type V2SavedSearchEditorUiAction =
  | "toggle_email_alerts_local"
  | "toggle_sms_alerts_local"
  | "toggle_homepage_local"
  | "save_criteria";

export function v2AgentSearchPostCreatesSavedSearch(input: {
  searchId?: string | null;
}): boolean {
  return !input.searchId;
}

export function v2AgentSearchPostMayAffectRailSavedSearchCount(input: {
  searchId?: string | null;
}): boolean {
  return v2AgentSearchPostCreatesSavedSearch(input);
}

export function v2AgentSearchPatchMayAffectRailVisibleCounts(): boolean {
  return false;
}

export function v2ShortlistEmailMayAffectRailEmailCount(): boolean {
  return true;
}

export function v2MatchboardActionFiresOnUpdated(
  action: V2MatchboardUiAction,
): boolean {
  switch (action) {
    case "save_criteria":
    case "sync_from_intent":
    case "email_shortlist":
      return true;
    case "view_all_matches":
    case "edit_criteria":
    case "cancel_edit":
    case "refresh_listings":
      return false;
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

/**
 * Ideal per-action rail need. Host cannot branch on this: shared onUpdated
 * has no payload, so applyV2MatchboardUpdatedRefresh always reloads rail.
 */
export function v2MatchboardActionWouldAffectRailIfDistinguishable(
  action: V2MatchboardUiAction,
  input: { hasPrimarySearch: boolean } = { hasPrimarySearch: false },
): boolean {
  switch (action) {
    case "email_shortlist":
      return true;
    case "save_criteria":
    case "sync_from_intent":
      return !input.hasPrimarySearch;
    case "view_all_matches":
    case "edit_criteria":
    case "cancel_edit":
    case "refresh_listings":
      return false;
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export function v2MatchboardSharedOnUpdatedMayAffectRail(): boolean {
  return true;
}

export function v2SavedSearchEditorActionFiresOnUpdated(
  action: V2SavedSearchEditorUiAction,
): boolean {
  switch (action) {
    case "save_criteria":
      return true;
    case "toggle_email_alerts_local":
    case "toggle_sms_alerts_local":
    case "toggle_homepage_local":
      return false;
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export function v2SavedSearchEditorOnUpdatedMayAffectRail(): boolean {
  return false;
}

export function applyV2MatchboardUpdatedRefresh(input: {
  reloadEngagementOverview: () => void;
  reloadSavedSearches: () => void;
  reloadLookingFor: () => void;
  reloadTimeline: () => void;
  invalidateEmails: () => void;
  reloadRail: () => void;
}) {
  input.reloadEngagementOverview();
  input.reloadSavedSearches();
  input.reloadLookingFor();
  input.reloadTimeline();
  input.invalidateEmails();
  input.reloadRail();
}

export function applyV2SavedSearchEditorUpdatedRefresh(input: {
  reloadSavedSearches: () => void;
  reloadEngagementOverview: () => void;
  reloadLookingFor: () => void;
  reloadTimeline: () => void;
}) {
  input.reloadSavedSearches();
  input.reloadEngagementOverview();
  input.reloadLookingFor();
  input.reloadTimeline();
}
