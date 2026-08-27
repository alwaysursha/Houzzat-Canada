/**
 * Stage 3K.5.7 — Tenant B lead cutover pre-flight selftests.
 * Run: pnpm tenant-lead-cutover-preflight:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { LeadIntent } from "@prisma/client";
import {
  PublicLeadRoutingError,
  resolveWorkspaceModeLeadDeskAssignment,
  assertAssigneeEligibleForWorkspace,
} from "../src/lib/workspace-lead-desk";
import {
  createTenantBLeadRoutingFixture,
  HOUZZAT_FIXTURE_ORG_ID,
  HOUZZAT_FIXTURE_WORKSPACE_ID,
  TENANT_B_FIXTURE_AGENT_ID,
  TENANT_B_FIXTURE_ORG_ID,
  TENANT_B_LEAD_ROUTING_FIXTURE_ROWS,
  TENANT_B_LEAD_ROUTING_FIXTURE_SUMMARY,
} from "../src/lib/tenancy/test-fixtures/tenant-b-lead-routing";
import {
  TENANT_B_TEST_WORKSPACE_ID,
} from "../src/lib/tenancy/test-fixtures/tenant-b-brand";
import {
  createFixtureHostResolutionDeps,
  clearHostResolutionCacheForTests,
} from "../src/lib/tenancy/resolve-workspace-host";
import {
  resolvePublicLeadWorkspaceIdFromRequest,
  detectClientWorkspaceOverride,
} from "../src/lib/tenancy/public-lead-workspace";
import {
  formatNewLeadEmailSubject,
  formatSignupLeadDetailLine,
  resolveLeadNotificationBrandFromDesk,
} from "../src/lib/tenancy/lead-notification-brand";
import { planPublicLeadRouting } from "../src/lib/tenancy/public-lead-dry-run";
import { PUBLIC_LEAD_WRITE_PATHS } from "../src/lib/tenancy/public-lead-write-paths";
import {
  assertCanaryLeadCutoverBundle,
  assertProductionIsolatedFromCanaryLeadCutover,
  isCanaryLeadCutoverBundleComplete,
  isUnsafePartialCanaryLeadCutover,
} from "./lib/canary-lead-cutover-config";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function req(host: string) {
  return new Request(`https://${host}/`, {
    headers: { host, "x-forwarded-proto": "https" },
  });
}

const scopeKeys = [
  "TENANT_DOMAIN_SCOPE",
  "TENANT_BRANDING_SCOPE",
  "TENANT_PUBLIC_LEAD_SCOPE",
  "WORKSPACE_ROUTING_SCOPE",
  "WORKSPACE_NOTIFICATION_SCOPE",
] as const;

async function withWorkspaceLeadScope<T>(fn: () => Promise<T>): Promise<T> {
  const prev: Record<string, string | undefined> = {};
  for (const key of scopeKeys) {
    prev[key] = process.env[key];
    process.env[key] = "workspace";
  }
  clearHostResolutionCacheForTests();
  try {
    return await fn();
  } finally {
    for (const key of scopeKeys) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
    clearHostResolutionCacheForTests();
  }
}

async function withLegacyLeadScope<T>(fn: () => Promise<T>): Promise<T> {
  const prev: Record<string, string | undefined> = {};
  for (const key of scopeKeys) {
    prev[key] = process.env[key];
    process.env[key] = "legacy";
  }
  clearHostResolutionCacheForTests();
  try {
    return await fn();
  } finally {
    for (const key of scopeKeys) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
    clearHostResolutionCacheForTests();
  }
}

function testSignupWiring() {
  const signUp = read("src/app/api/auth/sign-up/route.ts");
  const leadIntake = read("src/lib/agent/lead-intake.ts");
  assert.ok(signUp.includes("captureWebsiteLead({"));
  assert.ok(signUp.includes("request,"));
  assert.ok(leadIntake.includes("request?: Request | null"));
}

function testOrganizationIsolationFixture() {
  const fixture = createTenantBLeadRoutingFixture();
  assert.notEqual(
    TENANT_B_LEAD_ROUTING_FIXTURE_SUMMARY.organizationId,
    TENANT_B_LEAD_ROUTING_FIXTURE_SUMMARY.houzzatOrganizationId,
  );
  void fixture;
}

async function testAssigneeIsolation() {
  const fixture = createTenantBLeadRoutingFixture();
  await assertAssigneeEligibleForWorkspace(
    TENANT_B_TEST_WORKSPACE_ID,
    TENANT_B_FIXTURE_AGENT_ID,
    fixture,
  );
  await assert.rejects(
    () =>
      assertAssigneeEligibleForWorkspace(
        TENANT_B_TEST_WORKSPACE_ID,
        "agent_houzzat_fixture",
        fixture,
      ),
    PublicLeadRoutingError,
  );
}

async function testWorkspaceDeskAssignment() {
  const fixture = createTenantBLeadRoutingFixture();
  const houzzat = await resolveWorkspaceModeLeadDeskAssignment({
    workspaceId: HOUZZAT_FIXTURE_WORKSPACE_ID,
    intent: "BUYER",
    fixture,
  });
  assert.equal(houzzat.workspaceId, HOUZZAT_FIXTURE_WORKSPACE_ID);
  assert.equal(houzzat.organizationId, HOUZZAT_FIXTURE_ORG_ID);
  assert.equal(houzzat.assigneeId, "agent_houzzat_fixture");

  const tenantB = await resolveWorkspaceModeLeadDeskAssignment({
    workspaceId: TENANT_B_TEST_WORKSPACE_ID,
    intent: "BUYER",
    fixture,
  });
  assert.equal(tenantB.workspaceId, TENANT_B_TEST_WORKSPACE_ID);
  assert.equal(tenantB.organizationId, TENANT_B_FIXTURE_ORG_ID);
  assert.equal(tenantB.assigneeId, TENANT_B_FIXTURE_AGENT_ID);
  assert.notEqual(tenantB.organizationId, houzzat.organizationId);
}

function testNotificationBranding() {
  const tenant = resolveLeadNotificationBrandFromDesk({
    workspaceSlug: "tenant-canary",
    displayName: "Tenant Canary",
  });
  assert.equal(
    formatNewLeadEmailSubject(tenant, "listing inquiry"),
    "New Tenant Canary lead: listing inquiry",
  );
  assert.ok(
    formatSignupLeadDetailLine(tenant).includes("Tenant Canary"),
  );

  const houzzat = resolveLeadNotificationBrandFromDesk({
    workspaceSlug: "houzzat",
    displayName: "Houzzat",
  });
  assert.equal(
    formatNewLeadEmailSubject(houzzat, "listing inquiry"),
    "New Houzzat lead: listing inquiry",
  );
}

async function testHostnameWorkspaceResolver() {
  await withWorkspaceLeadScope(async () => {
    const deps = createFixtureHostResolutionDeps(TENANT_B_LEAD_ROUTING_FIXTURE_ROWS, {
      workspaceId: HOUZZAT_FIXTURE_WORKSPACE_ID,
      workspaceSlug: "houzzat",
    });
    const sequence = [
      ["houzzat.com", HOUZZAT_FIXTURE_WORKSPACE_ID],
      ["tenant-canary.houzzatpro.com", TENANT_B_TEST_WORKSPACE_ID],
      ["houzzat.com", HOUZZAT_FIXTURE_WORKSPACE_ID],
      ["tenant-canary.houzzatpro.com", TENANT_B_TEST_WORKSPACE_ID],
    ] as const;
    for (const [host, expected] of sequence) {
      const ws = await resolvePublicLeadWorkspaceIdFromRequest(req(host), deps);
      assert.equal(ws, expected, host);
    }
    assert.equal(
      await resolvePublicLeadWorkspaceIdFromRequest(
        req("unknown.houzzatpro.com"),
        deps,
      ),
      null,
    );
    assert.equal(
      await resolvePublicLeadWorkspaceIdFromRequest(req("houzzatpro.com"), deps),
      null,
    );
  });
}

const PUBLIC_PATHS = [
  "listing-inquiry",
  "home-valuation",
  "signup",
  "affordability-tool",
  "seller-readiness",
  "route-planner-request",
  "pre-construction-inquiry",
] as const;

async function testDryRunMatrix() {
  await withWorkspaceLeadScope(async () => {
    const fixture = createTenantBLeadRoutingFixture();
    const deps = createFixtureHostResolutionDeps(TENANT_B_LEAD_ROUTING_FIXTURE_ROWS, {
      workspaceId: HOUZZAT_FIXTURE_WORKSPACE_ID,
      workspaceSlug: "houzzat",
    });

    for (const path of PUBLIC_PATHS) {
      const houzzat = await planPublicLeadRouting({
        host: "houzzat.com",
        path,
        fixture,
        deps,
      });
      assert.ok(houzzat.ok, `${path} houzzat`);
      assert.equal(houzzat.ok && houzzat.desk.workspaceId, HOUZZAT_FIXTURE_WORKSPACE_ID);

      const tenantB = await planPublicLeadRouting({
        host: "tenant-canary.houzzatpro.com",
        path,
        fixture,
        deps,
      });
      assert.ok(tenantB.ok, `${path} tenant-b`);
      assert.equal(
        tenantB.ok && tenantB.desk.workspaceId,
        TENANT_B_TEST_WORKSPACE_ID,
      );
      assert.equal(
        tenantB.ok && tenantB.sideEffects.notificationDisplayName,
        "Tenant Canary",
      );

      const unknown = await planPublicLeadRouting({
        host: "unknown.houzzatpro.com",
        path,
        fixture,
        deps,
      });
      assert.equal(unknown.ok, false);

      const platform = await planPublicLeadRouting({
        host: "houzzatpro.com",
        path,
        fixture,
        deps,
      });
      assert.equal(platform.ok, false);
    }
  });
}

async function testSideEffectDryRunTenantB() {
  await withWorkspaceLeadScope(async () => {
    const fixture = createTenantBLeadRoutingFixture();
    const deps = createFixtureHostResolutionDeps(TENANT_B_LEAD_ROUTING_FIXTURE_ROWS, {
      workspaceId: HOUZZAT_FIXTURE_WORKSPACE_ID,
      workspaceSlug: "houzzat",
    });
    const plan = await planPublicLeadRouting({
      host: "tenant-canary.houzzatpro.com",
      path: "listing-inquiry",
      fixture,
      deps,
    });
    assert.ok(plan.ok);
    if (!plan.ok) return;
    assert.equal(plan.sideEffects.workspaceId, TENANT_B_TEST_WORKSPACE_ID);
    assert.equal(plan.sideEffects.organizationId, TENANT_B_FIXTURE_ORG_ID);
    assert.equal(plan.sideEffects.assigneeId, TENANT_B_FIXTURE_AGENT_ID);
    assert.notEqual(plan.sideEffects.workspaceId, HOUZZAT_FIXTURE_WORKSPACE_ID);
    assert.notEqual(plan.sideEffects.organizationId, HOUZZAT_FIXTURE_ORG_ID);
    assert.ok(
      plan.sideEffects.pushRecipientIds.every(
        (id) => id === TENANT_B_FIXTURE_AGENT_ID,
      ),
    );
    assert.equal(plan.sideEffects.notificationDisplayName, "Tenant Canary");
  });
}

async function testLegacyRegressionWiring() {
  await withLegacyLeadScope(async () => {
    const signUp = read("src/app/api/auth/sign-up/route.ts");
    assert.ok(signUp.includes("request,"));
    const leadIntake = read("src/lib/agent/lead-intake.ts");
    assert.ok(leadIntake.includes("isWorkspacePublicLeadScope()"));
    const signupPath = PUBLIC_LEAD_WRITE_PATHS.find((p) => p.id === "signup");
    assert.ok(signupPath);
  });
}

function testClientOverrideRejected() {
  const rejection = detectClientWorkspaceOverride({
    workspaceId: "evil",
    organizationId: "evil",
    assigneeId: "evil",
  });
  assert.ok(rejection?.rejected);
}

function testCanaryCutoverAtomicBundle() {
  const canary = read("wrangler.tenant-canary.jsonc");
  const production = read("wrangler.jsonc");
  assertCanaryLeadCutoverBundle(canary);
  assertProductionIsolatedFromCanaryLeadCutover(production);

  const partialRoutingMissing = canary.replace(
    '"WORKSPACE_ROUTING_SCOPE": "workspace",',
    "",
  );
  assert.equal(isUnsafePartialCanaryLeadCutover(partialRoutingMissing), true);
  assert.equal(isCanaryLeadCutoverBundleComplete(partialRoutingMissing), false);
}

function testAuthRunbookExists() {
  const runbook = read("docs/tenant-canary/auth-manual-smoke-runbook.md");
  assert.ok(runbook.includes("tenant-canary.houzzatpro.com"));
  assert.ok(runbook.includes("Sign in") || runbook.includes("sign in"));
  assert.ok(!runbook.toLowerCase().includes("password:"));
}

function testCutoverFlagPlanExists() {
  const plan = read("docs/tenant-canary/lead-cutover-flag-plan.md");
  assert.ok(plan.includes("TENANT_PUBLIC_LEAD_SCOPE"));
  assert.ok(plan.includes("legacy"));
  assert.ok(plan.includes("workspace"));
}

async function main() {
  testSignupWiring();
  testOrganizationIsolationFixture();
  await testAssigneeIsolation();
  await testWorkspaceDeskAssignment();
  testNotificationBranding();
  await testHostnameWorkspaceResolver();
  await testDryRunMatrix();
  await testSideEffectDryRunTenantB();
  await testLegacyRegressionWiring();
  testClientOverrideRejected();
  testCanaryCutoverAtomicBundle();
  testAuthRunbookExists();
  testCutoverFlagPlanExists();
  console.log("tenant-lead-cutover-preflight:selftest passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
