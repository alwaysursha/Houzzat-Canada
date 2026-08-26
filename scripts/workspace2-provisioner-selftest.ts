/**
 * Stage 3J.2 — Workspace #2 guarded provisioner selftest (no production writes).
 *
 * Run: pnpm workspace2-provisioner:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CANARY_CONFIRM_TOKEN,
  CANARY_ROUTING_SETTINGS_ID,
  CANARY_SLUG,
  HOUZZAT_ROUTING_ID,
  parseCanaryCliArgs,
  validateApplyConfirmation,
  verifyScopeGates,
} from "./lib/tenant-canary-provision";
import { HOUZZAT_WORKSPACE_SLUG } from "../src/lib/crm-ownership";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testApplyRequiresExactConfirm() {
  assert.equal(
    validateApplyConfirmation({ apply: false, confirm: null }),
    null,
  );
  assert.equal(
    validateApplyConfirmation({ apply: true, confirm: null }),
    `--apply requires --confirm=${CANARY_CONFIRM_TOKEN}`,
  );
  assert.equal(
    validateApplyConfirmation({ apply: true, confirm: "wrong" }),
    `--apply requires --confirm=${CANARY_CONFIRM_TOKEN}`,
  );
  assert.equal(
    validateApplyConfirmation({ apply: true, confirm: CANARY_CONFIRM_TOKEN }),
    null,
  );
}

function testParseArgs() {
  const parsed = parseCanaryCliArgs([
    "--apply",
    `--confirm=${CANARY_CONFIRM_TOKEN}`,
  ]);
  assert.equal(parsed.apply, true);
  assert.equal(parsed.confirm, CANARY_CONFIRM_TOKEN);
}

function testProvisionerStructure() {
  const lib = read("scripts/lib/tenant-canary-provision.ts");
  const provision = read("scripts/provision-tenant-canary.ts");
  const rollback = read("scripts/rollback-tenant-canary.ts");

  assert.ok(lib.includes("DRIFT_STOP"));
  assert.ok(lib.includes("ALREADY_MATCHES"));
  assert.ok(lib.includes("CREATE"));
  assert.ok(lib.includes(CANARY_SLUG));
  assert.ok(lib.includes(CANARY_ROUTING_SETTINGS_ID));
  assert.ok(lib.includes(HOUZZAT_ROUTING_ID));
  assert.ok(lib.includes("CANARY PROVISION PLAN"));
  assert.ok(lib.includes("CANARY ROLLBACK PLAN"));
  assert.ok(lib.includes("DRY RUN — NO PRODUCTION MUTATIONS"));

  assert.ok(provision.includes("formatProvisionReport"));
  assert.ok(provision.includes("validateApplyConfirmation"));
  assert.ok(provision.includes("executeProvisionApply"));
  assert.ok(!provision.includes("ensureCrmRoutingSettings"));
  assert.ok(!provision.includes("syncCrmRoutingSettingsForWorkspace"));
  assert.ok(!provision.includes("notify"));
  assert.ok(!provision.includes("lead.create"));

  assert.ok(rollback.includes("formatRollbackReport"));
  assert.ok(rollback.includes("executeRollbackApply"));
  assert.ok(rollback.includes("HOUZZAT_WORKSPACE_SLUG"));
  assert.ok(lib.includes("Lead safety"));
}

function testNoOrganizationB() {
  const lib = read("scripts/lib/tenant-canary-provision.ts");
  assert.ok(!lib.includes("organization.create"));
  assert.ok(lib.includes("Organization B"));
  assert.ok(lib.includes("not created"));
}

function testFlatCreatesNoNestedPrisma() {
  const lib = read("scripts/lib/tenant-canary-provision.ts");
  assert.ok(lib.includes("flat User create"));
  assert.ok(lib.includes("flat AgentProfile create"));
  const applySection = lib.slice(lib.indexOf("executeProvisionApply"));
  assert.ok(!applySection.includes("weights: {"));
  assert.ok(!applySection.includes("create: ["));
}

function testHouzzatProtection() {
  const lib = read("scripts/lib/tenant-canary-provision.ts");
  assert.ok(lib.includes("assertProtectedHouzzatIds"));
  assert.ok(lib.includes("user is ACTIVE Houzzat WorkspaceMember"));
  assert.ok(lib.includes("refuse to delete Houzzat workspace"));
  assert.ok(lib.includes("refuse to touch Houzzat routing id"));
  assert.equal(CANARY_SLUG, "tenant-canary");
  assert.notEqual(CANARY_SLUG, HOUZZAT_WORKSPACE_SLUG);
  assert.notEqual(CANARY_ROUTING_SETTINGS_ID, HOUZZAT_ROUTING_ID);
}

function testRollbackLeadSafety() {
  const lib = read("scripts/lib/tenant-canary-provision.ts");
  assert.ok(lib.includes("lead(s) in B — rollback refused"));
  assert.ok(lib.includes("child row(s) with workspaceId=B"));
}

function testScopeAckGate() {
  const prev = {
    read: process.env.WORKSPACE_READ_SCOPE,
    routing: process.env.WORKSPACE_ROUTING_SCOPE,
    notification: process.env.WORKSPACE_NOTIFICATION_SCOPE,
    team: process.env.WORKSPACE_TEAM_SCOPE,
    ack: process.env.CANARY_ACK_PRODUCTION_SCOPES,
  };
  process.env.WORKSPACE_READ_SCOPE = "legacy";
  process.env.WORKSPACE_ROUTING_SCOPE = "legacy";
  process.env.WORKSPACE_NOTIFICATION_SCOPE = "legacy";
  process.env.WORKSPACE_TEAM_SCOPE = "legacy";
  delete process.env.CANARY_ACK_PRODUCTION_SCOPES;
  try {
    const gates = verifyScopeGates();
    assert.equal(gates.ok, false);
    assert.equal(gates.missingAck, true);
    process.env.CANARY_ACK_PRODUCTION_SCOPES = "1";
    const acked = verifyScopeGates();
    assert.equal(acked.ok, true);
    assert.equal(acked.missingAck, false);
  } finally {
    if (prev.read === undefined) delete process.env.WORKSPACE_READ_SCOPE;
    else process.env.WORKSPACE_READ_SCOPE = prev.read;
    if (prev.routing === undefined) delete process.env.WORKSPACE_ROUTING_SCOPE;
    else process.env.WORKSPACE_ROUTING_SCOPE = prev.routing;
    if (prev.notification === undefined) {
      delete process.env.WORKSPACE_NOTIFICATION_SCOPE;
    } else process.env.WORKSPACE_NOTIFICATION_SCOPE = prev.notification;
    if (prev.team === undefined) delete process.env.WORKSPACE_TEAM_SCOPE;
    else process.env.WORKSPACE_TEAM_SCOPE = prev.team;
    if (prev.ack === undefined) delete process.env.CANARY_ACK_PRODUCTION_SCOPES;
    else process.env.CANARY_ACK_PRODUCTION_SCOPES = prev.ack;
  }
}

function testDryRunDefaultInCli() {
  const provision = read("scripts/provision-tenant-canary.ts");
  const rollback = read("scripts/rollback-tenant-canary.ts");
  assert.ok(provision.includes("if (!apply)"));
  assert.ok(rollback.includes("if (!apply)"));
  assert.ok(provision.includes("formatProvisionReport"));
  assert.ok(rollback.includes("formatRollbackReport"));
}

function testEmailRequiredForApply() {
  const lib = read("scripts/lib/tenant-canary-provision.ts");
  assert.ok(lib.includes("CANARY_OWNER_B_EMAIL"));
  assert.ok(lib.includes("CANARY_AGENT_B_EMAIL"));
  assert.ok(lib.includes("no password"));
}

async function testPlanDryRunZeroWritesWhenDbAvailable() {
  if (!process.env.DATABASE_URL) return;

  const { config } = await import("dotenv");
  config({ path: ".env.local", quiet: true });
  config({ quiet: true });

  const { prisma } = await import("../src/lib/prisma");
  const { buildProvisionPlan, buildRollbackPlan, resolveCanaryIdentityFromEnv } =
    await import("./lib/tenant-canary-provision");

  try {
    const beforeLeads = await prisma.lead.count();
    const beforeWorkspaces = await prisma.workspace.count();

    const plan = await buildProvisionPlan(prisma, resolveCanaryIdentityFromEnv());
    assert.ok(plan.steps.length > 0);
    assert.ok(!plan.steps.some((s) => s.action === "DELETE"));

    const rollback = await buildRollbackPlan(prisma, resolveCanaryIdentityFromEnv());
    assert.ok(rollback.steps.length > 0);

    const afterLeads = await prisma.lead.count();
    const afterWorkspaces = await prisma.workspace.count();
    assert.equal(afterLeads, beforeLeads);
    assert.equal(afterWorkspaces, beforeWorkspaces);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  testApplyRequiresExactConfirm();
  testParseArgs();
  testProvisionerStructure();
  testNoOrganizationB();
  testFlatCreatesNoNestedPrisma();
  testHouzzatProtection();
  testRollbackLeadSafety();
  testScopeAckGate();
  testDryRunDefaultInCli();
  testEmailRequiredForApply();
  await testPlanDryRunZeroWritesWhenDbAvailable();
  console.log("workspace2-provisioner:selftest ok");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
