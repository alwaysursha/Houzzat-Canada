/**
 * Structural: Wrangler must persist WORKSPACE_READ_SCOPE across deploys.
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

function testReadScopePersistedInVars() {
  assert.match(
    wrangler,
    /"WORKSPACE_READ_SCOPE"\s*:\s*"shadow"/,
    "WORKSPACE_READ_SCOPE=shadow must live in wrangler vars",
  );
}

function testActivationFlagsNotInWrangler() {
  for (const key of [
    "WORKSPACE_ROUTING_SCOPE",
    "WORKSPACE_NOTIFICATION_SCOPE",
    "WORKSPACE_TEAM_SCOPE",
  ]) {
    assert.ok(
      !wrangler.includes(`"${key}"`),
      `${key} must remain unset/legacy (not in wrangler vars)`,
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
testReadScopePersistedInVars();
testActivationFlagsNotInWrangler();
testNoSecretsInWranglerVars();
testDeployUsesOpennextWrangler();

console.log("workspace-deploy-flags:selftest: ok");
