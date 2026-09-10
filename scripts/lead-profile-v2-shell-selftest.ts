/**
 * Lead Profile V2 foundation + shell isolation selftest.
 * Run: node --import tsx scripts/lead-profile-v2-shell-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canAccessLead } from "../src/lib/crm-read-scope";
import {
  createLeadProfileV2Session,
  isV2AbortError,
} from "../src/lib/agent/lead-profile-v2/request-gate";
import { LEAD_PROFILE_V2_SHELL_SELECT } from "../src/lib/agent/lead-profile-v2/load-shell";
import { V2_LEAD_GET_AUTH_OPTIONS } from "../src/lib/agent/lead-profile-v2/access";

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

function testShellDoesNotLoadHeavyModules() {
  const loader = read("src/lib/agent/lead-profile-v2/load-shell.ts");
  const route = read("src/app/api/agent/leads-v2/[id]/shell/route.ts");
  const combined = `${loader}\n${route}`;
  for (const banned of [
    "lead-profile-timeline",
    "lead-profile-snapshot",
    "lead-profile-panels",
    "loadCustomerTimeline",
    "loadLeadProfileActivity",
    "loadBuyerIntent",
    "buyerIntentFromSavedSearches",
    "computeHotness",
    "hotnessFromSignals",
    "activityEvent",
    "htmlBody",
    "leadEmailLog",
    "listingView",
    "$transaction",
    ".upsert(",
  ]) {
    assert.equal(
      combined.includes(banned),
      false,
      `V2 shell must not reference ${banned}`,
    );
  }
  assert.ok(loader.includes("v2CanAccessLead"));
  assert.ok(loader.includes("LEAD_PROFILE_V2_SHELL_SELECT"));
  assert.ok(route.includes("handleAgentLeadGet"));
  assert.ok(route.includes("loadLeadProfileV2Shell"));
}

function testShellSelectIsIdentityOnly() {
  const select = LEAD_PROFILE_V2_SHELL_SELECT as Record<string, unknown>;
  for (const banned of [
    "timeline",
    "htmlBody",
    "body",
    "tasks",
    "appointments",
    "emails",
    "savedListings",
    "savedSearches",
    "activityEvent",
  ]) {
    assert.equal(
      banned in select,
      false,
      `shell select must not include ${banned}`,
    );
  }
  assert.equal(select.id, true);
  assert.equal(select.status, true);
  assert.equal(select.customer && typeof select.customer === "object", true);
  const loader = read("src/lib/agent/lead-profile-v2/load-shell.ts");
  assert.equal(loader.includes("prisma.lead.findUnique"), true);
  assert.equal(
    loader.split("prisma.").length - 1,
    1,
    "shell loader must use a single prisma.lead.findUnique (assignable agents is a separate helper)",
  );
}

function testNoGetSideEffects() {
  assert.equal(V2_LEAD_GET_AUTH_OPTIONS.sideEffects, false);
  const helper = read("src/lib/http/agent-lead-get.ts");
  assert.ok(helper.includes("sideEffects: false"));
  const route = read("src/app/api/agent/leads-v2/[id]/shell/route.ts");
  assert.ok(route.includes("handleAgentLeadGet"));
  const access = read("src/lib/agent/lead-profile-v2/access.ts");
  assert.ok(access.includes("sideEffects: false"));
  assert.ok(access.includes("requireAgentContextFromRequest"));
  assert.ok(access.includes("canAccessLead"));
}

function testForeignWorkspaceDenied() {
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
    assert.equal(
      canAccessLead(ctx, {
        organizationId: "org-b",
        workspaceId: "ws-b",
        assignedAgentId: "agent-a",
      }),
      false,
      "hostname-bound staff must not access a foreign workspace lead",
    );
    assert.equal(
      canAccessLead(ctx, {
        organizationId: "org-a",
        workspaceId: "ws-a",
        assignedAgentId: "agent-a",
      }),
      true,
    );
  } finally {
    if (prevRead === undefined) delete process.env.WORKSPACE_READ_SCOPE;
    else process.env.WORKSPACE_READ_SCOPE = prevRead;
    if (prevDomain === undefined) delete process.env.TENANT_DOMAIN_SCOPE;
    else process.env.TENANT_DOMAIN_SCOPE = prevDomain;
  }
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

async function testRequestGateCoalesceAndNoRetry() {
  const session = createLeadProfileV2Session();
  let starts = 0;
  let concurrent = 0;
  let maxConcurrent = 0;
  const fetchShell = async () => {
    starts += 1;
    concurrent += 1;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    await wait(40);
    concurrent -= 1;
  };

  session.request("shell", "lead-a", fetchShell);
  session.request("shell", "lead-a", fetchShell);
  session.request("shell", "lead-a", fetchShell);
  assert.equal(starts, 1, "must not start a second shell fetch while in flight");
  assert.equal(session.inspect("shell").inFlight, true);
  assert.equal(session.inspect("shell").trailing, true);

  await waitUntil(
    () => !session.inspect("shell").inFlight && !session.inspect("shell").trailing,
  );
  assert.equal(maxConcurrent, 1);
  assert.equal(starts, 2, "trailing refresh must coalesce to one extra run");

  const fetchSrc = read("src/lib/agent/lead-profile-v2/fetch-json.ts");
  assert.equal(fetchSrc.includes("retries"), false);
  assert.equal(fetchSrc.includes("for (let attempt"), false);
}

async function testRequestGateAbortLeadChange() {
  const session = createLeadProfileV2Session();
  const signals: AbortSignal[] = [];
  let starts = 0;
  const fetchShell = async (_leadId: string, signal: AbortSignal) => {
    starts += 1;
    signals.push(signal);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 200);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
      });
    });
  };

  session.request("shell", "lead-a", fetchShell);
  assert.equal(starts, 1);
  session.abortAll();
  assert.equal(signals[0]?.aborted, true);
  assert.equal(session.inspect("shell").inFlight, false);

  session.request("shell", "lead-b", fetchShell);
  assert.equal(starts, 2);
  await waitUntil(() => !session.inspect("shell").inFlight);
}

function testAbortIsNotFailedToLoad() {
  const host = read("src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx");
  assert.ok(host.includes("isV2AbortError"));
  assert.ok(host.includes("session.abortAll()"));
  assert.ok(host.includes("createLeadProfileV2Session"));
  assert.equal(host.includes("for (let attempt"), false);
  assert.equal(host.includes("retries"), false);
  assert.ok(isV2AbortError(Object.assign(new Error("Aborted"), { name: "AbortError" })));
}

function testHostDoesNotImportLegacyProfile() {
  const host = read("src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx");
  assert.equal(host.includes("CustomerProfile"), false);
  assert.equal(host.includes("lead-profile-snapshot"), false);
  assert.equal(host.includes("LeadSummary"), false);
}

async function main() {
  testLegacyUntouchedByV2Imports();
  testShellDoesNotLoadHeavyModules();
  testShellSelectIsIdentityOnly();
  testNoGetSideEffects();
  testForeignWorkspaceDenied();
  testHostDoesNotImportLegacyProfile();
  testAbortIsNotFailedToLoad();
  await testRequestGateCoalesceAndNoRetry();
  await testRequestGateAbortLeadChange();
  console.log("lead-profile-v2-shell-selftest: ok");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
