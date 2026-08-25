/**
 * Stage 3I.1 — identity / invite / deep-link security closure selftest.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createWorkspaceInviteRawToken,
  hashWorkspaceInviteToken,
  workspaceInviteHashesEqual,
} from "../src/lib/workspace-invite-token";
import { USERS, WS_A, WS_B } from "./lib/multi-workspace-isolation-fixtures";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testReconcileHelperExists() {
  const mod = read("src/lib/reconcile-user-platform-staff.ts");
  assert.ok(mod.includes("export async function reconcileUserPlatformStaffState"));
  assert.ok(mod.includes('status: "ACTIVE"'));
  assert.ok(mod.includes("activeSeatCount"));
  assert.ok(mod.includes('role: "ADMIN"'));
  // Must count ALL workspaces, not one.
  assert.ok(mod.includes("workspaceMember.count"));
}

function testRemovalUsesReconcileNotDirectDemote() {
  const admin = read("src/lib/workspace-team-admin.ts");
  assert.ok(admin.includes("reconcileUserPlatformStaffState"));
  assert.ok(admin.includes("scrubWorkspaceRoutingForMember"));
  // Suspend must not touch AgentProfile / User.role
  const suspendIdx = admin.indexOf("export async function suspendWorkspaceMember");
  const reactivateIdx = admin.indexOf("export async function reactivateWorkspaceMember");
  const suspendBody = admin.slice(suspendIdx, reactivateIdx);
  assert.ok(!suspendBody.includes("agentProfile"));
  assert.ok(!suspendBody.includes('role: "BUYER"'));
  assert.ok(suspendBody.includes("assertNotFinalOwnerOrThrow"));
  // Routing scoped by workspaceId settings only
  assert.ok(admin.includes("settingsId: settings.id, agentId: userId"));
  assert.ok(!admin.includes("deleteMany({ where: { agentId: userId } }"));
}

function testInviteTokenHashedAtRest() {
  const raw = createWorkspaceInviteRawToken();
  const hash = hashWorkspaceInviteToken(raw);
  assert.equal(hash.length, 64);
  assert.equal(hash, createHash("sha256").update(raw, "utf8").digest("hex"));
  assert.notEqual(raw, hash);
  assert.ok(workspaceInviteHashesEqual(hash, hash));
  assert.equal(workspaceInviteHashesEqual(hash, hashWorkspaceInviteToken("other")), false);

  const invite = read("src/lib/workspace-invite.ts");
  assert.ok(invite.includes("hashWorkspaceInviteToken"));
  assert.ok(invite.includes("createWorkspaceInviteRawToken"));
  assert.ok(invite.includes("findWorkspaceInviteByRawToken"));
  assert.ok(invite.includes("token: tokenHash") || invite.includes("token: tokenHash,"));
  // Email gets raw; DB gets hash
  assert.ok(invite.includes("token: rawToken"));
  assert.ok(invite.includes("normalizeEmail"));
  assert.ok(invite.includes("WRONG_ACCOUNT"));
  assert.ok(invite.includes("This account is disabled"));
}

function testInviteEmailMatchEnforced() {
  const invite = read("src/lib/workspace-invite.ts");
  assert.ok(invite.includes("normalizeEmail(acting.email) !== inviteEmail"));
  assert.ok(invite.includes("Possession of URL alone cannot create a session"));
}

function testOpenLeadCrossWorkspaceConfirm() {
  const page = read("src/app/(agent)/agent/open-lead/[leadId]/page.tsx");
  assert.ok(page.includes("resolveOpenLeadHandoff"));
  assert.ok(page.includes("Switch Workspace?"));
  assert.ok(page.includes('method="post"'));
  assert.ok(page.includes("/api/agent/open-lead/"));
  assert.ok(!page.includes("cookieStore.set"));
  assert.ok(!page.includes("signActiveWorkspaceId"));
  const helper = read("src/lib/open-lead-workspace-switch.ts");
  assert.ok(helper.includes("soleWorkspaceId"));
  assert.ok(helper.includes("validCookieWorkspaceId"));
  const api = read("src/app/api/agent/open-lead/[leadId]/route.ts");
  assert.ok(api.includes("isTrustedStaffMutationOrigin"));
  assert.ok(api.includes("export async function POST"));
  assert.ok(api.includes("export async function GET"));
  assert.ok(api.includes("signActiveWorkspaceId"));
  assert.ok(api.includes("needsConfirm"));
}

function testTeamFlagIsolationStructural() {
  const route = read("src/app/api/agent/team/route.ts");
  assert.ok(route.includes("handleWorkspaceTeamPost"));
  // Workspace branch must not call org delete/disable helpers
  const wsHandlerStart = route.indexOf("async function handleWorkspaceTeamPost");
  const postStart = route.indexOf("export async function POST");
  const wsHandler = route.slice(wsHandlerStart, postStart);
  assert.ok(!wsHandler.includes("disableTeamMember"));
  assert.ok(!wsHandler.includes("deleteTeamMember"));
  assert.ok(!wsHandler.includes("organizationInvite"));
  assert.ok(wsHandler.includes("createWorkspaceInvite"));
  // Legacy POST still uses org helpers
  const legacy = route.slice(postStart);
  assert.ok(legacy.includes("disableTeamMember"));
  assert.ok(legacy.includes("organizationInvite"));
}

function testNotificationBatching() {
  const notify = read("src/lib/workspace-notification-recipients.ts");
  assert.ok(notify.includes("userId: { in: unique }"));
  assert.ok(notify.includes("filterStaffRecipientsForLead"));
  // No per-id authorize loop in filter
  const filterStart = notify.indexOf("export async function filterStaffRecipientsForLead");
  const filterBody = notify.slice(filterStart);
  assert.ok(!filterBody.includes("for (const userId of userIds)"));
}

function testFixtureIsolationIds() {
  assert.notEqual(WS_A, WS_B);
  assert.notEqual(USERS.agentA1, USERS.agentB1);
}

async function main() {
  testReconcileHelperExists();
  testRemovalUsesReconcileNotDirectDemote();
  testInviteTokenHashedAtRest();
  testInviteEmailMatchEnforced();
  testOpenLeadCrossWorkspaceConfirm();
  testTeamFlagIsolationStructural();
  testNotificationBatching();
  testFixtureIsolationIds();
  console.log("workspace-3i1-security:selftest: ok");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
