/**
 * Stage 6.3 — Master Admin read-only API foundation selftest.
 * Run: node --import tsx scripts/stage-6.3-platform-api-selftest.ts
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  assertActiveMasterAdminOperator,
  PlatformOperatorAuthError,
} from "../src/lib/platform";
import {
  sanitizeProvisioningError,
  serializeOfferSummary,
} from "../src/lib/platform/read/serialize";

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

console.log("\n=== STAGE 6.3 — PLATFORM READ-ONLY API ===\n");

// 1. Routes exist
{
  const routes = [
    "src/app/api/platform/v1/me/route.ts",
    "src/app/api/platform/v1/summary/route.ts",
    "src/app/api/platform/v1/workspaces/route.ts",
    "src/app/api/platform/v1/workspaces/[workspaceId]/route.ts",
    "src/app/api/platform/v1/prospects/route.ts",
    "src/app/api/platform/v1/prospects/[prospectId]/route.ts",
    "src/app/api/platform/v1/offers/route.ts",
    "src/app/api/platform/v1/offers/[offerId]/route.ts",
    "src/app/api/platform/v1/subscriptions/route.ts",
    "src/app/api/platform/v1/subscriptions/[subscriptionId]/route.ts",
    "src/app/api/platform/v1/provisioning/route.ts",
    "src/app/api/platform/v1/provisioning/[runId]/route.ts",
    "src/app/api/platform/v1/audit/route.ts",
  ];
  for (const route of routes) {
    assert.ok(read(route).includes("runPlatformRoute"), route);
    assert.ok(!read(route).includes("requireAgentContext"), route);
  }
  console.log(`[1] ${routes.length} platform v1 routes present... PASS`);
}

// 2. Auth decisions
{
  assert.throws(
    () => assertActiveMasterAdminOperator(null, "admin@example.com"),
    (e: unknown) =>
      e instanceof PlatformOperatorAuthError &&
      e.code === "PLATFORM_OPERATOR_REQUIRED",
  );
  assert.throws(
    () =>
      assertActiveMasterAdminOperator(
        {
          id: "op",
          userId: "u",
          role: "MASTER_ADMIN",
          status: "DISABLED",
        },
        "x@example.com",
      ),
    (e: unknown) =>
      e instanceof PlatformOperatorAuthError &&
      e.code === "PLATFORM_OPERATOR_DISABLED",
  );
  const ok = assertActiveMasterAdminOperator(
    {
      id: "op",
      userId: "u",
      role: "MASTER_ADMIN",
      status: "ACTIVE",
    },
    "master@example.com",
  );
  assert.equal(ok.role, "MASTER_ADMIN");
  console.log("[2] Platform operator auth matrix... PASS");
}

// 3. CRM import boundary for platform read + api + routes
{
  const forbidden = [
    /from\s+["']@\/lib\/crm-read-scope["']/,
    /from\s+["']@\/lib\/agent\/lead-summary["']/,
    /from\s+["']@\/lib\/agent["']/,
    /prisma\.lead\./,
    /prisma\.leadNote\./,
    /prisma\.leadEmailLog\./,
  ];
  const dirs = [
    "src/lib/platform/read",
    "src/lib/platform/api",
    "src/app/api/platform",
  ];
  for (const dir of dirs) {
    for (const file of listTsFiles(dir)) {
      const src = read(file);
      for (const re of forbidden) {
        assert.ok(!re.test(src), `${file} matches forbidden ${re}`);
      }
    }
  }
  console.log("[3] CRM loader/model imports absent from platform API... PASS");
}

// 4. tokenHash never serialized
{
  const serialized = serializeOfferSummary({
    id: "offer1",
    prospectId: "p1",
    createdByOperatorId: "op1",
    status: "DRAFT",
    planCode: "SOLO",
    billingCadence: "MONTHLY",
    currency: "CAD",
    standardRecurringAmountCents: 1,
    negotiatedRecurringAmountCents: 1,
    setupFeeCents: 0,
    includedSeats: 1,
    additionalSeats: 0,
    trialDays: null,
    proposedStartDate: null,
    expiresAt: null,
    version: 1,
    acceptedSnapshotJson: null,
    sentAt: null,
    viewedAt: null,
    acceptedAt: null,
    acceptedByEmail: null,
    workspaceId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lineItems: [],
    tokens: [
      {
        id: "t1",
        offerId: "offer1",
        tokenHash: "secret-hash",
        expiresAt: new Date(),
        revokedAt: null,
        lastViewedAt: null,
        createdAt: new Date(),
      },
    ],
    acceptance: null,
    subscription: null,
    provisioningRun: null,
  });
  assert.ok(!("tokenHash" in (serialized.tokens[0] ?? {})));
  assert.equal(JSON.stringify(serialized).includes("secret-hash"), false);
  console.log("[4] tokenHash excluded from offer serialization... PASS");
}

// 5. Stripe secret redaction in provisioning errors
{
  const sanitized = sanitizeProvisioningError(
    "failed sk_live_abc123xyz webhook Bearer abc.def.ghi",
  );
  assert.ok(sanitized?.includes("[redacted-stripe-secret]"));
  assert.ok(sanitized?.includes("[redacted-bearer]"));
  assert.equal(sanitized?.includes("sk_live_abc123xyz"), false);
  console.log("[5] provisioning error sanitization... PASS");
}

// 6. Read services use requirePlatformOperator via route wrapper only
{
  const routeHelper = read("src/lib/platform/api/route.ts");
  assert.ok(routeHelper.includes("withPlatformOperator"));
  const readIndex = read("src/lib/platform/read/index.ts");
  assert.ok(!readIndex.includes("requirePlatformOperator"));
  console.log("[6] auth enforced at route boundary... PASS");
}

console.log("\nSTAGE 6.3 — ALL TESTS PASSED\n");
