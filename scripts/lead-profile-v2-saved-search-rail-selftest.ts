/**
 * Lead Profile V2 Matchboard / Saved Search → rail refresh selftest.
 * Run: node --import tsx scripts/lead-profile-v2-saved-search-rail-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyV2MatchboardUpdatedRefresh,
  applyV2SavedSearchEditorUpdatedRefresh,
  v2AgentSearchPatchMayAffectRailVisibleCounts,
  v2AgentSearchPostCreatesSavedSearch,
  v2AgentSearchPostMayAffectRailSavedSearchCount,
  v2MatchboardActionFiresOnUpdated,
  v2MatchboardActionWouldAffectRailIfDistinguishable,
  v2MatchboardSharedOnUpdatedMayAffectRail,
  v2SavedSearchEditorActionFiresOnUpdated,
  v2SavedSearchEditorOnUpdatedMayAffectRail,
  v2ShortlistEmailMayAffectRailEmailCount,
} from "../src/lib/agent/lead-profile-v2/saved-search-rail-refresh-query";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const LEGACY_FILES = [
  "src/components/agent/CustomerProfile.tsx",
  "src/components/agent/LeadQueryPopup.tsx",
  "src/components/agent/EngagementMatchboard.tsx",
  "src/components/agent/SavedSearchEditor.tsx",
  "src/app/api/agent/searches/route.ts",
  "src/app/api/agent/shortlist-email/route.ts",
  "src/lib/agent/send-shortlist-email.ts",
];

function testLegacyUntouchedByV2Imports() {
  for (const rel of LEGACY_FILES) {
    const src = read(rel);
    assert.equal(
      src.includes("lead-profile-v2"),
      false,
      `${rel} must not import V2`,
    );
    assert.equal(
      src.includes("leads-v2"),
      false,
      `${rel} must not reference V2 routes`,
    );
  }
}

function testServerCreateVsUpdate() {
  const searches = read("src/app/api/agent/searches/route.ts");
  assert.ok(searches.includes("created: false"));
  assert.ok(searches.includes("created: true"));
  assert.ok(searches.includes("prisma.savedSearch.create"));
  assert.ok(searches.includes("prisma.savedSearch.update"));
  assert.ok(searches.includes("if (parsed.data.searchId)"));
  assert.equal(searches.includes("customerAlert"), false);
  assert.equal(searches.includes("leadEmailLog"), false);
  assert.equal(v2AgentSearchPostCreatesSavedSearch({ searchId: null }), true);
  assert.equal(v2AgentSearchPostCreatesSavedSearch({}), true);
  assert.equal(
    v2AgentSearchPostCreatesSavedSearch({ searchId: "search-1" }),
    false,
  );
  assert.equal(
    v2AgentSearchPostMayAffectRailSavedSearchCount({ searchId: undefined }),
    true,
  );
  assert.equal(
    v2AgentSearchPostMayAffectRailSavedSearchCount({ searchId: "search-1" }),
    false,
  );
  assert.equal(v2AgentSearchPatchMayAffectRailVisibleCounts(), false);
}

function testShortlistWritesEmailLog() {
  const shortlist = read("src/lib/agent/send-shortlist-email.ts");
  assert.ok(shortlist.includes("sendAndLogClientEmail"));
  const log = read("src/lib/email/log.ts");
  assert.ok(log.includes("prisma.leadEmailLog.create"));
  const clientSend = read("src/lib/email/client-send.ts");
  assert.ok(clientSend.includes("if (!result.ok) return result"));
  assert.ok(clientSend.includes("logClientEmail"));
  assert.equal(v2ShortlistEmailMayAffectRailEmailCount(), true);
}

function testSharedOnUpdatedHasNoPayload() {
  const matchboard = read("src/components/agent/EngagementMatchboard.tsx");
  assert.ok(matchboard.includes("onUpdated?: () => void"));
  assert.equal(matchboard.includes("onUpdated?: (created"), false);
  assert.equal(matchboard.includes("onUpdated?.(json"), false);
  assert.ok(matchboard.includes("json.created"));
  const editor = read("src/components/agent/SavedSearchEditor.tsx");
  assert.ok(editor.includes("onUpdated?: () => void"));
  assert.ok(editor.includes('method: "PATCH"'));
  assert.equal(editor.includes("method: \"POST\""), false);
  assert.equal(v2MatchboardSharedOnUpdatedMayAffectRail(), true);
  assert.equal(v2SavedSearchEditorOnUpdatedMayAffectRail(), false);
}

function testActionMatrix() {
  assert.equal(v2MatchboardActionFiresOnUpdated("save_criteria"), true);
  assert.equal(v2MatchboardActionFiresOnUpdated("sync_from_intent"), true);
  assert.equal(v2MatchboardActionFiresOnUpdated("email_shortlist"), true);
  assert.equal(v2MatchboardActionFiresOnUpdated("view_all_matches"), false);
  assert.equal(v2MatchboardActionFiresOnUpdated("edit_criteria"), false);
  assert.equal(v2MatchboardActionFiresOnUpdated("cancel_edit"), false);
  assert.equal(v2MatchboardActionFiresOnUpdated("refresh_listings"), false);

  assert.equal(
    v2MatchboardActionWouldAffectRailIfDistinguishable("save_criteria", {
      hasPrimarySearch: false,
    }),
    true,
  );
  assert.equal(
    v2MatchboardActionWouldAffectRailIfDistinguishable("save_criteria", {
      hasPrimarySearch: true,
    }),
    false,
  );
  assert.equal(
    v2MatchboardActionWouldAffectRailIfDistinguishable("sync_from_intent", {
      hasPrimarySearch: true,
    }),
    false,
  );
  assert.equal(
    v2MatchboardActionWouldAffectRailIfDistinguishable("email_shortlist"),
    true,
  );
  assert.equal(
    v2MatchboardActionWouldAffectRailIfDistinguishable("view_all_matches"),
    false,
  );

  assert.equal(
    v2SavedSearchEditorActionFiresOnUpdated("save_criteria"),
    true,
  );
  assert.equal(
    v2SavedSearchEditorActionFiresOnUpdated("toggle_email_alerts_local"),
    false,
  );
  assert.equal(
    v2SavedSearchEditorActionFiresOnUpdated("toggle_sms_alerts_local"),
    false,
  );
  assert.equal(
    v2SavedSearchEditorActionFiresOnUpdated("toggle_homepage_local"),
    false,
  );
}

function testNonMutatingMatchboardPathsDoNotCallOnUpdated() {
  const src = read("src/components/agent/EngagementMatchboard.tsx");
  const startEdit =
    src.split("function startEdit()")[1]?.split("function cancelEdit()")[0] ??
    "";
  assert.equal(startEdit.includes("onUpdated"), false);
  const cancelEdit =
    src.split("function cancelEdit()")[1]?.split("async function saveEditedCriteria")[0] ??
    "";
  assert.equal(cancelEdit.includes("onUpdated"), false);
  const viewLink =
    src.split("View all matches")[0]?.slice(-800) ?? "";
  assert.ok(viewLink.includes("<Link"));
  const refreshIdx = src.indexOf(
    "editing ? criteriaToQuery(form, activeQuery)",
  );
  assert.ok(refreshIdx > 0);
  const refreshWindow = src.slice(
    Math.max(0, refreshIdx - 180),
    refreshIdx + 160,
  );
  assert.equal(refreshWindow.includes("onUpdated"), false);
}

function testHelpersRefreshShape() {
  const matchboard: string[] = [];
  applyV2MatchboardUpdatedRefresh({
    reloadEngagementOverview: () => matchboard.push("engagement"),
    reloadSavedSearches: () => matchboard.push("savedSearches"),
    reloadLookingFor: () => matchboard.push("lookingFor"),
    reloadTimeline: () => matchboard.push("timeline"),
    invalidateEmails: () => matchboard.push("invalidateEmails"),
    reloadRail: () => matchboard.push("rail"),
  });
  assert.deepEqual(matchboard, [
    "engagement",
    "savedSearches",
    "lookingFor",
    "timeline",
    "invalidateEmails",
    "rail",
  ]);

  const editor: string[] = [];
  applyV2SavedSearchEditorUpdatedRefresh({
    reloadSavedSearches: () => editor.push("savedSearches"),
    reloadEngagementOverview: () => editor.push("engagement"),
    reloadLookingFor: () => editor.push("lookingFor"),
    reloadTimeline: () => editor.push("timeline"),
  });
  assert.deepEqual(editor, [
    "savedSearches",
    "engagement",
    "lookingFor",
    "timeline",
  ]);
  assert.equal(editor.includes("rail"), false);
}

function testHostWiring() {
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  const matchboard =
    host.split("const onMatchboardUpdated")[1]?.split(
      "const onSavedSearchUpdated",
    )[0] ?? "";
  assert.ok(matchboard.includes("applyV2MatchboardUpdatedRefresh"));
  assert.ok(matchboard.includes("reloadRail"));
  assert.ok(matchboard.includes("reloadEngagementOverview"));
  assert.ok(matchboard.includes("reloadSavedSearches"));
  assert.ok(matchboard.includes("reloadLookingFor"));
  assert.ok(matchboard.includes("invalidateEmails"));
  assert.equal(matchboard.includes("reload()"), false);
  assert.equal(matchboard.includes("reloadTasks"), false);
  assert.equal(matchboard.includes("reloadAppointments"), false);

  const savedSearch =
    host.split("const onSavedSearchUpdated")[1]?.split(
      "function startEditContact",
    )[0] ?? "";
  assert.ok(savedSearch.includes("applyV2SavedSearchEditorUpdatedRefresh"));
  assert.equal(savedSearch.includes("reloadRail"), false);
  assert.equal(savedSearch.includes("reload()"), false);
  assert.equal(host.includes("/summary"), false);
}

function testNoWholeProfileReloadOnHelpers() {
  const helper = read(
    "src/lib/agent/lead-profile-v2/saved-search-rail-refresh-query.ts",
  );
  const matchFn =
    helper.split("export function applyV2MatchboardUpdatedRefresh")[1]?.split(
      "export function applyV2SavedSearchEditorUpdatedRefresh",
    )[0] ?? "";
  const editorFn =
    helper.split("export function applyV2SavedSearchEditorUpdatedRefresh")[1] ??
    "";
  assert.equal(matchFn.includes("reloadShell"), false);
  assert.equal(matchFn.includes("reloadTasks"), false);
  assert.equal(matchFn.includes("reloadAppointments"), false);
  assert.equal(editorFn.includes("reloadRail"), false);
  assert.equal(editorFn.includes("retries"), false);
  assert.equal(matchFn.includes("retries"), false);
}

function testNoRetriesOnSharedMutations() {
  const matchboard = read("src/components/agent/EngagementMatchboard.tsx");
  const editor = read("src/components/agent/SavedSearchEditor.tsx");
  const searches = read("src/app/api/agent/searches/route.ts");
  const shortlist = read("src/app/api/agent/shortlist-email/route.ts");
  for (const src of [matchboard, editor, searches, shortlist]) {
    assert.equal(src.includes("for (let attempt"), false);
    assert.equal(src.includes("retries"), false);
  }
  const railHook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2Rail.ts",
  );
  assert.equal(railHook.includes("for (let attempt"), false);
  assert.equal(railHook.includes("retries"), false);
  assert.ok(railHook.includes("session.request(V2_RAIL_RESOURCE_KEY"));
  assert.ok(railHook.includes("canApplyV2RailResponse"));
}

function testRailFailureIsolated() {
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2Rail.ts",
  );
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  assert.equal(hook.includes("setData("), false);
  const matchboard =
    host.split("const onMatchboardUpdated")[1]?.split(
      "const onSavedSearchUpdated",
    )[0] ?? "";
  assert.equal(matchboard.includes("setError"), false);
}

function main() {
  testLegacyUntouchedByV2Imports();
  testServerCreateVsUpdate();
  testShortlistWritesEmailLog();
  testSharedOnUpdatedHasNoPayload();
  testActionMatrix();
  testNonMutatingMatchboardPathsDoNotCallOnUpdated();
  testHelpersRefreshShape();
  testHostWiring();
  testNoWholeProfileReloadOnHelpers();
  testNoRetriesOnSharedMutations();
  testRailFailureIsolated();
  console.log("lead-profile-v2-saved-search-rail-selftest: ok");
}

main();
