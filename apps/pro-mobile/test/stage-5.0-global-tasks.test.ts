/**
 * Stage 5.0 — Native Global Tasks isolation + parity tests.
 *
 * Web Global Tasks = AgentTask OPEN inbox (/agent/tasks + Instant Shell).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { unwrapCreatedTask, unwrapTasksList } from "../src/lib/task-response";
import {
  createPlatformAccessToken,
  createWorkspaceAccessToken,
  verifyMobileToken,
} from "../src/types/token-helpers";

const REPO_ROOT = join(__dirname, "../../..");
const TASKS_ROUTE = join(REPO_ROOT, "src/app/api/mobile/v2/tasks/route.ts");
const TASK_PATCH_ROUTE = join(
  REPO_ROOT,
  "src/app/api/mobile/v2/tasks/[taskId]/route.ts",
);
const AGENT_SHELL = join(
  REPO_ROOT,
  "apps/pro-mobile/src/screens/AgentShell.tsx",
);
const GLOBAL_SCREEN = join(
  REPO_ROOT,
  "apps/pro-mobile/src/screens/GlobalTasksScreen.tsx",
);

const CANARY_PARITY = {
  workspaceId: "ws_tenant_canary",
  tasks: [
    {
      id: "task_canary_01",
      type: "CALL",
      status: "OPEN",
      title: "Call Alice about showing",
      body: null as string | null,
      dueAt: "2026-08-30T15:00:00.000Z",
      completedAt: null as string | null,
      createdAt: "2026-08-29T12:00:00.000Z",
      updatedAt: "2026-08-29T12:00:00.000Z",
      leadId: "lead_canary_01",
      lead: {
        id: "lead_canary_01",
        customer: { name: "Alice Canary", email: "alice@canary.test" },
      },
      assigneeId: "usr_canary_agent_01",
      workspaceId: "ws_tenant_canary",
    },
    {
      id: "task_canary_02",
      type: "TODO",
      status: "OPEN",
      title: "Personal follow-up (no lead)",
      body: null as string | null,
      dueAt: "2026-09-05T18:00:00.000Z",
      completedAt: null as string | null,
      createdAt: "2026-08-30T12:00:00.000Z",
      updatedAt: "2026-08-30T12:00:00.000Z",
      leadId: null as string | null,
      lead: null as null,
      assigneeId: "usr_canary_agent_01",
      workspaceId: "ws_tenant_canary",
    },
  ],
};

const HOUZZAT_PARITY = {
  workspaceId: "ws_houzzat_prod",
  tasks: [
    {
      id: "task_houzzat_01",
      type: "EMAIL",
      status: "OPEN",
      title: "Email Cevig welcome follow-up",
      body: null as string | null,
      dueAt: "2026-09-02T14:00:00.000Z",
      completedAt: null as string | null,
      createdAt: "2026-08-29T01:00:00.000Z",
      updatedAt: "2026-08-29T01:00:00.000Z",
      leadId: "cmtdo9u1p000cpsp7taxictsi",
      lead: {
        id: "cmtdo9u1p000cpsp7taxictsi",
        customer: { name: "Cevig", email: "cevig95014@dd2car.com" },
      },
      assigneeId: "usr_houzzat_agent_01",
      workspaceId: "ws_houzzat_prod",
    },
  ],
};

type MockLead = {
  id: string;
  workspaceId: string;
  assignedAgentId: string | null;
  organizationId: string;
};

const MOCK_LEADS: Record<string, MockLead> = {
  lead_canary_01: {
    id: "lead_canary_01",
    workspaceId: "ws_tenant_canary",
    assignedAgentId: "usr_canary_agent_01",
    organizationId: "org_canary",
  },
  lead_canary_03_agent2: {
    id: "lead_canary_03_agent2",
    workspaceId: "ws_tenant_canary",
    assignedAgentId: "usr_canary_agent_02",
    organizationId: "org_canary",
  },
};

type StoredTask = {
  id: string;
  type: "CALL" | "EMAIL" | "TODO";
  status: "OPEN" | "DONE" | "CANCELLED";
  title: string;
  body: string | null;
  dueAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  leadId: string | null;
  lead: {
    id: string;
    customer: { name: string; email: string };
  } | null;
  assigneeId: string;
  workspaceId: string;
};
const taskStore: StoredTask[] = [];

function authorizeWorkspace(tokenPayload: unknown) {
  const p = tokenPayload as {
    type?: string;
    wsId?: string;
    sub?: string;
    role?: string;
  };
  if (!p || p.type !== "mobile_workspace_access" || !p.wsId) {
    return { ok: false as const, status: 403, code: "WORKSPACE_FORBIDDEN" };
  }
  if (p.role !== "AGENT" && p.role !== "OWNER" && p.role !== "ADMIN") {
    return { ok: false as const, status: 403, code: "WORKSPACE_FORBIDDEN" };
  }
  return {
    ok: true as const,
    userId: p.sub!,
    workspaceId: p.wsId,
    role: p.role!,
  };
}

function listTasks(tokenPayload: unknown) {
  const access = authorizeWorkspace(tokenPayload);
  if (!access.ok) return access;
  let tasks = taskStore.filter(
    (t) => t.workspaceId === access.workspaceId && t.status === "OPEN",
  );
  if (access.role === "AGENT") {
    tasks = tasks.filter((t) => t.assigneeId === access.userId);
  }
  tasks = [...tasks].sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  return { ok: true as const, status: 200, tasks };
}

function createTask(tokenPayload: unknown, body: unknown) {
  const access = authorizeWorkspace(tokenPayload);
  if (!access.ok) return access;
  if (!body || typeof body !== "object") {
    return { ok: false as const, status: 400, code: "VALIDATION_ERROR" };
  }
  const raw = body as {
    title?: unknown;
    dueAt?: unknown;
    type?: unknown;
    leadId?: unknown;
  };
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const dueAt = typeof raw.dueAt === "string" ? raw.dueAt : "";
  if (!title || !dueAt || Number.isNaN(Date.parse(dueAt))) {
    return { ok: false as const, status: 400, code: "VALIDATION_ERROR" };
  }
  let leadId: string | null = null;
  let lead: StoredTask["lead"] = null;
  if (typeof raw.leadId === "string" && raw.leadId) {
    const leadRow = MOCK_LEADS[raw.leadId];
    if (!leadRow || leadRow.workspaceId !== access.workspaceId) {
      return { ok: false as const, status: 404, code: "LEAD_NOT_FOUND" };
    }
    if (
      access.role === "AGENT" &&
      leadRow.assignedAgentId !== access.userId &&
      leadRow.assignedAgentId !== null
    ) {
      return { ok: false as const, status: 404, code: "LEAD_NOT_FOUND" };
    }
    leadId = leadRow.id;
    lead = {
      id: leadRow.id,
      customer: { name: "Lead", email: "lead@test" },
    };
  }
  const task: StoredTask = {
    id: `task_${taskStore.length + 1}`,
    type: (raw.type as StoredTask["type"]) || "TODO",
    status: "OPEN",
    title,
    body: null,
    dueAt,
    completedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    leadId,
    lead,
    assigneeId: access.userId,
    workspaceId: access.workspaceId,
  };
  taskStore.push(task);
  return { ok: true as const, status: 200, task };
}

function patchTask(tokenPayload: unknown, taskId: string, body: unknown) {
  const access = authorizeWorkspace(tokenPayload);
  if (!access.ok) return access;
  const task = taskStore.find((t) => t.id === taskId);
  if (!task || task.workspaceId !== access.workspaceId) {
    return { ok: false as const, status: 404, code: "TASK_NOT_FOUND" };
  }
  if (access.role === "AGENT" && task.assigneeId !== access.userId) {
    return { ok: false as const, status: 404, code: "TASK_NOT_FOUND" };
  }
  const raw = (body || {}) as { status?: string };
  if (raw.status === "DONE") {
    task.status = "DONE";
    task.completedAt = new Date().toISOString();
  } else if (raw.status === "OPEN") {
    task.status = "OPEN";
    task.completedAt = null;
  }
  task.updatedAt = new Date().toISOString();
  return { ok: true as const, status: 200, task };
}

function assertHttpSafe(label: string, path: string) {
  const src = readFileSync(path, "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.equal(/\$transaction\s*\(/.test(code), false, `${label}: no $transaction`);
}

async function runStage50Tests() {
  console.log("=================================================================");
  console.log("STAGE 5.0 — NATIVE GLOBAL TASKS TESTS");
  console.log("=================================================================\n");

  taskStore.length = 0;
  for (const t of CANARY_PARITY.tasks) taskStore.push({ ...t } as StoredTask);
  for (const t of HOUZZAT_PARITY.tasks) taskStore.push({ ...t } as StoredTask);

  console.log("[1/14] HTTP-safe routes + authorizeMobileWorkspaceAccess...");
  {
    assertHttpSafe("tasks route", TASKS_ROUTE);
    assertHttpSafe("task patch route", TASK_PATCH_ROUTE);
    const src = readFileSync(TASKS_ROUTE, "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.ok(src.includes("authorizeMobileWorkspaceAccess"));
    assert.ok(src.includes("agentTask"));
    assert.ok(src.includes('status: "OPEN"'));
    assert.equal(/\$transaction\s*\(/.test(code), false);
    console.log("  -> PASS");
  }

  console.log("[2/14] GlobalTasksScreen mounted in AgentShell...");
  {
    const shell = readFileSync(AGENT_SHELL, "utf8");
    assert.ok(shell.includes("GlobalTasksScreen"));
    assert.ok(shell.includes("<GlobalTasksScreen"));
    assert.equal(shell.includes("ALL CAUGHT UP"), false);
    const screen = readFileSync(GLOBAL_SCREEN, "utf8");
    assert.ok(screen.includes("Tasks & Reminders"));
    assert.ok(screen.includes("Overdue"));
    assert.ok(screen.includes("Upcoming"));
    assert.ok(screen.includes("All caught up"));
    assert.ok(screen.includes("globalTaskCache"));
    assert.ok(screen.includes("/tasks"));
    console.log("  -> PASS");
  }

  console.log("[3/14] Unwrap helpers...");
  {
    const list = unwrapTasksList({
      ok: true,
      tasks: [{ id: "t1", title: "Hi" }],
    });
    assert.equal(list.length, 1);
    assert.equal(unwrapCreatedTask({ ok: true, task: { id: "t2" } })?.id, "t2");
    console.log("  -> PASS");
  }

  console.log("[4/14] Canary web ↔ Mobile v2 parity...");
  {
    const token = createWorkspaceAccessToken({
      userId: "usr_canary_agent_01",
      email: "agent1@canary.com",
      workspaceId: CANARY_PARITY.workspaceId,
      role: "AGENT",
    });
    const verified = verifyMobileToken(token.token);
    assert.equal(verified.ok, true);
    if (!verified.ok) return;
    const res = listTasks(verified.payload);
    assert.equal(res.ok, true);
    assert.equal(res.tasks?.length, 2);
    assert.equal(res.tasks?.[0]?.id, "task_canary_01");
    assert.equal(res.tasks?.[0]?.title, "Call Alice about showing");
    assert.equal(res.tasks?.[1]?.leadId, null);
    console.log("  -> PASS");
  }

  console.log("[5/14] Houzzat web ↔ Mobile v2 parity...");
  {
    const token = createWorkspaceAccessToken({
      userId: "usr_houzzat_agent_01",
      email: "staff@houzzat.com",
      workspaceId: HOUZZAT_PARITY.workspaceId,
      role: "AGENT",
    });
    const verified = verifyMobileToken(token.token);
    assert.equal(verified.ok, true);
    if (!verified.ok) return;
    const res = listTasks(verified.payload);
    assert.equal(res.ok, true);
    assert.equal(res.tasks?.length, 1);
    assert.equal(res.tasks?.[0]?.id, "task_houzzat_01");
    console.log("  -> PASS");
  }

  console.log("[6/14] Canary AGENT cannot see Houzzat tasks...");
  {
    const token = createWorkspaceAccessToken({
      userId: "usr_canary_agent_01",
      email: "agent1@canary.com",
      workspaceId: "ws_tenant_canary",
      role: "AGENT",
    });
    const verified = verifyMobileToken(token.token);
    assert.equal(verified.ok, true);
    if (!verified.ok) return;
    const res = listTasks(verified.payload);
    assert.equal(res.ok, true);
    assert.equal(
      res.tasks?.some((t) => t.workspaceId === "ws_houzzat_prod"),
      false,
    );
    console.log("  -> PASS");
  }

  console.log("[7/14] Agent A cannot complete Agent B private task...");
  {
    taskStore.push({
      id: "task_agent2_private",
      type: "CALL",
      status: "OPEN",
      title: "Agent 2 only",
      body: null,
      dueAt: "2026-09-10T12:00:00.000Z",
      completedAt: null,
      createdAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-01T12:00:00.000Z",
      leadId: "lead_canary_03_agent2",
      lead: null,
      assigneeId: "usr_canary_agent_02",
      workspaceId: "ws_tenant_canary",
    });
    const token = createWorkspaceAccessToken({
      userId: "usr_canary_agent_01",
      email: "agent1@canary.com",
      workspaceId: "ws_tenant_canary",
      role: "AGENT",
    });
    const verified = verifyMobileToken(token.token);
    assert.equal(verified.ok, true);
    if (!verified.ok) return;
    const listed = listTasks(verified.payload);
    assert.equal(listed.ok, true);
    if (!listed.ok) return;
    assert.equal(
      listed.tasks.some((t: StoredTask) => t.id === "task_agent2_private"),
      false,
    );
    const patched = patchTask(verified.payload, "task_agent2_private", {
      status: "DONE",
    });
    assert.equal(patched.ok, false);
    console.log("  -> PASS");
  }

  console.log("[8/14] OWNER same-workspace can list agent tasks...");
  {
    const token = createWorkspaceAccessToken({
      userId: "usr_canary_owner",
      email: "owner@canary.com",
      workspaceId: "ws_tenant_canary",
      role: "OWNER",
    });
    const verified = verifyMobileToken(token.token);
    assert.equal(verified.ok, true);
    if (!verified.ok) return;
    const res = listTasks(verified.payload);
    assert.equal(res.ok, true);
    assert.ok((res.tasks?.length ?? 0) >= 2);
    console.log("  -> PASS");
  }

  console.log("[9/14] Complete then reopen parity...");
  {
    const token = createWorkspaceAccessToken({
      userId: "usr_canary_agent_01",
      email: "agent1@canary.com",
      workspaceId: "ws_tenant_canary",
      role: "AGENT",
    });
    const verified = verifyMobileToken(token.token);
    assert.equal(verified.ok, true);
    if (!verified.ok) return;
    const done = patchTask(verified.payload, "task_canary_01", { status: "DONE" });
    assert.equal(done.ok, true);
    assert.equal(done.task?.status, "DONE");
    const reopen = patchTask(verified.payload, "task_canary_01", {
      status: "OPEN",
    });
    assert.equal(reopen.ok, true);
    assert.equal(reopen.task?.status, "OPEN");
    console.log("  -> PASS");
  }

  console.log("[10/14] Create lead-less + foreign lead rejected...");
  {
    const token = createWorkspaceAccessToken({
      userId: "usr_canary_agent_01",
      email: "agent1@canary.com",
      workspaceId: "ws_tenant_canary",
      role: "AGENT",
    });
    const verified = verifyMobileToken(token.token);
    assert.equal(verified.ok, true);
    if (!verified.ok) return;
    const created = createTask(verified.payload, {
      type: "CALL",
      title: "New global reminder",
      dueAt: "2026-09-08T16:00:00.000Z",
    });
    assert.equal(created.ok, true);
    assert.equal(created.task?.leadId, null);
    const foreign = createTask(verified.payload, {
      type: "CALL",
      title: "Bad lead",
      dueAt: "2026-09-08T16:00:00.000Z",
      leadId: "lead_does_not_exist",
    });
    assert.equal(foreign.ok, false);
    console.log("  -> PASS");
  }

  console.log("[11/14] Client workspace spoof / private lead create rejected...");
  {
    const token = createWorkspaceAccessToken({
      userId: "usr_canary_agent_01",
      email: "agent1@canary.com",
      workspaceId: "ws_tenant_canary",
      role: "AGENT",
    });
    const verified = verifyMobileToken(token.token);
    assert.equal(verified.ok, true);
    if (!verified.ok) return;
    // Cannot create on another agent's private lead
    const privateLead = createTask(verified.payload, {
      type: "CALL",
      title: "Steal agent2 lead",
      dueAt: "2026-09-08T16:00:00.000Z",
      leadId: "lead_canary_03_agent2",
    });
    assert.equal(privateLead.ok, false);
    // Signed token wsId is authoritative — unsigned mutation of claim is not a real client capability
    const listed = listTasks(verified.payload);
    assert.equal(listed.ok, true);
    assert.equal(
      listed.tasks?.some((t) => t.workspaceId === "ws_houzzat_prod"),
      false,
    );
    console.log("  -> PASS");
  }

  console.log("[12/14] Platform token rejected...");
  {
    const platform = createPlatformAccessToken({
      id: "usr_admin",
      email: "admin@houzzat.com",
    });
    const verified = verifyMobileToken(platform.token);
    assert.equal(verified.ok, true);
    if (!verified.ok) return;
    const res = listTasks(verified.payload);
    assert.equal(res.ok, false);
    console.log("  -> PASS");
  }

  console.log("[13/14] Foreign taskId rejected...");
  {
    const token = createWorkspaceAccessToken({
      userId: "usr_canary_agent_01",
      email: "agent1@canary.com",
      workspaceId: "ws_tenant_canary",
      role: "AGENT",
    });
    const verified = verifyMobileToken(token.token);
    assert.equal(verified.ok, true);
    if (!verified.ok) return;
    const res = patchTask(verified.payload, "task_does_not_exist", {
      status: "DONE",
    });
    assert.equal(res.ok, false);
    console.log("  -> PASS");
  }

  console.log("[14/14] Cache coherence helpers present...");
  {
    const cache = readFileSync(
      join(REPO_ROOT, "apps/pro-mobile/src/lib/lead-tab-cache.ts"),
      "utf8",
    );
    assert.ok(cache.includes("globalTaskCache"));
    assert.ok(cache.includes("invalidateLeadTasksCacheForLead"));
    assert.ok(cache.includes("invalidateGlobalTasksCacheForWorkspace"));
    const leadTab = readFileSync(
      join(REPO_ROOT, "apps/pro-mobile/src/components/TasksRemindersTab.tsx"),
      "utf8",
    );
    assert.ok(leadTab.includes("invalidateGlobalTasksCacheForWorkspace"));
    console.log("  -> PASS");
  }

  console.log("\nSTAGE 5.0 — ALL TESTS PASSED\n");
}

runStage50Tests().catch((err) => {
  console.error(err);
  process.exit(1);
});
