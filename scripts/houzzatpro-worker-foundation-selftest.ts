/**
 * Stage 6 infra correction — HouzzatPRO Worker foundation config selftest.
 * Run: pnpm houzzatpro-worker-foundation:selftest
 *
 * Validates wrangler.houzzatpro.jsonc + deploy targeting isolation.
 * Does not deploy, touch DNS, or attach hostnames.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertCanaryLeadCutoverBundle,
  assertProductionIsolatedFromCanaryLeadCutover,
  configHasKey,
  parseJsoncVar,
} from "./lib/canary-lead-cutover-config";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function parseJsoncName(configText: string): string {
  const match = configText.match(/"name"\s*:\s*"([^"]+)"/);
  assert.ok(match, "worker name in config");
  return match[1]!;
}

function testWorkerNamesIsolated() {
  const production = read("wrangler.jsonc");
  const canary = read("wrangler.tenant-canary.jsonc");
  const houzzatpro = read("wrangler.houzzatpro.jsonc");

  assert.equal(parseJsoncName(production), "houzzat");
  assert.equal(parseJsoncName(canary), "houzzat-tenant-canary");
  assert.equal(parseJsoncName(houzzatpro), "houzzatpro");

  assert.notEqual(production, houzzatpro);
  assert.notEqual(canary, houzzatpro);
  assert.ok(
    !houzzatpro.includes('"env"'),
    "houzzatpro must not use wrangler env inheritance",
  );
}

function testHouzzatproSelfBinding() {
  const houzzatpro = read("wrangler.houzzatpro.jsonc");
  assert.ok(houzzatpro.includes('"service": "houzzatpro"'));
  assert.ok(!houzzatpro.includes('"service": "houzzat"'));
  assert.ok(!houzzatpro.includes('"service": "houzzat-tenant-canary"'));
}

function testHouzzatproTenancyPosture() {
  const production = read("wrangler.jsonc");
  const houzzatpro = read("wrangler.houzzatpro.jsonc");

  // Platform Worker must be workspace-scoped (not houzzat legacy).
  assertCanaryLeadCutoverBundle(houzzatpro);
  assert.equal(parseJsoncVar(houzzatpro, "TENANT_ADMIN_HOST_LOCK"), "off");
  assert.equal(
    parseJsoncVar(houzzatpro, "NEXT_PUBLIC_SITE_URL"),
    "https://app.houzzatpro.com",
  );

  // Canary-style auth posture: no env-pinned NEXTAUTH_URL (trustHost).
  assert.equal(configHasKey(houzzatpro, "NEXTAUTH_URL"), false);
  assert.equal(configHasKey(houzzatpro, "AUTH_URL"), false);

  // Do not disable analytics beacon on the platform Worker (canary-only).
  assert.equal(configHasKey(houzzatpro, "ACTIVITY_BEACON_DISABLED"), false);

  // No routes / custom domains in config (dashboard attach is a later stage).
  assert.ok(!/"routes"\s*:/.test(houzzatpro));
  assert.ok(!/"route"\s*:/.test(houzzatpro));
  assert.ok(!houzzatpro.includes("custom_domain"));
  assert.ok(!houzzatpro.includes("*.houzzatpro.com"));

  // Production houzzat remains legacy-isolated from workspace flag bundle.
  assertProductionIsolatedFromCanaryLeadCutover(production);
}

function testDeployCommandIsolation() {
  const pkg = JSON.parse(read("package.json")) as {
    scripts: Record<string, string>;
  };

  assert.ok(pkg.scripts["deploy:cf"]?.includes("opennextjs-cloudflare deploy"));
  assert.ok(!pkg.scripts["deploy:cf"]?.includes("wrangler.houzzatpro.jsonc"));
  assert.ok(!pkg.scripts["deploy:cf"]?.includes("wrangler.tenant-canary.jsonc"));
  assert.ok(!pkg.scripts["deploy:cf"]?.includes("--config"));

  const canaryDeploy = pkg.scripts["deploy:cf:tenant-canary"];
  assert.ok(
    canaryDeploy?.includes(
      "opennextjs-cloudflare deploy --config wrangler.tenant-canary.jsonc",
    ),
  );
  assert.ok(!canaryDeploy?.includes("wrangler.houzzatpro.jsonc"));

  const houzzatproDeploy = pkg.scripts["deploy:cf:houzzatpro"];
  assert.ok(
    houzzatproDeploy?.includes(
      "opennextjs-cloudflare deploy --config wrangler.houzzatpro.jsonc",
    ),
  );
  assert.ok(
    houzzatproDeploy?.includes(
      "NEXT_PUBLIC_SITE_URL=https://app.houzzatpro.com",
    ),
  );
  assert.ok(!houzzatproDeploy?.includes("NEXTAUTH_URL"));
  assert.ok(!houzzatproDeploy?.includes("wrangler.tenant-canary.jsonc"));
  assert.ok(!houzzatproDeploy?.includes("wrangler.jsonc"));
  assert.ok(pkg.scripts["build:cloudflare:houzzatpro"]);

  // Main production workflow must stay on houzzat only.
  const workflow = read(".github/workflows/deploy.yml");
  assert.ok(workflow.includes("pnpm run deploy:cf"));
  assert.ok(!workflow.includes("deploy:cf:houzzatpro"));
  assert.ok(!workflow.includes("wrangler.houzzatpro.jsonc"));
}

function main() {
  testWorkerNamesIsolated();
  console.log("[1] Worker names isolated (houzzat / canary / houzzatpro)... PASS");

  testHouzzatproSelfBinding();
  console.log("[2] WORKER_SELF_REFERENCE → houzzatpro... PASS");

  testHouzzatproTenancyPosture();
  console.log("[3] Workspace tenancy + no auth URL pin + no routes... PASS");

  testDeployCommandIsolation();
  console.log("[4] deploy:cf:houzzatpro isolated; CI unchanged... PASS");

  console.log("\nHOUZZATPRO WORKER FOUNDATION SELFTEST PASSED");
}

main();
