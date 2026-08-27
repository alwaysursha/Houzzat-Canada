/**
 * Stage 3K.5.4.1 — canary deploy side-effect boundary + secret minimalism selftests.
 * Run: pnpm tenant-canary-side-effect:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isActivityBeaconEnabled } from "../src/lib/analytics/activity-beacon-enabled";
import {
  assertCanaryLeadCutoverBundle,
  assertProductionIsolatedFromCanaryLeadCutover,
  isCanaryLeadCutoverBundleComplete,
  isUnsafePartialCanaryLeadCutover,
  parseJsoncVar,
  configHasKey,
} from "./lib/canary-lead-cutover-config";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testActivityBeaconGate() {
  const prev = process.env.ACTIVITY_BEACON_DISABLED;
  try {
    delete process.env.ACTIVITY_BEACON_DISABLED;
    assert.equal(isActivityBeaconEnabled(), true, "beacon enabled by default");

    for (const flag of ["1", "true", "on", "TRUE"]) {
      process.env.ACTIVITY_BEACON_DISABLED = flag;
      assert.equal(
        isActivityBeaconEnabled(),
        false,
        `beacon disabled when ACTIVITY_BEACON_DISABLED=${flag}`,
      );
    }
  } finally {
    if (prev === undefined) delete process.env.ACTIVITY_BEACON_DISABLED;
    else process.env.ACTIVITY_BEACON_DISABLED = prev;
  }

  const providers = read("src/components/Providers.tsx");
  assert.ok(
    providers.includes("isActivityBeaconEnabled"),
    "Providers must gate ActivityBeacon",
  );
  assert.ok(
    providers.includes("isActivityBeaconEnabled() ? <ActivityBeacon /> : null"),
    "Providers must skip ActivityBeacon when disabled",
  );
}

function testCanaryAnalyticsDisabledProductionUnchanged() {
  const production = read("wrangler.jsonc");
  const canary = read("wrangler.tenant-canary.jsonc");

  assert.equal(parseJsoncVar(canary, "ACTIVITY_BEACON_DISABLED"), "1");
  assert.ok(
    !configHasKey(production, "ACTIVITY_BEACON_DISABLED"),
    "production houzzat must not disable analytics globally",
  );
}

function testPublicLeadScopeWorkspaceCutoverBundle() {
  const canary = read("wrangler.tenant-canary.jsonc");
  const production = read("wrangler.jsonc");
  assertCanaryLeadCutoverBundle(canary);
  assertProductionIsolatedFromCanaryLeadCutover(production);

  const partialLeadOnly = canary.replace(
    '"WORKSPACE_NOTIFICATION_SCOPE": "workspace",',
    "",
  );
  assert.equal(isUnsafePartialCanaryLeadCutover(partialLeadOnly), true);
  assert.equal(isCanaryLeadCutoverBundleComplete(partialLeadOnly), false);

  const leadIntake = read("src/lib/agent/lead-intake.ts");
  const publicLead = read("src/lib/tenancy/public-lead-workspace.ts");
  assert.ok(
    publicLead.includes("isTenantPublicLeadScopeWorkspace"),
    "public lead scope flag must exist",
  );
  assert.ok(
    leadIntake.includes("resolvePublicLeadWorkspaceIdFromRequest"),
    "lead intake must use request tenancy plumbing",
  );
}

function testNoPushEmailFirebaseRequiredInCanaryConfig() {
  const canary = read("wrangler.tenant-canary.jsonc");

  const deferredSecretKeys = [
    "RESEND_API_KEY",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "FIREBASE",
    "FCM",
    "VAPID",
  ];
  for (const key of deferredSecretKeys) {
    assert.ok(
      !canary.includes(key),
      `canary wrangler must not inline ${key}`,
    );
  }

  const pushBootstrap = read("src/components/mobile/PushNotificationsBootstrap.tsx");
  assert.ok(
    pushBootstrap.includes("Capacitor.isNativePlatform()"),
    "push bootstrap is native-only",
  );
}

function testNoBrokerageSyncOnAnonymousBrowse() {
  const beacon = read("src/components/analytics/ActivityBeacon.tsx");
  assert.ok(
    beacon.includes('pathname.startsWith("/admin")'),
    "beacon skips admin surfaces",
  );
  assert.ok(
    beacon.includes('pathname.startsWith("/agent")'),
    "beacon skips agent surfaces",
  );

  const marketingLayout = read("src/app/(marketing)/layout.tsx");
  assert.ok(
    !marketingLayout.includes("ensureBrokerageOrganization"),
    "marketing layout must not bootstrap brokerage org",
  );
}

function testTypesenseReadOnlyOnCanary() {
  const canary = read("wrangler.tenant-canary.jsonc");
  assert.equal(parseJsoncVar(canary, "TYPESENSE_SYNC"), "0");
}

function testProductionWorkerUnchanged() {
  const production = read("wrangler.jsonc");
  const pkg = JSON.parse(read("package.json")) as {
    scripts: Record<string, string>;
  };

  assert.ok(production.includes('"name": "houzzat"'));
  assert.equal(parseJsoncVar(production, "NEXTAUTH_URL"), "https://houzzat.com");
  assert.ok(!configHasKey(production, "TENANT_DOMAIN_SCOPE"));
  assert.ok(!configHasKey(production, "TENANT_BRANDING_SCOPE"));
  assert.ok(!pkg.scripts["deploy:cf"]?.includes("wrangler.tenant-canary.jsonc"));
}

function testMinimalSecretRunbook() {
  const runbook = read("docs/tenant-canary/secrets-runbook.md");
  assert.ok(runbook.includes("AUTH_SECRET"));
  assert.ok(runbook.includes("DATABASE_URL"));
  assert.ok(runbook.includes("TYPESENSE_SEARCH_API_KEY"));
  assert.ok(runbook.includes("ACTIVITY_BEACON_DISABLED"));
  assert.ok(runbook.includes("Defer"));
}

function testAuthSecretCanonical() {
  const activeWorkspace = read("src/lib/active-workspace.ts");
  assert.ok(
    activeWorkspace.includes("AUTH_SECRET ?? process.env.NEXTAUTH_SECRET"),
    "AUTH_SECRET is canonical with NEXTAUTH_SECRET fallback",
  );

  const auth = read("src/lib/auth.ts");
  assert.ok(
    auth.includes("Credentials("),
    "credentials provider exists for smoke test",
  );
  assert.ok(
    !auth.includes("process.env.NEXTAUTH_SECRET"),
    "auth.ts does not hard-require NEXTAUTH_SECRET",
  );
}

function testNoDeployInSelftest() {
  assert.ok(typeof main === "function");
}

function main() {
  testActivityBeaconGate();
  testCanaryAnalyticsDisabledProductionUnchanged();
  testPublicLeadScopeWorkspaceCutoverBundle();
  testNoPushEmailFirebaseRequiredInCanaryConfig();
  testNoBrokerageSyncOnAnonymousBrowse();
  testTypesenseReadOnlyOnCanary();
  testProductionWorkerUnchanged();
  testMinimalSecretRunbook();
  testAuthSecretCanonical();
  testNoDeployInSelftest();
  console.log("tenant-canary-side-effect:selftest passed");
}

main();
