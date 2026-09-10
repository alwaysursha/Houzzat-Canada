/**
 * Lead Profile V2 Engagement overview + Matchboard selftest.
 * Run: node --import tsx scripts/lead-profile-v2-engagement-overview-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HOT_VIEW_WINDOW_MS } from "../src/lib/agent/hotness";
import { canAccessLead } from "../src/lib/crm-read-scope";
import { v2CanAccessLead } from "../src/lib/agent/lead-profile-v2/access";
import {
  createLeadProfileV2Session,
  isV2AbortError,
} from "../src/lib/agent/lead-profile-v2/request-gate";
import {
  V2_ENGAGEMENT_OVERVIEW_ACCESS_SELECT,
  V2_ENGAGEMENT_SAVED_SEARCH_SELECT,
} from "../src/lib/agent/lead-profile-v2/load-engagement-overview";
import { buyerIntentFromSavedSearches } from "../src/lib/agent/buyer-intent";
import {
  V2_BUYER_INTENT_DAYS,
  V2_BUYER_INTENT_EVENT_TAKE,
  V2_BUYER_INTENT_LISTING_TAKE,
  V2_BUYER_INTENT_VISITOR_TAKE,
  V2_ENGAGEMENT_OVERVIEW_RESOURCE_KEY,
  V2_ENGAGEMENT_MATCHBOARD_CANDIDATE_TAKE,
  V2_ENGAGEMENT_VIEWS_WINDOW_MS,
  deriveV2EngagementSearchSeeds,
  selectV2MatchboardSearchSeed,
  toV2BuyerIntentSavedSearchInput,
  v2SavedSearchQueryIsUsable,
  canApplyV2EngagementOverviewResponse,
} from "../src/lib/agent/lead-profile-v2/engagement-overview-query";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const LEGACY_FILES = [
  "src/components/agent/CustomerProfile.tsx",
  "src/components/agent/LeadQueryPopup.tsx",
  "src/components/agent/EngagementMatchboard.tsx",
  "src/app/api/agent/leads/[id]/summary/route.ts",
  "src/app/api/agent/leads/[id]/engagement/route.ts",
  "src/app/api/agent/searches/route.ts",
  "src/app/api/agent/shortlist-email/route.ts",
  "src/lib/agent/lead-profile-panels.ts",
  "src/lib/agent/buyer-intent.ts",
  "src/lib/agent/lead-profile-snapshot.ts",
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

function testForeignWorkspaceEngagementUnavailable() {
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
    const loader = read(
      "src/lib/agent/lead-profile-v2/load-engagement-overview.ts",
    );
    const accessCheck = "if (!lead || !v2CanAccessLead(ctx, lead)) return null";
    assert.ok(loader.includes(accessCheck));
    assert.ok(
      loader.indexOf(accessCheck) < loader.indexOf("prisma.savedSearch.findMany"),
    );
    const route = read(
      "src/app/api/agent/leads-v2/[id]/engagement-overview/route.ts",
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

function testBuyerIntentBoundsPreserved() {
  assert.equal(V2_BUYER_INTENT_DAYS, 45);
  assert.equal(V2_BUYER_INTENT_VISITOR_TAKE, 20);
  assert.equal(V2_BUYER_INTENT_EVENT_TAKE, 40);
  assert.equal(V2_BUYER_INTENT_LISTING_TAKE, 12);
  const intent = read("src/lib/agent/buyer-intent.ts");
  assert.ok(intent.includes("45 * 24 * 60 * 60 * 1000"));
  assert.ok(intent.includes("take: 20"));
  assert.ok(intent.includes("take: 40"));
  assert.ok(intent.includes("slice(0, 12)"));
  assert.equal(intent.includes("htmlBody"), false);
  const loader = read(
    "src/lib/agent/lead-profile-v2/load-engagement-overview.ts",
  );
  assert.ok(loader.includes("loadBuyerIntent("));
  assert.equal(loader.includes("loadLeadProfileEngagementPanel"), false);
}

function testNoUnboundedHistoryQuery() {
  const intent = read("src/lib/agent/buyer-intent.ts");
  const searchBlock = intent.split("prisma.activityEvent.findMany")[1] ?? "";
  assert.ok(searchBlock.includes("createdAt: { gte: since }"));
  assert.ok(searchBlock.includes("take: 40"));
  assert.ok(searchBlock.includes("select: { path: true, createdAt: true }"));
  assert.equal(intent.includes("select: { meta: true }"), false);
}

function testLowerCollectionsNotQueried() {
  const loader = read(
    "src/lib/agent/lead-profile-v2/load-engagement-overview.ts",
  );
  for (const banned of [
    "prisma.propertyMonitor",
    "prisma.areaMonitor",
    "prisma.listingNote",
    "prisma.viewingTour",
    "prisma.savedListing.findMany",
    "prisma.customerAlert.findMany",
    "prisma.leadEmailLog.findMany",
    "loadPagedLeadTimeline",
    "prisma.agentTask",
    "prisma.appointment",
    "hotnessFromSignals",
    "/summary",
  ]) {
    assert.equal(loader.includes(banned), false, `must not query ${banned}`);
  }
  assert.ok(loader.includes("prisma.savedListing.count"));
  assert.ok(loader.includes("prisma.customerAlert.count"));
  assert.ok(loader.includes("prisma.leadEmailLog.count"));
  assert.ok(loader.includes("prisma.listingView.count"));
}

function testExplicitFieldSelects() {
  const access = V2_ENGAGEMENT_OVERVIEW_ACCESS_SELECT as Record<
    string,
    unknown
  >;
  assert.deepEqual(Object.keys(access).sort(), [
    "assignedAgentId",
    "customer",
    "customerId",
    "id",
    "organizationId",
    "workspaceId",
  ]);
  const search = V2_ENGAGEMENT_SAVED_SEARCH_SELECT as Record<string, unknown>;
  assert.deepEqual(Object.keys(search).sort(), [
    "emailAlerts",
    "id",
    "name",
    "query",
    "smsAlerts",
  ]);
  assert.equal(V2_ENGAGEMENT_MATCHBOARD_CANDIDATE_TAKE, 10);
  assert.equal(V2_ENGAGEMENT_VIEWS_WINDOW_MS, HOT_VIEW_WINDOW_MS);
  const loader = read(
    "src/lib/agent/lead-profile-v2/load-engagement-overview.ts",
  );
  assert.ok(loader.includes("prisma.savedSearch.findMany"));
  assert.ok(loader.includes("take: V2_ENGAGEMENT_MATCHBOARD_CANDIDATE_TAKE"));
  assert.ok(loader.includes("selectV2MatchboardSearchSeed"));
  assert.ok(loader.includes("toV2BuyerIntentSavedSearchInput(candidates)"));
  assert.equal(loader.includes("prisma.savedSearch.findFirst"), false);
  assert.ok(loader.includes("{ isHomepageActive: \"desc\""));
  const types = read("src/lib/agent/lead-profile-v2/types.ts");
  const overviewType =
    types.split("export type LeadProfileV2EngagementOverview")[1]?.split(
      "export type LeadProfileV2SavedSearch",
    )[0] ?? "";
  assert.ok(overviewType.includes("matchboardSearch"));
  assert.equal(overviewType.includes("savedSearches"), false);
}

function testMatchboardFallbackCases() {
  const intent = read("src/lib/agent/buyer-intent.ts");
  assert.ok(
    intent.includes("parsed.cities.length > 0 ||") &&
      intent.includes("parsed.communities.length > 0 ||") &&
      intent.includes("parsed.minPrice != null ||") &&
      intent.includes("parsed.maxPrice != null ||") &&
      intent.includes("parsed.minBeds != null ||") &&
      intent.includes("parsed.propertyTypes.length > 0"),
  );
  const savedLoop =
    intent.split("const saved = input.savedSearches ?? [];")[1]?.split(
      "const browseCities",
    )[0] ?? "";
  assert.ok(savedLoop.includes("if (!usable) continue"));
  assert.ok(savedLoop.includes("break;"));
  assert.equal(v2SavedSearchQueryIsUsable({ transactionType: "SALE" }), false);
  assert.equal(v2SavedSearchQueryIsUsable({ minBeds: 0 }), false);
  assert.equal(v2SavedSearchQueryIsUsable({ cities: ["Toronto"] }), true);

  const firstUsable = [
    seed("a", { cities: ["Toronto"] }),
    seed("b", { cities: ["Mississauga"] }),
  ];
  assert.deepEqual(ids(deriveV2EngagementSearchSeeds(firstUsable)), {
    matchboardSearch: "a",
    buyerIntentSavedSearch: "a",
  });
  assert.equal(
    toV2BuyerIntentSavedSearchInput(firstUsable).length,
    2,
  );
  assert.equal(
    buyerIntentFromSavedSearches({
      customerName: null,
      savedSearches: toV2BuyerIntentSavedSearchInput(firstUsable),
    }).criteria.cities[0],
    "Toronto",
  );

  const firstUnusable = [
    seed("a", {}),
    seed("b", { minBeds: 3 }),
  ];
  assert.deepEqual(ids(deriveV2EngagementSearchSeeds(firstUnusable)), {
    matchboardSearch: "a",
    buyerIntentSavedSearch: "b",
  });
  assert.equal(
    selectV2MatchboardSearchSeed(firstUnusable)?.id,
    "a",
  );
  assert.deepEqual(
    toV2BuyerIntentSavedSearchInput(firstUnusable).map((s) => s.name),
    ["a", "b"],
  );
  assert.equal(
    buyerIntentFromSavedSearches({
      customerName: null,
      savedSearches: toV2BuyerIntentSavedSearchInput(firstUnusable),
    }).criteria.minBeds,
    3,
  );
  assert.equal(
    buyerIntentFromSavedSearches({
      customerName: null,
      savedSearches: toV2BuyerIntentSavedSearchInput(firstUnusable),
    }).source,
    "saved",
  );

  const multipleUsable = [
    seed("a", { cities: ["Ottawa"] }),
    seed("b", { cities: ["Hamilton"] }),
    seed("c", { minBeds: 4 }),
  ];
  assert.equal(
    deriveV2EngagementSearchSeeds(multipleUsable).buyerIntentSavedSearch?.id,
    "a",
  );
  assert.equal(
    toV2BuyerIntentSavedSearchInput(multipleUsable).length,
    3,
  );
  assert.equal(
    buyerIntentFromSavedSearches({
      customerName: null,
      savedSearches: toV2BuyerIntentSavedSearchInput(multipleUsable),
    }).criteria.cities[0],
    "Ottawa",
  );

  const allUnusable = [
    seed("a", {}),
    seed("b", { transactionType: "SALE" }),
    seed("c", { minBeds: 0 }),
  ];
  assert.deepEqual(ids(deriveV2EngagementSearchSeeds(allUnusable)), {
    matchboardSearch: "a",
    buyerIntentSavedSearch: null,
  });
  assert.equal(toV2BuyerIntentSavedSearchInput(allUnusable).length, 3);
  assert.equal(
    buyerIntentFromSavedSearches({
      customerName: null,
      savedSearches: toV2BuyerIntentSavedSearchInput(allUnusable),
    }).source,
    "thin",
  );

  assert.deepEqual(ids(deriveV2EngagementSearchSeeds([])), {
    matchboardSearch: null,
    buyerIntentSavedSearch: null,
  });
  assert.deepEqual(toV2BuyerIntentSavedSearchInput([]), []);

  const loader = read(
    "src/lib/agent/lead-profile-v2/load-engagement-overview.ts",
  );
  assert.ok(loader.includes("toV2BuyerIntentSavedSearchInput(candidates)"));
  assert.equal(
    loader.includes("buyerIntentSavedSearch ? [buyerIntentSavedSearch]"),
    false,
  );
  assert.equal(loader.includes("savedSearches: matchboardSearch"), false);
  assert.equal(
    (loader.match(/prisma\.savedSearch\.findMany/g) ?? []).length,
    1,
  );
  const panels = read("src/lib/agent/lead-profile-panels.ts");
  const engagementLoader =
    panels.split("export async function loadLeadProfileEngagementPanel")[1] ??
    "";
  assert.ok(engagementLoader.includes("take: 10"));
  assert.ok(engagementLoader.includes("{ isHomepageActive: \"desc\""));
  assert.ok(engagementLoader.includes("{ isPrimary: \"desc\""));
  assert.ok(engagementLoader.includes("{ updatedAt: \"desc\""));
  assert.ok(engagementLoader.includes("savedSearches: searches"));
}

function ids(seeds: {
  matchboardSearch: { id: string } | null;
  buyerIntentSavedSearch: { id: string } | null;
}) {
  return {
    matchboardSearch: seeds.matchboardSearch?.id ?? null,
    buyerIntentSavedSearch: seeds.buyerIntentSavedSearch?.id ?? null,
  };
}

function seed(id: string, query: Record<string, unknown>) {
  return {
    id,
    name: id,
    emailAlerts: true,
    smsAlerts: false,
    query,
  };
}

function testLazyLoad() {
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2EngagementOverview.ts",
  );
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  assert.ok(hook.includes("if (!enabled)"));
  assert.ok(hook.includes("session.abort(V2_ENGAGEMENT_OVERVIEW_RESOURCE_KEY)"));
  assert.ok(host.includes('tab === "engagement"'));
  assert.ok(host.includes("useLeadProfileV2EngagementOverview("));
}

function testStaleResponsesDiscarded() {
  assert.equal(
    canApplyV2EngagementOverviewResponse({
      stamp: { leadId: "lead-a", epoch: 1 },
      current: { leadId: "lead-b", epoch: 1 },
    }),
    false,
  );
  assert.equal(
    canApplyV2EngagementOverviewResponse({
      stamp: { leadId: "lead-a", epoch: 1 },
      current: { leadId: "lead-a", epoch: 2 },
    }),
    false,
  );
  assert.equal(
    canApplyV2EngagementOverviewResponse({
      stamp: { leadId: "lead-a", epoch: 2 },
      current: { leadId: "lead-a", epoch: 2 },
    }),
    true,
  );
}

function testAbortIsNotAnError() {
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2EngagementOverview.ts",
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
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2EngagementOverview.ts",
  );
  for (const src of [fetchSrc, hook]) {
    assert.equal(src.includes("retries"), false);
    assert.equal(src.includes("for (let attempt"), false);
  }
}

function testMatchboardWritesIndependentlyAuthorized() {
  const searches = read("src/app/api/agent/searches/route.ts");
  const shortlist = read("src/app/api/agent/shortlist-email/route.ts");
  assert.ok(searches.includes("canAccessLead(ctx, lead)"));
  assert.ok(shortlist.includes("verifyLeadAccess: (lead) => canAccessLead(ctx, lead)"));
  const panel = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2EngagementPanel.tsx",
  );
  assert.ok(panel.includes("from \"@/components/agent/EngagementMatchboard\"") || panel.includes('from "@/components/agent/EngagementMatchboard"'));
}

function testTargetedRefreshOnly() {
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  const helper = read(
    "src/lib/agent/lead-profile-v2/saved-search-rail-refresh-query.ts",
  );
  const updated =
    host.split("const onMatchboardUpdated")[1]?.split(
      "function startEditContact",
    )[0] ?? "";
  assert.ok(updated.includes("applyV2MatchboardUpdatedRefresh"));
  assert.ok(updated.includes("applyV2SavedSearchEditorUpdatedRefresh"));
  assert.ok(updated.includes("reloadEngagementOverview"));
  assert.ok(updated.includes("reloadSavedSearches"));
  assert.ok(updated.includes("reloadTimeline: reloadDefaultTimeline"));
  assert.ok(updated.includes("invalidateEmails"));
  assert.equal(updated.includes("reload()"), false);
  assert.equal(updated.includes("reloadTasks("), false);
  assert.equal(updated.includes("reloadAppointments("), false);
  assert.equal(host.includes("/summary"), false);
  const matchFn =
    helper.split("export function applyV2MatchboardUpdatedRefresh")[1]?.split(
      "export function applyV2SavedSearchEditorUpdatedRefresh",
    )[0] ?? "";
  assert.ok(matchFn.includes("reloadEngagementOverview()"));
  assert.ok(matchFn.includes("reloadSavedSearches()"));
  assert.ok(matchFn.includes("reloadTimeline()"));
  assert.ok(matchFn.includes("invalidateEmails()"));
  assert.ok(matchFn.includes("reloadRail()"));
}

function testPresentationParityAndNoLowerSections() {
  const panel = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2EngagementPanel.tsx",
  );
  const legacy = read("src/components/agent/CustomerProfile.tsx");
  for (const copy of [
    "Views (24h)",
    "Saved homes",
    "Alerts",
    "Emails sent",
    "Criteria · matches · shortlist",
    "Loading…",
    "Failed to load",
  ]) {
    assert.ok(panel.includes(copy), `missing ${copy}`);
    assert.ok(legacy.includes(copy), `legacy missing ${copy}`);
  }
  assert.ok(panel.includes("Saved searches / homepage"));
}

function testFailedEngagementIsolated() {
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2EngagementOverview.ts",
  );
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  assert.ok(hook.includes("setError(true)"));
  assert.ok(host.includes("engagement.error"));
  assert.equal(hook.includes("setData("), false);
  assert.equal(hook.includes("reloadDefaultTimeline"), false);
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
  const fetchOverview = async () => {
    starts += 1;
    await waitMs(40);
  };
  session.request(V2_ENGAGEMENT_OVERVIEW_RESOURCE_KEY, "lead-a", fetchOverview);
  session.request(V2_ENGAGEMENT_OVERVIEW_RESOURCE_KEY, "lead-a", fetchOverview);
  session.request(V2_ENGAGEMENT_OVERVIEW_RESOURCE_KEY, "lead-a", fetchOverview);
  assert.equal(starts, 1);
  assert.equal(
    session.inspect(V2_ENGAGEMENT_OVERVIEW_RESOURCE_KEY).inFlight,
    true,
  );
  session.request("shell", "lead-a", fetchOverview);
  session.request("emails", "lead-a", fetchOverview);
  assert.equal(session.inspect("shell").inFlight, true);
  assert.equal(
    session.inspect(V2_ENGAGEMENT_OVERVIEW_RESOURCE_KEY).inFlight,
    true,
  );
  await waitUntil(
    () =>
      !session.inspect(V2_ENGAGEMENT_OVERVIEW_RESOURCE_KEY).inFlight &&
      !session.inspect("shell").inFlight &&
      !session.inspect("emails").inFlight,
  );
}

async function testAbortOnLeadChange() {
  const session = createLeadProfileV2Session();
  const signals: AbortSignal[] = [];
  const fetchOverview = async (_leadId: string, signal: AbortSignal) => {
    signals.push(signal);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 200);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
      });
    });
  };

  session.request(
    V2_ENGAGEMENT_OVERVIEW_RESOURCE_KEY,
    "lead-a",
    fetchOverview,
  );
  session.request(
    V2_ENGAGEMENT_OVERVIEW_RESOURCE_KEY,
    "lead-b",
    fetchOverview,
  );
  assert.equal(signals[0]?.aborted, true);
  await waitUntil(
    () => !session.inspect(V2_ENGAGEMENT_OVERVIEW_RESOURCE_KEY).inFlight,
  );
}

async function main() {
  testLegacyUntouchedByV2Imports();
  testForeignWorkspaceEngagementUnavailable();
  testBuyerIntentBoundsPreserved();
  testNoUnboundedHistoryQuery();
  testLowerCollectionsNotQueried();
  testExplicitFieldSelects();
  testMatchboardFallbackCases();
  testLazyLoad();
  testStaleResponsesDiscarded();
  testAbortIsNotAnError();
  testNoRetry();
  testMatchboardWritesIndependentlyAuthorized();
  testTargetedRefreshOnly();
  testPresentationParityAndNoLowerSections();
  testFailedEngagementIsolated();
  await testDuplicateRequestsPrevented();
  await testAbortOnLeadChange();
  console.log("lead-profile-v2-engagement-overview-selftest: ok");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
