/**
 * Launch-safe Lead Profile GET split: slim first-paint + authorized activity.
 * Run: pnpm lead-profile-summary-memory:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LEAD_PROFILE_EMAIL_LOG_SELECT } from "../src/lib/agent/customer-timeline";
import {
  DEFAULT_ACTIVITY_FILTER_IDS,
  isDefaultActivityFilters,
} from "../src/lib/agent/activity-filters";
import {
  createLeadProfileActivityGate,
  isAbortError,
} from "../src/lib/agent/lead-profile-activity-gate";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function countOccurrences(haystack: string, needle: string) {
  return haystack.split(needle).length - 1;
}

function sliceFn(src: string, start: string, end: string) {
  const from = src.indexOf(start);
  assert.ok(from >= 0, `missing ${start}`);
  const to = src.indexOf(end, from + start.length);
  assert.ok(to > from, `missing terminator ${end}`);
  return src.slice(from, to);
}

function testEmailSelectOmitsHtmlBody() {
  const select = LEAD_PROFILE_EMAIL_LOG_SELECT as Record<string, boolean>;
  assert.equal(select.htmlBody, undefined);
  assert.equal(select.body, true);
  assert.equal(select.subject, true);
  assert.equal(select.id, true);

  const summary = read("src/lib/agent/lead-summary.ts");
  const timeline = read("src/lib/agent/customer-timeline.ts");
  const summaryRoute = read("src/app/api/agent/leads/[id]/summary/route.ts");
  const activityRoute = read("src/app/api/agent/leads/[id]/activity/route.ts");

  assert.equal(summary.includes("htmlBody"), false);
  assert.equal(summaryRoute.includes("htmlBody"), false);
  assert.equal(activityRoute.includes("htmlBody"), false);

  const timelineFn = timeline.slice(
    timeline.indexOf("export async function loadCustomerTimeline"),
  );
  assert.equal(timelineFn.includes("htmlBody"), false);
  assert.equal(timelineFn.includes("prisma.leadEmailLog"), false);

  const preview = read("src/app/api/agent/emails/[id]/route.ts");
  assert.ok(
    preview.includes("htmlBody: true"),
    "dedicated email preview must still select htmlBody",
  );
}

function testFirstPaintCannotInvokeHeavyLoaders() {
  const summary = read("src/lib/agent/lead-summary.ts");
  const shellFn = sliceFn(
    summary,
    "export async function loadLeadSummary",
    "async function loadDomainCollections",
  );

  assert.equal(shellFn.includes("loadCustomerTimeline"), false);
  assert.equal(shellFn.includes("computeHotness"), false);
  assert.equal(shellFn.includes("loadBuyerIntent"), false);
  assert.equal(shellFn.includes("leadEmailLog"), false);
  assert.equal(shellFn.includes("LEAD_PROFILE_EMAIL_LOG_SELECT"), false);
  assert.equal(shellFn.includes("activityEvent"), false);
  assert.equal(shellFn.includes("listingView"), false);
  assert.equal(shellFn.includes("loadDomainCollections"), false);
  assert.ok(shellFn.includes("select:"));
  assert.equal(shellFn.includes("include:"), false);
  assert.ok(shellFn.includes("canAccessLead(ctx, lead)"));

  const prismaCalls = countOccurrences(shellFn, "prisma.");
  assert.ok(
    prismaCalls <= 2,
    `first-paint prisma calls must be ≤2 (lead + optional savedSearch), got ${prismaCalls}`,
  );
  assert.ok(shellFn.includes("prisma.lead.findUnique"));
  assert.ok(shellFn.includes("prisma.savedSearch.findFirst"));
  assert.ok(shellFn.includes("canAssignLeads ? listAssignableCrmAgents"));
}

function testNoDuplicateCollectionHydration() {
  const summary = read("src/lib/agent/lead-summary.ts");
  const timeline = read("src/lib/agent/customer-timeline.ts");
  const activityFn = sliceFn(
    summary,
    "export async function loadLeadProfileActivity",
    "nextReminder: openTasks[0]",
  );

  assert.equal(countOccurrences(activityFn, "prisma.leadEmailLog.findMany"), 1);
  assert.equal(countOccurrences(activityFn, "prisma.leadNote.findMany"), 1);
  assert.equal(countOccurrences(activityFn, "prisma.agentTask.findMany"), 1);
  assert.equal(countOccurrences(activityFn, "prisma.appointment.findMany"), 1);
  assert.ok(activityFn.includes("LEAD_PROFILE_EMAIL_LOG_SELECT"));
  assert.ok(activityFn.includes("domainCollections: domain"));
  assert.ok(activityFn.includes("await loadCustomerTimeline"));
  assert.ok(
    activityFn.indexOf("await loadCustomerTimeline") <
      activityFn.indexOf("await computeHotness"),
  );
  assert.ok(
    activityFn.indexOf("await computeHotness") <
      activityFn.indexOf("await loadBuyerIntent"),
  );

  const timelineFn = timeline.slice(
    timeline.indexOf("export async function loadCustomerTimeline"),
  );
  assert.equal(timelineFn.includes("prisma.leadEmailLog.findMany"), false);
  assert.equal(timelineFn.includes("prisma.leadNote.findMany"), false);
  assert.ok(timelineFn.includes("input.collections.emails"));
  assert.ok(timelineFn.includes("domainCollections"));
  assert.ok(timelineFn.includes("TIMELINE_ACTIVITY_EVENT_SELECT"));
}

function testSummaryAndActivitySkipSeatSync() {
  const helper = read("src/lib/http/agent-lead-get.ts");
  const activityRoute = read("src/app/api/agent/leads/[id]/activity/route.ts");
  const agent = read("src/lib/agent.ts");
  const brokerage = read("src/lib/agent/brokerage.ts");

  assert.ok(helper.includes("sideEffects: false"));
  assert.ok(helper.includes("requireAgentContextFromRequest(request"));
  assert.equal(helper.includes("healAgentSeatFlags"), false);
  assert.ok(helper.includes("if (status !== 200)"));
  assert.ok(
    helper.indexOf("if (status !== 200)") < helper.indexOf("jsonByteLength(body)"),
  );

  assert.ok(activityRoute.includes("sideEffects: false"));
  assert.ok(activityRoute.includes("requireAgentContextFromRequest(request"));
  assert.equal(activityRoute.includes("healAgentSeatFlags"), false);

  const ensureFn = brokerage.slice(
    brokerage.indexOf("export const ensureBrokerageOrganization"),
    brokerage.indexOf("export const listTeamAgents"),
  );
  assert.ok(ensureFn.includes("syncSeats: boolean = false"));
  assert.ok(ensureFn.includes("if (!syncSeats)"));

  assert.ok(agent.includes("buildLegacyAgentContext(user, false)"));
  assert.ok(agent.includes("options?.sideEffects === true"));
  assert.equal(agent.includes("options?.sideEffects !== false"), false);
  assert.equal(agent.includes("buildLegacyAgentContext(user, true)"), false);
  assert.equal(agent.includes("prisma.agentProfile.upsert"), false);

  const syncFn = brokerage.slice(
    brokerage.indexOf("async function syncBrokerageSeats"),
    brokerage.indexOf("export const ensureBrokerageOrganization"),
  );
  assert.equal(syncFn.includes(".upsert("), false);
  assert.ok(syncFn.includes("ensureOrganizationMembership"));

  const hostnameFn = agent.slice(
    agent.indexOf("async function buildHostnameBoundAgentContext"),
    agent.indexOf("export async function requireAgentContextForRequest"),
  );
  assert.ok(hostnameFn.includes("ensureBrokerageOrganization(allowSideEffects)"));
}

function testNoHttpTransactionOnReads() {
  const summary = read("src/lib/agent/lead-summary.ts");
  const timeline = read("src/lib/agent/customer-timeline.ts");
  const snapshot = read("src/lib/agent/lead-profile-snapshot.ts");
  const paged = read("src/lib/agent/lead-profile-timeline.ts");
  const helper = read("src/lib/http/agent-lead-get.ts");

  for (const [name, src] of [
    ["lead-summary", summary],
    ["customer-timeline", timeline],
    ["snapshot", snapshot],
    ["paged-timeline", paged],
    ["lead-get-helper", helper],
  ] as const) {
    assert.equal(src.includes("$transaction"), false, `${name} must not $transaction`);
    assert.equal(src.includes(".upsert("), false, `${name} must not upsert`);
  }
}

function testAuthorizationIntact() {
  const summary = read("src/lib/agent/lead-summary.ts");
  const agent = read("src/lib/agent.ts");
  const helper = read("src/lib/http/agent-lead-get.ts");
  const activityRoute = read("src/app/api/agent/leads/[id]/activity/route.ts");

  assert.equal(countOccurrences(summary, "canAccessLead(ctx, lead)"), 3);
  assert.ok(agent.includes("requireAgentUser()"));
  assert.ok(agent.includes("tryTenantStaffContext(request, user)"));
  assert.ok(agent.includes("isAgentRole"));
  assert.ok(helper.includes('return reply(401, { error: "Unauthorized" })'));
  assert.ok(helper.includes('return reply(404, { error: "Not found" })'));
  assert.ok(activityRoute.includes('return reply(401, { error: "Unauthorized" })'));
  assert.ok(activityRoute.includes('return reply(404, { error: "Not found" })'));

  for (const rel of [
    "src/app/api/agent/leads/[id]/summary/route.ts",
    "src/app/api/agent/leads/[id]/timeline/route.ts",
    "src/app/api/agent/leads/[id]/tasks/route.ts",
    "src/app/api/agent/leads/[id]/appointments/route.ts",
    "src/app/api/agent/leads/[id]/emails/route.ts",
    "src/app/api/agent/leads/[id]/engagement/route.ts",
  ]) {
    const src = read(rel);
    assert.equal(
      src.includes("params.params"),
      false,
      `${rel} must pass Next params Promise, not params.params`,
    );
  }
}

function testResponseContractKeys() {
  const summary = read("src/lib/agent/lead-summary.ts");
  const typeBlock = summary.slice(
    summary.indexOf("export type LeadProfileShell"),
    summary.indexOf("const EMPTY_DOMAIN"),
  );
  for (const key of [
    "lead:",
    "hot:",
    "stats:",
    "permissions:",
    "teamMembers:",
    "timeline:",
    "tasks:",
    "appointments:",
    "emails:",
    "notes:",
    "buyerIntent:",
    "export type LeadSummary = LeadProfileShell & LeadProfileActivity",
  ]) {
    assert.ok(typeBlock.includes(key), `contract must keep ${key}`);
  }

  const emailsType = typeBlock.slice(
    typeBlock.indexOf("emails: Array"),
    typeBlock.indexOf("notes: Array"),
  );
  assert.ok(emailsType.includes("body: string"));
  assert.equal(emailsType.includes("htmlBody"), false);
}

function testClientSplitAndNoRetry() {
  const profile = read("src/components/agent/CustomerProfile.tsx");
  const snapshot = read("src/lib/agent/lead-profile-snapshot.ts");
  const paged = read("src/lib/agent/lead-profile-timeline.ts");
  const helpers = profile.slice(
    profile.indexOf("async function fetchLeadJson"),
    profile.indexOf("export function CustomerProfile"),
  );
  assert.ok(helpers.includes("fetchLeadJson"));
  assert.ok(helpers.includes("readJsonResponse"));
  assert.equal(helpers.includes("res.json()"), false);
  assert.equal(helpers.includes("retries"), false);
  assert.equal(helpers.includes("for (let attempt"), false);
  assert.ok(profile.includes("/api/agent/leads/${targetLeadId}/summary"));
  assert.equal(profile.includes("/api/agent/leads/${leadId}/activity"), false);
  assert.ok(profile.includes("/api/agent/leads/${leadId}/timeline"));
  assert.ok(profile.includes("/api/agent/leads/${leadId}/tasks"));
  assert.ok(profile.includes("/api/agent/leads/${leadId}/appointments"));
  assert.ok(profile.includes("/api/agent/leads/${leadId}/emails"));
  assert.ok(profile.includes("/api/agent/leads/${leadId}/engagement"));
  assert.ok(profile.includes('useState<TabId>("activity")'));
  assert.ok(profile.includes("Load more"));
  assert.ok(profile.includes("View all"));
  assert.ok(snapshot.includes("buyerIntentFromSavedSearches"));
  assert.equal(snapshot.includes("loadBuyerIntent("), false);
  assert.equal(snapshot.includes("loadLeadProfileActivity"), false);
  assert.ok(paged.includes("LEAD_PROFILE_EMAIL_LIST_SELECT"));
  assert.equal(paged.includes("htmlBody"), false);
  assert.ok(paged.includes("FIRST_PAINT_TIMELINE_DAYS = 4"));
  assert.ok(paged.includes("TIMELINE_PAGE_SIZE = 40"));

  // Webpack client bundles cannot import prisma / pg. Filter helpers stay in
  // activity-filters.ts. Type-only imports from server modules are OK.
  assert.equal(profile.includes('from "@/lib/agent/lead-profile-timeline"'), false);
  assert.equal(profile.includes('from "@/lib/prisma"'), false);
  assert.equal(profile.includes('from "@/lib/agent/lead-summary"'), false);
  for (const specifier of [
    "@/lib/agent/lead-profile-snapshot",
    "@/lib/agent/lead-profile-panels",
    "@/lib/agent/customer-timeline",
  ]) {
    const from = `from "${specifier}"`;
    let fromIdx = profile.indexOf(from);
    while (fromIdx >= 0) {
      const importIdx = profile.lastIndexOf("import", fromIdx);
      assert.ok(importIdx >= 0, `missing import for ${specifier}`);
      const statement = profile.slice(importIdx, fromIdx);
      assert.ok(
        /^\s*import type\b/.test(statement),
        `CustomerProfile must type-only import ${specifier}`,
      );
      fromIdx = profile.indexOf(from, fromIdx + from.length);
    }
  }
  assert.ok(profile.includes('from "@/lib/agent/activity-filters"'));
  assert.ok(profile.includes("isDefaultActivityFilters"));
  assert.equal(isDefaultActivityFilters(DEFAULT_ACTIVITY_FILTER_IDS), true);
  assert.equal(isDefaultActivityFilters(new Set(DEFAULT_ACTIVITY_FILTER_IDS)), true);
  assert.equal(isDefaultActivityFilters(["calls"]), false);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(predicate: () => boolean, timeoutMs = 1000) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("timed out waiting for condition");
    }
    await wait(5);
  }
}

function abortError() {
  return Object.assign(new Error("Aborted"), { name: "AbortError" });
}

function testAbortIsNotFailedToLoadSource() {
  const profile = read("src/components/agent/CustomerProfile.tsx");
  const gate = read("src/lib/agent/lead-profile-activity-gate.ts");
  const helper = profile.slice(
    profile.indexOf("async function fetchLeadJson"),
    profile.indexOf("export function CustomerProfile"),
  );
  const apply = profile.slice(
    profile.indexOf("const applySnapshot = useCallback"),
    profile.indexOf("const reload = useCallback"),
  );
  const effect = profile.slice(
    profile.indexOf("useEffect(() => {"),
    profile.indexOf("const onUpdated = useCallback"),
  );

  assert.ok(profile.includes("createLeadProfileActivityGate()"));
  assert.ok(effect.includes("snapshotGate.abortActive()"));
  assert.ok(gate.includes("if (inFlight)"));
  assert.ok(gate.includes("trailing = true"));
  assert.equal(gate.includes("setTimeout"), false);
  assert.equal(gate.includes("retries"), false);
  assert.equal(profile.includes("for (let attempt"), false);
  assert.equal(profile.includes("retries"), false);

  assert.ok(helper.includes("if (isAbortError(error) || signal?.aborted)"));
  assert.ok(helper.includes("throw error"));
  const abortCatch = helper.slice(
    helper.indexOf("catch (error)"),
    helper.indexOf("throw new Error(\"Failed to load\")"),
  );
  assert.ok(abortCatch.includes("throw error"));
  assert.equal(abortCatch.includes("Failed to load"), false);

  assert.ok(apply.includes("if (signal.aborted || targetLeadId !== leadIdRef.current) return;"));
}

async function testActivityGateMaxOneInFlightAndCoalesce() {
  const gate = createLeadProfileActivityGate();
  let concurrent = 0;
  let maxConcurrent = 0;
  let starts = 0;
  const fetchActivity = async () => {
    starts += 1;
    concurrent += 1;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    await wait(40);
    concurrent -= 1;
  };

  gate.request("lead-a", fetchActivity);
  gate.request("lead-a", fetchActivity);
  gate.request("lead-a", fetchActivity);
  gate.request("lead-a", fetchActivity);
  assert.equal(starts, 1, "must not start a second /activity while one is in flight");
  assert.equal(gate.inFlight, true);
  assert.equal(gate.trailing, true);

  await waitUntil(() => !gate.inFlight && !gate.trailing);
  assert.equal(maxConcurrent, 1, "max one /activity request in flight");
  assert.equal(starts, 2, "repeated refreshes must coalesce into one trailing run");
}

async function testActivityGateAbortUnmountAndLeadChange() {
  const gate = createLeadProfileActivityGate();
  const signals: AbortSignal[] = [];
  let starts = 0;
  let failedToLoad = false;
  const fetchActivity = async (_leadId: string, signal: AbortSignal) => {
    starts += 1;
    signals.push(signal);
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 200);
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(abortError());
        });
      });
    } catch (error) {
      if (isAbortError(error) || signal.aborted) return;
      failedToLoad = true;
    }
  };

  gate.request("lead-a", fetchActivity);
  gate.request("lead-a", fetchActivity);
  assert.equal(starts, 1);
  assert.equal(gate.trailing, true);
  gate.abortActive();
  assert.equal(gate.inFlight, false);
  assert.equal(gate.trailing, false);
  assert.equal(signals[0]?.aborted, true);

  await wait(20);
  assert.equal(starts, 1, "unmount abort must not start a retry");
  assert.equal(failedToLoad, false, "aborted request is not Failed to load");

  gate.request("lead-b", fetchActivity);
  assert.equal(starts, 2);
  assert.equal(signals[0]?.aborted, true);
  assert.equal(signals[1]?.aborted, false);

  await waitUntil(() => !gate.inFlight);
  assert.equal(starts, 2, "lead change must not retry the aborted request");
  assert.equal(failedToLoad, false);
}

async function testAbortedApplyDoesNotFlagFailedToLoad() {
  let activityError = false;
  const controller = new AbortController();
  const applyActivity = async (_leadId: string, nextSignal: AbortSignal) => {
    try {
      await new Promise<void>((_resolve, reject) => {
        nextSignal.addEventListener("abort", () => {
          reject(abortError());
        });
      });
    } catch (error) {
      if (isAbortError(error) || nextSignal.aborted) return;
      activityError = true;
    }
  };

  const pending = applyActivity("lead-a", controller.signal);
  controller.abort();
  await pending;
  assert.equal(activityError, false);
}

async function main() {
  testEmailSelectOmitsHtmlBody();
  testFirstPaintCannotInvokeHeavyLoaders();
  testNoDuplicateCollectionHydration();
  testSummaryAndActivitySkipSeatSync();
  testNoHttpTransactionOnReads();
  testAuthorizationIntact();
  testResponseContractKeys();
  testClientSplitAndNoRetry();
  testAbortIsNotFailedToLoadSource();
  await testActivityGateMaxOneInFlightAndCoalesce();
  await testActivityGateAbortUnmountAndLeadChange();
  await testAbortedApplyDoesNotFlagFailedToLoad();
  console.log("lead-profile-summary-memory-selftest: ok");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
