/**
 * Lead Profile V2 Route Planner selftest.
 * Run: node --import tsx scripts/lead-profile-v2-route-planner-selftest.ts
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
  V2_ROUTE_PLANNER_ACCESS_SELECT,
  V2_ROUTE_PLANNER_TOUR_SELECT,
} from "../src/lib/agent/lead-profile-v2/load-route-planner";
import {
  V2_ROUTE_PLANNER_RESOURCE_KEY,
  V2_ROUTE_PLANNER_STOPS_TAKE,
  V2_ROUTE_PLANNER_TOUR_TAKE,
  canApplyV2RoutePlannerResponse,
  formatV2RoutePlannerTourStopsPhrase,
  mapV2RoutePlannerTours,
  v2RoutePlannerStopsTruncated,
} from "../src/lib/agent/lead-profile-v2/route-planner-query";
import { ROUTE_PLANNER_MAX_STOPS } from "../src/lib/route-planner/optimize";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const LEGACY_FILES = [
  "src/components/agent/CustomerProfile.tsx",
  "src/components/agent/LeadQueryPopup.tsx",
  "src/app/api/agent/leads/[id]/engagement/route.ts",
  "src/app/api/route-planner/route.ts",
  "src/app/api/route-planner/stops/route.ts",
  "src/lib/agent/lead-profile-panels.ts",
  "src/lib/mobile/v2/viewings-planner.ts",
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

function testForeignWorkspaceRoutePlannerUnavailable() {
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
    const loader = read("src/lib/agent/lead-profile-v2/load-route-planner.ts");
    const accessCheck = "if (!lead || !v2CanAccessLead(ctx, lead)) return null";
    assert.ok(loader.includes(accessCheck));
    assert.ok(
      loader.indexOf(accessCheck) <
        loader.indexOf("prisma.viewingTour.findMany"),
    );
    const route = read(
      "src/app/api/agent/leads-v2/[id]/route-planner/route.ts",
    );
    assert.ok(route.includes("handleAgentLeadGet"));
    assert.equal(route.includes("/summary"), false);
    assert.equal(route.includes("searchParams.get(\"workspace"), false);
    assert.equal(route.includes("export async function POST"), false);
    assert.equal(route.includes("export async function DELETE"), false);
  } finally {
    if (prevRead === undefined) delete process.env.WORKSPACE_READ_SCOPE;
    else process.env.WORKSPACE_READ_SCOPE = prevRead;
    if (prevDomain === undefined) delete process.env.TENANT_DOMAIN_SCOPE;
    else process.env.TENANT_DOMAIN_SCOPE = prevDomain;
  }
}

function testNoCustomerEmptyTours() {
  const loader = read("src/lib/agent/lead-profile-v2/load-route-planner.ts");
  assert.ok(loader.includes("if (!lead.customerId)"));
  assert.ok(loader.includes("return { tours: [] }"));
}

function testExplicitSelectsAndBounds() {
  const access = V2_ROUTE_PLANNER_ACCESS_SELECT as Record<string, unknown>;
  assert.deepEqual(Object.keys(access).sort(), [
    "assignedAgentId",
    "customerId",
    "id",
    "organizationId",
    "workspaceId",
  ]);
  const select = V2_ROUTE_PLANNER_TOUR_SELECT as Record<string, unknown>;
  assert.deepEqual(Object.keys(select).sort(), [
    "_count",
    "id",
    "name",
    "status",
    "stops",
  ]);
  assert.equal(V2_ROUTE_PLANNER_TOUR_TAKE, 8);
  assert.equal(V2_ROUTE_PLANNER_STOPS_TAKE, 10);
  assert.equal(V2_ROUTE_PLANNER_STOPS_TAKE, ROUTE_PLANNER_MAX_STOPS);
  const stops = V2_ROUTE_PLANNER_TOUR_SELECT.stops as {
    orderBy: { sortOrder: string };
    take: number;
    select: Record<string, unknown>;
  };
  assert.equal(stops.take, 10);
  assert.equal(stops.orderBy.sortOrder, "asc");
  assert.deepEqual(Object.keys(stops.select), ["mlsNumber"]);
  const count = V2_ROUTE_PLANNER_TOUR_SELECT._count as {
    select: Record<string, unknown>;
  };
  assert.deepEqual(count.select, { stops: true });
  const loader = read("src/lib/agent/lead-profile-v2/load-route-planner.ts");
  assert.ok(loader.includes("orderBy: { updatedAt: \"desc\" }"));
  assert.ok(loader.includes("take: V2_ROUTE_PLANNER_TOUR_TAKE"));
  const legacy = read("src/lib/agent/lead-profile-panels.ts");
  const tourQuery =
    legacy.split("prisma.viewingTour.findMany({")[1]?.split(
      "prisma.customerAlert.findMany",
    )[0] ?? "";
  assert.ok(tourQuery.includes("orderBy: { updatedAt: \"desc\" }"));
  assert.ok(tourQuery.includes("take: 8"));
  assert.ok(tourQuery.includes("orderBy: { sortOrder: \"asc\" }"));
}

function testNoUnrelatedHydration() {
  const loader = read("src/lib/agent/lead-profile-v2/load-route-planner.ts");
  for (const banned of [
    "prisma.listing",
    "media",
    "addressLine",
    "startAddress",
    "loadBuyerIntent",
    "prisma.savedSearch",
    "prisma.savedListing",
    "prisma.propertyMonitor",
    "prisma.areaMonitor",
    "prisma.listingNote",
    "prisma.customerAlert",
    "prisma.leadEmailLog",
    "prisma.listingView",
    "prisma.activityEvent",
    "loadPagedLeadTimeline",
    "prisma.agentTask",
    "prisma.appointment",
    "/api/route-planner",
    "/summary",
  ]) {
    assert.equal(loader.includes(banned), false, `must not query ${banned}`);
  }
}

function testMaxHydration() {
  assert.equal(V2_ROUTE_PLANNER_TOUR_TAKE * V2_ROUTE_PLANNER_STOPS_TAKE, 80);
  assert.equal(V2_ROUTE_PLANNER_STOPS_TAKE, 10);
}

function testNoSchemaCapOrNewEndpoint() {
  const schema = read("prisma/schema.prisma");
  const tourModel =
    schema.split("model ViewingTour {")[1]?.split("model ViewingTourStop")[0] ??
    "";
  const stopModel =
    schema.split("model ViewingTourStop {")[1]?.split("model ")[0] ?? "";
  assert.equal(tourModel.includes("stops     ViewingTourStop[]"), true);
  assert.equal(stopModel.includes("@id"), true);
  assert.equal(stopModel.includes("maxStops"), false);
  assert.equal(stopModel.includes("@@check"), false);
  const v2Api = read(
    "src/app/api/agent/leads-v2/[id]/route-planner/route.ts",
  );
  assert.ok(v2Api.includes("handleAgentLeadGet"));
  assert.equal(v2Api.includes("export async function POST"), false);
}

function testCountListConsistency() {
  const cases: Array<{ total: number; loaded: number }> = [
    { total: 0, loaded: 0 },
    { total: 1, loaded: 1 },
    { total: 9, loaded: 9 },
    { total: 10, loaded: 10 },
    { total: 11, loaded: 10 },
    { total: 15, loaded: 10 },
  ];
  for (const { total, loaded } of cases) {
    const stops = Array.from({ length: loaded }, (_, i) => ({
      mlsNumber: `MLS${String(i + 1).padStart(6, "0")}`,
    }));
    const mapped = mapV2RoutePlannerTours([
      {
        id: `tour-${total}-${loaded}`,
        name: "Route Planner",
        status: "DRAFT",
        _count: { stops: total },
        stops,
      },
    ]);
    const tour = mapped.tours[0]!;
    assert.equal(tour.stopCount, total);
    assert.equal(tour.stops.length, loaded);
    const phrase = formatV2RoutePlannerTourStopsPhrase(tour);
    const listed = tour.stops.map((s) => s.mlsNumber);
    if (listed.length > 0) {
      assert.ok(phrase.endsWith(`(${listed.join(", ")})`));
    } else {
      assert.equal(phrase.includes("("), false);
    }
    const countPart = phrase.split(" (")[0] ?? "";
    if (total > loaded) {
      assert.equal(countPart, `${loaded} of ${total} stops`);
      assert.equal(v2RoutePlannerStopsTruncated(tour), true);
    } else {
      assert.equal(countPart, `${loaded} stops`);
      assert.equal(v2RoutePlannerStopsTruncated(tour), false);
    }
    const visibleCount = Number(countPart.split(" ")[0]);
    assert.equal(visibleCount, loaded);
    assert.equal(visibleCount, listed.length);
  }
}

function testSyntheticOverTenStops() {
  const stops = Array.from({ length: 10 }, (_, i) => ({
    mlsNumber: `MLS${String(i + 1).padStart(6, "0")}`,
  }));
  const mapped = mapV2RoutePlannerTours([
    {
      id: "tour-over",
      name: "Route Planner",
      status: "DRAFT",
      _count: { stops: 15 },
      stops,
    },
  ]);
  assert.equal(mapped.tours.length, 1);
  assert.equal(mapped.tours[0]?.stopCount, 15);
  assert.equal(mapped.tours[0]?.stops.length, 10);
  assert.equal(
    formatV2RoutePlannerTourStopsPhrase(mapped.tours[0]!),
    "10 of 15 stops (MLS000001, MLS000002, MLS000003, MLS000004, MLS000005, MLS000006, MLS000007, MLS000008, MLS000009, MLS000010)",
  );
}

function testOrderedMlsAndExactCountUnderTen() {
  const mapped = mapV2RoutePlannerTours([
    {
      id: "tour-a",
      name: "Route Planner",
      status: "REQUESTED",
      _count: { stops: 2 },
      stops: [{ mlsNumber: "AAA" }, { mlsNumber: "BBB" }],
    },
  ]);
  assert.equal(mapped.tours[0]?.stopCount, 2);
  assert.equal(
    mapped.tours[0]?.stops.map((s) => s.mlsNumber).join(", "),
    "AAA, BBB",
  );
}

function testLazyLoad() {
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2RoutePlanner.ts",
  );
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  assert.ok(hook.includes("if (!enabled)"));
  assert.ok(hook.includes("session.abort(V2_ROUTE_PLANNER_RESOURCE_KEY)"));
  assert.ok(host.includes("useLeadProfileV2RoutePlanner("));
  assert.ok(host.includes('tab === "engagement"'));
}

function testStaleResponsesDiscarded() {
  assert.equal(
    canApplyV2RoutePlannerResponse({
      stamp: { leadId: "lead-a", epoch: 1 },
      current: { leadId: "lead-b", epoch: 1 },
    }),
    false,
  );
  assert.equal(
    canApplyV2RoutePlannerResponse({
      stamp: { leadId: "lead-a", epoch: 1 },
      current: { leadId: "lead-a", epoch: 2 },
    }),
    false,
  );
  assert.equal(
    canApplyV2RoutePlannerResponse({
      stamp: { leadId: "lead-a", epoch: 2 },
      current: { leadId: "lead-a", epoch: 2 },
    }),
    true,
  );
}

function testAbortIsNotAnError() {
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2RoutePlanner.ts",
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
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2RoutePlanner.ts",
  );
  for (const src of [fetchSrc, hook]) {
    assert.equal(src.includes("retries"), false);
    assert.equal(src.includes("for (let attempt"), false);
  }
}

function testReadOnlyNoMutations() {
  const panel = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2EngagementPanel.tsx",
  );
  const section =
    panel.split('<Panel title="Route planner">')[1]?.split(
      "function Panel",
    )[0] ?? "";
  assert.equal(section.includes("/api/route-planner"), false);
  assert.equal(section.includes("/api/route-planner/stops"), false);
  assert.equal(section.includes("method: \"POST\""), false);
  assert.equal(section.includes("method: \"DELETE\""), false);
  const v2Api = read(
    "src/app/api/agent/leads-v2/[id]/route-planner/route.ts",
  );
  assert.equal(v2Api.includes("export async function POST"), false);
  assert.equal(v2Api.includes("export async function PATCH"), false);
}

function testTargetedRefresh() {
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  const refresh =
    host.split("const refreshProfile = useCallback")[1]?.split(
      "const onTaskCreated",
    )[0] ?? "";
  assert.ok(refresh.includes("reloadRoutePlanner()"));
  const matchboard =
    host.split("const onMatchboardUpdated")[1]?.split(
      "const onSavedSearchUpdated",
    )[0] ?? "";
  assert.equal(matchboard.includes("reloadRoutePlanner"), false);
  assert.equal(matchboard.includes("reload()"), false);
}

function testPresentationParity() {
  const panel = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2EngagementPanel.tsx",
  );
  const legacy = read("src/components/agent/CustomerProfile.tsx");
  for (const copy of [
    'title="Route planner"',
    "No tours",
    'className="text-[13px] text-[#94a3b8]"',
    'className="space-y-1"',
    'className="text-[12px] text-[#475569]"',
    ".join(\", \")",
  ]) {
    assert.ok(legacy.includes(copy), `legacy missing ${copy}`);
    if (copy !== ".join(\", \")") {
      assert.ok(panel.includes(copy), `missing ${copy}`);
    }
  }
  assert.ok(
    panel.includes("{t.name} · {t.status} · {formatV2RoutePlannerTourStopsPhrase(t)}"),
  );
  assert.ok(legacy.includes("{t.name} · {t.status} · {t.stops.length} stops"));
  assert.equal(panel.includes("{t.stopCount} stops"), false);
  const helper = read("src/lib/agent/lead-profile-v2/route-planner-query.ts");
  assert.ok(helper.includes('.join(", ")'));
  assert.equal(helper.includes("take: Infinity"), false);
  const v2Api = read(
    "src/app/api/agent/leads-v2/[id]/route-planner/route.ts",
  );
  assert.ok(v2Api.includes("loadLeadProfileV2RoutePlanner"));
  assert.equal(v2Api.includes("prisma.viewingTour"), false);
}

function testFailureDoesNotAffectOtherEngagement() {
  const panel = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2EngagementPanel.tsx",
  );
  assert.ok(panel.includes("routePlannerError"));
  assert.ok(panel.includes("EngagementMatchboard"));
  assert.ok(panel.includes("savedSearchesError"));
  assert.ok(panel.includes("savedHomesError"));
  assert.ok(panel.includes("propertyWatchesError"));
  assert.ok(panel.includes("areaMonitorsError"));
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2RoutePlanner.ts",
  );
  assert.equal(hook.includes("setData("), false);
  assert.equal(hook.includes("reloadEngagementOverview"), false);
  assert.equal(hook.includes("reloadSavedSearches"), false);
  assert.equal(hook.includes("reloadSavedHomes"), false);
  assert.equal(hook.includes("reloadPropertyWatches"), false);
  assert.equal(hook.includes("reloadAreaMonitors"), false);
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
  const fetchTours = async () => {
    starts += 1;
    await waitMs(40);
  };
  session.request(V2_ROUTE_PLANNER_RESOURCE_KEY, "lead-a", fetchTours);
  session.request(V2_ROUTE_PLANNER_RESOURCE_KEY, "lead-a", fetchTours);
  session.request(V2_ROUTE_PLANNER_RESOURCE_KEY, "lead-a", fetchTours);
  assert.equal(starts, 1);
  session.request("engagement-overview", "lead-a", fetchTours);
  session.request("saved-searches", "lead-a", fetchTours);
  session.request("saved-homes", "lead-a", fetchTours);
  session.request("property-watches", "lead-a", fetchTours);
  session.request("area-monitors", "lead-a", fetchTours);
  assert.equal(session.inspect(V2_ROUTE_PLANNER_RESOURCE_KEY).inFlight, true);
  assert.equal(session.inspect("engagement-overview").inFlight, true);
  await waitUntil(
    () =>
      !session.inspect(V2_ROUTE_PLANNER_RESOURCE_KEY).inFlight &&
      !session.inspect("engagement-overview").inFlight &&
      !session.inspect("saved-searches").inFlight &&
      !session.inspect("saved-homes").inFlight &&
      !session.inspect("property-watches").inFlight &&
      !session.inspect("area-monitors").inFlight,
  );
}

async function testAbortOnLeadChange() {
  const session = createLeadProfileV2Session();
  const signals: AbortSignal[] = [];
  const fetchTours = async (_leadId: string, signal: AbortSignal) => {
    signals.push(signal);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 200);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
      });
    });
  };
  session.request(V2_ROUTE_PLANNER_RESOURCE_KEY, "lead-a", fetchTours);
  session.request(V2_ROUTE_PLANNER_RESOURCE_KEY, "lead-b", fetchTours);
  assert.equal(signals[0]?.aborted, true);
  await waitUntil(
    () => !session.inspect(V2_ROUTE_PLANNER_RESOURCE_KEY).inFlight,
  );
}

async function main() {
  testLegacyUntouchedByV2Imports();
  testForeignWorkspaceRoutePlannerUnavailable();
  testNoCustomerEmptyTours();
  testExplicitSelectsAndBounds();
  testNoUnrelatedHydration();
  testMaxHydration();
  testNoSchemaCapOrNewEndpoint();
  testCountListConsistency();
  testSyntheticOverTenStops();
  testOrderedMlsAndExactCountUnderTen();
  testLazyLoad();
  testStaleResponsesDiscarded();
  testAbortIsNotAnError();
  testNoRetry();
  testReadOnlyNoMutations();
  testTargetedRefresh();
  testPresentationParity();
  testFailureDoesNotAffectOtherEngagement();
  await testDuplicateRequestsPrevented();
  await testAbortOnLeadChange();
  console.log("lead-profile-v2-route-planner-selftest: ok");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
