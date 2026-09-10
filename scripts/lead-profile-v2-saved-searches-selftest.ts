/**
 * Lead Profile V2 Saved Searches selftest.
 * Run: node --import tsx scripts/lead-profile-v2-saved-searches-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canAccessLead } from "../src/lib/crm-read-scope";
import { v2CanAccessLead } from "../src/lib/agent/lead-profile-v2/access";
import {
  createLeadProfileV2Session,
  isV2AbortError,
} from "../src/lib/agent/lead-profile-v2/request-gate";
import {
  V2_SAVED_SEARCHES_ACCESS_SELECT,
  V2_SAVED_SEARCH_LIST_SELECT,
} from "../src/lib/agent/lead-profile-v2/load-saved-searches";
import {
  V2_SAVED_SEARCHES_RESOURCE_KEY,
  V2_SAVED_SEARCHES_TAKE,
  canApplyV2SavedSearchesResponse,
} from "../src/lib/agent/lead-profile-v2/saved-searches-query";
import { V2_ENGAGEMENT_MATCHBOARD_CANDIDATE_TAKE } from "../src/lib/agent/lead-profile-v2/engagement-overview-query";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const LEGACY_FILES = [
  "src/components/agent/CustomerProfile.tsx",
  "src/components/agent/LeadQueryPopup.tsx",
  "src/components/agent/SavedSearchEditor.tsx",
  "src/app/api/agent/leads/[id]/engagement/route.ts",
  "src/app/api/agent/searches/route.ts",
  "src/lib/agent/lead-profile-panels.ts",
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

function testOverviewLoadsOnlyOneMatchboardSeed() {
  assert.equal(V2_ENGAGEMENT_MATCHBOARD_CANDIDATE_TAKE, 10);
  const overview = read(
    "src/lib/agent/lead-profile-v2/load-engagement-overview.ts",
  );
  assert.ok(overview.includes("selectV2MatchboardSearchSeed"));
  assert.ok(overview.includes("toV2BuyerIntentSavedSearchInput(candidates)"));
  assert.ok(overview.includes("take: V2_ENGAGEMENT_MATCHBOARD_CANDIDATE_TAKE"));
  assert.ok(overview.includes("matchboardSearch"));
  assert.equal(V2_SAVED_SEARCHES_TAKE, 10);
  const list = read("src/lib/agent/lead-profile-v2/load-saved-searches.ts");
  assert.ok(list.includes("take: V2_SAVED_SEARCHES_TAKE"));
  const types = read("src/lib/agent/lead-profile-v2/types.ts");
  const overviewType =
    types.split("export type LeadProfileV2EngagementOverview")[1]?.split(
      "export type LeadProfileV2SavedSearch",
    )[0] ?? "";
  assert.equal(overviewType.includes("savedSearches"), false);
}

function testForeignWorkspaceSavedSearchesUnavailable() {
  const prevRead = process.env.WORKSPACE_READ_SCOPE;
  const prevDomain = process.env.TENANT_DOMAIN_SCOPE;
  try {
    process.env.WORKSPACE_READ_SCOPE = "workspace";
    process.env.TENANT_DOMAIN_SCOPE = "workspace";
    const ctx = {
      user: { id: "agent-a" },
      organizationId: "org-a",
      organizationIds: ["org-a"],
      canSeeTeamLeads: true,
      isPlatformAdmin: false,
      workspaceId: "ws-a",
      isWorkspaceMember: true,
      isWorkspaceCrmAllowed: true,
      hasAmbiguousWorkspaceMembership: false,
    };
    const foreign = {
      organizationId: "org-b",
      workspaceId: "ws-b",
      assignedAgentId: "agent-a",
    };
    assert.equal(canAccessLead(ctx, foreign), false);
    assert.equal(v2CanAccessLead(ctx, foreign), false);
    const loader = read("src/lib/agent/lead-profile-v2/load-saved-searches.ts");
    const accessCheck = "if (!lead || !v2CanAccessLead(ctx, lead)) return null";
    assert.ok(loader.includes(accessCheck));
    assert.ok(
      loader.indexOf(accessCheck) < loader.indexOf("prisma.savedSearch.findMany"),
    );
    const route = read(
      "src/app/api/agent/leads-v2/[id]/saved-searches/route.ts",
    );
    assert.ok(route.includes("handleAgentLeadGet"));
    assert.equal(route.includes("/summary"), false);
    assert.equal(route.includes("searchParams.get(\"workspace"), false);
  } finally {
    if (prevRead === undefined) delete process.env.WORKSPACE_READ_SCOPE;
    else process.env.WORKSPACE_READ_SCOPE = prevRead;
    if (prevDomain === undefined) delete process.env.TENANT_DOMAIN_SCOPE;
    else process.env.TENANT_DOMAIN_SCOPE = prevDomain;
  }
}

function testExplicitSelectsAndBound() {
  const select = V2_SAVED_SEARCH_LIST_SELECT as Record<string, unknown>;
  assert.deepEqual(Object.keys(select).sort(), [
    "emailAlerts",
    "id",
    "isHomepageActive",
    "name",
    "query",
    "smsAlerts",
  ]);
  const access = V2_SAVED_SEARCHES_ACCESS_SELECT as Record<string, unknown>;
  assert.deepEqual(Object.keys(access).sort(), [
    "assignedAgentId",
    "customerId",
    "id",
    "organizationId",
    "workspaceId",
  ]);
  assert.equal(V2_SAVED_SEARCHES_TAKE, 10);
  const loader = read("src/lib/agent/lead-profile-v2/load-saved-searches.ts");
  assert.ok(loader.includes("{ isHomepageActive: \"desc\" }"));
  assert.ok(loader.includes("{ isPrimary: \"desc\" }"));
  assert.ok(loader.includes("{ updatedAt: \"desc\" }"));
  const legacy = read("src/lib/agent/lead-profile-panels.ts");
  assert.ok(legacy.includes("take: 10"));
}

function testNoUnrelatedCollections() {
  const loader = read("src/lib/agent/lead-profile-v2/load-saved-searches.ts");
  for (const banned of [
    "loadBuyerIntent",
    "prisma.savedListing",
    "prisma.propertyMonitor",
    "prisma.areaMonitor",
    "prisma.listingNote",
    "prisma.viewingTour",
    "prisma.customerAlert",
    "prisma.leadEmailLog",
    "prisma.listingView",
    "prisma.activityEvent",
    "loadPagedLeadTimeline",
    "prisma.agentTask",
    "prisma.appointment",
    "/summary",
  ]) {
    assert.equal(loader.includes(banned), false, `must not query ${banned}`);
  }
}

function testLazyLoad() {
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2SavedSearches.ts",
  );
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  assert.ok(hook.includes("if (!enabled)"));
  assert.ok(hook.includes("session.abort(V2_SAVED_SEARCHES_RESOURCE_KEY)"));
  assert.ok(host.includes("useLeadProfileV2SavedSearches("));
  assert.ok(host.includes('tab === "engagement"'));
}

function testStaleResponsesDiscarded() {
  assert.equal(
    canApplyV2SavedSearchesResponse({
      stamp: { leadId: "lead-a", epoch: 1 },
      current: { leadId: "lead-b", epoch: 1 },
    }),
    false,
  );
  assert.equal(
    canApplyV2SavedSearchesResponse({
      stamp: { leadId: "lead-a", epoch: 1 },
      current: { leadId: "lead-a", epoch: 2 },
    }),
    false,
  );
  assert.equal(
    canApplyV2SavedSearchesResponse({
      stamp: { leadId: "lead-a", epoch: 2 },
      current: { leadId: "lead-a", epoch: 2 },
    }),
    true,
  );
}

function testAbortIsNotAnError() {
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2SavedSearches.ts",
  );
  assert.ok(hook.includes("isV2AbortError"));
  assert.ok(hook.includes("signal.aborted"));
  assert.equal(
    isV2AbortError(Object.assign(new Error("Aborted"), { name: "AbortError" })),
    true,
  );
}

function testNoRetry() {
  const fetchSrc = read("src/lib/agent/lead-profile-v2/fetch-json.ts");
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2SavedSearches.ts",
  );
  for (const src of [fetchSrc, hook]) {
    assert.equal(src.includes("retries"), false);
    assert.equal(src.includes("for (let attempt"), false);
  }
}

function testMutationsIndependentlyAuthorized() {
  const searches = read("src/app/api/agent/searches/route.ts");
  assert.ok(searches.includes("canAccessLead(ctx, lead)"));
  const editor = read("src/components/agent/SavedSearchEditor.tsx");
  assert.ok(editor.includes('method: "PATCH"'));
  assert.ok(editor.includes("/api/agent/searches"));
  const panel = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2EngagementPanel.tsx",
  );
  assert.ok(panel.includes('from "@/components/agent/SavedSearchEditor"'));
}

function testTargetedRefresh() {
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  const helper = read(
    "src/lib/agent/lead-profile-v2/saved-search-rail-refresh-query.ts",
  );
  const updated =
    host.split("const onSavedSearchUpdated")[1]?.split(
      "function startEditContact",
    )[0] ?? "";
  assert.ok(updated.includes("applyV2SavedSearchEditorUpdatedRefresh"));
  assert.ok(updated.includes("reloadSavedSearches"));
  assert.ok(updated.includes("reloadEngagementOverview"));
  assert.ok(updated.includes("reloadTimeline: reloadDefaultTimeline"));
  assert.equal(updated.includes("reloadRail"), false);
  assert.equal(updated.includes("reload()"), false);
  assert.equal(updated.includes("reloadTasks("), false);
  assert.equal(updated.includes("reloadAppointments("), false);
  const editorFn =
    helper.split("export function applyV2SavedSearchEditorUpdatedRefresh")[1] ??
    "";
  assert.ok(editorFn.includes("reloadSavedSearches()"));
  assert.ok(editorFn.includes("reloadEngagementOverview()"));
  assert.ok(editorFn.includes("reloadTimeline()"));
  assert.equal(editorFn.includes("reloadRail"), false);
}

function testPresentationParity() {
  const panel = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2EngagementPanel.tsx",
  );
  const legacy = read("src/components/agent/CustomerProfile.tsx");
  for (const copy of [
    "Saved searches / homepage",
    "Active homepage search",
    "No saved searches yet — use “Save as search” above to",
  ]) {
    assert.ok(panel.includes(copy), `missing ${copy}`);
    assert.ok(legacy.includes(copy), `legacy missing ${copy}`);
  }
}

function testFailureDoesNotRemoveOverview() {
  const panel = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2EngagementPanel.tsx",
  );
  assert.ok(panel.includes("savedSearchesError"));
  assert.ok(panel.includes("EngagementMatchboard"));
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2SavedSearches.ts",
  );
  assert.equal(hook.includes("setData("), false);
  assert.equal(hook.includes("reloadEngagementOverview"), false);
}

function waitMs(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(predicate: () => boolean, timeoutMs = 1000) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("timed out waiting for condition");
    }
    await waitMs(5);
  }
}

async function testDuplicateRequestsPrevented() {
  const session = createLeadProfileV2Session();
  let starts = 0;
  const fetchSearches = async () => {
    starts += 1;
    await waitMs(40);
  };
  session.request(V2_SAVED_SEARCHES_RESOURCE_KEY, "lead-a", fetchSearches);
  session.request(V2_SAVED_SEARCHES_RESOURCE_KEY, "lead-a", fetchSearches);
  session.request(V2_SAVED_SEARCHES_RESOURCE_KEY, "lead-a", fetchSearches);
  assert.equal(starts, 1);
  session.request("engagement-overview", "lead-a", fetchSearches);
  assert.equal(session.inspect("engagement-overview").inFlight, true);
  assert.equal(session.inspect(V2_SAVED_SEARCHES_RESOURCE_KEY).inFlight, true);
  await waitUntil(
    () =>
      !session.inspect(V2_SAVED_SEARCHES_RESOURCE_KEY).inFlight &&
      !session.inspect("engagement-overview").inFlight,
  );
}

async function testAbortOnLeadChange() {
  const session = createLeadProfileV2Session();
  const signals: AbortSignal[] = [];
  const fetchSearches = async (_leadId: string, signal: AbortSignal) => {
    signals.push(signal);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 200);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
      });
    });
  };
  session.request(V2_SAVED_SEARCHES_RESOURCE_KEY, "lead-a", fetchSearches);
  session.request(V2_SAVED_SEARCHES_RESOURCE_KEY, "lead-b", fetchSearches);
  assert.equal(signals[0]?.aborted, true);
  await waitUntil(
    () => !session.inspect(V2_SAVED_SEARCHES_RESOURCE_KEY).inFlight,
  );
}

async function main() {
  testLegacyUntouchedByV2Imports();
  testOverviewLoadsOnlyOneMatchboardSeed();
  testForeignWorkspaceSavedSearchesUnavailable();
  testExplicitSelectsAndBound();
  testNoUnrelatedCollections();
  testLazyLoad();
  testStaleResponsesDiscarded();
  testAbortIsNotAnError();
  testNoRetry();
  testMutationsIndependentlyAuthorized();
  testTargetedRefresh();
  testPresentationParity();
  testFailureDoesNotRemoveOverview();
  await testDuplicateRequestsPrevented();
  await testAbortOnLeadChange();
  console.log("lead-profile-v2-saved-searches-selftest: ok");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
