/**
 * Workspace / org invite acceptance — Workers-safe account creation + token hash.
 * Run: pnpm workspace-invite-acceptance:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createWorkspaceInviteRawToken,
  hashWorkspaceInviteToken,
} from "../src/lib/workspace-invite-token";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

/** Nested user.create is rejected by PrismaNeonHttp on Workers. */
function testNoNestedUserCreateOnAccept() {
  for (const rel of [
    "src/lib/workspace-invite.ts",
    "src/lib/agent/accept-invite.ts",
  ]) {
    const src = read(rel);
    assert.ok(
      !src.includes("agentProfile: { create"),
      `${rel} must not nest agentProfile.create`,
    );
    assert.ok(
      !src.includes("consentEvents:"),
      `${rel} must not nest consentEvents`,
    );
    assert.ok(
      !src.includes("consentEvent.createMany"),
      `${rel} must not use createMany for consents`,
    );
    assert.ok(
      src.includes("createAgentAccountFromInvite"),
      `${rel} must use flat invite account helper`,
    );
  }

  const helper = read("src/lib/auth/invite-account.ts");
  assert.ok(helper.includes("persistSignupConsentEvents"));
  assert.ok(helper.includes('role: "AGENT"'));
  assert.ok(helper.includes("agentProfile.create"));
  assert.ok(!helper.includes("consentEvents:"));
}

function testTokenHashLookupOnce() {
  const raw = createWorkspaceInviteRawToken();
  const hash = hashWorkspaceInviteToken(raw);
  assert.equal(hash.length, 64);
  assert.match(hash, /^[a-f0-9]{64}$/);
  // Single hash — hashing the hash must not match DB lookup key.
  assert.notEqual(hashWorkspaceInviteToken(hash), hash);
  assert.equal(hashWorkspaceInviteToken(raw), hash);

  const mod = read("src/lib/workspace-invite.ts");
  assert.ok(mod.includes("findWorkspaceInviteByRawToken"));
  assert.ok(mod.includes("hashWorkspaceInviteToken(rawToken)"));
  // Email URL gets raw; DB stores hash
  assert.ok(mod.includes("createWorkspaceInviteRawToken"));
  const emailSend = mod.includes("rawToken") && mod.includes("/auth/invite/");
  assert.ok(emailSend);
}

function testNewUserOrderingNoEarlyReconcile() {
  const mod = read("src/lib/workspace-invite.ts");
  const acceptStart = mod.indexOf("export async function acceptWorkspaceInvite");
  const acceptBody = mod.slice(acceptStart);
  const newUserMarker = "createAgentAccountFromInvite";
  const memberCreate = "workspaceMember.create";
  const reconcile = "reconcileUserPlatformStaffState";

  const newUserIdx = acceptBody.indexOf(newUserMarker);
  const memberIdx = acceptBody.indexOf(memberCreate, newUserIdx);
  // Existing-user path may reconcile before new-user path; ensure new-user
  // block does not call reconcile (membership create is enough for AGENT).
  const afterNewUser = acceptBody.slice(newUserIdx);
  const nextReturn = afterNewUser.indexOf("secondMembership: false");
  const newUserBlock = afterNewUser.slice(0, nextReturn);
  assert.ok(newUserIdx >= 0);
  assert.ok(memberIdx > newUserIdx, "membership after user create");
  assert.ok(
    !newUserBlock.includes(reconcile),
    "new-user accept must not reconcile before/without membership",
  );
}

function testClientShowsErrors() {
  const client = read("src/components/auth/TeamInviteClient.tsx");
  assert.ok(client.includes("We couldn’t join the team"));
  assert.ok(client.includes("} catch {"));
  assert.ok(client.includes("Create account & join team"));
}

function testRouteCookieAndSafe500() {
  const route = read("src/app/api/auth/invite/[token]/route.ts");
  assert.ok(route.includes("response.cookies.set"));
  assert.ok(route.includes("ACTIVE_WORKSPACE_COOKIE"));
  assert.ok(route.includes("We couldn’t join the team"));
  assert.ok(route.includes("catch (error)"));
  // Cookie only in Route Handler after success — not in page SC
  const page = read("src/app/(auth)/auth/invite/[token]/page.tsx");
  assert.ok(!page.includes("cookies().set"));
  assert.ok(!page.includes("signActiveWorkspaceId"));
}

function testEmailAuthoritativeNotClientSubmitted() {
  const client = read("src/components/auth/TeamInviteClient.tsx");
  assert.ok(client.includes("disabled"));
  assert.ok(client.includes("readOnly"));
  assert.ok(
    !client.includes("body: JSON.stringify({\n          email"),
    "client must not POST email",
  );
  const org = read("src/lib/agent/accept-invite.ts");
  assert.ok(org.includes("email: invite.email"));
  const ws = read("src/lib/workspace-invite.ts");
  assert.ok(ws.includes("email: inviteEmail"));
}

async function main() {
  testNoNestedUserCreateOnAccept();
  testTokenHashLookupOnce();
  testNewUserOrderingNoEarlyReconcile();
  testClientShowsErrors();
  testRouteCookieAndSafe500();
  testEmailAuthoritativeNotClientSubmitted();
  console.log("workspace-invite-acceptance:selftest: ok");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
