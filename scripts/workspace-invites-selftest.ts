/**
 * Stage 3I — WorkspaceInvite lifecycle selftest (structural + policy).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createWorkspaceInviteRawToken,
  hashWorkspaceInviteToken,
} from "../src/lib/workspace-invite-token";
import { workspaceAdminCanInviteRole } from "../src/lib/workspace-team";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testTokenEntropy() {
  const a = createWorkspaceInviteRawToken();
  const b = createWorkspaceInviteRawToken();
  assert.notEqual(a, b);
  assert.ok(a.length >= 32);
  assert.notEqual(a, hashWorkspaceInviteToken(a));
}

function testInviteModuleCoverage() {
  const mod = read("src/lib/workspace-invite.ts");
  assert.ok(mod.includes("createWorkspaceInvite"));
  assert.ok(mod.includes("acceptWorkspaceInvite"));
  assert.ok(mod.includes("loadWorkspaceInvitePreview"));
  assert.ok(mod.includes("cancelWorkspaceInvite"));
  assert.ok(mod.includes("resendWorkspaceInvite"));
  assert.ok(mod.includes('status: "CANCELLED"'));
  assert.ok(mod.includes('status: "EXPIRED"'));
  assert.ok(mod.includes('status: "ACCEPTED"'));
  assert.ok(mod.includes("secondMembership"));
  assert.ok(mod.includes("Cannot invite OWNER"));
  assert.ok(mod.includes("hashWorkspaceInviteToken"));
  assert.ok(mod.includes("createWorkspaceInviteRawToken"));
  assert.ok(mod.includes("createAgentAccountFromInvite"));
  assert.ok(mod.includes("provisionPasswordlessAgentFromInvite"));
  assert.ok(mod.includes("parseAdminManagedAgentProfile"));
  assert.ok(mod.includes("existingStaffHasPassword"));
  assert.ok(!mod.includes("agentProfile: { create"));
  assert.ok(!mod.includes("consentEvents:"));
}

function testAcceptApiBranches() {
  const route = read("src/app/api/auth/invite/[token]/route.ts");
  assert.ok(route.includes("loadWorkspaceInvitePreview"));
  assert.ok(route.includes("acceptWorkspaceInvite"));
  assert.ok(route.includes("acceptOrganizationInvite"));
  assert.ok(route.includes("signActiveWorkspaceId"));
  assert.ok(route.includes("ACTIVE_WORKSPACE_COOKIE"));
}

function testSchemaStatuses() {
  const schema = read("prisma/schema.prisma");
  const start = schema.indexOf("enum WorkspaceInviteStatus");
  assert.ok(start >= 0);
  const block = schema.slice(start, schema.indexOf("}", start) + 1);
  assert.ok(block.includes("PENDING"));
  assert.ok(block.includes("ACCEPTED"));
  assert.ok(block.includes("CANCELLED"));
  assert.ok(block.includes("EXPIRED"));
  // REVOKED not used — CANCELLED is the revoke equivalent
  assert.ok(!block.includes("REVOKED"));
}

function testInvitePolicy() {
  assert.equal(workspaceAdminCanInviteRole("OWNER", "AGENT"), true);
  assert.equal(workspaceAdminCanInviteRole("ADMIN", "ADMIN"), false);
}

async function main() {
  testTokenEntropy();
  testInviteModuleCoverage();
  testAcceptApiBranches();
  testSchemaStatuses();
  testInvitePolicy();
  console.log("workspace-invites:selftest: ok");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
