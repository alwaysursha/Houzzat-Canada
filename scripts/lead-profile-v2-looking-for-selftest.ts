/**
 * Lead Profile V2 Looking For selftest.
 * Run: node --import tsx scripts/lead-profile-v2-looking-for-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canAccessLead } from "../src/lib/crm-read-scope";
import { v2CanAccessLead } from "../src/lib/agent/lead-profile-v2/access";
import { buyerIntentFromSavedSearches } from "../src/lib/agent/buyer-intent";
import {
  createLeadProfileV2Session,
  isV2AbortError,
} from "../src/lib/agent/lead-profile-v2/request-gate";
import {
  V2_LOOKING_FOR_ACCESS_SELECT,
  V2_LOOKING_FOR_PRIMARY_SEARCH_SELECT,
} from "../src/lib/agent/lead-profile-v2/load-looking-for";
import {
  V2_LOOKING_FOR_RESOURCE_KEY,
  canApplyV2LookingForResponse,
  selectV2LookingFor,
} from "../src/lib/agent/lead-profile-v2/looking-for-query";
import type { LeadProfileV2BuyerIntent } from "../src/lib/agent/lead-profile-v2/types";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const LEGACY_FILES = [
  "src/components/agent/CustomerProfile.tsx",
  "src/components/agent/LeadQueryPopup.tsx",
  "src/lib/agent/lead-profile-snapshot.ts",
  "src/lib/agent/lead-summary.ts",
  "src/lib/agent/buyer-intent.ts",
  "src/lib/agent/lead-profile-panels.ts",
];

function thinIntent(
  overrides: Partial<LeadProfileV2BuyerIntent> = {},
): LeadProfileV2BuyerIntent {
  return {
    summary: "thin summary",
    chips: [],
    source: "thin",
    sourceLabel: "No clear criteria yet",
    criteria: {
      cities: [],
      communities: [],
      propertyTypes: [],
      minBeds: null,
      maxBeds: null,
      minPrice: null,
      maxPrice: null,
      transactionType: null,
      searchCount: 0,
      listingViewCount: 0,
      sampleMls: [],
    },
    headline: null,
    ...overrides,
  };
}

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

function testForeignWorkspaceLookingForUnavailable() {
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
    const loader = read("src/lib/agent/lead-profile-v2/load-looking-for.ts");
    const accessCheck = "if (!lead || !v2CanAccessLead(ctx, lead)) return null";
    assert.ok(loader.includes(accessCheck));
    assert.ok(
      loader.indexOf(accessCheck) <
        loader.indexOf("prisma.savedSearch.findFirst"),
    );
    const route = read("src/app/api/agent/leads-v2/[id]/looking-for/route.ts");
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

function testBoundedFirstPaintQuery() {
  const select = V2_LOOKING_FOR_PRIMARY_SEARCH_SELECT as Record<string, unknown>;
  assert.deepEqual(Object.keys(select).sort(), ["name", "query"]);
  const access = V2_LOOKING_FOR_ACCESS_SELECT as Record<string, unknown>;
  assert.ok("customerId" in access);
  const loader = read("src/lib/agent/lead-profile-v2/load-looking-for.ts");
  assert.ok(loader.includes("prisma.savedSearch.findFirst"));
  assert.ok(loader.includes("{ isPrimary: \"desc\" }"));
  assert.ok(loader.includes("{ updatedAt: \"desc\" }"));
  assert.equal(loader.includes("isHomepageActive"), false);
  assert.ok(loader.includes("buyerIntentFromSavedSearches"));
  assert.equal(loader.includes("loadBuyerIntent("), false);
  const snapshot = read("src/lib/agent/lead-profile-snapshot.ts");
  assert.ok(snapshot.includes("buyerIntentFromSavedSearches"));
  const summary = read("src/lib/agent/lead-summary.ts");
  assert.ok(
    summary.includes("orderBy: [{ isPrimary: \"desc\" }, { updatedAt: \"desc\" }]"),
  );
}

function testNoDuplicateHeavyQueries() {
  const loader = read("src/lib/agent/lead-profile-v2/load-looking-for.ts");
  for (const banned of [
    "loadBuyerIntent",
    "prisma.listing.findMany",
    "prisma.listingView",
    "prisma.activityEvent",
    "prisma.siteVisitor",
    "htmlBody",
    "loadPagedLeadTimeline",
    "prisma.leadEmailLog",
    "prisma.customerAlert",
    "nextReminder",
  ]) {
    assert.equal(loader.includes(banned), false, `must not query ${banned}`);
  }
}

function testEmptyAndPartialCriteria() {
  const empty = buyerIntentFromSavedSearches({
    customerName: "Alex Rivera",
    savedSearches: [],
  });
  assert.equal(empty.source, "thin");
  assert.equal(empty.sourceLabel, "No clear criteria yet");
  assert.equal(empty.headline, null);
  assert.equal(empty.chips.length, 0);
  assert.ok(empty.summary.includes("Alex"));

  const txnOnly = buyerIntentFromSavedSearches({
    customerName: "Alex Rivera",
    savedSearches: [
      { name: "Lease only", query: { transactionType: "LEASE" } },
    ],
  });
  assert.equal(txnOnly.source, "thin");

  const partial = buyerIntentFromSavedSearches({
    customerName: "Alex Rivera",
    savedSearches: [
      {
        name: "Midtown",
        query: { cities: "Toronto", minBeds: 2, maxPrice: 900000 },
      },
    ],
  });
  assert.equal(partial.source, "saved");
  assert.equal(partial.sourceLabel, "Saved search");
  assert.ok(partial.headline);
  assert.ok(partial.chips.includes("Toronto"));
  assert.ok(partial.chips.includes("up to $900k"));
  assert.ok(partial.chips.includes("2+ beds"));
  assert.ok(partial.headline?.includes("Toronto"));
  assert.ok(partial.headline?.includes("2+ bed"));
  assert.ok(partial.headline?.includes("up to $900k"));

  const range = buyerIntentFromSavedSearches({
    customerName: "Alex",
    savedSearches: [
      {
        name: "Range",
        query: {
          communities: "Clarkson",
          cities: "Mississauga",
          minPrice: 800000,
          maxPrice: 1_200_000,
          propertyTypes: "DETACHED",
          transactionType: "LEASE",
        },
      },
    ],
  });
  assert.ok(range.chips.includes("Clarkson"));
  assert.ok(range.chips.includes("$800k–$1.2M"));
  assert.ok(range.chips.includes("For lease"));
}

function testConflictingSourcePrecedence() {
  const unusablePrimary = buyerIntentFromSavedSearches({
    customerName: "Alex",
    savedSearches: [
      { name: "Primary unusable", query: { transactionType: "SALE" } },
    ],
  });
  assert.equal(
    unusablePrimary.source,
    "thin",
    "first-paint receives only the primary search; txn-only is not usable",
  );

  const usableOther = buyerIntentFromSavedSearches({
    customerName: "Alex",
    savedSearches: [
      { name: "Usable later", query: { cities: "Mississauga", minBeds: 3 } },
    ],
  });
  assert.equal(usableOther.source, "saved");
  assert.ok(usableOther.chips.includes("Mississauga"));

  const usablePrimary = buyerIntentFromSavedSearches({
    customerName: "Alex",
    savedSearches: [
      { name: "Primary usable", query: { cities: "Oakville", minPrice: 800000 } },
    ],
  });
  assert.equal(usablePrimary.source, "saved");
  assert.ok(usablePrimary.chips.includes("Oakville"));

  const skippedUnusableWhenCollectionPassed = buyerIntentFromSavedSearches({
    customerName: "Alex",
    savedSearches: [
      { name: "Primary unusable", query: { transactionType: "SALE" } },
      { name: "Usable later", query: { cities: "Mississauga", minBeds: 3 } },
    ],
  });
  assert.equal(
    skippedUnusableWhenCollectionPassed.source,
    "saved",
    "the assembler skips an unusable first row if more searches are passed",
  );
  assert.ok(skippedUnusableWhenCollectionPassed.chips.includes("Mississauga"));

  const loader = read("src/lib/agent/lead-profile-v2/load-looking-for.ts");
  assert.ok(loader.includes("findFirst"));
  assert.equal(loader.includes("findMany"), false);

  const engagement = thinIntent({
    source: "inferred",
    sourceLabel: "From browsing",
    summary: "browse wins after engagement loads",
    headline: "From browsing",
  });
  assert.equal(
    selectV2LookingFor({
      engagementBuyerIntent: engagement,
      firstPaint: usablePrimary,
    }),
    engagement,
  );
  assert.equal(
    selectV2LookingFor({
      engagementBuyerIntent: null,
      firstPaint: usablePrimary,
    }),
    usablePrimary,
  );
  assert.equal(
    selectV2LookingFor({
      engagementBuyerIntent: null,
      firstPaint: null,
    }),
    null,
  );
}

function testLegacyClientPrecedence() {
  const profile = read("src/components/agent/CustomerProfile.tsx");
  assert.ok(
    profile.includes(
      "engagementPanel?.buyerIntent ?? data?.lookingFor ?? null",
    ),
  );
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  assert.ok(host.includes("selectV2LookingFor("));
  assert.ok(host.includes("engagement.panel?.buyerIntent"));
  assert.ok(host.includes("firstPaint: lookingForResource.panel"));
}

function testNoDuplicateLoadBuyerIntentOnLookingFor() {
  const overview = read(
    "src/lib/agent/lead-profile-v2/load-engagement-overview.ts",
  );
  assert.ok(overview.includes("loadBuyerIntent"));
  const looking = read("src/lib/agent/lead-profile-v2/load-looking-for.ts");
  assert.equal(looking.includes("loadBuyerIntent("), false);
}

function testPresentationParity() {
  const rail = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Rail.tsx",
  );
  const legacy = read("src/components/agent/CustomerProfile.tsx");
  for (const copy of [
    "Looking for",
    "View matching homes",
    "Shortlist & email",
    "Inquiry listing · MLS ",
    'className="mt-3 overflow-hidden rounded-xl border border-[#c7e0d4]',
    "hasUsableSearchCriteria(lookingFor.criteria)",
    "buyerIntentToSearchHref(lookingFor.criteria)",
  ]) {
    assert.ok(rail.includes(copy), `rail missing ${copy}`);
    assert.ok(legacy.includes(copy), `legacy missing ${copy}`);
  }
}

function testTargetedRefresh() {
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  const helper = read(
    "src/lib/agent/lead-profile-v2/saved-search-rail-refresh-query.ts",
  );
  const matchboard =
    host.split("const onMatchboardUpdated")[1]?.split(
      "const onSavedSearchUpdated",
    )[0] ?? "";
  assert.ok(matchboard.includes("applyV2MatchboardUpdatedRefresh"));
  assert.ok(matchboard.includes("reloadLookingFor"));
  assert.equal(matchboard.includes("reload()"), false);
  const savedSearch =
    host.split("const onSavedSearchUpdated")[1]?.split(
      "function startEditContact",
    )[0] ?? "";
  assert.ok(savedSearch.includes("applyV2SavedSearchEditorUpdatedRefresh"));
  assert.ok(savedSearch.includes("reloadLookingFor"));
  assert.equal(savedSearch.includes("reload()"), false);
  const matchFn =
    helper.split("export function applyV2MatchboardUpdatedRefresh")[1]?.split(
      "export function applyV2SavedSearchEditorUpdatedRefresh",
    )[0] ?? "";
  const editorFn =
    helper.split("export function applyV2SavedSearchEditorUpdatedRefresh")[1] ??
    "";
  assert.ok(matchFn.includes("reloadLookingFor()"));
  assert.ok(editorFn.includes("reloadLookingFor()"));
}

function testLazyLoadAfterShell() {
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2LookingFor.ts",
  );
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  assert.ok(hook.includes("if (!enabled)"));
  assert.ok(host.includes("useLeadProfileV2LookingFor("));
  assert.ok(host.includes("data != null && data.lead.id === leadId"));
}

function testStaleResponsesDiscarded() {
  assert.equal(
    canApplyV2LookingForResponse({
      stamp: { leadId: "lead-a", epoch: 1 },
      current: { leadId: "lead-b", epoch: 1 },
    }),
    false,
  );
  assert.equal(
    canApplyV2LookingForResponse({
      stamp: { leadId: "lead-a", epoch: 2 },
      current: { leadId: "lead-a", epoch: 2 },
    }),
    true,
  );
}

function testAbortIsNotAnError() {
  assert.equal(
    isV2AbortError(Object.assign(new Error("Aborted"), { name: "AbortError" })),
    true,
  );
}

function testNoRetry() {
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2LookingFor.ts",
  );
  assert.equal(hook.includes("retries"), false);
}

function testFailureDoesNotTakeDownShell() {
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2LookingFor.ts",
  );
  assert.equal(hook.includes("setData("), false);
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
  const fetchLooking = async () => {
    starts += 1;
    await waitMs(40);
  };
  session.request(V2_LOOKING_FOR_RESOURCE_KEY, "lead-a", fetchLooking);
  session.request(V2_LOOKING_FOR_RESOURCE_KEY, "lead-a", fetchLooking);
  assert.equal(starts, 1);
  session.request("engagement-overview", "lead-a", fetchLooking);
  assert.equal(session.inspect(V2_LOOKING_FOR_RESOURCE_KEY).inFlight, true);
  assert.equal(session.inspect("engagement-overview").inFlight, true);
  await waitUntil(
    () =>
      !session.inspect(V2_LOOKING_FOR_RESOURCE_KEY).inFlight &&
      !session.inspect("engagement-overview").inFlight,
  );
}

async function main() {
  testLegacyUntouchedByV2Imports();
  testForeignWorkspaceLookingForUnavailable();
  testBoundedFirstPaintQuery();
  testNoDuplicateHeavyQueries();
  testEmptyAndPartialCriteria();
  testConflictingSourcePrecedence();
  testLegacyClientPrecedence();
  testNoDuplicateLoadBuyerIntentOnLookingFor();
  testPresentationParity();
  testTargetedRefresh();
  testLazyLoadAfterShell();
  testStaleResponsesDiscarded();
  testAbortIsNotAnError();
  testNoRetry();
  testFailureDoesNotTakeDownShell();
  await testDuplicateRequestsPrevented();
  console.log("lead-profile-v2-looking-for-selftest: ok");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
