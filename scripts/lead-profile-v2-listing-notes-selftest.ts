/**
 * Lead Profile V2 Listing Notes selftest.
 * Run: node --import tsx scripts/lead-profile-v2-listing-notes-selftest.ts
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
  V2_LISTING_NOTES_ACCESS_SELECT,
  V2_LISTING_NOTE_LIST_SELECT,
} from "../src/lib/agent/lead-profile-v2/load-listing-notes";
import {
  V2_LISTING_NOTES_PREVIEW_CHARS,
  V2_LISTING_NOTES_RESOURCE_KEY,
  V2_LISTING_NOTES_TAKE,
  canApplyV2ListingNotesResponse,
} from "../src/lib/agent/lead-profile-v2/listing-notes-query";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const LEGACY_FILES = [
  "src/components/agent/CustomerProfile.tsx",
  "src/components/agent/LeadQueryPopup.tsx",
  "src/app/api/agent/leads/[id]/engagement/route.ts",
  "src/app/api/account/notes/route.ts",
  "src/app/api/account/notes/[mlsNumber]/route.ts",
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

function testForeignWorkspaceListingNotesUnavailable() {
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
    const loader = read("src/lib/agent/lead-profile-v2/load-listing-notes.ts");
    const accessCheck = "if (!lead || !v2CanAccessLead(ctx, lead)) return null";
    assert.ok(loader.includes(accessCheck));
    assert.ok(
      loader.indexOf(accessCheck) <
        loader.indexOf("prisma.listingNote.findMany"),
    );
    const route = read(
      "src/app/api/agent/leads-v2/[id]/listing-notes/route.ts",
    );
    assert.ok(route.includes("handleAgentLeadGet"));
    assert.equal(route.includes("/summary"), false);
    assert.equal(route.includes("searchParams.get(\"workspace"), false);
    assert.equal(route.includes("export async function POST"), false);
    assert.equal(route.includes("export async function PUT"), false);
    assert.equal(route.includes("export async function PATCH"), false);
    assert.equal(route.includes("export async function DELETE"), false);
  } finally {
    if (prevRead === undefined) delete process.env.WORKSPACE_READ_SCOPE;
    else process.env.WORKSPACE_READ_SCOPE = prevRead;
    if (prevDomain === undefined) delete process.env.TENANT_DOMAIN_SCOPE;
    else process.env.TENANT_DOMAIN_SCOPE = prevDomain;
  }
}

function testNoCustomerEmptyNotes() {
  const loader = read("src/lib/agent/lead-profile-v2/load-listing-notes.ts");
  assert.ok(loader.includes("if (!lead.customerId)"));
  assert.ok(loader.includes("return { listingNotes: [] }"));
}

function testExplicitSelectsAndBound() {
  const select = V2_LISTING_NOTE_LIST_SELECT as Record<string, unknown>;
  assert.deepEqual(Object.keys(select).sort(), ["body", "id", "mlsNumber"]);
  const access = V2_LISTING_NOTES_ACCESS_SELECT as Record<string, unknown>;
  assert.deepEqual(Object.keys(access).sort(), [
    "assignedAgentId",
    "customerId",
    "id",
    "organizationId",
    "workspaceId",
  ]);
  assert.equal(V2_LISTING_NOTES_TAKE, 15);
  const loader = read("src/lib/agent/lead-profile-v2/load-listing-notes.ts");
  assert.ok(loader.includes("orderBy: { updatedAt: \"desc\" }"));
  assert.ok(loader.includes("take: V2_LISTING_NOTES_TAKE"));
  const legacy = read("src/lib/agent/lead-profile-panels.ts");
  const notesQuery =
    legacy.split("prisma.listingNote.findMany({")[1]?.split(
      "prisma.viewingTour.findMany",
    )[0] ?? "";
  assert.ok(notesQuery.includes("orderBy: { updatedAt: \"desc\" }"));
  assert.ok(notesQuery.includes("take: 15"));
  assert.ok(notesQuery.includes("id: true"));
  assert.ok(notesQuery.includes("mlsNumber: true"));
  assert.ok(notesQuery.includes("body: true"));
  assert.equal(notesQuery.includes("createdAt"), false);
  assert.equal(notesQuery.includes("user:"), false);
}

function testNoListingMediaOrRemarksHydration() {
  const loader = read("src/lib/agent/lead-profile-v2/load-listing-notes.ts");
  for (const banned of [
    "prisma.listing.findMany",
    "prisma.listing.findUnique",
    "media",
    "addressLine",
    "remarks",
    "description",
    "loadBuyerIntent",
    "prisma.savedSearch",
    "prisma.savedListing",
    "prisma.propertyMonitor",
    "prisma.areaMonitor",
    "prisma.viewingTour",
    "prisma.customerAlert",
    "prisma.leadEmailLog",
    "prisma.listingView",
    "prisma.activityEvent",
    "loadPagedLeadTimeline",
    "prisma.agentTask",
    "prisma.appointment",
    "prisma.leadNote",
    "/summary",
  ]) {
    assert.equal(loader.includes(banned), false, `must not query ${banned}`);
  }
  const types = read("src/lib/agent/lead-profile-v2/types.ts");
  const dto =
    types.split("export type LeadProfileV2ListingNote ")[1]?.split(
      "export type LeadProfileV2ListingNotesPanel",
    )[0] ?? "";
  assert.ok(dto.includes("id: string"));
  assert.ok(dto.includes("mlsNumber: string"));
  assert.ok(dto.includes("body: string"));
  assert.equal(dto.includes("updatedAt"), false);
  assert.equal(dto.includes("createdAt"), false);
  assert.equal(dto.includes("author"), false);
  assert.equal(dto.includes("userId"), false);
}

function testNoteBodyHandlingMatchesLegacy() {
  assert.equal(V2_LISTING_NOTES_PREVIEW_CHARS, 120);
  const panel = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2EngagementPanel.tsx",
  );
  const legacy = read("src/components/agent/CustomerProfile.tsx");
  assert.ok(panel.includes("n.body.slice(0, 120)"));
  assert.ok(legacy.includes("n.body.slice(0, 120)"));
  const loader = read("src/lib/agent/lead-profile-v2/load-listing-notes.ts");
  assert.equal(loader.includes("slice("), false);
  const accountWrite = read("src/app/api/account/notes/[mlsNumber]/route.ts");
  assert.ok(accountWrite.includes("z.string().max(8000)"));
  const schema = read("prisma/schema.prisma");
  const listingNote =
    schema.split("model ListingNote {")[1]?.split("model PropertyMonitor")[0] ??
    "";
  assert.ok(listingNote.includes("@db.Text"));
}

function testLazyLoad() {
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2ListingNotes.ts",
  );
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  assert.ok(hook.includes("if (!enabled)"));
  assert.ok(hook.includes("session.abort(V2_LISTING_NOTES_RESOURCE_KEY)"));
  assert.ok(host.includes("useLeadProfileV2ListingNotes("));
  assert.ok(host.includes('tab === "engagement"'));
}

function testStaleResponsesDiscarded() {
  assert.equal(
    canApplyV2ListingNotesResponse({
      stamp: { leadId: "lead-a", epoch: 1 },
      current: { leadId: "lead-b", epoch: 1 },
    }),
    false,
  );
  assert.equal(
    canApplyV2ListingNotesResponse({
      stamp: { leadId: "lead-a", epoch: 1 },
      current: { leadId: "lead-a", epoch: 2 },
    }),
    false,
  );
  assert.equal(
    canApplyV2ListingNotesResponse({
      stamp: { leadId: "lead-a", epoch: 2 },
      current: { leadId: "lead-a", epoch: 2 },
    }),
    true,
  );
}

function testAbortIsNotAnError() {
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2ListingNotes.ts",
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
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2ListingNotes.ts",
  );
  for (const src of [fetchSrc, hook]) {
    assert.equal(src.includes("retries"), false);
    assert.equal(src.includes("for (let attempt"), false);
  }
}

function testReadOnlyNoV2Mutations() {
  const customerApi = read("src/app/api/account/notes/[mlsNumber]/route.ts");
  assert.ok(customerApi.includes("requireFullCustomerUser()"));
  assert.equal(customerApi.includes("canAccessLead"), false);
  const panel = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2EngagementPanel.tsx",
  );
  const section =
    panel.split('<Panel title="Customer listing notes">')[1]?.split(
      "function Panel",
    )[0] ?? "";
  assert.equal(section.includes("/api/account/notes"), false);
  assert.equal(section.includes("method: \"PUT\""), false);
  assert.equal(section.includes("method: \"POST\""), false);
  assert.equal(section.includes("method: \"DELETE\""), false);
  const v2Api = read(
    "src/app/api/agent/leads-v2/[id]/listing-notes/route.ts",
  );
  assert.equal(v2Api.includes("export async function POST"), false);
  assert.equal(v2Api.includes("export async function PUT"), false);
  assert.equal(v2Api.includes("export async function PATCH"), false);
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
  assert.ok(refresh.includes("reloadListingNotes()"));
  const matchboard =
    host.split("const onMatchboardUpdated")[1]?.split(
      "const onSavedSearchUpdated",
    )[0] ?? "";
  assert.equal(matchboard.includes("reloadListingNotes"), false);
  assert.equal(matchboard.includes("reload()"), false);
  const savedSearch =
    host.split("const onSavedSearchUpdated")[1]?.split(
      "function startEditContact",
    )[0] ?? "";
  assert.equal(savedSearch.includes("reloadListingNotes"), false);
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
    'title="Customer listing notes"',
    "None",
    'className="space-y-1"',
    'className="text-[12px] text-[#475569]"',
    "href={`/listing/${n.mlsNumber}`}",
    'className="font-semibold text-[#2b6cb0] hover:underline"',
    "n.body.slice(0, 120)",
  ]) {
    assert.ok(panel.includes(copy), `missing ${copy}`);
    assert.ok(legacy.includes(copy), `legacy missing ${copy}`);
  }
}

function testFailureDoesNotAffectOtherEngagement() {
  const panel = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2EngagementPanel.tsx",
  );
  assert.ok(panel.includes("listingNotesError"));
  assert.ok(panel.includes("EngagementMatchboard"));
  assert.ok(panel.includes("savedSearchesError"));
  assert.ok(panel.includes("savedHomesError"));
  assert.ok(panel.includes("propertyWatchesError"));
  assert.ok(panel.includes("areaMonitorsError"));
  assert.ok(panel.includes("routePlannerError"));
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2ListingNotes.ts",
  );
  assert.equal(hook.includes("setData("), false);
  assert.equal(hook.includes("reloadEngagementOverview"), false);
  assert.equal(hook.includes("reloadSavedSearches"), false);
  assert.equal(hook.includes("reloadSavedHomes"), false);
  assert.equal(hook.includes("reloadPropertyWatches"), false);
  assert.equal(hook.includes("reloadAreaMonitors"), false);
  assert.equal(hook.includes("reloadRoutePlanner"), false);
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
  const fetchNotes = async () => {
    starts += 1;
    await waitMs(40);
  };
  session.request(V2_LISTING_NOTES_RESOURCE_KEY, "lead-a", fetchNotes);
  session.request(V2_LISTING_NOTES_RESOURCE_KEY, "lead-a", fetchNotes);
  session.request(V2_LISTING_NOTES_RESOURCE_KEY, "lead-a", fetchNotes);
  assert.equal(starts, 1);
  session.request("engagement-overview", "lead-a", fetchNotes);
  session.request("saved-searches", "lead-a", fetchNotes);
  session.request("saved-homes", "lead-a", fetchNotes);
  session.request("property-watches", "lead-a", fetchNotes);
  session.request("area-monitors", "lead-a", fetchNotes);
  session.request("route-planner", "lead-a", fetchNotes);
  assert.equal(session.inspect(V2_LISTING_NOTES_RESOURCE_KEY).inFlight, true);
  assert.equal(session.inspect("engagement-overview").inFlight, true);
  await waitUntil(
    () =>
      !session.inspect(V2_LISTING_NOTES_RESOURCE_KEY).inFlight &&
      !session.inspect("engagement-overview").inFlight &&
      !session.inspect("saved-searches").inFlight &&
      !session.inspect("saved-homes").inFlight &&
      !session.inspect("property-watches").inFlight &&
      !session.inspect("area-monitors").inFlight &&
      !session.inspect("route-planner").inFlight,
  );
}

async function testAbortOnLeadChange() {
  const session = createLeadProfileV2Session();
  const signals: AbortSignal[] = [];
  const fetchNotes = async (_leadId: string, signal: AbortSignal) => {
    signals.push(signal);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 200);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
      });
    });
  };
  session.request(V2_LISTING_NOTES_RESOURCE_KEY, "lead-a", fetchNotes);
  session.request(V2_LISTING_NOTES_RESOURCE_KEY, "lead-b", fetchNotes);
  assert.equal(signals[0]?.aborted, true);
  await waitUntil(
    () => !session.inspect(V2_LISTING_NOTES_RESOURCE_KEY).inFlight,
  );
}

async function main() {
  testLegacyUntouchedByV2Imports();
  testForeignWorkspaceListingNotesUnavailable();
  testNoCustomerEmptyNotes();
  testExplicitSelectsAndBound();
  testNoListingMediaOrRemarksHydration();
  testNoteBodyHandlingMatchesLegacy();
  testLazyLoad();
  testStaleResponsesDiscarded();
  testAbortIsNotAnError();
  testNoRetry();
  testReadOnlyNoV2Mutations();
  testTargetedRefresh();
  testPresentationParity();
  testFailureDoesNotAffectOtherEngagement();
  await testDuplicateRequestsPrevented();
  await testAbortOnLeadChange();
  console.log("lead-profile-v2-listing-notes-selftest: ok");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
