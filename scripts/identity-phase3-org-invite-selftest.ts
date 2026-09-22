/**
 * Phase 3 — organization invite must not attach cross-workspace / NULL Users.
 * Run: pnpm identity:phase3:org-invite:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveOrganizationInviteWorkspaceId,
  selectOrganizationInviteIdentity,
} from "../src/lib/agent/accept-invite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS_A = "ws_a";
const WS_B = "ws_b";
const EMAIL = "sameperson@example.com";

type FakeUser = {
  id: string;
  email: string;
  workspaceId: string | null;
  role: string;
  isBuyer: boolean;
  isSeller: boolean;
};

function fakeDb(users: FakeUser[], memberships: Array<{ userId: string; workspaceId: string }>) {
  return {
    user: {
      findUnique: async ({ where: { id } }: { where: { id: string } }) => {
        const row = users.find((u) => u.id === id);
        return row ? { workspaceId: row.workspaceId } : null;
      },
    },
    workspaceMember: {
      findMany: async ({
        where,
      }: {
        where: { userId: string };
        select: { workspaceId: true };
        take: number;
      }) =>
        memberships
          .filter((m) => m.userId === where.userId)
          .map((m) => ({ workspaceId: m.workspaceId })),
    },
  };
}

async function testResolveInviteWorkspaceFromInviterHome() {
  const users: FakeUser[] = [
    {
      id: "inviter_b",
      email: "owner-b@example.com",
      workspaceId: WS_B,
      role: "ADMIN",
      isBuyer: false,
      isSeller: false,
    },
  ];
  const ws = await resolveOrganizationInviteWorkspaceId(
    { organizationId: "org_shared", invitedById: "inviter_b" },
    fakeDb(users, []) as never,
    async () => ({}),
  );
  assert.equal(ws, WS_B);
  console.log("[org-invite] resolve workspace from inviter home... PASS");
}

async function testResolveInviteWorkspaceIgnoresAmbiguousMembership() {
  const users: FakeUser[] = [
    {
      id: "inviter_null",
      email: "owner@example.com",
      workspaceId: null,
      role: "ADMIN",
      isBuyer: false,
      isSeller: false,
    },
  ];
  const ws = await resolveOrganizationInviteWorkspaceId(
    { organizationId: "org_shared", invitedById: "inviter_null" },
    fakeDb(users, [
      { userId: "inviter_null", workspaceId: WS_A },
      { userId: "inviter_null", workspaceId: WS_B },
    ]) as never,
    async () => ({ workspaceId: WS_A }),
  );
  // Ambiguous memberships → fall through to org ownership bridge
  assert.equal(ws, WS_A);
  console.log("[org-invite] ambiguous membership falls to org bridge... PASS");
}

function testCrossWorkspaceUserCannotSatisfyInvite() {
  const userA: FakeUser = {
    id: "user_a",
    email: EMAIL,
    workspaceId: WS_A,
    role: "BUYER",
    isBuyer: true,
    isSeller: false,
  };
  const platform: FakeUser = {
    id: "user_null",
    email: EMAIL,
    workspaceId: null,
    role: "ADMIN",
    isBuyer: false,
    isSeller: false,
  };

  const rejectA = selectOrganizationInviteIdentity({
    inviteWorkspaceId: WS_B,
    inviteEmail: EMAIL,
    candidates: [userA, platform],
    actingUserId: userA.id,
  });
  assert.equal(rejectA.ok, false);
  if (!rejectA.ok) assert.equal(rejectA.reason, "WRONG_ACCOUNT");

  const rejectPlatform = selectOrganizationInviteIdentity({
    inviteWorkspaceId: WS_B,
    inviteEmail: EMAIL,
    candidates: [userA, platform],
    actingUserId: platform.id,
  });
  assert.equal(rejectPlatform.ok, false);
  if (!rejectPlatform.ok) assert.equal(rejectPlatform.reason, "WRONG_ACCOUNT");

  // No B identity yet → create path (NONE_IN_WORKSPACE), not attach A
  const none = selectOrganizationInviteIdentity({
    inviteWorkspaceId: WS_B,
    inviteEmail: EMAIL,
    candidates: [userA, platform],
  });
  assert.equal(none.ok, false);
  if (!none.ok) assert.equal(none.reason, "NONE_IN_WORKSPACE");

  console.log("[org-invite] WS_A / NULL cannot satisfy WS_B invite... PASS");
}

function testWorkspaceBIdentityCanAccept() {
  const userB: FakeUser = {
    id: "user_b",
    email: EMAIL,
    workspaceId: WS_B,
    role: "BUYER",
    isBuyer: true,
    isSeller: false,
  };
  const userA: FakeUser = {
    id: "user_a",
    email: EMAIL,
    workspaceId: WS_A,
    role: "BUYER",
    isBuyer: true,
    isSeller: false,
  };

  const needSignIn = selectOrganizationInviteIdentity({
    inviteWorkspaceId: WS_B,
    inviteEmail: EMAIL,
    candidates: [userA, userB],
  });
  assert.equal(needSignIn.ok, false);
  if (!needSignIn.ok) assert.equal(needSignIn.reason, "NEED_SIGN_IN");

  const wrongSession = selectOrganizationInviteIdentity({
    inviteWorkspaceId: WS_B,
    inviteEmail: EMAIL,
    candidates: [userA, userB],
    actingUserId: userA.id,
  });
  assert.equal(wrongSession.ok, false);
  if (!wrongSession.ok) assert.equal(wrongSession.reason, "WRONG_ACCOUNT");

  const ok = selectOrganizationInviteIdentity({
    inviteWorkspaceId: WS_B,
    inviteEmail: EMAIL,
    candidates: [userA, userB],
    actingUserId: userB.id,
  });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.user.id, "user_b");
    assert.equal(ok.user.workspaceId, WS_B);
  }

  console.log("[org-invite] only WS_B identity satisfies WS_B invite... PASS");
}

function testSourceGuards() {
  const accept = read("src/lib/agent/accept-invite.ts");
  const inviteAccount = read("src/lib/auth/invite-account.ts");
  const workspaceInvite = read("src/lib/workspace-invite.ts");

  assert.ok(accept.includes("resolveOrganizationInviteWorkspaceId"));
  assert.ok(accept.includes("selectOrganizationInviteIdentity"));
  assert.ok(accept.includes("findWorkspaceInviteUser"));
  assert.ok(
    accept.includes("workspaceId,") || accept.includes("workspaceId: workspaceId"),
  );
  assert.ok(accept.includes("createAgentAccountFromInvite"));
  assert.equal(
    /where:\s*\{\s*email:\s*invite\.email\s*\}/.test(accept),
    false,
    "accept-invite must not resolve User by invite.email alone",
  );
  assert.ok(inviteAccount.includes("workspaceId: input.workspaceId"));
  assert.ok(workspaceInvite.includes("workspaceId: invite.workspaceId"));
  assert.ok(workspaceInvite.includes("workspaceId: workspace.id"));

  console.log("[org-invite] source guards (no global email)... PASS");
}

async function main() {
  await testResolveInviteWorkspaceFromInviterHome();
  await testResolveInviteWorkspaceIgnoresAmbiguousMembership();
  testCrossWorkspaceUserCannotSatisfyInvite();
  testWorkspaceBIdentityCanAccept();
  testSourceGuards();
  console.log("\n[identity-phase3-org-invite] ALL PASS\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
