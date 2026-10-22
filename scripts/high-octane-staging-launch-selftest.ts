/**
 * Fail-closed HIGH OCTANE staging launch plan.
 * Run: pnpm exec tsx scripts/high-octane-staging-launch-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  HIGH_OCTANE_STAGING_NEXT_DIST_DIR,
  resolveNextDistDir,
} from "../src/lib/next/high-octane-staging-dist-dir";
import {
  FORCED_STAGING_INTEGRATIONS,
  HIGH_OCTANE_STAGING_BRANCH_ID,
  evaluateHighOctaneStagingLaunch,
  finishLaunch,
  unsafeChildIntegrationKeys,
  type LaunchDecision,
} from "../src/lib/tenancy/templates/high-octane-staging-launch";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const STAGING_DIRECT =
  "postgresql://staging-user:staging-secret@ep-red-credit-axp65p8a.c-4.us-east-2.aws.neon.tech/neondb";
const STAGING_POOLED =
  "postgresql://staging-user:staging-secret@ep-red-credit-axp65p8a-pooler.c-4.us-east-2.aws.neon.tech/neondb";
const PRODUCTION_DATABASE =
  "postgresql://prod-user:prod-secret@ep-snowy-river-axfgwomo-pooler.c-4.us-east-2.aws.neon.tech/neondb";
const PRODUCTION_DIRECT =
  "postgresql://prod-user:prod-secret@ep-snowy-river-axfgwomo.c-4.us-east-2.aws.neon.tech/neondb";

function fileEnv(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    DATABASE_URL: PRODUCTION_DATABASE,
    DIRECT_URL: PRODUCTION_DIRECT,
    AUTH_SECRET: "production-auth-secret-value",
    NEXTAUTH_SECRET: "production-nextauth-secret",
    NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3000",
    NEXTAUTH_URL: "http://127.0.0.1:3000",
    STAGING_DATABASE_URL: STAGING_POOLED,
    STAGING_DIRECT_URL: STAGING_DIRECT,
    HIGH_OCTANE_STAGING_AUTH_SECRET: "staging-only-auth-secret-value",
    RESEND_API_KEY: "re_live_example",
    TWILIO_AUTH_TOKEN: "twilio-live-token",
    STRIPE_SECRET_KEY: "sk_live_example",
    TYPESENSE_ADMIN_API_KEY: "typesense-admin",
    TYPESENSE_SYNC: "1",
    LISTING_PROVIDER: "proptx",
    PROPTX_BEARER_TOKEN: "mls-live-token",
    R2_SECRET_ACCESS_KEY: "r2-live-secret",
    CRON_SECRET: "cron-live-secret",
    NEXT_PUBLIC_META_PIXEL_ID: "pixel-live",
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_example",
    GOOGLE_MAPS_BILLING_ENABLED: "1",
    GOOGLE_ROUTES_ENABLED: "1",
    ...overrides,
  };
}

function readyPlan(): LaunchDecision {
  return evaluateHighOctaneStagingLaunch({
    fileEnv: fileEnv(),
    branchId: HIGH_OCTANE_STAGING_BRANCH_ID,
  });
}

const accepted = readyPlan();
assert.equal(accepted.ok, true, accepted.blockers.join(","));
assert.equal(accepted.childEnv.DATABASE_URL, STAGING_DIRECT);
assert.equal(accepted.childEnv.DIRECT_URL, STAGING_DIRECT);
assert.notEqual(accepted.childEnv.DATABASE_URL, PRODUCTION_DATABASE);
assert.notEqual(accepted.childEnv.DIRECT_URL, PRODUCTION_DIRECT);
assert.equal(accepted.childEnv.HIGH_OCTANE_STAGING, "1");
assert.equal(accepted.childEnv.HIGH_OCTANE_STAGING_ACCESS, "authenticated");
assert.equal(accepted.childEnv.HIGH_OCTANE_STAGING_DIST, "1");
assert.equal(accepted.childEnv.TENANT_DOMAIN_SCOPE, "workspace");
assert.equal(accepted.childEnv.NEXTAUTH_URL, "http://localhost:3010");
assert.equal(accepted.childEnv.NEXT_PUBLIC_SITE_URL, "http://localhost:3010");
assert.equal(accepted.childEnv.AUTH_SECRET, "staging-only-auth-secret-value");
assert.notEqual(accepted.childEnv.AUTH_SECRET, "production-auth-secret-value");
assert.equal(accepted.report.distDir, ".next-high-octane-staging");
assert.equal(accepted.report.hostname, "localhost");
assert.equal(accepted.report.devHostnameLeftUntouched, "127.0.0.1");
assert.equal(accepted.command.args[4], "localhost");
assert.equal(accepted.command.args[6], "3010");
assert.equal(unsafeChildIntegrationKeys(accepted.childEnv).length, 0);
assert.equal(accepted.childEnv.RESEND_API_KEY, "");
assert.equal(accepted.childEnv.TWILIO_AUTH_TOKEN, "");
assert.equal(accepted.childEnv.STRIPE_SECRET_KEY, "");
assert.equal(accepted.childEnv.STRIPE_WEBHOOK_SECRET, "");
assert.equal(accepted.childEnv.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, "");
assert.equal(accepted.childEnv.TYPESENSE_SYNC, "0");
assert.equal(accepted.childEnv.TYPESENSE_SEARCH, "0");
assert.equal(accepted.childEnv.TYPESENSE_ADMIN_API_KEY, "");
assert.equal(accepted.childEnv.PROPTX_BEARER_TOKEN, "");
assert.equal(accepted.childEnv.MLS_SYNC_SECRET, "");
assert.equal(accepted.childEnv.R2_SECRET_ACCESS_KEY, "");
assert.equal(accepted.childEnv.CRON_SECRET, "");
assert.equal(accepted.childEnv.NEXT_PUBLIC_META_PIXEL_ID, "");
assert.equal(accepted.childEnv.GOOGLE_MAPS_BILLING_ENABLED, "0");
assert.equal(accepted.childEnv.GOOGLE_ROUTES_ENABLED, "0");
assert.equal(accepted.childEnv.LISTING_PROVIDER, "mock");
assert.equal(accepted.report.nextStarted, false);
assert.equal(accepted.report.prismaGenerate, false);
assert.equal(accepted.command.args.includes("dev.sh"), false);
assert.equal(accepted.command.args.join(" ").includes("prisma"), false);

const production = evaluateHighOctaneStagingLaunch({
  fileEnv: fileEnv({ STAGING_DIRECT_URL: PRODUCTION_DIRECT }),
  branchId: HIGH_OCTANE_STAGING_BRANCH_ID,
});
assert.equal(production.ok, false);
assert.ok(production.blockers.includes("staging_direct_is_production"));
assert.equal(production.childEnv.DATABASE_URL, "");
assert.equal(production.childEnv.DIRECT_URL, "");

const wrongBranch = evaluateHighOctaneStagingLaunch({
  fileEnv: fileEnv(),
  branchId: "br-wrong-branch",
});
assert.equal(wrongBranch.ok, false);
assert.ok(wrongBranch.blockers.includes("staging_branch_mismatch"));
assert.equal(wrongBranch.childEnv.DATABASE_URL, "");

const missingSecret = evaluateHighOctaneStagingLaunch({
  fileEnv: fileEnv({ HIGH_OCTANE_STAGING_AUTH_SECRET: undefined }),
  branchId: HIGH_OCTANE_STAGING_BRANCH_ID,
});
assert.equal(missingSecret.ok, false);
assert.ok(missingSecret.blockers.includes("staging_auth_secret_missing"));
assert.equal(missingSecret.childEnv.AUTH_SECRET, "");
assert.notEqual(missingSecret.childEnv.AUTH_SECRET, "production-auth-secret-value");

const reusedSecret = evaluateHighOctaneStagingLaunch({
  fileEnv: fileEnv({ HIGH_OCTANE_STAGING_AUTH_SECRET: "production-auth-secret-value" }),
  branchId: HIGH_OCTANE_STAGING_BRANCH_ID,
});
assert.equal(reusedSecret.ok, false);
assert.ok(reusedSecret.blockers.includes("staging_auth_secret_reuses_production"));
assert.equal(reusedSecret.childEnv.AUTH_SECRET, "");

const unknownCredential = evaluateHighOctaneStagingLaunch({
  fileEnv: fileEnv({ LIVE_BOARD_TOKEN: "board-token" }),
  branchId: HIGH_OCTANE_STAGING_BRANCH_ID,
});
assert.equal(unknownCredential.ok, false);
assert.ok(unknownCredential.blockers.includes("unknown_credential:LIVE_BOARD_TOKEN"));
assert.equal(unknownCredential.childEnv.LIVE_BOARD_TOKEN, "");

const poolerAsDirect = evaluateHighOctaneStagingLaunch({
  fileEnv: fileEnv({ STAGING_DIRECT_URL: STAGING_POOLED }),
  branchId: HIGH_OCTANE_STAGING_BRANCH_ID,
});
assert.equal(poolerAsDirect.ok, false);
assert.ok(poolerAsDirect.blockers.includes("staging_direct_is_pooler"));
assert.equal(poolerAsDirect.childEnv.NEXTAUTH_URL, "http://localhost:3010");
assert.equal(poolerAsDirect.childEnv.TENANT_DOMAIN_SCOPE, "workspace");

assert.equal(resolveNextDistDir({}), ".next");
assert.equal(resolveNextDistDir({ HIGH_OCTANE_STAGING_DIST: "1" }), HIGH_OCTANE_STAGING_NEXT_DIST_DIR);
assert.notEqual(accepted.report.distDir, resolveNextDistDir({}));

const pkg = readFileSync(join(root, "package.json"), "utf8");
assert.ok(pkg.includes('"dev": "bash scripts/dev.sh"'));

const auth = readFileSync(join(root, "src/lib/auth.config.ts"), "utf8");
const cookies = auth.slice(auth.indexOf("cookies:"), auth.indexOf("callbacks:"));
assert.equal(cookies.includes("domain:"), false);
assert.equal(accepted.report.hostname === accepted.report.devHostnameLeftUntouched, false);

let spawned = 0;
finishLaunch(accepted, "dry-run", () => {
  spawned += 1;
});
assert.equal(spawned, 0);
finishLaunch(missingSecret, "start", () => {
  spawned += 1;
});
assert.equal(spawned, 0);
finishLaunch(accepted, "start", (command, args, env) => {
  spawned += 1;
  assert.equal(command, "pnpm");
  assert.deepEqual(args, ["exec", "next", "dev", "--hostname", "localhost", "--port", "3010", "--webpack"]);
  assert.equal(env.DATABASE_URL, STAGING_DIRECT);
  assert.equal(env.HIGH_OCTANE_STAGING_DIST, "1");
});
assert.equal(spawned, 1);

for (const value of Object.values(FORCED_STAGING_INTEGRATIONS)) {
  assert.ok(value === "" || value === "0" || value === "1" || value === "mock" || value === "idx");
}

const launcher = readFileSync(join(root, "scripts/start-high-octane-staging.ts"), "utf8");
assert.ok(launcher.includes('finishLaunch(decision, "dry-run"'));
assert.ok(launcher.includes(".env.high-octane-staging"));
assert.ok(launcher.includes("HIGH_OCTANE_STAGING_AUTH_SECRET"));
assert.ok(launcher.includes("BEGIN READ ONLY"));
assert.equal(launcher.includes("scripts/dev.sh"), false);
assert.equal(launcher.includes("db push"), false);
assert.equal(launcher.includes("migrate"), false);

console.log("high-octane-staging-launch-selftest: ok");
