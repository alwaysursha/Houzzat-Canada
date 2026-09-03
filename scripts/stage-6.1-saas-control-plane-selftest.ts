/**
 * Stage 6.1 — control-plane module boundary + schema contract tests.
 * Run: node --import tsx scripts/stage-6.1-saas-control-plane-selftest.ts
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function listTsFiles(dir: string): string[] {
  const abs = join(root, dir);
  const out: string[] = [];
  for (const name of readdirSync(abs, { withFileTypes: true })) {
    const rel = join(dir, name.name);
    if (name.isDirectory()) out.push(...listTsFiles(rel));
    else if (name.name.endsWith(".ts") || name.name.endsWith(".tsx")) out.push(rel);
  }
  return out;
}

console.log("\n=== STAGE 6.1 — SAAS CONTROL PLANE ===\n");

// 1. Schema presence
{
  const schema = read("prisma/schema.prisma");
  for (const model of [
    "PlatformOperator",
    "PlatformProspect",
    "PlatformProspectActivity",
    "CommercialOffer",
    "CommercialOfferLineItem",
    "CommercialOfferToken",
    "OfferAcceptance",
    "BillingCustomer",
    "Subscription",
    "WorkspaceEntitlement",
    "WorkspaceSeatQuota",
    "AddOnGrant",
    "ProvisioningRun",
    "ProvisioningStep",
    "WorkspaceStatusEvent",
    "PlatformAuditEvent",
    "WorkspaceEmailIdentity",
  ]) {
    assert.ok(schema.includes(`model ${model}`), `missing model ${model}`);
  }
  assert.ok(schema.includes("currentSubscriptionId"));
  assert.ok(schema.includes("themeId"));
  assert.ok(schema.includes("SubscriptionStatus"));
  const subStatusEnum = schema.match(
    /enum SubscriptionStatus \{([^}]+)\}/,
  );
  assert.ok(subStatusEnum, "SubscriptionStatus enum block");
  assert.ok(
    !subStatusEnum[1].includes("SUSPENDED"),
    "SubscriptionStatus must not include SUSPENDED",
  );
  assert.ok(
    subStatusEnum[1].includes("PAST_DUE"),
    "SubscriptionStatus must include PAST_DUE",
  );
  assert.ok(schema.includes("WorkspaceCurrentSubscription"));
  assert.ok(schema.includes("WorkspaceSubscriptions"));
  const offerBlock = schema.match(/model CommercialOffer \{[\s\S]*?\n\}/);
  assert.ok(offerBlock, "CommercialOffer block");
  assert.ok(
    !/\bsubscriptionId\b/.test(offerBlock[0]),
    "CommercialOffer must not declare subscriptionId",
  );
  assert.ok(
    /\bsubscription\s+Subscription\?/.test(offerBlock[0]),
    "CommercialOffer should expose inverse subscription relation",
  );
  console.log("[1] Schema models + currentSubscription + no Offer.subscriptionId... PASS");
}

// 2. Migration additive
{
  const mig = read(
    "prisma/migrations/20260903120000_stage_61_saas_control_plane/migration.sql",
  );
  assert.ok(mig.includes("CREATE TABLE \"PlatformOperator\""));
  assert.ok(mig.includes("CREATE TABLE \"Subscription\""));
  assert.ok(mig.includes('ADD COLUMN "currentSubscriptionId"'));
  assert.ok(mig.includes('ADD COLUMN "themeId"'));
  assert.ok(!mig.includes("DROP TABLE"));
  assert.ok(!mig.includes("DROP COLUMN"));
  assert.ok(!/ALTER TYPE \"WorkspaceStatus\"/.test(mig));
  console.log("[2] Migration additive / no WorkspaceStatus mutation... PASS");
}

// 3. Platform auth foundation
{
  const auth = read("src/lib/platform/auth/require-platform-operator.ts");
  assert.ok(auth.includes("requirePlatformOperator"));
  assert.ok(auth.includes("platformOperator.findUnique"));
  assert.ok(!auth.includes("requireAgentContext"));
  assert.ok(!auth.includes("crm-read-scope"));
  assert.ok(!/from ["']@\/lib\/agent["']/.test(auth));
  console.log("[3] requirePlatformOperator isolated from CRM... PASS");
}

// 4. Import boundary — platform/** must not pull CRM lead loaders
{
  const forbiddenImportRes = [
    /from\s+["']@\/lib\/crm-read-scope["']/,
    /from\s+["']@\/lib\/agent\/lead-summary["']/,
    /from\s+["']@\/lib\/agent["']/,
  ];
  const files = listTsFiles("src/lib/platform");
  for (const file of files) {
    const src = read(file);
    for (const re of forbiddenImportRes) {
      assert.ok(!re.test(src), `${file} matches forbidden import ${re}`);
    }
  }
  console.log(`[4] Platform module CRM import boundary (${files.length} files)... PASS`);
}

// 5. Grandfathering profile constant
{
  const profiles = read("src/lib/platform/entitlements/profiles.ts");
  assert.ok(profiles.includes("HOUZZAT_LEGACY"));
  console.log("[5] HOUZZAT_LEGACY profile constant... PASS");
}

console.log("\nSTAGE 6.1 — ALL TESTS PASSED\n");
