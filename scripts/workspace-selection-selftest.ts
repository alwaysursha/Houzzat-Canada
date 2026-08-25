/**
 * Stage 3H — active workspace selection selftest (no production DB).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  signActiveWorkspaceId,
  verifySignedActiveWorkspaceCookie,
} from "../src/lib/active-workspace";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

process.env.AUTH_SECRET = "selftest-active-workspace-secret";

function testSignAndVerify() {
  const signed = signActiveWorkspaceId("ws_smith_team");
  assert.equal(verifySignedActiveWorkspaceCookie(signed), "ws_smith_team");
}

function testForgedSignatureDenied() {
  assert.equal(
    verifySignedActiveWorkspaceCookie("ws_smith_team.forged"),
    null,
  );
}

function testTamperedWorkspaceIdDenied() {
  const signed = signActiveWorkspaceId("ws_smith_team");
  const tampered = signed.replace("ws_smith_team", "ws_jones_team");
  assert.equal(verifySignedActiveWorkspaceCookie(tampered), null);
}

function testEmptyDenied() {
  assert.equal(verifySignedActiveWorkspaceCookie(""), null);
  assert.equal(verifySignedActiveWorkspaceCookie(null), null);
}

function testMembershipStillRequired() {
  const ctx = readFileSync(join(root, "src/lib/workspace-context.ts"), "utf8");
  assert.ok(ctx.includes('status: "ACTIVE"'));
  assert.ok(ctx.includes("requiresWorkspaceSelection"));
}

async function main() {
  testSignAndVerify();
  testForgedSignatureDenied();
  testTamperedWorkspaceIdDenied();
  testEmptyDenied();
  testMembershipStillRequired();
  console.log("workspace-selection:selftest: ok");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
