/**
 * Lead Profile V2 rail counts / hotness selftest.
 * Run: node --import tsx scripts/lead-profile-v2-rail-selftest.ts
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
import { V2_RAIL_ACCESS_SELECT } from "../src/lib/agent/lead-profile-v2/load-rail";
import {
  V2_RAIL_RESOURCE_KEY,
  V2_RAIL_VIEW_GROUP_TAKE,
  canApplyV2RailResponse,
} from "../src/lib/agent/lead-profile-v2/rail-query";
import {
  HOT_VIEW_WINDOW_MS,
  ONLINE_MS,
  hotnessFromSignals,
} from "../src/lib/agent/hotness";
import { V2_ENGAGEMENT_VIEWS_WINDOW_MS } from "../src/lib/agent/lead-profile-v2/engagement-overview-query";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const LEGACY_FILES = [
  "src/components/agent/CustomerProfile.tsx",
  "src/components/agent/LeadQueryPopup.tsx",
  "src/app/api/agent/leads/[id]/summary/route.ts",
  "src/lib/agent/lead-profile-snapshot.ts",
  "src/lib/agent/lead-summary.ts",
  "src/lib/agent/hotness.ts",
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

function testForeignWorkspaceRailUnavailable() {
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
    const loader = read("src/lib/agent/lead-profile-v2/load-rail.ts");
    const accessCheck = "if (!lead || !v2CanAccessLead(ctx, lead)) return null";
    assert.ok(loader.includes(accessCheck));
    assert.ok(
      loader.indexOf(accessCheck) < loader.indexOf("prisma.savedListing.count"),
    );
    const route = read("src/app/api/agent/leads-v2/[id]/rail/route.ts");
    assert.ok(route.includes("handleAgentLeadGet"));
    assert.equal(route.includes("/summary"), false);
    assert.equal(route.includes("searchParams.get(\"workspace"), false);
    assert.equal(route.includes("export async function POST"), false);
  } finally {
    if (prevRead === undefined) delete process.env.WORKSPACE_READ_SCOPE;
    else process.env.WORKSPACE_READ_SCOPE = prevRead;
    if (prevDomain === undefined) delete process.env.TENANT_DOMAIN_SCOPE;
    else process.env.TENANT_DOMAIN_SCOPE = prevDomain;
  }
}

function testExplicitSelectsAndBounds() {
  const access = V2_RAIL_ACCESS_SELECT as Record<string, unknown>;
  assert.deepEqual(Object.keys(access).sort(), [
    "assignedAgentId",
    "createdAt",
    "customerId",
    "firstRespondedAt",
    "id",
    "organizationId",
    "score",
    "status",
    "workspaceId",
  ]);
  assert.equal(V2_RAIL_VIEW_GROUP_TAKE, 40);
  assert.equal(HOT_VIEW_WINDOW_MS, 24 * 60 * 60 * 1000);
  assert.equal(V2_ENGAGEMENT_VIEWS_WINDOW_MS, HOT_VIEW_WINDOW_MS);
  const loader = read("src/lib/agent/lead-profile-v2/load-rail.ts");
  assert.ok(loader.includes("prisma.savedListing.count"));
  assert.ok(loader.includes("prisma.savedSearch.count"));
  assert.ok(loader.includes("prisma.listingView.count"));
  assert.ok(loader.includes("prisma.listingView.groupBy"));
  assert.ok(loader.includes("prisma.leadEmailLog.count"));
  assert.ok(loader.includes("prisma.customerAlert.count"));
  assert.equal(
    loader.split("prisma.savedListing.count").length - 1,
    1,
  );
  assert.equal(loader.split("prisma.listingView.count").length - 1, 1);
  assert.equal(loader.split("prisma.leadEmailLog.count").length - 1, 1);
  assert.equal(loader.split("prisma.customerAlert.count").length - 1, 1);
  assert.ok(loader.includes("take: V2_RAIL_VIEW_GROUP_TAKE"));
  assert.ok(loader.includes("prisma.activityEvent.findFirst"));
  assert.ok(loader.includes("prisma.siteVisitor.findFirst"));
  assert.ok(loader.includes("select: { createdAt: true }"));
  assert.ok(loader.includes("select: { lastSeenAt: true }"));
  const snapshot = read("src/lib/agent/lead-profile-snapshot.ts");
  assert.ok(snapshot.includes("take: 40"));
  assert.ok(snapshot.includes("hotnessFromSignals"));
}

function testNoLargeHydration() {
  const loader = read("src/lib/agent/lead-profile-v2/load-rail.ts");
  for (const banned of [
    "htmlBody",
    "html",
    "payload",
    "meta",
    "prisma.listing.findMany",
    "prisma.listing.findUnique",
    "media",
    "loadBuyerIntent",
    "loadPagedLeadTimeline",
    "prisma.leadEmailLog.findMany",
    "prisma.customerAlert.findMany",
    "prisma.agentTask",
    "prisma.listingNote",
    "prisma.viewingTour",
    "prisma.appointment",
    "Looking for",
    "nextReminder",
    "/summary",
  ]) {
    assert.equal(loader.includes(banned), false, `must not query ${banned}`);
  }
}

function testHotnessParity() {
  const now = new Date();
  const hotness = hotnessFromSignals(
    {
      leadId: "lead-a",
      customerId: "cust-a",
      status: "NEW_LEAD",
      score: 10,
      createdAt: now,
      firstRespondedAt: null,
    },
    {
      views24h: 10,
      distinctListings24h: 3,
      lastSeenAt: now,
    },
  );
  assert.equal(ONLINE_MS, 3 * 60 * 1000);
  assert.equal(hotness.views24h, 10);
  assert.equal(hotness.distinctListings24h, 3);
  assert.equal(hotness.isOnline, true);
  assert.equal(hotness.binge, true);
  assert.equal(
    hotness.hotness,
    Math.round(10 + Math.min(40, 10 * 3) + Math.min(30, 3 * 8) + 25 + 20 + 15),
  );
  const loader = read("src/lib/agent/lead-profile-v2/load-rail.ts");
  assert.ok(loader.includes("hotnessFromSignals"));
  assert.equal(loader.includes("let hotness ="), false);
  const types = read("src/lib/agent/lead-profile-v2/types.ts");
  const dto =
    types.split("export type LeadProfileV2RailHot ")[1]?.split(
      "export type LeadProfileV2RailPanel",
    )[0] ?? "";
  assert.ok(dto.includes("hotness: number"));
  assert.ok(dto.includes("views24h: number"));
  assert.ok(dto.includes("distinctListings24h: number"));
  assert.ok(dto.includes("isOnline: boolean"));
  assert.ok(dto.includes("binge: boolean"));
  assert.ok(dto.includes("lastSeenAt: string | null"));
  assert.ok(dto.includes("slaHoursOpen: number | null"));
}

function testLazyLoadAfterShell() {
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2Rail.ts",
  );
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  assert.ok(hook.includes("if (!enabled)"));
  assert.ok(hook.includes("session.abort(V2_RAIL_RESOURCE_KEY)"));
  assert.ok(host.includes("useLeadProfileV2Rail("));
  assert.ok(host.includes("data != null && data.lead.id === leadId"));
  assert.ok(host.includes("reloadRail()"));
}

function testStaleResponsesDiscarded() {
  assert.equal(
    canApplyV2RailResponse({
      stamp: { leadId: "lead-a", epoch: 1 },
      current: { leadId: "lead-b", epoch: 1 },
    }),
    false,
  );
  assert.equal(
    canApplyV2RailResponse({
      stamp: { leadId: "lead-a", epoch: 1 },
      current: { leadId: "lead-a", epoch: 2 },
    }),
    false,
  );
  assert.equal(
    canApplyV2RailResponse({
      stamp: { leadId: "lead-a", epoch: 2 },
      current: { leadId: "lead-a", epoch: 2 },
    }),
    true,
  );
}

function testAbortIsNotAnError() {
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2Rail.ts",
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
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2Rail.ts",
  );
  for (const src of [fetchSrc, hook]) {
    assert.equal(src.includes("retries"), false);
    assert.equal(src.includes("for (let attempt"), false);
  }
}

function testPresentationParity() {
  const rail = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Rail.tsx",
  );
  const info = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2InfoPanel.tsx",
  );
  const legacy = read("src/components/agent/CustomerProfile.tsx");
  for (const copy of [
    "ONLINE",
    "BINGE · ",
    " homes",
    'className="size-4 text-[#e11d48]"',
    'className="mt-4 flex items-center justify-center gap-5 text-[#64748b]"',
    'className="inline-flex items-center gap-1 text-[12px] font-semibold"',
  ]) {
    assert.ok(rail.includes(copy), `rail missing ${copy}`);
    assert.ok(legacy.includes(copy), `legacy missing ${copy}`);
  }
  assert.ok(rail.includes("{rail.stats.saves}"));
  assert.ok(rail.includes("{rail.hot.views24h}"));
  assert.ok(rail.includes("{rail.stats.savedSearches}"));
  assert.ok(legacy.includes("{data.stats.saves}"));
  assert.ok(legacy.includes("{data.hot.views24h}"));
  assert.ok(legacy.includes("{data.stats.savedSearches}"));
  assert.ok(info.includes('label="Hotness"'));
  assert.ok(legacy.includes('label="Hotness"'));
  assert.ok(info.includes('label="Last visit"'));
  assert.ok(legacy.includes('label="Last visit"'));
  assert.ok(info.includes('label="SLA open"'));
  assert.ok(legacy.includes('label="SLA open"'));
  assert.ok(rail.includes("Looking for"));
}

function testFailureDoesNotTakeDownShell() {
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2Rail.ts",
  );
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  assert.equal(hook.includes("setData("), false);
  assert.ok(host.includes("rail={rail.panel}"));
  assert.equal(hook.includes("reloadDefaultTimeline"), false);
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
  const fetchRail = async () => {
    starts += 1;
    await waitMs(40);
  };
  session.request(V2_RAIL_RESOURCE_KEY, "lead-a", fetchRail);
  session.request(V2_RAIL_RESOURCE_KEY, "lead-a", fetchRail);
  session.request(V2_RAIL_RESOURCE_KEY, "lead-a", fetchRail);
  assert.equal(starts, 1);
  session.request("shell", "lead-a", fetchRail);
  session.request("engagement-overview", "lead-a", fetchRail);
  assert.equal(session.inspect(V2_RAIL_RESOURCE_KEY).inFlight, true);
  assert.equal(session.inspect("shell").inFlight, true);
  await waitUntil(
    () =>
      !session.inspect(V2_RAIL_RESOURCE_KEY).inFlight &&
      !session.inspect("shell").inFlight &&
      !session.inspect("engagement-overview").inFlight,
  );
}

async function testAbortOnLeadChange() {
  const session = createLeadProfileV2Session();
  const signals: AbortSignal[] = [];
  const fetchRail = async (_leadId: string, signal: AbortSignal) => {
    signals.push(signal);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 200);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
      });
    });
  };
  session.request(V2_RAIL_RESOURCE_KEY, "lead-a", fetchRail);
  session.request(V2_RAIL_RESOURCE_KEY, "lead-b", fetchRail);
  assert.equal(signals[0]?.aborted, true);
  await waitUntil(() => !session.inspect(V2_RAIL_RESOURCE_KEY).inFlight);
}

async function main() {
  testLegacyUntouchedByV2Imports();
  testForeignWorkspaceRailUnavailable();
  testExplicitSelectsAndBounds();
  testNoLargeHydration();
  testHotnessParity();
  testLazyLoadAfterShell();
  testStaleResponsesDiscarded();
  testAbortIsNotAnError();
  testNoRetry();
  testPresentationParity();
  testFailureDoesNotTakeDownShell();
  await testDuplicateRequestsPrevented();
  await testAbortOnLeadChange();
  console.log("lead-profile-v2-rail-selftest: ok");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
