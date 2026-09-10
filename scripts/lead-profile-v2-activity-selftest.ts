/**
 * Lead Profile V2 Activity tab selftest.
 * Run: node --import tsx scripts/lead-profile-v2-activity-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canAccessLead } from "../src/lib/crm-read-scope";
import {
  DEFAULT_ACTIVITY_FILTER_IDS,
  isDefaultActivityFilters,
} from "../src/lib/agent/activity-filters";
import { LEAD_PROFILE_EMAIL_LIST_SELECT } from "../src/lib/agent/customer-timeline";
import {
  FIRST_PAINT_TIMELINE_DAYS,
  TIMELINE_PAGE_SIZE,
} from "../src/lib/agent/lead-profile-timeline";
import { v2CanAccessLead } from "../src/lib/agent/lead-profile-v2/access";
import {
  createLeadProfileV2Session,
} from "../src/lib/agent/lead-profile-v2/request-gate";
import {
  V2_TIMELINE_PAGE_SIZE,
  V2_TIMELINE_RECENT_DAYS,
  V2_TIMELINE_RESOURCE_KEY,
  buildV2TimelineSearchParams,
  canApplyV2TimelineResponse,
  mergeV2TimelineRows,
  parseV2TimelineSearchParams,
  resolveV2TimelineScope,
  shouldSkipDuplicateV2TimelineAppend,
  v2ActivityFilterAction,
  v2TimelineAppendCursorKey,
} from "../src/lib/agent/lead-profile-v2/timeline-query";
import { V2_TIMELINE_ACCESS_SELECT } from "../src/lib/agent/lead-profile-v2/load-timeline";
import type { LeadProfileV2TimelineItem } from "../src/lib/agent/lead-profile-v2/types";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const LEGACY_FILES = [
  "src/components/agent/CustomerProfile.tsx",
  "src/components/agent/LeadQueryPopup.tsx",
  "src/app/api/agent/leads/[id]/summary/route.ts",
  "src/app/api/agent/leads/[id]/timeline/route.ts",
  "src/app/api/agent/leads/[id]/tasks/route.ts",
  "src/app/api/agent/leads/[id]/appointments/route.ts",
  "src/app/api/agent/leads/[id]/emails/route.ts",
  "src/app/api/agent/leads/[id]/engagement/route.ts",
  "src/app/api/agent/leads/[id]/activity/route.ts",
  "src/lib/agent/lead-summary.ts",
  "src/lib/agent/lead-profile-snapshot.ts",
  "src/lib/agent/lead-profile-timeline.ts",
  "src/lib/agent/lead-profile-panels.ts",
  "src/lib/agent/customer-timeline.ts",
  "src/lib/agent/hotness.ts",
  "src/lib/agent/buyer-intent.ts",
  "src/components/agent/ActivityFilters.tsx",
  "src/components/agent/CrmTimeline.tsx",
  "src/components/agent/EmailPreviewModal.tsx",
];

const V2_ACTIVITY_FILES = [
  "src/app/api/agent/leads-v2/[id]/timeline/route.ts",
  "src/lib/agent/lead-profile-v2/load-timeline.ts",
  "src/lib/agent/lead-profile-v2/timeline-query.ts",
  "src/components/agent/lead-profile-v2/LeadProfileV2ActivityPanel.tsx",
  "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2Timeline.ts",
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

function testRecentScopeIsFourDaysMaxForty() {
  assert.equal(V2_TIMELINE_RECENT_DAYS, 4);
  assert.equal(V2_TIMELINE_PAGE_SIZE, 40);
  assert.equal(FIRST_PAINT_TIMELINE_DAYS, 4);
  assert.equal(TIMELINE_PAGE_SIZE, 40);
  assert.equal(V2_TIMELINE_RECENT_DAYS, FIRST_PAINT_TIMELINE_DAYS);
  assert.equal(V2_TIMELINE_PAGE_SIZE, TIMELINE_PAGE_SIZE);

  const loader = read("src/lib/agent/lead-profile-timeline.ts");
  assert.ok(loader.includes("FIRST_PAINT_TIMELINE_DAYS = 4"));
  assert.ok(loader.includes("TIMELINE_PAGE_SIZE = 40"));
  assert.ok(loader.includes('input.scope === "recent"'));
  assert.ok(loader.includes("FIRST_PAINT_TIMELINE_DAYS * 24 * 60 * 60 * 1000"));
  assert.ok(loader.includes("Math.min(Math.max(input.take ?? TIMELINE_PAGE_SIZE, 1), 40)"));
  assert.ok(loader.includes("filtered.slice(0, take)"));
}

function testHistoryRemainsPaginated() {
  const parsed = parseV2TimelineSearchParams(
    new URL("https://x.local/api/agent/leads-v2/lead-1/timeline?scope=history"),
  );
  assert.equal(parsed.scope, "history");
  assert.equal(parsed.filterIds, null);
  const loader = read("src/lib/agent/lead-profile-timeline.ts");
  assert.ok(loader.includes("const take = Math.min(Math.max(input.take ?? TIMELINE_PAGE_SIZE, 1), 40)"));
  const v2Loader = read("src/lib/agent/lead-profile-v2/load-timeline.ts");
  assert.ok(v2Loader.includes("take: V2_TIMELINE_PAGE_SIZE"));
  assert.equal(v2Loader.includes("take: -1"), false);
}

function testFilteredRequestsUseHistoryScope() {
  assert.equal(resolveV2TimelineScope("recent", ["emails"]), "history");
  assert.equal(
    resolveV2TimelineScope("recent", [...DEFAULT_ACTIVITY_FILTER_IDS]),
    "recent",
  );
  const parsed = parseV2TimelineSearchParams(
    new URL(
      "https://x.local/api/agent/leads-v2/lead-1/timeline?scope=recent&filters=emails,notes",
    ),
  );
  assert.equal(parsed.scope, "history");
  assert.deepEqual(parsed.filterIds, ["emails", "notes"]);
  const action = v2ActivityFilterAction(new Set(["emails"]));
  assert.equal(action.type, "fetch-history");
}

function testRestoringDefaultsRestoresRecent() {
  const action = v2ActivityFilterAction(DEFAULT_ACTIVITY_FILTER_IDS);
  assert.equal(action.type, "restore-recent");
  assert.equal(isDefaultActivityFilters(DEFAULT_ACTIVITY_FILTER_IDS), true);
  const params = buildV2TimelineSearchParams({
    scope: "recent",
    filters: DEFAULT_ACTIVITY_FILTER_IDS,
  });
  assert.equal(params.get("scope"), "recent");
  assert.equal(params.get("filters"), null);
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2Timeline.ts",
  );
  const restoreBlock =
    hook.split('case "restore-recent"')[1]?.split('case "fetch-history"')[0] ??
    "";
  assert.ok(restoreBlock.includes("defaultRecentRef"));
  assert.ok(restoreBlock.includes('setScope("recent")'));
  assert.equal(restoreBlock.includes('scope: "history"'), false);
}

function testLoadMoreCannotDoubleFetchSameCursor() {
  const cursorKey = v2TimelineAppendCursorKey({
    leadId: "lead-a",
    scope: "recent",
    filterKey: "default",
    before: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(
    shouldSkipDuplicateV2TimelineAppend({
      inFlight: true,
      lastCursorKey: null,
      cursorKey,
    }),
    true,
  );
  assert.equal(
    shouldSkipDuplicateV2TimelineAppend({
      inFlight: false,
      lastCursorKey: cursorKey,
      cursorKey,
    }),
    true,
  );
  assert.equal(
    shouldSkipDuplicateV2TimelineAppend({
      inFlight: false,
      lastCursorKey: cursorKey,
      cursorKey: v2TimelineAppendCursorKey({
        leadId: "lead-a",
        scope: "recent",
        filterKey: "default",
        before: "2026-01-02T00:00:00.000Z",
      }),
    }),
    false,
  );
}

function testStaleResponsesCannotAppend() {
  assert.equal(
    canApplyV2TimelineResponse({
      stamp: { leadId: "lead-a", epoch: 1 },
      current: { leadId: "lead-b", epoch: 1 },
    }),
    false,
  );
  assert.equal(
    canApplyV2TimelineResponse({
      stamp: { leadId: "lead-a", epoch: 1 },
      current: { leadId: "lead-a", epoch: 2 },
    }),
    false,
  );
  assert.equal(
    canApplyV2TimelineResponse({
      stamp: { leadId: "lead-a", epoch: 3 },
      current: { leadId: "lead-a", epoch: 3 },
    }),
    true,
  );

  const prev: LeadProfileV2TimelineItem[] = [
    {
      id: "a",
      source: "lead",
      type: "NOTE",
      title: "Note",
      body: null,
      mlsNumber: null,
      path: null,
      imageUrl: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ];
  const next: LeadProfileV2TimelineItem[] = [
    prev[0]!,
    {
      id: "b",
      source: "lead",
      type: "NOTE",
      title: "Note 2",
      body: null,
      mlsNumber: null,
      path: null,
      imageUrl: null,
      createdAt: "2025-12-31T00:00:00.000Z",
    },
  ];
  const merged = mergeV2TimelineRows(prev, next, true);
  assert.deepEqual(
    merged.map((row) => row.id),
    ["a", "b"],
  );
}

function testForeignWorkspaceLeadTimelineReturnsNoData() {
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
    const loader = read("src/lib/agent/lead-profile-v2/load-timeline.ts");
    assert.ok(loader.includes("if (!lead || !v2CanAccessLead(ctx, lead)) return null"));
    const accessCheckIdx = loader.indexOf(
      "if (!lead || !v2CanAccessLead(ctx, lead)) return null",
    );
    const pageCallIdx = loader.indexOf("return loadPagedLeadTimeline");
    assert.ok(accessCheckIdx >= 0 && pageCallIdx > accessCheckIdx);
    assert.equal("htmlBody" in V2_TIMELINE_ACCESS_SELECT, false);
    assert.equal("notes" in V2_TIMELINE_ACCESS_SELECT, false);
  } finally {
    if (prevRead === undefined) delete process.env.WORKSPACE_READ_SCOPE;
    else process.env.WORKSPACE_READ_SCOPE = prevRead;
    if (prevDomain === undefined) delete process.env.TENANT_DOMAIN_SCOPE;
    else process.env.TENANT_DOMAIN_SCOPE = prevDomain;
  }
}

function testHtmlBodyIsNotSelected() {
  const emailSelect = LEAD_PROFILE_EMAIL_LIST_SELECT as Record<string, unknown>;
  assert.equal("htmlBody" in emailSelect, false);
  assert.equal("body" in emailSelect, false);
  for (const rel of [
    ...V2_ACTIVITY_FILES,
    "src/lib/agent/lead-profile-timeline.ts",
    "src/lib/agent/customer-timeline.ts",
  ]) {
    const src = read(rel);
    if (rel.endsWith("customer-timeline.ts")) {
      assert.equal(src.includes("htmlBody"), true, "comment may mention htmlBody");
      assert.ok(src.includes("never htmlBody"));
      continue;
    }
    assert.equal(
      src.includes("htmlBody"),
      false,
      `${rel} must not select htmlBody`,
    );
  }
}

function testTimelineQueriesAreBounded() {
  const loader = read("src/lib/agent/lead-profile-timeline.ts");
  const findMany = loader.match(/findMany\(/g) ?? [];
  assert.equal(findMany.length, 12, "12 bounded timeline sources");
  const takes = loader.match(/take: perSource/g) ?? [];
  assert.equal(takes.length, 12);
  assert.ok(loader.includes("const perSource = take"));
  assert.ok(loader.includes("filtered.slice(0, take)"));
  const v2 = read("src/lib/agent/lead-profile-v2/load-timeline.ts");
  assert.ok(v2.includes("take: V2_TIMELINE_PAGE_SIZE"));
  assert.equal(v2.includes("$transaction"), false);
  assert.equal(v2.includes(".upsert("), false);
}

function testNoRetries() {
  const fetchSrc = read("src/lib/agent/lead-profile-v2/fetch-json.ts");
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2Timeline.ts",
  );
  for (const src of [fetchSrc, hook]) {
    assert.equal(src.includes("retries"), false);
    assert.equal(src.includes("for (let attempt"), false);
  }
}

function testNoLegacySummaryCall() {
  for (const rel of [
    ...V2_ACTIVITY_FILES,
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  ]) {
    const src = read(rel);
    assert.equal(src.includes("/summary"), false, `${rel} must not call summary`);
    assert.equal(
      src.includes("/api/agent/leads/${"),
      false,
      `${rel} must not call Legacy lead GET routes`,
    );
  }
  const route = read("src/app/api/agent/leads-v2/[id]/timeline/route.ts");
  assert.ok(route.includes("handleAgentLeadGet"));
  assert.ok(route.includes("loadLeadProfileV2Timeline"));
  assert.ok(route.includes("parseV2TimelineSearchParams"));
  assert.equal(route.includes("findAccessibleLead"), false);
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2Timeline.ts",
  );
  assert.ok(hook.includes(V2_TIMELINE_RESOURCE_KEY) || hook.includes('"timeline"'));
  assert.ok(hook.includes("requestIfIdle"));
  assert.ok(hook.includes("isV2AbortError"));
}

function testActivityReusesPresentation() {
  const panel = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2ActivityPanel.tsx",
  );
  assert.ok(panel.includes("ActivityFilters"));
  assert.ok(panel.includes("CrmTimeline"));
  assert.ok(panel.includes("Load more"));
  assert.ok(panel.includes("View all"));
  assert.equal(panel.includes("from \"@/lib/prisma\""), false);
  assert.equal(panel.includes("lead-profile-timeline"), false);
}

function testActivityUsableIfRailFails() {
  const panel = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2ActivityPanel.tsx",
  );
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  assert.equal(panel.includes("useLeadProfileV2Rail"), false);
  assert.equal(panel.includes("rail.hot"), false);
  const activityCase =
    host.split('case "activity":')[1]?.split("case \"reminders\":")[0] ?? "";
  assert.ok(activityCase.includes("LeadProfileV2ActivityPanel"));
  assert.equal(activityCase.includes("rail.panel"), false);
  assert.equal(activityCase.includes("rail.error"), false);
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

async function testTimelineGateNoDoubleFetchOrRetry() {
  const session = createLeadProfileV2Session();
  let starts = 0;
  let concurrent = 0;
  let maxConcurrent = 0;
  const fetchTimeline = async () => {
    starts += 1;
    concurrent += 1;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    await waitMs(40);
    concurrent -= 1;
  };

  session.request(V2_TIMELINE_RESOURCE_KEY, "lead-a", fetchTimeline);
  const second = session.requestIfIdle(
    V2_TIMELINE_RESOURCE_KEY,
    "lead-a",
    fetchTimeline,
  );
  const third = session.requestIfIdle(
    V2_TIMELINE_RESOURCE_KEY,
    "lead-a",
    fetchTimeline,
  );
  assert.equal(second, false);
  assert.equal(third, false);
  assert.equal(starts, 1);
  assert.equal(session.inspect(V2_TIMELINE_RESOURCE_KEY).trailing, false);

  await waitUntil(
    () => !session.inspect(V2_TIMELINE_RESOURCE_KEY).inFlight,
  );
  assert.equal(maxConcurrent, 1);
  assert.equal(starts, 1, "Load more must not coalesce a duplicate cursor fetch");

  session.request("shell", "lead-a", fetchTimeline);
  session.request(V2_TIMELINE_RESOURCE_KEY, "lead-a", fetchTimeline);
  assert.equal(
    session.inspect("shell").inFlight &&
      session.inspect(V2_TIMELINE_RESOURCE_KEY).inFlight,
    true,
  );
  await waitUntil(
    () =>
      !session.inspect("shell").inFlight &&
      !session.inspect(V2_TIMELINE_RESOURCE_KEY).inFlight,
  );
}

async function testTimelineAbortOnLeadChange() {
  const session = createLeadProfileV2Session();
  const signals: AbortSignal[] = [];
  const fetchTimeline = async (_leadId: string, signal: AbortSignal) => {
    signals.push(signal);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 200);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
      });
    });
  };

  session.request(V2_TIMELINE_RESOURCE_KEY, "lead-a", fetchTimeline);
  session.request(V2_TIMELINE_RESOURCE_KEY, "lead-b", fetchTimeline);
  assert.equal(signals[0]?.aborted, true);
  await waitUntil(() => !session.inspect(V2_TIMELINE_RESOURCE_KEY).inFlight);
}

function testEmptyNotFinalWhileLoading() {
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2Timeline.ts",
  );
  assert.ok(hook.includes('if (busy && rows.length === 0) return "Loading…"'));
  assert.ok(hook.includes('if (error && rows.length === 0) return "Failed to load"'));
  assert.ok(hook.includes('return "No activity yet."'));
  assert.ok(
    hook.includes(
      'return "No activity matches these filters. Adjust Filters to see more."',
    ),
  );
  assert.ok(hook.includes("isV2AbortError"));
}

async function main() {
  testLegacyUntouchedByV2Imports();
  testRecentScopeIsFourDaysMaxForty();
  testHistoryRemainsPaginated();
  testFilteredRequestsUseHistoryScope();
  testRestoringDefaultsRestoresRecent();
  testLoadMoreCannotDoubleFetchSameCursor();
  testStaleResponsesCannotAppend();
  testForeignWorkspaceLeadTimelineReturnsNoData();
  testHtmlBodyIsNotSelected();
  testTimelineQueriesAreBounded();
  testNoRetries();
  testNoLegacySummaryCall();
  testActivityReusesPresentation();
  testActivityUsableIfRailFails();
  testEmptyNotFinalWhileLoading();
  await testTimelineGateNoDoubleFetchOrRetry();
  await testTimelineAbortOnLeadChange();
  console.log("lead-profile-v2-activity-selftest: ok");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
