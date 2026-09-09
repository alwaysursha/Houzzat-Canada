/**
 * Launch-safe Lead Profile GET memory bounds.
 * Run: pnpm lead-profile-summary-memory:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LEAD_PROFILE_EMAIL_LOG_SELECT } from "../src/lib/agent/customer-timeline";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function countOccurrences(haystack: string, needle: string) {
  return haystack.split(needle).length - 1;
}

function testEmailSelectOmitsHtmlBody() {
  const select = LEAD_PROFILE_EMAIL_LOG_SELECT as Record<string, boolean>;
  assert.equal(select.htmlBody, undefined);
  assert.equal(select.body, true);
  assert.equal(select.subject, true);
  assert.equal(select.id, true);

  const summary = read("src/lib/agent/lead-summary.ts");
  const timeline = read("src/lib/agent/customer-timeline.ts");
  const route = read("src/app/api/agent/leads/[id]/summary/route.ts");

  assert.ok(
    summary.includes("LEAD_PROFILE_EMAIL_LOG_SELECT"),
    "summary must use the narrow email select",
  );
  assert.equal(summary.includes("htmlBody"), false);
  assert.equal(route.includes("htmlBody"), false);

  const timelineFn = timeline.slice(
    timeline.indexOf("export async function loadCustomerTimeline"),
  );
  assert.equal(timelineFn.includes("htmlBody"), false);
  assert.equal(
    timelineFn.includes("prisma.leadEmailLog"),
    false,
    "timeline must not query leadEmailLog when collections are passed",
  );

  const preview = read("src/app/api/agent/emails/[id]/route.ts");
  assert.ok(
    preview.includes("htmlBody: true"),
    "dedicated email preview must still select htmlBody",
  );
}

function testNoDuplicateCollectionHydration() {
  const summary = read("src/lib/agent/lead-summary.ts");
  const timeline = read("src/lib/agent/customer-timeline.ts");

  assert.equal(countOccurrences(summary, "prisma.leadEmailLog.findMany"), 1);
  assert.equal(countOccurrences(summary, "prisma.leadNote.findMany"), 1);
  assert.equal(countOccurrences(summary, "prisma.agentTask.findMany"), 1);
  assert.equal(countOccurrences(summary, "prisma.appointment.findMany"), 1);

  const timelineFn = timeline.slice(
    timeline.indexOf("export async function loadCustomerTimeline"),
  );
  assert.equal(timelineFn.includes("prisma.leadEmailLog.findMany"), false);
  assert.equal(timelineFn.includes("prisma.leadNote.findMany"), false);
  assert.equal(timelineFn.includes("prisma.agentTask.findMany"), false);
  assert.equal(timelineFn.includes("prisma.appointment.findMany"), false);
  assert.ok(timelineFn.includes("input.collections.emails"));
  assert.ok(summary.includes("collections:"));
}

function testSummaryGetDoesNotScheduleSeatSync() {
  const route = read("src/app/api/agent/leads/[id]/summary/route.ts");
  const agent = read("src/lib/agent.ts");
  const brokerage = read("src/lib/agent/brokerage.ts");

  assert.ok(route.includes("sideEffects: false"));
  assert.ok(route.includes("requireAgentContextFromRequest(request"));
  assert.equal(route.includes("healAgentSeatFlags"), false);
  assert.equal(route.includes("syncBrokerageSeats"), false);
  assert.equal(route.includes("ensureBrokerageOrganization()"), false);

  const ensureFn = brokerage.slice(
    brokerage.indexOf("export const ensureBrokerageOrganization"),
    brokerage.indexOf("export const listTeamAgents"),
  );
  assert.ok(ensureFn.includes("syncSeats: boolean = true"));
  assert.ok(ensureFn.includes("if (syncSeats === false)"));
  assert.ok(
    ensureFn.indexOf("if (syncSeats === false)") <
      ensureFn.indexOf("syncBrokerageSeats"),
  );

  const hostnameFn = agent.slice(
    agent.indexOf("async function buildHostnameBoundAgentContext"),
    agent.indexOf("export async function requireAgentContextForRequest"),
  );
  assert.ok(hostnameFn.includes("ensureBrokerageOrganization(allowSideEffects)"));
  assert.ok(hostnameFn.includes("if (allowSideEffects)"));
  assert.ok(
    hostnameFn.indexOf("if (allowSideEffects)") <
      hostnameFn.indexOf("healAgentSeatFlags"),
  );

  const legacyFn = agent.slice(
    agent.indexOf("async function buildLegacyAgentContext"),
    agent.indexOf("export const requireAgentContextFromRequest"),
  );
  assert.ok(legacyFn.includes("ensureBrokerageOrganization(allowSideEffects)"));
  assert.ok(legacyFn.includes("if (allowSideEffects && !isPlatformAdmin)"));
}

function testNoHttpTransactionOnThisRead() {
  const summary = read("src/lib/agent/lead-summary.ts");
  const timeline = read("src/lib/agent/customer-timeline.ts");
  const route = read("src/app/api/agent/leads/[id]/summary/route.ts");
  const agent = read("src/lib/agent.ts");

  for (const [name, src] of [
    ["lead-summary", summary],
    ["customer-timeline", timeline],
    ["summary-route", route],
  ] as const) {
    assert.equal(src.includes("$transaction"), false, `${name} must not $transaction`);
    assert.equal(src.includes(".upsert("), false, `${name} must not upsert`);
  }

  const hostnameFn = agent.slice(
    agent.indexOf("async function buildHostnameBoundAgentContext"),
    agent.indexOf("export async function requireAgentContextForRequest"),
  );
  const healBlock = hostnameFn.slice(hostnameFn.indexOf("if (allowSideEffects)"));
  assert.ok(healBlock.includes("healAgentSeatFlags"));
}

function testSuccessfulPathSkipsJsonByteLength() {
  const route = read("src/app/api/agent/leads/[id]/summary/route.ts");
  const guard = route.indexOf("if (status !== 200)");
  const stringifyCall = route.indexOf("jsonByteLength(body)");
  assert.ok(guard >= 0);
  assert.ok(stringifyCall > guard);
  assert.ok(route.includes("return reply(200, summary)"));
}

function testAuthorizationIntact() {
  const summary = read("src/lib/agent/lead-summary.ts");
  const agent = read("src/lib/agent.ts");
  const route = read("src/app/api/agent/leads/[id]/summary/route.ts");

  assert.ok(summary.includes("canAccessLead(ctx, lead)"));
  assert.ok(agent.includes("requireAgentUser()"));
  assert.ok(agent.includes("tryTenantStaffContext(request, user)"));
  assert.ok(agent.includes("isAgentRole"));
  assert.ok(route.includes('return reply(401, { error: "Unauthorized" })'));
  assert.ok(route.includes('return reply(404, { error: "Not found" })'));
}

function testResponseContractKeys() {
  const summary = read("src/lib/agent/lead-summary.ts");
  const typeBlock = summary.slice(
    summary.indexOf("export type LeadSummary"),
    summary.indexOf("function searchLabel"),
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
  ]) {
    assert.ok(typeBlock.includes(key), `LeadSummary must keep ${key}`);
  }

  const emailsType = typeBlock.slice(
    typeBlock.indexOf("emails: Array"),
    typeBlock.indexOf("notes: Array"),
  );
  assert.ok(emailsType.includes("body: string"));
  assert.equal(emailsType.includes("htmlBody"), false);
}

testEmailSelectOmitsHtmlBody();
testNoDuplicateCollectionHydration();
testSummaryGetDoesNotScheduleSeatSync();
testNoHttpTransactionOnThisRead();
testSuccessfulPathSkipsJsonByteLength();
testAuthorizationIntact();
testResponseContractKeys();
console.log("lead-profile-summary-memory-selftest: ok");
