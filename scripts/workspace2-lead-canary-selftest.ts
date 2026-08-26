/**
 * Stage 3J.4 — Lead B canary selftest (no production writes by default).
 *
 * Run: pnpm workspace2-lead-canary:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CANARY_LEAD_CONFIRM_TOKEN,
  CANARY_LEAD_MARKER,
  buildReadIsolationPlan,
  parseLeadCanaryCliArgs,
  validateLeadCanaryApplyConfirmation,
} from "./lib/tenant-lead-canary";
import { CANARY_SLUG } from "./lib/tenant-canary-provision";
import { HOUZZAT_WORKSPACE_SLUG } from "../src/lib/crm-ownership";
import {
  canAccessLead,
  type CrmScopeContext,
} from "../src/lib/crm-read-scope";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function ctx(workspaceId: string): CrmScopeContext {
  return {
    user: { id: "user_x" },
    organizationId: "org_demo",
    organizationIds: ["org_demo"],
    canSeeTeamLeads: true,
    isPlatformAdmin: false,
    workspaceId,
    isWorkspaceMember: true,
    isWorkspaceCrmAllowed: true,
    hasAmbiguousWorkspaceMembership: false,
  };
}

function testApplyGuard() {
  assert.equal(
    validateLeadCanaryApplyConfirmation({ apply: true, confirm: null }),
    `--apply requires --confirm=${CANARY_LEAD_CONFIRM_TOKEN}`,
  );
  assert.equal(
    validateLeadCanaryApplyConfirmation({
      apply: true,
      confirm: CANARY_LEAD_CONFIRM_TOKEN,
    }),
    null,
  );
}

function testStructure() {
  const lib = read("scripts/lib/tenant-lead-canary.ts");
  const cli = read("scripts/workspace-lead-canary.ts");
  const rollback = read("scripts/rollback-lead-canary.ts");

  assert.ok(lib.includes("resolveTrustedCanaryBContext"));
  assert.ok(lib.includes("resolveWorkspaceRoutedAssignee"));
  assert.ok(lib.includes("workspaceId: context.workspaceId"));
  assert.ok(!lib.includes("resolveLeadCrmOwnership("));
  assert.ok(!cli.includes("fetch("));
  assert.ok(!cli.includes('"/api/leads"'));
  assert.ok(cli.includes("requireScopeAckForApply"));
  assert.ok(lib.includes(CANARY_LEAD_MARKER));
  assert.ok(lib.includes("createCallNewLeadTask deferred"));
  assert.ok(!lib.includes("notifyNewLeadCaptured"));
  assert.ok(!lib.includes("scheduleNewLeadStaffEmail"));
  assert.ok(rollback.includes("executeLeadCanaryRollbackApply"));
  assert.ok(lib.includes("Houzzat protected"));
}

function testTrustedLookup() {
  const lib = read("scripts/lib/tenant-lead-canary.ts");
  assert.ok(lib.includes("where: { slug: CANARY_SLUG }"));
  assert.ok(lib.includes("workspace.id === houzzat.id"));
  assert.ok(!lib.includes("workspaceId: input.workspaceId"));
}

function testCompatOrgCannotDetermineWorkspace() {
  const lib = read("scripts/lib/tenant-lead-canary.ts");
  assert.ok(lib.includes("metadata only"));
  assert.ok(lib.includes("LEGACY_CRM_ORGANIZATION_SLUG"));
  assert.ok(lib.includes("workspaceId: context.workspaceId"));
}

function testReadIsolationMatrix() {
  const prev = process.env.WORKSPACE_READ_SCOPE;
  process.env.WORKSPACE_READ_SCOPE = "workspace";
  try {
    const leadB = {
      organizationId: "org_demo",
      workspaceId: "ws_b",
      assignedAgentId: "agent_b",
    };
    const leadA = {
      organizationId: "org_demo",
      workspaceId: "ws_a",
      assignedAgentId: "agent_a",
    };
    assert.equal(canAccessLead(ctx("ws_b"), leadB), true);
    assert.equal(canAccessLead(ctx("ws_b"), leadA), false);
    assert.equal(canAccessLead(ctx("ws_a"), leadB), false);
  } finally {
    if (prev === undefined) delete process.env.WORKSPACE_READ_SCOPE;
    else process.env.WORKSPACE_READ_SCOPE = prev;
  }

  const plan = buildReadIsolationPlan({
    workspaceId: "ws_b",
    workspaceSlug: CANARY_SLUG,
    houzzatWorkspaceId: "ws_a",
    compatOrgId: "org_demo",
    compatOrgSlug: "demo-agent",
    agentBId: "agent_b",
    agentBPrefix: "agent_b",
    ownerBId: "owner_b",
    ownerBPrefix: "owner_b",
    primaryAgentId: "agent_b",
    routingSettingsId: "tenant-canary-routing",
    buyerTotal: 100,
    sellerTotal: 100,
  });
  assert.ok(plan.some((p) => p.includes("deny")));
}

function testRollbackExactLeadOnly() {
  const lib = read("scripts/lib/tenant-lead-canary.ts");
  assert.ok(lib.includes("CANARY_LEAD_MARKER"));
  assert.ok(lib.includes("lead.workspaceId !== context.workspaceId"));
  assert.ok(lib.includes("deleteMany({ where: { leadId } })"));
  assert.ok(!lib.includes("deleteMany({ where: { workspaceId"));
}

function testNoHouzzatMutation() {
  const lib = read("scripts/lib/tenant-lead-canary.ts");
  assert.ok(lib.includes("Houzzat baseline changed"));
  assert.ok(lib.includes("Houzzat default routing"));
  assert.notEqual(CANARY_SLUG, HOUZZAT_WORKSPACE_SLUG);
}

function testParseArgs() {
  const parsed = parseLeadCanaryCliArgs([
    "--apply",
    `--confirm=${CANARY_LEAD_CONFIRM_TOKEN}`,
  ]);
  assert.equal(parsed.apply, true);
  assert.equal(parsed.confirm, CANARY_LEAD_CONFIRM_TOKEN);
}

async function testDryRunZeroWritesWhenDbAvailable() {
  if (!process.env.DATABASE_URL) return;

  const { config } = await import("dotenv");
  config({ path: ".env.local", quiet: true });
  config({ quiet: true });

  const { prisma } = await import("../src/lib/prisma");
  const { buildLeadCanaryPlan, buildLeadCanaryRollbackPlan } = await import(
    "./lib/tenant-lead-canary"
  );

  try {
    const before = await prisma.lead.count();
    const plan = await buildLeadCanaryPlan(prisma, {
      leadEmail: "lead-canary-selftest@houzzat-canary.invalid",
      leadName: "Selftest",
    });
    assert.ok(plan.steps.length > 0);
    assert.ok(!plan.steps.some((s) => s.action === "DELETE"));

    const rollback = await buildLeadCanaryRollbackPlan(prisma, {
      leadEmail: "lead-canary-selftest@houzzat-canary.invalid",
      leadName: "Selftest",
    });
    assert.ok(rollback.steps.length > 0);

    const after = await prisma.lead.count();
    assert.equal(after, before);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  testApplyGuard();
  testStructure();
  testTrustedLookup();
  testCompatOrgCannotDetermineWorkspace();
  testReadIsolationMatrix();
  testRollbackExactLeadOnly();
  testNoHouzzatMutation();
  testParseArgs();
  await testDryRunZeroWritesWhenDbAvailable();
  console.log("workspace2-lead-canary:selftest ok");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
