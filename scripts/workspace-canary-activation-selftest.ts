/**
 * Stage 3J.9.1 — canary activation selftest (URL safety + rotation).
 * Run: pnpm workspace-canary-activation:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CANARY_ACTIVATION_CONFIRM_TOKEN,
  buildActivationInviteUrl,
  parseActivationCanaryCliArgs,
  parseActivationUserTarget,
  resolveCanaryActivationBaseUrl,
  validateActivationCanaryApplyConfirmation,
  validateActivationUserTarget,
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

function testUserTargetFailClosed() {
  assert.equal(parseActivationUserTarget("agent"), "agent");
  assert.equal(parseActivationUserTarget("owner"), "owner");
  assert.equal(parseActivationUserTarget("both"), null);

  assert.equal(
    validateActivationUserTarget({
      apply: true,
      userRaw: null,
      userTarget: null,
    }),
    "--apply requires --user=agent (or --user=owner)",
  );
  assert.equal(
    validateActivationUserTarget({
      apply: true,
      userRaw: "both",
      userTarget: null,
    }),
    "Unknown --user=both (allowed: agent, owner)",
  );

  const parsed = parseActivationCanaryCliArgs([
    "--apply",
    "--confirm=tenant-canary-activation",
    "--user=agent",
    "--rotate",
  ]);
  assert.equal(parsed.apply, true);
  assert.equal(parsed.rotate, true);
  assert.equal(parsed.userTarget, "agent");
}

function testProductionUrlRejectsLocalhost() {
  const bad = resolveCanaryActivationBaseUrl({
    CANARY_ACK_PRODUCTION_SCOPES: "1",
    NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3000",
  });
  assert.equal(bad.baseUrl, null);
  assert.ok(bad.error?.includes("localhost") || bad.error?.includes("CANARY_SITE_URL"));

  const skippedLocalUsesCanary = resolveCanaryActivationBaseUrl({
    CANARY_ACK_PRODUCTION_SCOPES: "1",
    NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3000",
    CANARY_SITE_URL: "https://houzzat.com",
  });
  assert.equal(skippedLocalUsesCanary.error, null);
  assert.equal(skippedLocalUsesCanary.baseUrl, "https://houzzat.com");

  const badHost = resolveCanaryActivationBaseUrl({
    CANARY_ACK_PRODUCTION_SCOPES: "1",
    CANARY_SITE_URL: "https://example.com",
  });
  assert.equal(badHost.baseUrl, null);
  assert.ok(badHost.error?.includes("houzzat.com"));

  const http = resolveCanaryActivationBaseUrl({
    CANARY_ACK_PRODUCTION_SCOPES: "1",
    CANARY_SITE_URL: "http://houzzat.com",
  });
  assert.equal(http.baseUrl, null);
  assert.ok(http.error?.includes("https"));
}

function testProductionUrlAccepted() {
  const ok = resolveCanaryActivationBaseUrl({
    CANARY_ACK_PRODUCTION_SCOPES: "1",
    CANARY_SITE_URL: "https://houzzat.com",
  });
  assert.equal(ok.error, null);
  assert.equal(ok.baseUrl, "https://houzzat.com");

  const fromNext = resolveCanaryActivationBaseUrl({
    CANARY_ACK_PRODUCTION_SCOPES: "1",
    NEXT_PUBLIC_SITE_URL: "https://houzzat.com/",
  });
  assert.equal(fromNext.baseUrl, "https://houzzat.com");

  const url = buildActivationInviteUrl(
    "https://houzzat.com",
    "TEST_TOKEN_VALUE_NOT_FOR_LOGS",
  );
  assert.equal(url, "https://houzzat.com/auth/invite/TEST_TOKEN_VALUE_NOT_FOR_LOGS");
  assert.ok(!url.includes("127.0.0.1"));
  assert.ok(!url.includes("localhost"));
}

function testNoSiteUrlLocalhostFallbackInLib() {
  const lib = read("scripts/lib/tenant-activation-canary.ts");
  assert.ok(!lib.includes('from "../../src/lib/constants"'));
  assert.ok(lib.includes("resolveCanaryActivationBaseUrl"));
  assert.ok(lib.includes("CANARY_SITE_URL"));
  assert.ok(lib.includes("--rotate"));
  assert.ok(lib.includes("CANCELLED"));
  assert.ok(lib.includes("status: \"CANCELLED\"") || lib.includes('status: "CANCELLED"'));
}

function testActivationStrategy() {
  const invite = read("src/lib/workspace-invite.ts");
  assert.ok(invite.includes("needsPasswordActivation"));
  assert.ok(invite.includes("canActivatePasswordlessExisting"));
  assert.ok(invite.includes("bcrypt.hash"));
  assert.ok(invite.includes('priorMembership?.status === "ACTIVE"'));
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

function testUiAndCliSafety() {
  const ui = read("src/components/auth/TeamInviteClient.tsx");
  assert.ok(ui.includes("needsPasswordActivation"));

  const cli = read("scripts/workspace-prepare-canary-activation.ts");
  assert.ok(cli.includes("--rotate"));
  assert.ok(cli.includes("DO NOT paste"));
  assert.ok(cli.includes("executeActivationCanaryApply"));
  assert.ok(!cli.includes("console.log(rawToken)"));
}

function testRotationPreservesUser() {
  const lib = read("scripts/lib/tenant-activation-canary.ts");
  assert.ok(lib.includes("rotation does not mutate User.password"));
  assert.ok(lib.includes("PRESERVE"));
  assert.ok(!lib.includes("pushDevice.create"));
  assert.ok(!lib.includes("user.update"));
}

async function main() {
  testApplyGuard();
  testUserTargetFailClosed();
  testProductionUrlRejectsLocalhost();
  testProductionUrlAccepted();
  testNoSiteUrlLocalhostFallbackInLib();
  testActivationStrategy();
  testReuseExistingSeat();
  testUiAndCliSafety();
  testRotationPreservesUser();
  console.log("workspace-canary-activation:selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
