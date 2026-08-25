/**
 * Stage 3H — workspace team isolation selftest (fixtures).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { USERS, WS_A, WS_B } from "./lib/multi-workspace-isolation-fixtures";
import {
  workspaceAdminCanChangeRole,
  workspaceAdminCanRemoveMember,
} from "../src/lib/workspace-team";
import { parseWorkspaceTeamScope } from "../src/lib/workspace-scope-flags";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

type Member = {
  id: string;
  workspaceId: string;
  userId: string;
  role: "OWNER" | "ADMIN" | "AGENT";
  status: "ACTIVE" | "SUSPENDED";
};

const TEAM: Member[] = [
  { id: "m_owner_a", workspaceId: WS_A, userId: USERS.ownerA, role: "OWNER", status: "ACTIVE" },
  { id: "m_admin_a", workspaceId: WS_A, userId: USERS.adminA, role: "ADMIN", status: "ACTIVE" },
  { id: "m_agent_a", workspaceId: WS_A, userId: USERS.agentA1, role: "AGENT", status: "ACTIVE" },
  { id: "m_owner_b", workspaceId: WS_B, userId: USERS.ownerB, role: "OWNER", status: "ACTIVE" },
];

function listTeam(workspaceId: string) {
  return TEAM.filter((m) => m.workspaceId === workspaceId);
}

function testOwnerAListsAMembersOnly() {
  const members = listTeam(WS_A);
  assert.equal(members.length, 3);
  assert.ok(members.every((m) => m.workspaceId === WS_A));
}

function testOwnerACannotSeeB() {
  const bMembers = listTeam(WS_B);
  assert.ok(!listTeam(WS_A).some((m) => bMembers.some((b) => b.id === m.id)));
}

function testAgentCannotManageTeam() {
  assert.equal(workspaceAdminCanChangeRole("AGENT", "AGENT"), false);
  assert.equal(
    workspaceAdminCanRemoveMember("AGENT", "AGENT", USERS.agentA2, USERS.agentA1),
    false,
  );
}

function testAdminCannotRemoveOwner() {
  assert.equal(
    workspaceAdminCanRemoveMember("ADMIN", "OWNER", USERS.ownerA, USERS.adminA),
    false,
  );
}

function testOwnerCanRemoveAgent() {
  assert.equal(
    workspaceAdminCanRemoveMember("OWNER", "AGENT", USERS.agentA1, USERS.ownerA),
    true,
  );
}

function testLegacyTeamFlagDefault() {
  delete process.env.WORKSPACE_TEAM_SCOPE;
  assert.equal(parseWorkspaceTeamScope(), "legacy");
}

function testTeamApiBranchesOnFlag() {
  const route = readFileSync(
    join(root, "src/app/api/agent/team/route.ts"),
    "utf8",
  );
  assert.ok(route.includes("resolveTeamAuthority"));
  assert.ok(route.includes("getWorkspaceTeamPayload"));
  assert.ok(route.includes("handleWorkspaceTeamPost"));
  assert.ok(route.includes("createWorkspaceInvite"));
  assert.ok(route.includes("WORKSPACE_CONTEXT_REQUIRED"));
}

async function main() {
  testOwnerAListsAMembersOnly();
  testOwnerACannotSeeB();
  testAgentCannotManageTeam();
  testAdminCannotRemoveOwner();
  testOwnerCanRemoveAgent();
  testLegacyTeamFlagDefault();
  testTeamApiBranchesOnFlag();
  console.log("workspace-team:selftest: ok");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
