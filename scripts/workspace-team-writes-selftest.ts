/**
 * Stage 3I — WorkspaceMember write policy + routing/notification exclusion (fixtures).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { USERS, WS_A, WS_B } from "./lib/multi-workspace-isolation-fixtures";
import {
  workspaceAdminCanChangeRole,
  workspaceAdminCanInviteRole,
  workspaceAdminCanRemoveMember,
  workspaceAdminCanSuspendMember,
} from "../src/lib/workspace-team";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testPermissionMatrix() {
  // OWNER
  assert.equal(workspaceAdminCanInviteRole("OWNER", "AGENT"), true);
  assert.equal(workspaceAdminCanInviteRole("OWNER", "ADMIN"), true);
  assert.equal(workspaceAdminCanInviteRole("OWNER", "OWNER"), false);
  assert.equal(
    workspaceAdminCanRemoveMember("OWNER", "AGENT", USERS.agentA1, USERS.ownerA),
    true,
  );
  assert.equal(
    workspaceAdminCanRemoveMember("OWNER", "ADMIN", USERS.adminA, USERS.ownerA),
    true,
  );
  assert.equal(
    workspaceAdminCanRemoveMember("OWNER", "OWNER", USERS.ownerA, USERS.ownerA),
    false,
  );
  assert.equal(
    workspaceAdminCanSuspendMember("OWNER", "AGENT", USERS.agentA1, USERS.ownerA),
    true,
  );

  // ADMIN
  assert.equal(workspaceAdminCanInviteRole("ADMIN", "AGENT"), true);
  assert.equal(workspaceAdminCanInviteRole("ADMIN", "ADMIN"), false);
  assert.equal(
    workspaceAdminCanRemoveMember("ADMIN", "AGENT", USERS.agentA1, USERS.adminA),
    true,
  );
  assert.equal(
    workspaceAdminCanRemoveMember("ADMIN", "ADMIN", USERS.adminA, USERS.adminA),
    false,
  );
  assert.equal(
    workspaceAdminCanRemoveMember("ADMIN", "OWNER", USERS.ownerA, USERS.adminA),
    false,
  );
  assert.equal(workspaceAdminCanChangeRole("ADMIN", "AGENT"), true);
  assert.equal(workspaceAdminCanChangeRole("ADMIN", "ADMIN"), false);

  // AGENT
  assert.equal(workspaceAdminCanInviteRole("AGENT", "AGENT"), false);
  assert.equal(
    workspaceAdminCanRemoveMember("AGENT", "AGENT", USERS.agentA2, USERS.agentA1),
    false,
  );
}

function testCrossWorkspaceDenialStructural() {
  const admin = read("src/lib/workspace-team-admin.ts");
  assert.ok(admin.includes("scrubWorkspaceRoutingForMember"));
  assert.ok(admin.includes("Transfer target must be an ACTIVE member"));
  assert.ok(admin.includes("reconcileUserPlatformStaffState"));
  assert.ok(admin.includes("primaryAgentId"));
  assert.ok(!admin.includes("organizationMembership"));
}

function testTeamRouteNoLonger501() {
  const route = read("src/app/api/agent/team/route.ts");
  assert.ok(route.includes("handleWorkspaceTeamPost"));
  assert.ok(route.includes("createWorkspaceInvite"));
  assert.ok(route.includes("suspendWorkspaceMember"));
  assert.ok(!route.includes("WORKSPACE_TEAM_WRITES_DISABLED"));
  assert.ok(route.includes("WORKSPACE_ID_IGNORED"));
}

function testRemovalExcludesRoutingAndNotify() {
  const routing = read("src/lib/workspace-routing.ts");
  assert.ok(routing.includes('status: "ACTIVE"'));
  assert.ok(routing.includes("listWorkspaceRoutableAgents"));

  const notify = read("src/lib/workspace-notification-recipients.ts");
  assert.ok(notify.includes('status: "ACTIVE"'));
  assert.ok(notify.includes("authorizeStaffRecipientForLead"));
}

function testSameBrokerageIrrelevant() {
  // Fixture IDs: A and B share brokerage name but policies are workspace-scoped.
  assert.notEqual(WS_A, WS_B);
  assert.notEqual(USERS.ownerA, USERS.ownerB);
}

async function main() {
  testPermissionMatrix();
  testCrossWorkspaceDenialStructural();
  testTeamRouteNoLonger501();
  testRemovalExcludesRoutingAndNotify();
  testSameBrokerageIrrelevant();
  console.log("workspace-team-writes:selftest: ok");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
