/**
 * Stage 3K.5.10.2 — Houzzat production legacy auth / CRM regression tests.
 * Run: pnpm houzzat-legacy-auth-regression:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  denyUnlessFullCustomerAccess,
  type CustomerUser,
} from "../src/lib/account";
import {
  isActiveHostnameBoundReadMode,
  leadTenantWhere,
  parseCrmReadScope,
} from "../src/lib/crm-read-scope";
import { shouldUseHostnameBoundStaffContext } from "../src/lib/tenancy/tenant-staff-context";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function withEnv(
  vars: Record<string, string | undefined>,
  fn: () => void | Promise<void>,
) {
  const prev: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    prev[key] = process.env[key];
    const value = vars[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return Promise.resolve(fn()).finally(() => {
    for (const key of Object.keys(vars)) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  });
}

const legacyCtx = {
  user: { id: "staff_user" },
  organizationId: "demo-agent",
  organizationIds: ["demo-agent"],
  canSeeTeamLeads: true,
  isPlatformAdmin: true,
  workspaceId: "ws_houzzat",
  isWorkspaceMember: true,
  isWorkspaceCrmAllowed: true,
  hasAmbiguousWorkspaceMembership: false,
};

function staffUser(overrides: Partial<CustomerUser> = {}): CustomerUser {
  return {
    id: "staff_1",
    email: "staff@example.com",
    name: "Staff",
    image: null,
    phone: null,
    homeAddress: null,
    homeLat: null,
    homeLng: null,
    role: "ADMIN",
    emailVerified: null,
    createdAt: new Date("2020-01-01"),
    caslConsentAt: null,
    vowAcceptedAt: null,
    vowVersion: null,
    emailAlertsEnabled: true,
    smsAlertsEnabled: false,
    relatedListingsMode: "SAME_AREA",
    termsAcceptedAt: null,
    termsVersion: null,
    ...overrides,
  };
}

async function testLegacyModePreservesOrgReads() {
  await withEnv(
    {
      TENANT_DOMAIN_SCOPE: undefined,
      WORKSPACE_READ_SCOPE: undefined,
    },
    () => {
      assert.equal(parseCrmReadScope(), "legacy");
      assert.equal(isActiveHostnameBoundReadMode(), false);
      assert.equal(shouldUseHostnameBoundStaffContext(), false);
      const where = leadTenantWhere(legacyCtx);
      assert.deepEqual(where, { organizationId: { in: ["demo-agent"] } });
    },
  );
}

async function testPartialReadFlipDoesNotBreakLegacy() {
  await withEnv(
    {
      TENANT_DOMAIN_SCOPE: undefined,
      WORKSPACE_READ_SCOPE: "workspace",
    },
    () => {
      assert.equal(parseCrmReadScope(), "workspace");
      assert.equal(isActiveHostnameBoundReadMode(), false);
      assert.equal(shouldUseHostnameBoundStaffContext(), false);
      const where = leadTenantWhere(legacyCtx);
      assert.deepEqual(where, { organizationId: { in: ["demo-agent"] } });
    },
  );
}

async function testFullWorkspaceModeStaysStrict() {
  await withEnv(
    {
      TENANT_DOMAIN_SCOPE: "workspace",
      WORKSPACE_READ_SCOPE: "workspace",
    },
    () => {
      assert.equal(isActiveHostnameBoundReadMode(), true);
      assert.equal(shouldUseHostnameBoundStaffContext(), true);
      const where = leadTenantWhere(legacyCtx);
      assert.deepEqual(where, { workspaceId: "ws_houzzat" });
    },
  );
}

function testStaffBypassesConsumerEmailVerifyGate() {
  const denied = denyUnlessFullCustomerAccess(
    staffUser({ role: "ADMIN", emailVerified: null }),
  );
  assert.equal(denied, null);

  const agentDenied = denyUnlessFullCustomerAccess(
    staffUser({ role: "AGENT", emailVerified: null }),
  );
  assert.equal(agentDenied, null);

  const consumerDenied = denyUnlessFullCustomerAccess(
    staffUser({
      role: "CUSTOMER",
      emailVerified: null,
      createdAt: new Date("2020-01-01"),
    }),
  );
  assert.ok(consumerDenied);
  assert.equal(consumerDenied?.status, 403);
}

function testAgentContextWiring() {
  const agentLib = read("src/lib/agent.ts");
  assert.ok(agentLib.includes("shouldUseHostnameBoundStaffContext"));
  assert.ok(!agentLib.includes('parseCrmReadScope() === "workspace"'));

  const staffCtx = read("src/lib/tenancy/tenant-staff-context.ts");
  assert.ok(staffCtx.includes("isActiveHostnameBoundReadMode"));

  const accountLib = read("src/lib/account.ts");
  assert.ok(accountLib.includes("isStaffRole(user.role)"));
}

function testCrmReadScopeUsesDualFlagGate() {
  const crm = read("src/lib/crm-read-scope.ts");
  assert.ok(crm.includes("isActiveHostnameBoundReadMode"));
  assert.ok(crm.includes("isTenantDomainScopeWorkspace"));
}

function testMiddlewareFaviconRewrite() {
  const middleware = read("src/middleware.ts");
  assert.ok(middleware.includes('pathname === "/favicon.ico"'));
  assert.ok(middleware.includes("/api/tenancy/favicon"));
  assert.ok(!middleware.includes("webp|ico"));
}

async function main() {
  await testLegacyModePreservesOrgReads();
  await testPartialReadFlipDoesNotBreakLegacy();
  await testFullWorkspaceModeStaysStrict();
  testStaffBypassesConsumerEmailVerifyGate();
  testAgentContextWiring();
  testCrmReadScopeUsesDualFlagGate();
  testMiddlewareFaviconRewrite();
  console.log("houzzat-legacy-auth-regression:selftest passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
