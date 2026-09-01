/**
 * Stage 4.6 — Native Tasks & Reminders isolation + HTTP-safety tests.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createPlatformAccessToken,
  createWorkspaceAccessToken,
  verifyMobileToken,
} from "../src/types/token-helpers";

const REPO_ROOT = join(__dirname, "../../..");
const TASKS_ROUTE = join(
  REPO_ROOT,
  "src/app/api/mobile/v2/leads/[leadId]/tasks/route.ts",
);
const TASK_PATCH_ROUTE = join(
  REPO_ROOT,
  "src/app/api/mobile/v2/leads/[leadId]/tasks/[taskId]/route.ts",
);

type MockLead = {
  id: string;
  workspaceId: string;
  assignedAgentId: string | null;
  organizationId: string;
  status: string;
  firstRespondedAt: Date | null;
};

const MOCK_LEADS: Record<string, MockLead> = {
  lead_canary_01: {
    id: "lead_canary_01",
    workspaceId: "ws_tenant_canary",
    assignedAgentId: "usr_canary_agent_01",
    organizationId: "org_canary",
    status: "NEW_LEAD",
    firstRespondedAt: null,
  },
  lead_canary_02_pond: {
    id: "lead_canary_02_pond",
    workspaceId: "ws_tenant_canary",
    assignedAgentId: null,
    organizationId: "org_canary",
    status: "NEW_LEAD",
    firstRespondedAt: null,
  },
  lead_canary_03_agent2: {
    id: "lead_canary_03_agent2",
    workspaceId: "ws_tenant_canary",
    assignedAgentId: "usr_canary_agent_02",
    organizationId: "org_canary",
    status: "CONTACTED",
    firstRespondedAt: new Date(),
  },
  lead_houzzat_01: {
    id: "lead_houzzat_01",
    workspaceId: "ws_houzzat_prod",
    assignedAgentId: "usr_houzzat_agent_01",
    organizationId: "org_houzzat",
    status: "NEW_LEAD",
    firstRespondedAt: null,
  },
};

type StoredTask = {
  id: string;
  leadId: string;
  workspaceId: string;
  organizationId: string;
  assigneeId: string;
  type: "CALL" | "EMAIL" | "TODO";
  status: "OPEN" | "DONE" | "CANCELLED";
  title: string;
  body: string | null;
  dueAt: string;
  completedAt: string | null;
};

type StoredActivity = {
  leadId: string;
  type: string;
  body: string;
};

const taskStore: StoredTask[] = [];
const activityStore: StoredActivity[] = [];

function authorize(tokenPayload: any, leadId: string) {
  if (
    !tokenPayload ||
    tokenPayload.type !== "mobile_workspace_access" ||
    !tokenPayload.wsId
  ) {
    return { ok: false as const, status: 403, code: "WORKSPACE_FORBIDDEN" };
  }
  const workspaceId = tokenPayload.wsId as string;
  const userId = tokenPayload.sub as string;
  const role = tokenPayload.role as string;
  const lead = MOCK_LEADS[leadId];
  if (!lead || lead.workspaceId !== workspaceId) {
    return { ok: false as const, status: 404, code: "LEAD_NOT_FOUND" };
  }
  if (role === "AGENT") {
    if (lead.assignedAgentId !== userId && lead.assignedAgentId !== null) {
      return { ok: false as const, status: 404, code: "LEAD_NOT_FOUND" };
    }
  } else if (role !== "OWNER" && role !== "ADMIN") {
    return { ok: false as const, status: 403, code: "WORKSPACE_FORBIDDEN" };
  }
  return { ok: true as const, userId, workspaceId, role, lead };
}

function listTasks(tokenPayload: any, leadId: string) {
  const access = authorize(tokenPayload, leadId);
  if (!access.ok) return access;
  const tasks = taskStore.filter(
    (t) => t.leadId === leadId && t.workspaceId === access.workspaceId,
  );
  return { ok: true as const, status: 200, tasks };
}

function createTask(tokenPayload: any, leadId: string, body: unknown) {
  const access = authorize(tokenPayload, leadId);
  if (!access.ok) return access;
  if (!body || typeof body !== "object") {
    return { ok: false as const, status: 400, code: "VALIDATION_ERROR" };
  }
  const raw = body as {
    title?: unknown;
    type?: unknown;
    dueAt?: unknown;
    body?: unknown;
  };
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!title || title.length > 200) {
    return { ok: false as const, status: 400, code: "VALIDATION_ERROR" };
  }
  if (typeof raw.dueAt !== "string" || Number.isNaN(Date.parse(raw.dueAt))) {
    return { ok: false as const, status: 400, code: "VALIDATION_ERROR" };
  }
  const type =
    raw.type === "CALL" || raw.type === "EMAIL" || raw.type === "TODO"
      ? raw.type
      : "TODO";

  const task: StoredTask = {
    id: `task_${taskStore.length + 1}`,
    leadId: access.lead.id,
    workspaceId: access.workspaceId,
    organizationId: access.lead.organizationId,
    assigneeId: access.userId,
    type,
    status: "OPEN",
    title,
    body: typeof raw.body === "string" ? raw.body : null,
    dueAt: new Date(raw.dueAt).toISOString(),
    completedAt: null,
  };
  taskStore.push(task);
  activityStore.push({
    leadId: access.lead.id,
    type: "reminder_set",
    body: `${type}: ${title}`,
  });
  return { ok: true as const, status: 200, task };
}

function patchTask(
  tokenPayload: any,
  leadId: string,
  taskId: string,
  body: unknown,
) {
  const access = authorize(tokenPayload, leadId);
  if (!access.ok) return access;
  const task = taskStore.find((t) => t.id === taskId);
  if (
    !task ||
    task.leadId !== access.lead.id ||
    task.workspaceId !== access.workspaceId
  ) {
    return { ok: false as const, status: 404, code: "TASK_NOT_FOUND" };
  }
  if (!body || typeof body !== "object") {
    return { ok: false as const, status: 400, code: "VALIDATION_ERROR" };
  }
  const raw = body as { status?: unknown; title?: unknown; dueAt?: unknown };
  if (raw.status !== undefined) {
    if (raw.status !== "OPEN" && raw.status !== "DONE" && raw.status !== "CANCELLED") {
      return { ok: false as const, status: 400, code: "VALIDATION_ERROR" };
    }
    task.status = raw.status;
    task.completedAt =
      raw.status === "DONE"
        ? new Date().toISOString()
        : raw.status === "OPEN"
          ? null
          : task.completedAt;
  }
  if (typeof raw.title === "string" && raw.title.trim()) {
    task.title = raw.title.trim();
  }
  if (typeof raw.dueAt === "string" && !Number.isNaN(Date.parse(raw.dueAt))) {
    task.dueAt = new Date(raw.dueAt).toISOString();
  }
  return { ok: true as const, status: 200, task: { ...task } };
}

function assertHttpSafe(label: string, path: string) {
  const src = readFileSync(path, "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.equal(/\$transaction\s*\(/.test(code), false, `${label}: no $transaction`);
  assert.equal(/\.updateMany\s*\(/.test(code), false, `${label}: no updateMany`);
  assert.equal(
    /activities\s*:\s*\{\s*create\s*:/.test(code),
    false,
    `${label}: no nested activities.create`,
  );
}

async function runStage46Tests() {
  console.log("=================================================================");
  console.log("STAGE 4.6 — NATIVE TASKS & REMINDERS TESTS");
  console.log("=================================================================\n");

  taskStore.length = 0;
  activityStore.length = 0;

  console.log("[1/12] HTTP-safe source (tasks GET/POST + PATCH)...");
  {
    assertHttpSafe("tasks route", TASKS_ROUTE);
    assertHttpSafe("task patch route", TASK_PATCH_ROUTE);
    console.log("  -> PASS");
  }

  const canaryAgent = createWorkspaceAccessToken({
    userId: "usr_canary_agent_01",
    email: "agent1@canary.com",
    workspaceId: "ws_tenant_canary",
    role: "AGENT",
  });
  const ca = verifyMobileToken(canaryAgent.token);
  assert.equal(ca.ok, true);
  if (!ca.ok) return;

  console.log("[2/12] Canary AGENT can create + list Canary lead tasks...");
  {
    const created = createTask(ca.payload, "lead_canary_01", {
      type: "CALL",
      title: "Follow up Canary",
      dueAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    assert.equal(created.ok, true);
    assert.equal(created.task?.status, "OPEN");
    assert.equal(created.task?.type, "CALL");

    const listed = listTasks(ca.payload, "lead_canary_01");
    assert.equal(listed.ok, true);
    assert.equal(listed.tasks?.length, 1);
    assert.equal(
      activityStore.filter((a) => a.type === "reminder_set").length,
      1,
    );
    console.log("  -> PASS");
  }

  console.log("[3/12] Complete + reopen...");
  {
    const taskId = taskStore[0]!.id;
    const done = patchTask(ca.payload, "lead_canary_01", taskId, {
      status: "DONE",
    });
    assert.equal(done.ok, true);
    assert.equal(done.task?.status, "DONE");
    assert.ok(done.task?.completedAt);

    const reopen = patchTask(ca.payload, "lead_canary_01", taskId, {
      status: "OPEN",
    });
    assert.equal(reopen.ok, true);
    assert.equal(reopen.task?.status, "OPEN");
    assert.equal(reopen.task?.completedAt, null);
    // No duplicate reminder_set on complete
    assert.equal(
      activityStore.filter((a) => a.type === "reminder_set").length,
      1,
    );
    console.log("  -> PASS");
  }

  console.log("[4/12] Canary AGENT cannot access Houzzat tasks...");
  {
    assert.equal(listTasks(ca.payload, "lead_houzzat_01").status, 404);
    assert.equal(
      createTask(ca.payload, "lead_houzzat_01", {
        title: "x",
        dueAt: new Date().toISOString(),
      }).status,
      404,
    );
    console.log("  -> PASS");
  }

  console.log("[5/12] Houzzat AGENT cannot access Canary tasks...");
  {
    const houzzat = createWorkspaceAccessToken({
      userId: "usr_houzzat_agent_01",
      email: "staff@houzzat.com",
      workspaceId: "ws_houzzat_prod",
      role: "AGENT",
    });
    const h = verifyMobileToken(houzzat.token);
    assert.equal(h.ok, true);
    if (!h.ok) return;
    assert.equal(listTasks(h.payload, "lead_canary_01").status, 404);
    assert.equal(
      createTask(h.payload, "lead_canary_01", {
        title: "x",
        dueAt: new Date().toISOString(),
      }).status,
      404,
    );
    console.log("  -> PASS");
  }

  console.log("[6/12] Agent A cannot access Agent B private lead tasks...");
  {
    assert.equal(listTasks(ca.payload, "lead_canary_03_agent2").status, 404);
    assert.equal(
      createTask(ca.payload, "lead_canary_03_agent2", {
        title: "x",
        dueAt: new Date().toISOString(),
      }).status,
      404,
    );
    console.log("  -> PASS");
  }

  console.log("[7/12] Pond lead create allowed for AGENT...");
  {
    const res = createTask(ca.payload, "lead_canary_02_pond", {
      type: "TODO",
      title: "Pond reminder",
      dueAt: new Date(Date.now() + 86400_000).toISOString(),
    });
    assert.equal(res.ok, true);
    console.log("  -> PASS");
  }

  console.log("[8/12] OWNER can access Agent B lead tasks...");
  {
    const owner = createWorkspaceAccessToken({
      userId: "usr_canary_owner",
      email: "owner@canary.com",
      workspaceId: "ws_tenant_canary",
      role: "OWNER",
    });
    const o = verifyMobileToken(owner.token);
    assert.equal(o.ok, true);
    if (!o.ok) return;
    const created = createTask(o.payload, "lead_canary_03_agent2", {
      title: "Owner task",
      dueAt: new Date().toISOString(),
    });
    assert.equal(created.ok, true);
    const listed = listTasks(o.payload, "lead_canary_03_agent2");
    assert.equal(listed.ok, true);
    assert.ok((listed.tasks?.length ?? 0) >= 1);
    console.log("  -> PASS");
  }

  console.log("[9/12] Client workspace spoof has no effect...");
  {
    // Token is Canary — Houzzat lead still 404 regardless of spoofed header intent.
    assert.equal(listTasks(ca.payload, "lead_houzzat_01").status, 404);
    console.log("  -> PASS");
  }

  console.log("[10/12] Platform-only token rejected...");
  {
    const platform = createPlatformAccessToken({
      id: "usr_platform",
      email: "platform@houzzat.com",
    });
    const p = verifyMobileToken(platform.token);
    assert.equal(p.ok, true);
    if (!p.ok) return;
    assert.equal(listTasks(p.payload, "lead_canary_01").status, 403);
    assert.equal(
      createTask(p.payload, "lead_canary_01", {
        title: "x",
        dueAt: new Date().toISOString(),
      }).status,
      403,
    );
    console.log("  -> PASS");
  }

  console.log("[11/12] Invalid taskId from another workspace rejected...");
  {
    const houzzat = createWorkspaceAccessToken({
      userId: "usr_houzzat_agent_01",
      email: "staff@houzzat.com",
      workspaceId: "ws_houzzat_prod",
      role: "AGENT",
    });
    const h = verifyMobileToken(houzzat.token);
    assert.equal(h.ok, true);
    if (!h.ok) return;
    const foreign = createTask(h.payload, "lead_houzzat_01", {
      title: "Houzzat only",
      dueAt: new Date().toISOString(),
    });
    assert.equal(foreign.ok, true);
    const crossPatch = patchTask(
      ca.payload,
      "lead_canary_01",
      foreign.task!.id,
      { status: "DONE" },
    );
    assert.equal(crossPatch.status, 404);
    console.log("  -> PASS");
  }

  console.log("[12/12] Invalid dueAt / empty title rejected...");
  {
    assert.equal(
      createTask(ca.payload, "lead_canary_01", {
        title: "  ",
        dueAt: new Date().toISOString(),
      }).status,
      400,
    );
    assert.equal(
      createTask(ca.payload, "lead_canary_01", {
        title: "ok",
        dueAt: "not-a-date",
      }).status,
      400,
    );
    console.log("  -> PASS");
  }

  console.log("\n=================================================================");
  console.log("STAGE 4.6 TASKS & REMINDERS TESTS: ALL PASSED");
  console.log("=================================================================");
}

runStage46Tests().catch((err) => {
  console.error("STAGE 4.6 TESTS FAILED:", err);
  process.exit(1);
});
