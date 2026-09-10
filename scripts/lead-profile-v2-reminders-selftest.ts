/**
 * Lead Profile V2 Task & Reminders tab selftest.
 * Run: node --import tsx scripts/lead-profile-v2-reminders-selftest.ts
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
  V2_FOLLOW_UP_NOTE_SELECT,
  V2_TASKS_ACCESS_SELECT,
  V2_TASKS_SELECT,
} from "../src/lib/agent/lead-profile-v2/load-tasks";
import {
  V2_TASKS_RESOURCE_KEY,
  V2_TASKS_TAKE,
  canApplyV2TasksResponse,
} from "../src/lib/agent/lead-profile-v2/tasks-query";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const LEGACY_FILES = [
  "src/components/agent/CustomerProfile.tsx",
  "src/components/agent/LeadQueryPopup.tsx",
  "src/components/agent/TaskForm.tsx",
  "src/app/api/agent/leads/[id]/summary/route.ts",
  "src/app/api/agent/leads/[id]/timeline/route.ts",
  "src/app/api/agent/leads/[id]/tasks/route.ts",
  "src/app/api/agent/leads/[id]/appointments/route.ts",
  "src/app/api/agent/leads/[id]/emails/route.ts",
  "src/app/api/agent/leads/[id]/engagement/route.ts",
  "src/app/api/agent/leads/[id]/activity/route.ts",
  "src/app/api/agent/tasks/route.ts",
  "src/app/api/agent/notes/route.ts",
  "src/lib/agent/lead-summary.ts",
  "src/lib/agent/lead-profile-snapshot.ts",
  "src/lib/agent/lead-profile-timeline.ts",
  "src/lib/agent/lead-profile-panels.ts",
];

const V2_REMINDERS_FILES = [
  "src/app/api/agent/leads-v2/[id]/tasks/route.ts",
  "src/lib/agent/lead-profile-v2/load-tasks.ts",
  "src/lib/agent/lead-profile-v2/tasks-query.ts",
  "src/components/agent/lead-profile-v2/LeadProfileV2RemindersPanel.tsx",
  "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2Tasks.ts",
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

function testForeignWorkspaceTasksUnavailable() {
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
    const loader = read("src/lib/agent/lead-profile-v2/load-tasks.ts");
    const accessCheck = "if (!lead || !v2CanAccessLead(ctx, lead)) return null";
    assert.ok(loader.includes(accessCheck));
    assert.ok(
      loader.indexOf(accessCheck) < loader.indexOf("prisma.agentTask.findMany"),
    );
    assert.ok(
      loader.indexOf(accessCheck) < loader.indexOf("prisma.leadNote.findMany"),
    );
  } finally {
    if (prevRead === undefined) delete process.env.WORKSPACE_READ_SCOPE;
    else process.env.WORKSPACE_READ_SCOPE = prevRead;
    if (prevDomain === undefined) delete process.env.TENANT_DOMAIN_SCOPE;
    else process.env.TENANT_DOMAIN_SCOPE = prevDomain;
  }
}

function testNoUnrelatedProfileQueries() {
  const loader = read("src/lib/agent/lead-profile-v2/load-tasks.ts");
  const route = read("src/app/api/agent/leads-v2/[id]/tasks/route.ts");
  const combined = `${loader}\n${route}`;
  for (const banned of [
    "lead-profile-snapshot",
    "loadLeadProfileSnapshot",
    "loadPagedLeadTimeline",
    "loadBuyerIntent",
    "computeHotness",
    "activityEvent",
    "listingView",
    "savedSearch",
    "leadEmailLog",
    "appointment",
    "htmlBody",
    "/summary",
    "$transaction",
    ".upsert(",
  ]) {
    assert.equal(
      combined.includes(banned),
      false,
      `tasks loader must not reference ${banned}`,
    );
  }
  assert.equal(loader.split("prisma.").length - 1, 3);
  for (const rel of V2_REMINDERS_FILES) {
    const src = read(rel);
    assert.equal(src.includes("/summary"), false, `${rel} must not call summary`);
    assert.equal(src.includes("htmlBody"), false, `${rel} must not mention htmlBody`);
  }
}

function testOnlyRequiredFieldsSelected() {
  assert.equal(V2_TASKS_TAKE, 40);
  const panels = read("src/lib/agent/lead-profile-panels.ts");
  assert.ok(panels.includes("take: 40"));
  const taskSelect = V2_TASKS_SELECT as Record<string, unknown>;
  const noteSelect = V2_FOLLOW_UP_NOTE_SELECT as Record<string, unknown>;
  const access = V2_TASKS_ACCESS_SELECT as Record<string, unknown>;
  for (const banned of ["body", "completedAt", "htmlBody", "meta"]) {
    assert.equal(banned in taskSelect, false, `task select must omit ${banned}`);
  }
  assert.equal("id" in taskSelect, true);
  assert.equal("title" in taskSelect, true);
  assert.equal("status" in taskSelect, true);
  assert.equal("type" in taskSelect, true);
  assert.equal("dueAt" in taskSelect, true);
  assert.equal("pinnedAt" in noteSelect, false);
  assert.equal("htmlBody" in noteSelect, false);
  assert.equal("body" in noteSelect, true);
  assert.equal("pinned" in noteSelect, true);
  assert.equal("customerId" in access, false);
  const loader = read("src/lib/agent/lead-profile-v2/load-tasks.ts");
  assert.ok(loader.includes("take: V2_TASKS_TAKE"));
}

function testTabIsLazyLoaded() {
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2Tasks.ts",
  );
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  assert.ok(hook.includes("if (!enabled)"));
  assert.ok(host.includes('useLeadProfileV2Tasks(session, leadId, tab === "reminders")'));
  assert.ok(host.includes('const [tab, setTab] = useState<LeadProfileV2TabId>("activity")'));
}

function testStaleResponsesDiscarded() {
  assert.equal(
    canApplyV2TasksResponse({
      stamp: { leadId: "lead-a", epoch: 1 },
      current: { leadId: "lead-b", epoch: 1 },
    }),
    false,
  );
  assert.equal(
    canApplyV2TasksResponse({
      stamp: { leadId: "lead-a", epoch: 1 },
      current: { leadId: "lead-a", epoch: 2 },
    }),
    false,
  );
  assert.equal(
    canApplyV2TasksResponse({
      stamp: { leadId: "lead-a", epoch: 2 },
      current: { leadId: "lead-a", epoch: 2 },
    }),
    true,
  );
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2Tasks.ts",
  );
  assert.ok(hook.includes("canApplyV2TasksResponse"));
}

function testAbortIsNotAnError() {
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2Tasks.ts",
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
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2Tasks.ts",
  );
  for (const src of [fetchSrc, hook]) {
    assert.equal(src.includes("retries"), false);
    assert.equal(src.includes("for (let attempt"), false);
  }
}

function testTargetedMutationRefresh() {
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  const panel = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2RemindersPanel.tsx",
  );
  assert.ok(panel.includes('onUpdated={onTaskCreated}'));
  assert.ok(panel.includes('method: "PATCH"'));
  assert.ok(panel.includes("/api/agent/notes"));
  assert.ok(panel.includes("/api/agent/TaskForm") === false);
  assert.ok(panel.includes("from \"@/components/agent/TaskForm\""));
  const taskCreated =
    host.split("const onTaskCreated")[1]?.split("const onNotePinned")[0] ?? "";
  const notePinned =
    host.split("const onNotePinned")[1]?.split("function startEditContact")[0] ??
    "";
  assert.ok(taskCreated.includes("reloadTasks()"));
  assert.ok(taskCreated.includes("reloadNextReminder()"));
  assert.ok(taskCreated.includes("reloadDefaultTimeline()"));
  assert.equal(taskCreated.includes("reload()"), false);
  assert.ok(notePinned.includes("reloadTasks()"));
  assert.ok(notePinned.includes("reloadDefaultTimeline()"));
  assert.equal(notePinned.includes("reload()"), false);
  assert.equal(host.includes("/api/agent/leads/${"), false);
  assert.equal(host.includes("/summary"), false);
}

function testMutationRoutesProtectLeadAccess() {
  const tasks = read("src/app/api/agent/tasks/route.ts");
  const notes = read("src/app/api/agent/notes/route.ts");
  assert.ok(tasks.includes("canAccessLead(ctx, lead)"));
  assert.ok(notes.includes("canAccessLead(ctx, lead)"));
  assert.ok(notes.includes("canAccessLead(ctx, existing.lead)"));
}

function testPresentationParity() {
  const panel = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2RemindersPanel.tsx",
  );
  assert.ok(panel.includes("Set reminder"));
  assert.ok(panel.includes("Follow-up notes"));
  assert.ok(panel.includes("Loading…"));
  assert.ok(panel.includes("Failed to load"));
  assert.ok(panel.includes("No reminders yet."));
  assert.equal(panel.includes("TaskCompleteButton"), false);
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
  const fetchTasks = async () => {
    starts += 1;
    concurrent += 1;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    await waitMs(40);
    concurrent -= 1;
  };

  session.request(V2_TASKS_RESOURCE_KEY, "lead-a", fetchTasks);
  session.request(V2_TASKS_RESOURCE_KEY, "lead-a", fetchTasks);
  session.request(V2_TASKS_RESOURCE_KEY, "lead-a", fetchTasks);
  assert.equal(starts, 1);
  assert.equal(session.inspect(V2_TASKS_RESOURCE_KEY).inFlight, true);
  assert.equal(session.inspect(V2_TASKS_RESOURCE_KEY).trailing, true);

  await waitUntil(
    () =>
      !session.inspect(V2_TASKS_RESOURCE_KEY).inFlight &&
      !session.inspect(V2_TASKS_RESOURCE_KEY).trailing,
  );
  assert.equal(maxConcurrent, 1);
  assert.equal(starts, 2);

  session.request("shell", "lead-a", fetchTasks);
  session.request(V2_TASKS_RESOURCE_KEY, "lead-a", fetchTasks);
  session.request("timeline", "lead-a", fetchTasks);
  assert.equal(session.inspect("shell").inFlight, true);
  assert.equal(session.inspect(V2_TASKS_RESOURCE_KEY).inFlight, true);
  await waitUntil(
    () =>
      !session.inspect("shell").inFlight &&
      !session.inspect(V2_TASKS_RESOURCE_KEY).inFlight &&
      !session.inspect("timeline").inFlight,
  );
}

async function testAbortOnLeadChange() {
  const session = createLeadProfileV2Session();
  const signals: AbortSignal[] = [];
  const fetchTasks = async (_leadId: string, signal: AbortSignal) => {
    signals.push(signal);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 200);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
      });
    });
  };

  session.request(V2_TASKS_RESOURCE_KEY, "lead-a", fetchTasks);
  session.request(V2_TASKS_RESOURCE_KEY, "lead-b", fetchTasks);
  assert.equal(signals[0]?.aborted, true);
  await waitUntil(() => !session.inspect(V2_TASKS_RESOURCE_KEY).inFlight);
}

function testFailedRemindersIsolated() {
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2Tasks.ts",
  );
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  assert.ok(hook.includes('setError(true)'));
  assert.ok(host.includes("tasks.error"));
  assert.equal(hook.includes("setData("), false);
  assert.equal(hook.includes("reloadDefaultTimeline"), false);
}

async function main() {
  testLegacyUntouchedByV2Imports();
  testForeignWorkspaceTasksUnavailable();
  testNoUnrelatedProfileQueries();
  testOnlyRequiredFieldsSelected();
  testTabIsLazyLoaded();
  testStaleResponsesDiscarded();
  testAbortIsNotAnError();
  testNoRetry();
  testTargetedMutationRefresh();
  testMutationRoutesProtectLeadAccess();
  testPresentationParity();
  testFailedRemindersIsolated();
  await testDuplicateRequestsPrevented();
  await testAbortOnLeadChange();
  console.log("lead-profile-v2-reminders-selftest: ok");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
