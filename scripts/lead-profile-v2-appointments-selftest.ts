/**
 * Lead Profile V2 Appointments tab selftest.
 * Run: node --import tsx scripts/lead-profile-v2-appointments-selftest.ts
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
  V2_APPOINTMENT_SELECT,
  V2_APPOINTMENTS_ACCESS_SELECT,
} from "../src/lib/agent/lead-profile-v2/load-appointments";
import {
  V2_APPOINTMENTS_RESOURCE_KEY,
  V2_APPOINTMENTS_TAKE,
  canApplyV2AppointmentsResponse,
} from "../src/lib/agent/lead-profile-v2/appointments-query";

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
];

const V2_APPOINTMENTS_FILES = [
  "src/app/api/agent/leads-v2/[id]/appointments/route.ts",
  "src/lib/agent/lead-profile-v2/load-appointments.ts",
  "src/lib/agent/lead-profile-v2/appointments-query.ts",
  "src/components/agent/lead-profile-v2/LeadProfileV2AppointmentsPanel.tsx",
  "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2Appointments.ts",
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

function testForeignWorkspaceAppointmentsUnavailable() {
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
    const loader = read("src/lib/agent/lead-profile-v2/load-appointments.ts");
    const accessCheck = "if (!lead || !v2CanAccessLead(ctx, lead)) return null";
    assert.ok(loader.includes(accessCheck));
    assert.ok(
      loader.indexOf(accessCheck) < loader.indexOf("prisma.appointment.findMany"),
    );
    assert.ok(loader.includes("where: { leadId: lead.id }"));
  } finally {
    if (prevRead === undefined) delete process.env.WORKSPACE_READ_SCOPE;
    else process.env.WORKSPACE_READ_SCOPE = prevRead;
    if (prevDomain === undefined) delete process.env.TENANT_DOMAIN_SCOPE;
    else process.env.TENANT_DOMAIN_SCOPE = prevDomain;
  }
}

function testExactLegacyOrderingAndBound() {
  assert.equal(V2_APPOINTMENTS_TAKE, 40);
  const legacy = read("src/lib/agent/lead-profile-panels.ts");
  const loader = read("src/lib/agent/lead-profile-v2/load-appointments.ts");
  assert.ok(legacy.includes("orderBy: { createdAt: \"desc\" }"));
  assert.ok(legacy.includes("take: 40"));
  assert.ok(loader.includes('orderBy: { createdAt: "desc" }'));
  assert.ok(loader.includes("take: V2_APPOINTMENTS_TAKE"));
}

function testOnlyRequiredFieldsSelected() {
  const select = V2_APPOINTMENT_SELECT as Record<string, unknown>;
  const access = V2_APPOINTMENTS_ACCESS_SELECT as Record<string, unknown>;
  for (const required of [
    "id",
    "type",
    "status",
    "startsAt",
    "listingMls",
    "videoJoinUrl",
    "notes",
  ]) {
    assert.equal(required in select, true, `must select ${required}`);
  }
  for (const banned of [
    "htmlBody",
    "customer",
    "listing",
    "lead",
    "meta",
    "createdAt",
  ]) {
    assert.equal(banned in select, false, `must omit ${banned}`);
  }
  assert.equal("customerId" in access, false);
  const loader = read("src/lib/agent/lead-profile-v2/load-appointments.ts");
  for (const banned of [
    "lead-profile-snapshot",
    "loadPagedLeadTimeline",
    "loadBuyerIntent",
    "computeHotness",
    "activityEvent",
    "listingView",
    "savedSearch",
    "leadEmailLog",
    "agentTask",
    "leadNote",
    "htmlBody",
    "/summary",
    "$transaction",
    ".upsert(",
    "include:",
  ]) {
    assert.equal(loader.includes(banned), false, `must not reference ${banned}`);
  }
  assert.equal(loader.split("prisma.").length - 1, 2);
}

function testTabIsLazyLoaded() {
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2Appointments.ts",
  );
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  assert.ok(hook.includes("if (!enabled)"));
  assert.ok(host.includes('tab === "appointments"'));
  assert.ok(host.includes('const [tab, setTab] = useState<LeadProfileV2TabId>("activity")'));
}

function testStaleResponsesDiscarded() {
  assert.equal(
    canApplyV2AppointmentsResponse({
      stamp: { leadId: "lead-a", epoch: 1 },
      current: { leadId: "lead-b", epoch: 1 },
    }),
    false,
  );
  assert.equal(
    canApplyV2AppointmentsResponse({
      stamp: { leadId: "lead-a", epoch: 1 },
      current: { leadId: "lead-a", epoch: 2 },
    }),
    false,
  );
  assert.equal(
    canApplyV2AppointmentsResponse({
      stamp: { leadId: "lead-a", epoch: 2 },
      current: { leadId: "lead-a", epoch: 2 },
    }),
    true,
  );
}

function testAbortIsNotAnError() {
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2Appointments.ts",
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
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2Appointments.ts",
  );
  for (const src of [fetchSrc, hook]) {
    assert.equal(src.includes("retries"), false);
    assert.equal(src.includes("for (let attempt"), false);
  }
}

function testNoFullProfileReload() {
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  const refresh =
    host.split("const refreshProfile")[1]?.split("const onTaskCreated")[0] ??
    "";
  assert.ok(refresh.includes('if (tab === "appointments") reloadAppointments()'));
  assert.ok(refresh.includes("else invalidateAppointments()"));
  const panel = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2AppointmentsPanel.tsx",
  );
  assert.equal(panel.includes("/api/agent/leads/"), false);
  assert.equal(panel.includes("AppointmentActions"), false);
  assert.equal(panel.includes("method: \"POST\""), false);
  for (const rel of V2_APPOINTMENTS_FILES) {
    const src = read(rel);
    assert.equal(src.includes("/summary"), false, `${rel} must not call summary`);
  }
}

function testPresentationParity() {
  const panel = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2AppointmentsPanel.tsx",
  );
  assert.ok(panel.includes("Loading…"));
  assert.ok(panel.includes("Failed to load"));
  assert.ok(panel.includes("No appointments."));
  assert.ok(panel.includes("Unscheduled"));
  assert.ok(panel.includes("Join link"));
  assert.ok(panel.includes('a.type.replaceAll("_", " ")'));
  assert.equal(panel.includes("from \"@/lib/prisma\""), false);
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
  let concurrent = 0;
  let maxConcurrent = 0;
  const fetchAppointments = async () => {
    starts += 1;
    concurrent += 1;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    await waitMs(40);
    concurrent -= 1;
  };

  session.request(V2_APPOINTMENTS_RESOURCE_KEY, "lead-a", fetchAppointments);
  session.request(V2_APPOINTMENTS_RESOURCE_KEY, "lead-a", fetchAppointments);
  session.request(V2_APPOINTMENTS_RESOURCE_KEY, "lead-a", fetchAppointments);
  assert.equal(starts, 1);
  assert.equal(session.inspect(V2_APPOINTMENTS_RESOURCE_KEY).trailing, true);

  await waitUntil(
    () =>
      !session.inspect(V2_APPOINTMENTS_RESOURCE_KEY).inFlight &&
      !session.inspect(V2_APPOINTMENTS_RESOURCE_KEY).trailing,
  );
  assert.equal(maxConcurrent, 1);
  assert.equal(starts, 2);

  session.request("shell", "lead-a", fetchAppointments);
  session.request("tasks", "lead-a", fetchAppointments);
  session.request(V2_APPOINTMENTS_RESOURCE_KEY, "lead-a", fetchAppointments);
  assert.equal(session.inspect("shell").inFlight, true);
  assert.equal(session.inspect(V2_APPOINTMENTS_RESOURCE_KEY).inFlight, true);
  await waitUntil(
    () =>
      !session.inspect("shell").inFlight &&
      !session.inspect("tasks").inFlight &&
      !session.inspect(V2_APPOINTMENTS_RESOURCE_KEY).inFlight,
  );
}

async function testAbortOnLeadChange() {
  const session = createLeadProfileV2Session();
  const signals: AbortSignal[] = [];
  const fetchAppointments = async (_leadId: string, signal: AbortSignal) => {
    signals.push(signal);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 200);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
      });
    });
  };

  session.request(V2_APPOINTMENTS_RESOURCE_KEY, "lead-a", fetchAppointments);
  session.request(V2_APPOINTMENTS_RESOURCE_KEY, "lead-b", fetchAppointments);
  assert.equal(signals[0]?.aborted, true);
  await waitUntil(
    () => !session.inspect(V2_APPOINTMENTS_RESOURCE_KEY).inFlight,
  );
}

function testFailedAppointmentsIsolated() {
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2Appointments.ts",
  );
  assert.ok(hook.includes("setError(true)"));
  assert.equal(hook.includes("setData("), false);
  assert.equal(hook.includes("reloadDefaultTimeline"), false);
  assert.equal(hook.includes("reloadTasks"), false);
}

async function main() {
  testLegacyUntouchedByV2Imports();
  testForeignWorkspaceAppointmentsUnavailable();
  testExactLegacyOrderingAndBound();
  testOnlyRequiredFieldsSelected();
  testTabIsLazyLoaded();
  testStaleResponsesDiscarded();
  testAbortIsNotAnError();
  testNoRetry();
  testNoFullProfileReload();
  testPresentationParity();
  testFailedAppointmentsIsolated();
  await testDuplicateRequestsPrevented();
  await testAbortOnLeadChange();
  console.log("lead-profile-v2-appointments-selftest: ok");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
