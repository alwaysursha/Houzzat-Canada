/**
 * Stage 3J.6 — Task_B canary selftest (no production writes).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "@prisma/client";
import {
  CANARY_TASK_CONFIRM_TOKEN,
  executeTaskCanaryApply,
  resolveTrustedCanaryBContext,
  validateTaskCanaryApplyConfirmation,
} from "./lib/tenant-task-canary";
import {
  CANARY_AFFILIATION,
  CANARY_NAME,
  CANARY_ROUTING_SETTINGS_ID,
  CANARY_SLUG,
  type HouzzatBaseline,
} from "./lib/tenant-canary-provision";
import { CANARY_LEAD_MARKER } from "./lib/tenant-lead-canary";
import { agentTaskTenantWhere } from "../src/lib/crm-read-scope";
import type { CrmScopeContext } from "../src/lib/crm-read-scope";
import { HOUZZAT_WORKSPACE_SLUG } from "../src/lib/crm-ownership";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const CALL_NEW_LEAD_TASK_TITLE = "Call new lead";

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testApplyGuard() {
  assert.equal(
    validateTaskCanaryApplyConfirmation({ apply: true, confirm: null }),
    `--apply requires --confirm=${CANARY_TASK_CONFIRM_TOKEN}`,
  );
  assert.equal(
    validateTaskCanaryApplyConfirmation({
      apply: true,
      confirm: CANARY_TASK_CONFIRM_TOKEN,
    }),
    null,
  );
}

function testStructure() {
  const lib = read("scripts/lib/tenant-task-canary.ts");
  const cli = read("scripts/workspace-task-canary.ts");
  assert.ok(lib.includes("createCallNewLeadTask"));
  assert.ok(lib.includes("resolveChildCrmOwnership reads Lead_B.workspaceId"));
  assert.ok(lib.includes("agentTaskTenantWhere"));
  assert.ok(lib.includes(CALL_NEW_LEAD_TASK_TITLE));
  assert.ok(!lib.includes("notifyNewLeadCaptured"));
  assert.ok(cli.includes("requireScopeAckForApply"));
  assert.ok(cli.includes("resolveTrustedCanaryBContext"));
}

function testChildInheritsWorkspace() {
  const lib = read("scripts/lib/tenant-task-canary.ts");
  assert.ok(lib.includes("task.workspaceId !== context.workspaceId"));
  assert.ok(!lib.includes("resolveLeadCrmOwnership("));
}

function testTaskIsolationPredicate() {
  const prev = process.env.WORKSPACE_READ_SCOPE;
  process.env.WORKSPACE_READ_SCOPE = "workspace";
  try {
    const ctx: CrmScopeContext = {
      user: { id: "u1" },
      organizationId: "org",
      organizationIds: ["org"],
      canSeeTeamLeads: true,
      isPlatformAdmin: false,
      workspaceId: "ws_b",
      isWorkspaceMember: true,
      isWorkspaceCrmAllowed: true,
      hasAmbiguousWorkspaceMembership: false,
    };
    assert.deepEqual(agentTaskTenantWhere(ctx), { workspaceId: "ws_b" });
  } finally {
    if (prev === undefined) delete process.env.WORKSPACE_READ_SCOPE;
    else process.env.WORKSPACE_READ_SCOPE = prev;
  }
}

function testRollbackExactOnly() {
  const lib = read("scripts/lib/tenant-task-canary.ts");
  assert.ok(lib.includes(CALL_NEW_LEAD_TASK_TITLE));
  assert.ok(lib.includes("workspaceId: context.workspaceId"));
  assert.ok(!lib.includes("deleteMany({ where: { workspaceId"));
}

/** Mirrors workspace-task-canary.ts apply imports — catches missing re-exports. */
async function testCliApplyImportGraph() {
  const taskLib = await import("./lib/tenant-task-canary");
  const symbols = [
    "buildTaskCanaryPlan",
    "executeTaskCanaryApply",
    "formatTaskCanaryReport",
    "parseTaskCanaryCliArgs",
    "requireLeadEmailForApply",
    "requireScopeAckForApply",
    "resolveLeadCanaryInputFromEnv",
    "resolveTrustedCanaryBContext",
    "validateTaskCanaryApplyConfirmation",
  ] as const;

  for (const name of symbols) {
    assert.equal(
      typeof taskLib[name],
      "function",
      `tenant-task-canary must export function ${name}`,
    );
  }
}

function createMockPrismaForTrustedContext() {
  const wsB = {
    id: "ws_b_canary",
    slug: CANARY_SLUG,
    status: "ACTIVE",
    name: CANARY_NAME,
    brokerageAffiliation: CANARY_AFFILIATION,
    primaryAgentId: "agent_b_id",
  };
  const houzzat = { id: "ws_houzzat" };
  const compatOrg = { id: "org_demo", slug: "demo-agent" };
  const members = [
    {
      role: "OWNER",
      userId: "owner_b_id",
      user: { email: "owner@canary.invalid", role: "ADMIN", agentProfile: null },
    },
    {
      role: "AGENT",
      userId: "agent_b_id",
      user: {
        email: "agent@canary.invalid",
        role: "AGENT",
        agentProfile: { active: true },
      },
    },
  ];
  const routing = {
    id: CANARY_ROUTING_SETTINGS_ID,
    workspaceId: wsB.id,
    listingAgentId: "agent_b_id",
    sellerAssignMode: "LISTING_AGENT",
    weights: [
      { lane: "BUYER", percent: 100, agentId: "agent_b_id" },
      { lane: "SELLER", percent: 100, agentId: "agent_b_id" },
    ],
  };

  return {
    workspace: {
      findUnique: async (args: { where: { slug: string } }) => {
        if (args.where.slug === CANARY_SLUG) return wsB;
        if (args.where.slug === HOUZZAT_WORKSPACE_SLUG) return houzzat;
        return null;
      },
    },
    organization: {
      findUnique: async () => compatOrg,
    },
    workspaceMember: {
      findMany: async () => members,
    },
    crmRoutingSettings: {
      findUnique: async (args: { where: { id: string } }) => {
        if (args.where.id === CANARY_ROUTING_SETTINGS_ID) return routing;
        return null;
      },
    },
    crmRoutingWeight: {
      count: async () => 0,
    },
  } as unknown as PrismaClient;
}

