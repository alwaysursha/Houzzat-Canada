/**
 * Lead Profile V2 Property Watches selftest.
 * Run: node --import tsx scripts/lead-profile-v2-property-watches-selftest.ts
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
  V2_PROPERTY_WATCHES_ACCESS_SELECT,
  V2_PROPERTY_WATCH_LIST_SELECT,
} from "../src/lib/agent/lead-profile-v2/load-property-watches";
import {
  V2_PROPERTY_WATCHES_RESOURCE_KEY,
  V2_PROPERTY_WATCHES_TAKE,
  canApplyV2PropertyWatchesResponse,
} from "../src/lib/agent/lead-profile-v2/property-watches-query";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const LEGACY_FILES = [
  "src/components/agent/CustomerProfile.tsx",
  "src/components/agent/LeadQueryPopup.tsx",
  "src/app/api/agent/leads/[id]/engagement/route.ts",
  "src/app/api/account/property-monitors/route.ts",
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

function testForeignWorkspaceWatchesUnavailable() {
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
      "src/lib/agent/lead-profile-v2/load-property-watches.ts",
    );
    const accessCheck = "if (!lead || !v2CanAccessLead(ctx, lead)) return null";
    assert.ok(loader.includes(accessCheck));
    assert.ok(
      loader.indexOf(accessCheck) <
        loader.indexOf("prisma.propertyMonitor.findMany"),
    );
    const route = read(
      "src/app/api/agent/leads-v2/[id]/property-watches/route.ts",
    );
    assert.ok(route.includes("handleAgentLeadGet"));
    assert.equal(route.includes("/summary"), false);
    assert.equal(route.includes("searchParams.get(\"workspace"), false);
    assert.equal(route.includes("export async function POST"), false);
    assert.equal(route.includes("export async function DELETE"), false);
    assert.equal(route.includes("export async function PATCH"), false);
  } finally {
    if (prevRead === undefined) delete process.env.WORKSPACE_READ_SCOPE;
    else process.env.WORKSPACE_READ_SCOPE = prevRead;
    if (prevDomain === undefined) delete process.env.TENANT_DOMAIN_SCOPE;
    else process.env.TENANT_DOMAIN_SCOPE = prevDomain;
  }
}

function testExplicitSelectsAndBound() {
  const select = V2_PROPERTY_WATCH_LIST_SELECT as Record<string, unknown>;
  assert.deepEqual(Object.keys(select).sort(), ["id", "mlsNumber"]);
  const access = V2_PROPERTY_WATCHES_ACCESS_SELECT as Record<string, unknown>;
  assert.deepEqual(Object.keys(access).sort(), [
    "assignedAgentId",
    "customerId",
    "id",
    "organizationId",
    "workspaceId",
  ]);
  assert.equal(V2_PROPERTY_WATCHES_TAKE, 20);
  const loader = read(
    "src/lib/agent/lead-profile-v2/load-property-watches.ts",
  );
  assert.ok(loader.includes("orderBy: { createdAt: \"desc\" }"));
  assert.ok(loader.includes("take: V2_PROPERTY_WATCHES_TAKE"));
  const legacy = read("src/lib/agent/lead-profile-panels.ts");
  const watchQuery =
    legacy.split("prisma.propertyMonitor.findMany({")[1]?.split(
      "prisma.areaMonitor.findMany",
    )[0] ?? "";
  assert.ok(watchQuery.includes("orderBy: { createdAt: \"desc\" }"));
  assert.ok(watchQuery.includes("take: 20"));
  assert.ok(watchQuery.includes("id: true"));
  assert.ok(watchQuery.includes("mlsNumber: true"));
  assert.equal(watchQuery.includes("emailAlerts"), false);
  assert.equal(watchQuery.includes("lastKnownPrice"), false);
  assert.equal(watchQuery.includes("prisma.listing"), false);
}

function testNoUnrelatedEngagementQueries() {
  const loader = read(
    "src/lib/agent/lead-profile-v2/load-property-watches.ts",
  );
  for (const banned of [
    "prisma.listing",
    "media",
    "gallery",
    "remarks",
    "loadBuyerIntent",
    "prisma.savedSearch",
    "prisma.savedListing",
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
  const types = read("src/lib/agent/lead-profile-v2/types.ts");
  const dto =
    types.split("export type LeadProfileV2PropertyWatch ")[1]?.split(
      "export type LeadProfileV2PropertyWatchesPanel",
    )[0] ?? "";
  assert.ok(dto.includes("id: string"));
  assert.ok(dto.includes("mlsNumber: string"));
  assert.equal(dto.includes("emailAlerts"), false);
  assert.equal(dto.includes("address"), false);
  assert.equal(dto.includes("listPrice"), false);
}

function testLazyLoad() {
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2PropertyWatches.ts",
  );
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  assert.ok(hook.includes("if (!enabled)"));
  assert.ok(hook.includes("session.abort(V2_PROPERTY_WATCHES_RESOURCE_KEY)"));
  assert.ok(host.includes("useLeadProfileV2PropertyWatches("));
  assert.ok(host.includes('tab === "engagement"'));
}

function testStaleResponsesDiscarded() {
  assert.equal(
    canApplyV2PropertyWatchesResponse({
      stamp: { leadId: "lead-a", epoch: 1 },
      current: { leadId: "lead-b", epoch: 1 },
    }),
    false,
  );
  assert.equal(
    canApplyV2PropertyWatchesResponse({
      stamp: { leadId: "lead-a", epoch: 1 },
      current: { leadId: "lead-a", epoch: 2 },
    }),
    false,
  );
  assert.equal(
    canApplyV2PropertyWatchesResponse({
      stamp: { leadId: "lead-a", epoch: 2 },
      current: { leadId: "lead-a", epoch: 2 },
    }),
    true,
  );
}

function testAbortIsNotAnError() {
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2PropertyWatches.ts",
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
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2PropertyWatches.ts",
  );
  for (const src of [fetchSrc, hook]) {
    assert.equal(src.includes("retries"), false);
    assert.equal(src.includes("for (let attempt"), false);
  }
}

function testMutationsIndependentlyAuthorized() {
  const customerApi = read("src/app/api/account/property-monitors/route.ts");
  assert.ok(customerApi.includes("requireFullCustomerUser()"));
  assert.equal(customerApi.includes("canAccessLead"), false);
  const panel = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2EngagementPanel.tsx",
  );
  const watches =
    panel.split('<Panel title="Property watches">')[1]?.split(
      "function Panel",
    )[0] ?? "";
  assert.equal(watches.includes("/api/account/property-monitors"), false);
  assert.equal(watches.includes("method: \"DELETE\""), false);
  assert.equal(watches.includes("Unsave"), false);
  assert.equal(watches.includes("Remove"), false);
  const v2Api = read(
    "src/app/api/agent/leads-v2/[id]/property-watches/route.ts",
  );
  assert.equal(v2Api.includes("export async function POST"), false);
  assert.equal(v2Api.includes("export async function DELETE"), false);
}

function testTargetedRefresh() {
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  const refresh =
    host.split("const refreshProfile = useCallback")[1]?.split(
      "const onTaskCreated",
    )[0] ?? "";
  assert.ok(refresh.includes("reloadPropertyWatches()"));
  const matchboard =
    host.split("const onMatchboardUpdated")[1]?.split(
      "const onSavedSearchUpdated",
    )[0] ?? "";
  assert.equal(matchboard.includes("reloadPropertyWatches"), false);
  assert.equal(matchboard.includes("reload()"), false);
  const savedSearch =
    host.split("const onSavedSearchUpdated")[1]?.split(
      "function startEditContact",
    )[0] ?? "";
  assert.equal(savedSearch.includes("reloadPropertyWatches"), false);
  assert.equal(savedSearch.includes("reload()"), false);
  assert.equal(savedSearch.includes("reloadTasks("), false);
  assert.equal(savedSearch.includes("reloadAppointments("), false);
}

function testPresentationParity() {
  const panel = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2EngagementPanel.tsx",
  );
  const legacy = read("src/components/agent/CustomerProfile.tsx");
  for (const copy of [
    'title="Property watches"',
    'className="flex flex-wrap gap-1.5"',
    'className="text-[13px] text-[#94a3b8]"',
    "None",
    "href={`/listing/${m.mlsNumber}`}",
    'className="rounded-md bg-[#eef2f6] px-2 py-0.5 text-[12px] font-semibold text-[#2b6cb0] hover:underline"',
  ]) {
    assert.ok(panel.includes(copy), `missing ${copy}`);
    assert.ok(legacy.includes(copy), `legacy missing ${copy}`);
  }
}

function testFailureDoesNotAffectOtherEngagement() {
  const panel = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2EngagementPanel.tsx",
  );
  assert.ok(panel.includes("propertyWatchesError"));
  assert.ok(panel.includes("EngagementMatchboard"));
  assert.ok(panel.includes("savedSearchesError"));
  assert.ok(panel.includes("savedHomesError"));
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2PropertyWatches.ts",
  );
  assert.equal(hook.includes("setData("), false);
  assert.equal(hook.includes("reloadEngagementOverview"), false);
  assert.equal(hook.includes("reloadSavedSearches"), false);
  assert.equal(hook.includes("reloadSavedHomes"), false);
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
  const fetchWatches = async () => {
    starts += 1;
    await waitMs(40);
  };
  session.request(V2_PROPERTY_WATCHES_RESOURCE_KEY, "lead-a", fetchWatches);
  session.request(V2_PROPERTY_WATCHES_RESOURCE_KEY, "lead-a", fetchWatches);
  session.request(V2_PROPERTY_WATCHES_RESOURCE_KEY, "lead-a", fetchWatches);
  assert.equal(starts, 1);
  session.request("engagement-overview", "lead-a", fetchWatches);
  session.request("saved-searches", "lead-a", fetchWatches);
  session.request("saved-homes", "lead-a", fetchWatches);
  assert.equal(session.inspect("engagement-overview").inFlight, true);
  assert.equal(session.inspect("saved-searches").inFlight, true);
  assert.equal(session.inspect("saved-homes").inFlight, true);
  assert.equal(session.inspect(V2_PROPERTY_WATCHES_RESOURCE_KEY).inFlight, true);
  await waitUntil(
    () =>
      !session.inspect(V2_PROPERTY_WATCHES_RESOURCE_KEY).inFlight &&
      !session.inspect("engagement-overview").inFlight &&
      !session.inspect("saved-searches").inFlight &&
      !session.inspect("saved-homes").inFlight,
  );
}

async function testAbortOnLeadChange() {
  const session = createLeadProfileV2Session();
  const signals: AbortSignal[] = [];
  const fetchWatches = async (_leadId: string, signal: AbortSignal) => {
    signals.push(signal);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 200);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
      });
    });
  };
  session.request(V2_PROPERTY_WATCHES_RESOURCE_KEY, "lead-a", fetchWatches);
  session.request(V2_PROPERTY_WATCHES_RESOURCE_KEY, "lead-b", fetchWatches);
  assert.equal(signals[0]?.aborted, true);
  await waitUntil(
    () => !session.inspect(V2_PROPERTY_WATCHES_RESOURCE_KEY).inFlight,
  );
}

async function main() {
  testLegacyUntouchedByV2Imports();
  testForeignWorkspaceWatchesUnavailable();
  testExplicitSelectsAndBound();
  testNoUnrelatedEngagementQueries();
  testLazyLoad();
  testStaleResponsesDiscarded();
  testAbortIsNotAnError();
  testNoRetry();
  testMutationsIndependentlyAuthorized();
  testTargetedRefresh();
  testPresentationParity();
  testFailureDoesNotAffectOtherEngagement();
  await testDuplicateRequestsPrevented();
  await testAbortOnLeadChange();
  console.log("lead-profile-v2-property-watches-selftest: ok");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
