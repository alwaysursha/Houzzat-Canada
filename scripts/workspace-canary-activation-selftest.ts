/**
 * Stage 3J.8 — canary activation selftest.
 * Run: pnpm workspace-canary-activation:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CANARY_ACTIVATION_CONFIRM_TOKEN,
  validateActivationCanaryApplyConfirmation,
} from "./lib/tenant-activation-canary";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testApplyGuard() {
  assert.equal(
    validateActivationCanaryApplyConfirmation({ apply: true, confirm: null }),
    `--apply requires --confirm=${CANARY_ACTIVATION_CONFIRM_TOKEN}`,
  );
  assert.equal(
    validateActivationCanaryApplyConfirmation({
      apply: true,
      confirm: CANARY_ACTIVATION_CONFIRM_TOKEN,
    }),
    null,
  );
}

function testActivationStrategy() {
  const invite = read("src/lib/workspace-invite.ts");
  assert.ok(invite.includes("needsPasswordActivation"));
  assert.ok(invite.includes("canActivatePasswordlessExisting"));
  assert.ok(invite.includes("bcrypt.hash"));
  assert.ok(invite.includes("priorMembership?.status === \"ACTIVE\""));
  assert.ok(!invite.includes("PushDevice"));
}

function testReuseExistingSeat() {
  const invite = read("src/lib/workspace-invite.ts");
  const acceptStart = invite.indexOf(
    "export async function acceptWorkspaceInvite",
  );
  const accept = invite.slice(acceptStart, acceptStart + 4500);
  assert.ok(accept.includes("workspaceMember.upsert"));
  assert.ok(accept.includes("user.update"));
  assert.ok(accept.includes("password: hashed"));
  assert.ok(!accept.includes("user.create"));
}

function testUiPasswordPath() {
  const ui = read("src/components/auth/TeamInviteClient.tsx");
  assert.ok(ui.includes("needsPasswordActivation"));
  assert.ok(ui.includes("Set password & open CRM"));
}

function testPrepareTool() {
  const lib = read("scripts/lib/tenant-activation-canary.ts");
  const cli = read("scripts/workspace-prepare-canary-activation.ts");
  assert.ok(lib.includes("NO email send") || lib.includes("no email"));
  assert.ok(lib.includes("createWorkspaceInviteRawToken"));
  assert.ok(lib.includes("hashWorkspaceInviteToken"));
  assert.ok(cli.includes("REFUSE --apply"));
  assert.ok(cli.includes("dry-run only"));
  assert.ok(!lib.includes("pushDevice.create"));
}

function testDeepLinkIsolation() {
  const openLead = read("src/lib/agent/lead-profile-query.ts");
  assert.ok(openLead.includes("openLeadHandoffHref"));
  assert.ok(openLead.includes("/agent/open-lead/"));
}

async function main() {
  testApplyGuard();
  testActivationStrategy();
  testReuseExistingSeat();
  testUiPasswordPath();
  testPrepareTool();
  testDeepLinkIsolation();
  console.log("workspace-canary-activation:selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