async function testResolveTrustedCanaryBContextRuntime() {
  const prisma = createMockPrismaForTrustedContext();
  const context = await resolveTrustedCanaryBContext(prisma);
  assert.equal(context.workspaceId, "ws_b_canary");
  assert.equal(context.agentBId, "agent_b_id");
  assert.equal(context.compatOrgSlug, "demo-agent");
}

function baselineFixture(): HouzzatBaseline {
  return {
    workspaceId: "ws_houzzat",
    memberCount: 4,
    crm: { leadCount: 54, nullWorkspaceLeads: 0 },
    routing: {
      listingAgentIdPrefix: "cmrz0wkx",
      buyerTotal: 100,
      sellerTotal: 100,
    },
  };
}

function createMockPrismaForApply(input: {
  existingTaskId?: string;
  leadId?: string;
}) {
  const leadId = input.leadId ?? "lead_b_id";
  const contextWorkspaceId = "ws_b_canary";
  let createCalls = 0;

  const prisma = {
    lead: {
      findFirst: async () => ({
        id: leadId,
        workspaceId: contextWorkspaceId,
        organizationId: "org_demo",
        assignedAgentId: "agent_b_id",
        notes: CANARY_LEAD_MARKER,
      }),
    },
    agentTask: {
      findFirst: async () =>
        input.existingTaskId ? { id: input.existingTaskId } : null,
    },
    get createCallCount() {
      return createCalls;
    },
  };

  return {
    prisma: prisma as unknown as PrismaClient,
    leadId,
    trackCreate: () => {
      createCalls++;
    },
  };
}

async function testExecuteApplyCreateAndIdempotent() {
  const { prisma, leadId, trackCreate } = createMockPrismaForApply({});
  const context = {
    workspaceId: "ws_b_canary",
    workspaceSlug: CANARY_SLUG,
    houzzatWorkspaceId: "ws_houzzat",
    compatOrgId: "org_demo",
    compatOrgSlug: "demo-agent",
    agentBId: "agent_b_id",
    agentBPrefix: "agent_b_",
    ownerBId: "owner_b_id",
    ownerBPrefix: "owner_b_",
    primaryAgentId: "agent_b_id",
    routingSettingsId: CANARY_ROUTING_SETTINGS_ID,
    buyerTotal: 100,
    sellerTotal: 100,
  };
  const baseline = baselineFixture();
  const input = { leadEmail: "lead@canary.invalid", leadName: "Canary" };

  const created = await executeTaskCanaryApply(prisma, input, context, baseline, {
    createCallNewLeadTask: async (taskInput) => {
      trackCreate();
      assert.equal(taskInput.leadId, leadId);
      assert.equal(taskInput.assigneeId, "agent_b_id");
      assert.equal(taskInput.organizationId, "org_demo");
      return {
        id: "task_b_id",
        workspaceId: context.workspaceId,
        assigneeId: "agent_b_id",
        organizationId: "org_demo",
        leadId,
        title: CALL_NEW_LEAD_TASK_TITLE,
      } as Awaited<ReturnType<typeof import("../src/lib/agent/lead-intake").createCallNewLeadTask>>;
    },
    captureHouzzatBaseline: async () => baseline,
  });

  assert.equal(created.length, 1);
  assert.equal(created[0]?.action, "CREATE");
  assert.equal(created[0]?.detail, "task_b_id");

  const { prisma: prisma2 } = createMockPrismaForApply({
    existingTaskId: "task_b_id",
    leadId,
  });
  const again = await executeTaskCanaryApply(
    prisma2,
    input,
    context,
    baseline,
    {
      createCallNewLeadTask: async () => {
        throw new Error("must not create duplicate Task_B");
      },
    },
  );
  assert.equal(again.length, 1);
  assert.equal(again[0]?.action, "ALREADY_MATCHES");
}

async function testRollbackApplyImportGraph() {
  const taskLib = await import("./lib/tenant-task-canary");
  assert.equal(typeof taskLib.executeTaskCanaryRollbackApply, "function");
  assert.equal(typeof taskLib.buildTaskCanaryRollbackPlan, "function");
}

async function main() {
  testApplyGuard();
  testStructure();
  testChildInheritsWorkspace();
  testTaskIsolationPredicate();
  testRollbackExactOnly();
  await testCliApplyImportGraph();
  await testResolveTrustedCanaryBContextRuntime();
  await testExecuteApplyCreateAndIdempotent();
  await testRollbackApplyImportGraph();
  console.log("workspace2-task-canary:selftest ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
