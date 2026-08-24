/**
 * Stage 2B — Houzzat Workspace provisioning selftest.
 * Run: pnpm workspace-provisioning:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  HOUZZAT_WORKSPACE_SLUG,
  LEGACY_CRM_ORGANIZATION_SLUG,
} from "./lib/houzzat-workspace-provisioning";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testProvisionScriptStructure() {
  const provision = read("scripts/provision-houzzat-workspace.ts");
  const helper = read("scripts/lib/houzzat-workspace-provisioning.ts");
  const rollback = read("scripts/rollback-houzzat-workspace.ts");

  assert.ok(provision.includes('--apply'), "provision script must gate writes on --apply");
  assert.ok(
    !provision.includes("organization.update"),
    "provision script must not mutate Organization",
  );
  assert.ok(
    !provision.includes("lead.update"),
    "provision script must not mutate Lead",
  );
  assert.ok(
    !helper.includes("sendRenderedEmail"),
    "provision helper must not send email",
  );
  assert.ok(
    !helper.includes("notify"),
    "provision helper must not trigger notifications",
  );
  assert.ok(helper.includes("$transaction"), "provision must use a transaction");
  assert.ok(helper.includes(HOUZZAT_WORKSPACE_SLUG));
  assert.ok(helper.includes(LEGACY_CRM_ORGANIZATION_SLUG));
  assert.ok(rollback.includes("--apply"), "rollback must gate writes on --apply");
}

function testNoRuntimeWorkspaceWiring() {
  const agent = read("src/lib/agent.ts");
  const brokerage = read("src/lib/agent/brokerage.ts");
  const staffEvents = read("src/lib/notifications/staff-events.ts");
  const combined = [agent, brokerage, staffEvents].join("\n");

  assert.ok(!combined.includes("prisma.workspace"));
  assert.ok(!combined.includes("WorkspaceMember"));
  assert.ok(!combined.includes("workspaceId"));
}

function testOwnerNotPrimaryAgentRole() {
  const helper = read("scripts/lib/houzzat-workspace-provisioning.ts");
  assert.ok(
    helper.includes('role: "OWNER"') && helper.includes('role: "AGENT"'),
    "OWNER and AGENT roles must be distinct members",
  );
  assert.ok(
    helper.includes("billingOwnerUserId") && helper.includes("primaryAgentUserId"),
    "billing owner and primary agent are separate fields",
  );
}

function testIdempotencyGuards() {
  const provision = read("scripts/provision-houzzat-workspace.ts");
  const helper = read("scripts/lib/houzzat-workspace-provisioning.ts");
  assert.ok(helper.includes('kind: "complete"'));
  assert.ok(helper.includes('kind: "drift"'));
  assert.ok(provision.includes("NO ACTION REQUIRED"));
}

async function testLiveStateWhenAvailable() {
  if (!process.env.DATABASE_URL) return;

  const { config } = await import("dotenv");
  config({ path: ".env.local", quiet: true });
  config({ quiet: true });

  const { prisma } = await import("../src/lib/prisma");
  const {
    buildPlannedProvisioning,
    gatherPreconditions,
    loadExistingProvisioning,
    resolveHouzzatStaffIds,
  } = await import("./lib/houzzat-workspace-provisioning");

  try {
    const staff = await resolveHouzzatStaffIds(prisma);
    assert.ok(staff.billingOwnerUserId.length > 8);
    assert.ok(staff.primaryAgentUserId.length > 8);
    assert.ok(staff.testAdminUserId.length > 8);
    assert.notEqual(staff.billingOwnerUserId, staff.primaryAgentUserId);

    const snapshot = await gatherPreconditions(prisma);
    const planned = buildPlannedProvisioning(staff);
    const existing = await loadExistingProvisioning(prisma, planned);

    if (existing.kind === "complete") {
      assert.equal(snapshot.leadCount, 41);
      assert.equal(existing.members.length, 3);
    } else if (existing.kind === "absent") {
      assert.equal(snapshot.workspaceCount, 0);
      assert.equal(snapshot.workspaceMemberCount, 0);
    } else {
      assert.fail(`unexpected provisioning drift: ${existing.reason}`);
    }
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

async function main() {
  testProvisionScriptStructure();
  testNoRuntimeWorkspaceWiring();
  testOwnerNotPrimaryAgentRole();
  testIdempotencyGuards();
  await testLiveStateWhenAvailable();
  console.log("workspace-provisioning:selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
