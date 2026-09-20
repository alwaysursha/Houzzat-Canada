/**
 * V1 Admin-managed Agent profiles + invitation onboarding.
 * Run: pnpm admin-agent-profile:selftest
 *
 * Hermetic. No production writes. No Demo Agent mutation. No deploy.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  composeStaffDisplayName,
  parseAdminManagedAgentProfile,
  parseRecoLicenseExpiry,
  recoExpiryToInputValue,
} from "../src/lib/agent/admin-managed-profile";
import {
  INVALID_CONTACT_PHONE_MESSAGE,
  parsePhoneColumnsForWrite,
} from "../src/lib/sms/e164";
import { workspaceAdminCanInviteRole } from "../src/lib/workspace-team";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const VALID_PROFILE = {
  firstName: "Jordan",
  lastName: "Lee",
  email: "jordan.lee@brokerage.test",
  phone: "416-555-1234",
  recoLicenseNumber: "12345678",
  recoLicenseExpiresAt: "2027-06-15",
};

function testParseRequiredFieldsAndPhoneLockstep() {
  const parsed = parseAdminManagedAgentProfile(VALID_PROFILE);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.data.displayName, "Jordan Lee");
  assert.equal(parsed.data.email, "jordan.lee@brokerage.test");
  assert.equal(parsed.data.phone, "416-555-1234");
  assert.equal(parsed.data.phoneE164, "+14165551234");
  assert.equal(parsed.data.phoneColumns.phone, "416-555-1234");
  assert.equal(parsed.data.phoneColumns.phoneE164, "+14165551234");
  assert.equal(parsed.data.recoLicenseNumber, "12345678");
  assert.equal(recoExpiryToInputValue(parsed.data.recoLicenseExpiresAt), "2027-06-15");

  const columns = parsePhoneColumnsForWrite(VALID_PROFILE.phone);
  assert.equal(columns.ok, true);
  if (columns.ok) {
    assert.equal(columns.columns.phoneE164, parsed.data.phoneE164);
  }

  const missing = parseAdminManagedAgentProfile({
    ...VALID_PROFILE,
    firstName: "  ",
  });
  assert.equal(missing.ok, false);

  const badPhone = parseAdminManagedAgentProfile({
    ...VALID_PROFILE,
    phone: "not-a-phone",
  });
  assert.equal(badPhone.ok, false);
  if (!badPhone.ok) {
    assert.equal(badPhone.error, INVALID_CONTACT_PHONE_MESSAGE);
  }
}

function testRecoExpiryStructured() {
  const ok = parseRecoLicenseExpiry("2027-06-15");
  assert.ok(ok);
  assert.equal(ok?.toISOString(), "2027-06-15T12:00:00.000Z");
  assert.equal(parseRecoLicenseExpiry("15/06/2027"), null);
  assert.equal(parseRecoLicenseExpiry("2027-13-40"), null);
  assert.equal(composeStaffDisplayName("  Ali  ", "  Syed "), "Ali Syed");
}

function testInvitePersistsCanonicalPhoneAndReusesPendingInvite() {
  const invite = read("src/lib/workspace-invite.ts");
  assert.ok(invite.includes("parseAdminManagedAgentProfile"));
  assert.ok(invite.includes("provisionPasswordlessAgentFromInvite"));
  assert.ok(invite.includes("sendWorkspaceInviteEmail"));
  assert.ok(invite.includes("A pending invite already exists for this email."));
  assert.ok(invite.includes("existingStaffHasPassword"));
  assert.ok(
    invite.includes("Passwordless / newly provisioned Agents stay PENDING"),
  );
  assert.ok(!invite.includes("agentProfile: { create"));

  const helper = read("src/lib/auth/invite-account.ts");
  assert.ok(helper.includes("password: null"));
  assert.ok(helper.includes("phoneE164: input.profile.phoneE164"));
  assert.ok(!helper.includes("workspaceMember"));

  const route = read("src/app/api/agent/team/route.ts");
  assert.ok(route.includes("workspaceAgentInviteSchema"));
  assert.ok(route.includes("recoLicenseNumber"));
  assert.ok(route.includes("createWorkspaceInvite"));
}

function testActivationNoDuplicateAgent() {
  const invite = read("src/lib/workspace-invite.ts");
  const acceptStart = invite.indexOf("export async function acceptWorkspaceInvite");
  const acceptBody = invite.slice(acceptStart);
  const passwordless = acceptBody.indexOf("canActivatePasswordlessExisting && existing");
  const newUser = acceptBody.indexOf("createAgentAccountFromInvite");
  assert.ok(passwordless >= 0);
  assert.ok(newUser > passwordless);
  const passwordlessBlock = acceptBody.slice(passwordless, newUser);
  assert.ok(!passwordlessBlock.includes("createAgentAccountFromInvite"));
  assert.ok(passwordlessBlock.includes("workspaceMember.upsert"));
  assert.ok(invite.includes("applyInviteSnapshotIfPresent"));

  const client = read("src/components/auth/TeamInviteClient.tsx");
  assert.ok(client.includes("profilePrefilled"));
  assert.ok(client.includes("Entered by your admin"));
  assert.ok(client.includes("Set password & open CRM"));
  assert.ok(client.includes("Create account & join team"));
}

function testOwnerAdminAuthorizationAndAgentReadOnly() {
  assert.equal(workspaceAdminCanInviteRole("OWNER", "AGENT"), true);
  assert.equal(workspaceAdminCanInviteRole("ADMIN", "AGENT"), true);
  assert.equal(workspaceAdminCanInviteRole("ADMIN", "ADMIN"), false);
  assert.equal(workspaceAdminCanInviteRole("AGENT", "AGENT"), false);

  const update = read("src/lib/agent/admin-managed-profile.ts");
  assert.ok(update.includes("workspaceTeamCanManage"));
  assert.ok(update.includes('return { ok: false, error: "Forbidden.", status: 403 }'));
  assert.ok(update.includes("workspaceId: ctx.workspaceId, userId"));
  assert.ok(!update.includes("assignedAgentId"));

  const api = read("src/app/api/agent/team/members/[userId]/route.ts");
  assert.ok(api.includes("updateWorkspaceAgentProfile"));
  assert.ok(api.includes("loadWorkspaceAgentProfile"));

  const teamUi = read("src/components/agent/TeamAdminClient.tsx");
  assert.ok(teamUi.includes("Edit profile"));
  assert.ok(teamUi.includes("View profile"));
  assert.ok(teamUi.includes("canManage && !isSelf"));

  const profileUi = read("src/components/agent/AgentProfileAdminClient.tsx");
  assert.ok(profileUi.includes("profile.canEdit"));
  assert.ok(profileUi.includes("Read only"));
}

function testCrossWorkspaceDenial() {
  const profile = read("src/lib/agent/admin-managed-profile.ts");
  assert.ok(profile.includes("Agent not found in this Workspace."));
  assert.ok(profile.includes("where: { workspaceId: ctx.workspaceId, userId }"));
  assert.equal(profile.includes("isPlatformAdmin"), false);

  const team = read("src/lib/workspace-team.ts");
  assert.ok(team.includes("where: { workspaceId: ctx.workspaceId, status: \"ACTIVE\" }"));
}

function testPhoneE164LockstepAndNotifyCanonical() {
  const profile = read("src/lib/agent/admin-managed-profile.ts");
  assert.ok(profile.includes("parsePhoneColumnsForWrite"));
  assert.ok(profile.includes("phoneE164: profile.phoneE164"));
  assert.ok(profile.includes("phone: profile.phone"));

  const notify = read("src/lib/sms/assigned-agent-inbound-notify.ts");
  assert.ok(notify.includes("scheduleNotifyAssignedAgentOfInboundSmsByCell"));
  assert.ok(notify.includes("select: { phoneE164: true, phone: true, disabledAt: true }"));
  assert.ok(!notify.includes("agentProfile"));
}

function testSeatAndInvitationBehaviorPreserved() {
  const invite = read("src/lib/workspace-invite.ts");
  assert.ok(invite.includes("Cannot invite OWNER"));
  assert.ok(invite.includes("workspaceAdminCanInviteRole"));
  assert.ok(invite.includes("That user is already an ACTIVE member of this Workspace."));
  assert.ok(invite.includes("A pending invite already exists for this email."));
  assert.ok(invite.includes("alreadyMember"));
  assert.ok(invite.includes("convertsConsumerAccount"));

  const schema = read("prisma/schema.prisma");
  assert.ok(schema.includes("recoLicenseNumber"));
  assert.ok(schema.includes("recoLicenseExpiresAt"));
  assert.ok(schema.includes("model AgentProfile"));
  assert.ok(schema.includes("model WorkspaceInvite"));

  const migration = read(
    "prisma/migrations/20260920160000_admin_managed_agent_profile/migration.sql",
  );
  assert.ok(migration.includes("ADD COLUMN IF NOT EXISTS \"recoLicenseNumber\""));
  assert.ok(migration.includes("Demo Agent rows are not rewritten"));
}

async function main() {
  testParseRequiredFieldsAndPhoneLockstep();
  testRecoExpiryStructured();
  testInvitePersistsCanonicalPhoneAndReusesPendingInvite();
  testActivationNoDuplicateAgent();
  testOwnerAdminAuthorizationAndAgentReadOnly();
  testCrossWorkspaceDenial();
  testPhoneE164LockstepAndNotifyCanonical();
  testSeatAndInvitationBehaviorPreserved();
  console.log("admin-agent-profile:selftest: ok");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
