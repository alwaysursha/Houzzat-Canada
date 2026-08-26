/**
 * Stage 3J.8 — brokerage seat sync isolation selftest.
 * Run: pnpm workspace-brokerage-sync-isolation:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isWorkspaceScopedBrokerageSeatSync,
} from "../src/lib/agent/brokerage-seat-sync";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testModeAwareAuthority() {
  const prev = process.env.WORKSPACE_READ_SCOPE;
  try {
    process.env.WORKSPACE_READ_SCOPE = "workspace";
    assert.equal(isWorkspaceScopedBrokerageSeatSync(), true);
    process.env.WORKSPACE_READ_SCOPE = "legacy";
    assert.equal(isWorkspaceScopedBrokerageSeatSync(), false);
    delete process.env.WORKSPACE_READ_SCOPE;
    assert.equal(isWorkspaceScopedBrokerageSeatSync(), false);
  } finally {
    if (prev === undefined) delete process.env.WORKSPACE_READ_SCOPE;
    else process.env.WORKSPACE_READ_SCOPE = prev;
  }
}

function testStructure() {
  const sync = read("src/lib/agent/brokerage-seat-sync.ts");
  const brokerage = read("src/lib/agent/brokerage.ts");
  const agent = read("src/lib/agent.ts");

  assert.ok(sync.includes("resolveLegacyBrokerageSeatTargets"));
  assert.ok(sync.includes("HOUZZAT_WORKSPACE_SLUG"));
  assert.ok(sync.includes("isWorkspaceScopedBrokerageSeatSync"));
  assert.ok(sync.includes('status: "ACTIVE"'));

  assert.ok(brokerage.includes("resolveLegacyBrokerageSeatTargets"));
  assert.ok(brokerage.includes("isWorkspaceScopedBrokerageSeatSync"));
  assert.ok(!brokerage.includes('where: { role: "ADMIN", disabledAt: null }'));
  assert.ok(brokerage.includes("houzzatWorkspaceId"));
  assert.ok(brokerage.includes("workspaceId: null"));

  assert.ok(agent.includes("userQualifiesForLegacyBrokerageOrgSeat"));
  assert.ok(agent.includes("qualifiesForOrgSeat"));
}

function testMatrixDocumented() {
  const sync = read("src/lib/agent/brokerage-seat-sync.ts");
  assert.ok(sync.includes("Only ACTIVE Houzzat WorkspaceMembers qualify") || sync.includes("only ACTIVE Houzzat"));
  assert.ok(!sync.includes("deleteMany"));
}

function testNoAutoCleanup() {
  const brokerage = read("src/lib/agent/brokerage.ts");
  const syncFn = brokerage.slice(
    brokerage.indexOf("async function syncBrokerageSeats"),
    brokerage.indexOf("export const ensureBrokerageOrganization"),
  );
  assert.ok(!syncFn.includes("organizationMembership.delete"));
  assert.ok(!syncFn.includes("deleteMany"));
}

function testCleanupToolExists() {
  const cleanup = read("scripts/lib/tenant-org-artifact-cleanup.ts");
  assert.ok(cleanup.includes("CANARY_ORG_ARTIFACT_CONFIRM_TOKEN"));
  assert.ok(cleanup.includes("NO ACTIVE Houzzat") || cleanup.includes("Houzzat membership"));
  assert.ok(cleanup.includes("OrganizationMembership"));
}

async function main() {
  testModeAwareAuthority();
  testStructure();
  testMatrixDocumented();
  testNoAutoCleanup();
  testCleanupToolExists();
  console.log("workspace-brokerage-sync-isolation:selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
