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
  const summaryRoute = read("src/app/api/agent/leads/[id]/summary/route.ts");
  const activityRoute = read("src/app/api/agent/leads/[id]/activity/route.ts");
  const agent = read("src/lib/agent.ts");
  const brokerage = read("src/lib/agent/brokerage.ts");

  for (const [name, route] of [
    ["summary", summaryRoute],
    ["activity", activityRoute],
  ] as const) {
    assert.ok(route.includes("sideEffects: false"), `${name} sideEffects false`);
    assert.ok(route.includes("requireAgentContextFromRequest(request"));
    assert.equal(route.includes("healAgentSeatFlags"), false);
    assert.equal(route.includes("syncBrokerageSeats"), false);
    assert.ok(route.includes("if (status !== 200)"));
    assert.ok(
      route.indexOf("if (status !== 200)") < route.indexOf("jsonByteLength(body)"),
    );
  }

  const ensureFn = brokerage.slice(
    brokerage.indexOf("export const ensureBrokerageOrganization"),
    brokerage.indexOf("export const listTeamAgents"),
  );
  assert.ok(ensureFn.includes("if (syncSeats === false)"));

  const hostnameFn = agent.slice(
    agent.indexOf("async function buildHostnameBoundAgentContext"),
    agent.indexOf("export async function requireAgentContextForRequest"),
  );
  assert.ok(hostnameFn.includes("ensureBrokerageOrganization(allowSideEffects)"));
}

function testNoHttpTransactionOnReads() {
  const summary = read("src/lib/agent/lead-summary.ts");
  const timeline = read("src/lib/agent/customer-timeline.ts");
  const summaryRoute = read("src/app/api/agent/leads/[id]/summary/route.ts");
  const activityRoute = read("src/app/api/agent/leads/[id]/activity/route.ts");

  for (const [name, src] of [
    ["lead-summary", summary],
    ["customer-timeline", timeline],
    ["summary-route", summaryRoute],
    ["activity-route", activityRoute],
  ] as const) {
    assert.equal(src.includes("$transaction"), false, `${name} must not $transaction`);
    assert.equal(src.includes(".upsert("), false, `${name} must not upsert`);
  }
}

function testAuthorizationIntact() {
  const summary = read("src/lib/agent/lead-summary.ts");
  const agent = read("src/lib/agent.ts");
  const summaryRoute = read("src/app/api/agent/leads/[id]/summary/route.ts");
  const activityRoute = read("src/app/api/agent/leads/[id]/activity/route.ts");

  assert.equal(countOccurrences(summary, "canAccessLead(ctx, lead)"), 2);
  assert.ok(agent.includes("requireAgentUser()"));
  assert.ok(agent.includes("tryTenantStaffContext(request, user)"));
  assert.ok(agent.includes("isAgentRole"));
  for (const route of [summaryRoute, activityRoute]) {
    assert.ok(route.includes('return reply(401, { error: "Unauthorized" })'));
    assert.ok(route.includes('return reply(404, { error: "Not found" })'));
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
  const helpers = profile.slice(
    profile.indexOf("async function fetchLeadSummary"),
    profile.indexOf("export function CustomerProfile"),
  );
  assert.ok(helpers.includes("fetchLeadSummary"));
  assert.ok(helpers.includes("fetchLeadActivity"));
  assert.ok(helpers.includes("/api/agent/leads/${leadId}/activity"));
  assert.ok(helpers.includes("readJsonResponse"));
  assert.equal(helpers.includes("res.json()"), false);
  assert.equal(helpers.includes("retries"), false);
  assert.equal(helpers.includes("for (let attempt"), false);
  assert.ok(profile.includes("setData(json)"));
  const reloadFn = profile.slice(
    profile.indexOf("const reload = useCallback"),
    profile.indexOf("useEffect(() => {"),
  );
  assert.ok(
    reloadFn.indexOf("fetchLeadSummary") < reloadFn.indexOf("setData(json)"),
  );
  assert.ok(
    reloadFn.indexOf("setData(json)") < reloadFn.indexOf("requestActivity(leadId)"),
    "activity fetch must start after first-paint data",
  );
  assert.ok(profile.includes("activityLoading"));
  assert.ok(profile.includes("deferredLabel"));
  assert.ok(profile.includes("Loading…"));
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
  const activityFetch = profile.slice(
    profile.indexOf("async function fetchLeadActivity"),
    profile.indexOf("function isMergedLeadSummary"),
  );
  const apply = profile.slice(
    profile.indexOf("const applyActivity = useCallback"),
    profile.indexOf("const requestActivity = useCallback"),
  );
  const effect = profile.slice(
    profile.indexOf("useEffect(() => {"),
    profile.indexOf("const onUpdated = useCallback"),
  );

  assert.ok(profile.includes("createLeadProfileActivityGate()"));
  assert.ok(profile.includes("activityGate.request(targetLeadId, applyActivity)"));
  assert.ok(effect.includes("activityGate.abortActive()"));
  assert.ok(gate.includes("if (inFlight)"));
  assert.ok(gate.includes("trailing = true"));
  assert.ok(gate.includes("void run(nextLeadId, nextFetch)"));
  assert.equal(gate.includes("setTimeout"), false);
  assert.equal(gate.includes("retries"), false);
  assert.equal(profile.includes("for (let attempt"), false);
  assert.equal(profile.includes("retries"), false);

  assert.ok(activityFetch.includes("if (isAbortError(error) || signal.aborted)"));
  assert.ok(activityFetch.includes("throw error"));
  const abortCatch = activityFetch.slice(
    activityFetch.indexOf("catch (error)"),
    activityFetch.indexOf("throw new Error(\"Failed to load\")"),
  );
  assert.ok(abortCatch.includes("throw error"));
  assert.equal(abortCatch.includes("Failed to load"), false);

  assert.ok(apply.includes("if (isAbortError(error) || signal.aborted) return;"));
  const applyError = apply.slice(apply.indexOf("catch (error)"));
  const abortReturn = applyError.indexOf(
    "if (isAbortError(error) || signal.aborted) return;",
  );
  const failedFlag = applyError.indexOf("setActivityError(true)");
  assert.ok(abortReturn >= 0 && failedFlag > abortReturn);
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
