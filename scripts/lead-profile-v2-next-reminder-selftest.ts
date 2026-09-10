/**
 * Lead Profile V2 Next Reminder selftest.
 * Run: node --import tsx scripts/lead-profile-v2-next-reminder-selftest.ts
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
  V2_NEXT_REMINDER_ACCESS_SELECT,
  V2_NEXT_REMINDER_SELECT,
} from "../src/lib/agent/lead-profile-v2/load-next-reminder";
import {
  V2_NEXT_REMINDER_RESOURCE_KEY,
  canApplyV2NextReminderResponse,
  selectV2NextOpenReminder,
} from "../src/lib/agent/lead-profile-v2/next-reminder-query";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const LEGACY_FILES = [
  "src/components/agent/CustomerProfile.tsx",
  "src/components/agent/LeadQueryPopup.tsx",
  "src/lib/agent/lead-profile-snapshot.ts",
  "src/lib/agent/lead-summary.ts",
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

function testForeignWorkspaceNextReminderUnavailable() {
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
    const loader = read("src/lib/agent/lead-profile-v2/load-next-reminder.ts");
    const accessCheck = "if (!lead || !v2CanAccessLead(ctx, lead)) return null";
    assert.ok(loader.includes(accessCheck));
    assert.ok(
      loader.indexOf(accessCheck) <
        loader.indexOf("prisma.agentTask.findFirst"),
    );
    const route = read(
      "src/app/api/agent/leads-v2/[id]/next-reminder/route.ts",
    );
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

function testBoundedMinimalQuery() {
  const select = V2_NEXT_REMINDER_SELECT as Record<string, unknown>;
  assert.deepEqual(Object.keys(select).sort(), ["dueAt", "title"]);
  const access = V2_NEXT_REMINDER_ACCESS_SELECT as Record<string, unknown>;
  assert.ok("id" in access);
  const loader = read("src/lib/agent/lead-profile-v2/load-next-reminder.ts");
  assert.ok(loader.includes("prisma.agentTask.findFirst"));
  assert.ok(loader.includes("status: \"OPEN\""));
  assert.ok(loader.includes("orderBy: { dueAt: \"asc\" }"));
  assert.equal(loader.includes("findMany"), false);
  assert.equal(loader.includes("body: true"), false);
  assert.equal(loader.includes("completedAt"), false);
  assert.equal(loader.includes("createdBy"), false);
  assert.equal(loader.includes("prisma.appointment"), false);
  assert.equal(loader.includes("prisma.leadNote"), false);
  assert.equal(loader.includes("htmlBody"), false);
  assert.equal(loader.includes("loadPagedLeadTimeline"), false);
  const snapshot = read("src/lib/agent/lead-profile-snapshot.ts");
  assert.ok(snapshot.includes("prisma.agentTask.findFirst"));
  assert.ok(snapshot.includes("status: \"OPEN\""));
  assert.ok(snapshot.includes("orderBy: { dueAt: \"asc\" }"));
  assert.ok(snapshot.includes("select: { title: true, dueAt: true }"));
}

function testNoTaskBodyHydration() {
  const loader = read("src/lib/agent/lead-profile-v2/load-next-reminder.ts");
  for (const banned of [
    "body: true",
    "prisma.leadEmailLog",
    "prisma.activityEvent",
    "prisma.listing.find",
    "loadLeadProfileV2Tasks",
    "V2_TASKS_TAKE",
  ]) {
    assert.equal(loader.includes(banned), false, `must not query ${banned}`);
  }
}

function testFilterAndOrderRules() {
  const upcoming = "2099-01-02T15:00:00.000Z";
  const overdue = "2020-01-01T12:00:00.000Z";
  const laterOpen = "2099-06-01T09:00:00.000Z";
  const tasks = [
    {
      status: "DONE",
      title: "Completed call",
      dueAt: "2019-01-01T12:00:00.000Z",
    },
    {
      status: "CANCELLED",
      title: "Cancelled todo",
      dueAt: "2018-01-01T12:00:00.000Z",
    },
    { status: "OPEN", title: "Later follow-up", dueAt: laterOpen },
    { status: "OPEN", title: "Overdue call", dueAt: overdue },
    { status: "OPEN", title: "Upcoming email", dueAt: upcoming },
  ];
  const next = selectV2NextOpenReminder(tasks);
  assert.deepEqual(next, { title: "Overdue call", dueAt: overdue });
  assert.equal(selectV2NextOpenReminder([]), null);
  assert.equal(
    selectV2NextOpenReminder([
      { status: "DONE", title: "Done", dueAt: overdue },
      { status: "CANCELLED", title: "Cancelled", dueAt: upcoming },
    ]),
    null,
  );
  const onlyUpcoming = selectV2NextOpenReminder([
    { status: "OPEN", title: "Upcoming email", dueAt: upcoming },
    { status: "DONE", title: "Completed call", dueAt: overdue },
  ]);
  assert.deepEqual(onlyUpcoming, {
    title: "Upcoming email",
    dueAt: upcoming,
  });
}

function testPresentationParity() {
  const rail = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Rail.tsx",
  );
  const legacy = read("src/components/agent/CustomerProfile.tsx");
  for (const copy of [
    "Next reminder",
    'className="mt-3 rounded-md border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-left text-[12px]"',
    'className="font-semibold text-[#92400e]"',
    'className="text-[#78350f]"',
    'className="text-[#a16207]"',
    'toLocaleString("en-CA", {',
    'month: "short"',
    'day: "numeric"',
    'hour: "numeric"',
    'minute: "2-digit"',
  ]) {
    assert.ok(rail.includes(copy), `rail missing ${copy}`);
    assert.ok(legacy.includes(copy), `legacy missing ${copy}`);
  }
  assert.equal(rail.includes("Overdue"), false);
  assert.equal(rail.includes("Upcoming"), false);
  assert.equal(legacy.includes("data.nextReminder.type"), false);
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  assert.ok(host.includes("nextReminder={nextReminderResource.panel?.nextReminder ?? null}"));
}

function testTasksResourceDoesNotSatisfyFirstPaint() {
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  assert.ok(host.includes("useLeadProfileV2Tasks(session, leadId, tab === \"reminders\")"));
  assert.ok(host.includes("useLeadProfileV2NextReminder("));
  assert.ok(host.includes("data != null && data.lead.id === leadId"));
  const tasks = read("src/lib/agent/lead-profile-v2/load-tasks.ts");
  assert.ok(tasks.includes("prisma.agentTask.findMany"));
  assert.ok(tasks.includes("prisma.leadNote.findMany"));
}

function testTargetedRefresh() {
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  const created =
    host.split("const onTaskCreated")[1]?.split("const onNotePinned")[0] ?? "";
  assert.ok(created.includes("reloadNextReminder()"));
  assert.ok(created.includes("reloadTasks()"));
  assert.ok(created.includes("reloadDefaultTimeline()"));
  assert.equal(created.includes("reload()"), false);
  const notes =
    host.split("const onNotePinned")[1]?.split("const onEmailSent")[0] ?? "";
  assert.equal(notes.includes("reloadNextReminder()"), false);
}

function testLazyLoadAfterShell() {
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2NextReminder.ts",
  );
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  assert.ok(hook.includes("if (!enabled)"));
  assert.ok(host.includes("useLeadProfileV2NextReminder("));
}

function testStaleResponsesDiscarded() {
  assert.equal(
    canApplyV2NextReminderResponse({
      stamp: { leadId: "lead-a", epoch: 1 },
      current: { leadId: "lead-b", epoch: 1 },
    }),
    false,
  );
  assert.equal(
    canApplyV2NextReminderResponse({
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
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2NextReminder.ts",
  );
  assert.equal(hook.includes("retries"), false);
}

function testFailureDoesNotTakeDownShell() {
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2NextReminder.ts",
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
  const fetchNext = async () => {
    starts += 1;
    await waitMs(40);
  };
  session.request(V2_NEXT_REMINDER_RESOURCE_KEY, "lead-a", fetchNext);
  session.request(V2_NEXT_REMINDER_RESOURCE_KEY, "lead-a", fetchNext);
  assert.equal(starts, 1);
  session.request("tasks", "lead-a", fetchNext);
  assert.equal(session.inspect(V2_NEXT_REMINDER_RESOURCE_KEY).inFlight, true);
  assert.equal(session.inspect("tasks").inFlight, true);
  await waitUntil(
    () =>
      !session.inspect(V2_NEXT_REMINDER_RESOURCE_KEY).inFlight &&
      !session.inspect("tasks").inFlight,
  );
}

async function main() {
  testLegacyUntouchedByV2Imports();
  testForeignWorkspaceNextReminderUnavailable();
  testBoundedMinimalQuery();
  testNoTaskBodyHydration();
  testFilterAndOrderRules();
  testPresentationParity();
  testTasksResourceDoesNotSatisfyFirstPaint();
  testTargetedRefresh();
  testLazyLoadAfterShell();
  testStaleResponsesDiscarded();
  testAbortIsNotAnError();
  testNoRetry();
  testFailureDoesNotTakeDownShell();
  await testDuplicateRequestsPrevented();
  console.log("lead-profile-v2-next-reminder-selftest: ok");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
