/**
 * Structural: dashboard is source of truth for WORKSPACE_READ_SCOPE.
 * keep_vars preserves dashboard vars not listed in wrangler.
 * Run: pnpm workspace-deploy-flags:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wrangler = readFileSync(join(root, "wrangler.jsonc"), "utf8");
const deployYml = readFileSync(join(root, ".github/workflows/deploy.yml"), "utf8");
const packageJson = readFileSync(join(root, "package.json"), "utf8");

function testKeepVarsEnabled() {
  assert.match(wrangler, /"keep_vars"\s*:\s*true/);
}

function testReadScopeNotHardcodedInWrangler() {
  assert.ok(
    !wrangler.includes("WORKSPACE_READ_SCOPE"),
    "WORKSPACE_READ_SCOPE must not be hardcoded in wrangler (dashboard SoT)",
  );
}

function testActivationFlagsNotInWrangler() {
  for (const key of [
    "WORKSPACE_ROUTING_SCOPE",
    "WORKSPACE_NOTIFICATION_SCOPE",
    "WORKSPACE_TEAM_SCOPE",
    "WORKSPACE_DUAL_WRITE",
  ]) {
    assert.ok(
      !wrangler.includes(`"${key}"`),
      `${key} must remain unset in wrangler vars`,
    );
  }
}

function testNoSecretsInWranglerVars() {
  const forbidden = [
    "DATABASE_URL",
    "DIRECT_URL",
    "AUTH_SECRET",
    "NEXTAUTH_SECRET",
    "GOOGLE_CLIENT_SECRET",
    "RESEND_API_KEY",
    "TYPESENSE_SEARCH_API_KEY",
    "TYPESENSE_ADMIN_API_KEY",
    "CLOUDFLARE_API_TOKEN",
    "FIREBASE",
    "PRIVATE_KEY",
    "password",
  ];
  const lower = wrangler.toLowerCase();
  for (const needle of forbidden) {
    assert.ok(
      !lower.includes(needle.toLowerCase()),
      `wrangler.jsonc must not contain secret-like key/value: ${needle}`,
    );
  }
}

function testDeployUsesOpennextWrangler() {
  assert.ok(packageJson.includes("opennextjs-cloudflare deploy"));
  assert.ok(deployYml.includes("pnpm run deploy:cf"));
  assert.ok(!deployYml.includes("--keep-vars=false"));
}

testKeepVarsEnabled();
testReadScopeNotHardcodedInWrangler();
testActivationFlagsNotInWrangler();
testNoSecretsInWranglerVars();
testDeployUsesOpennextWrangler();

console.log("workspace-deploy-flags:selftest: ok");
