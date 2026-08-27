/**
 * Stage 3K.5.8G — tenant CRM hostname isolation selftest.
 * Run: pnpm tenant-crm-host-isolation:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canAccessLead,
  leadTenantWhere,
  parseCrmReadScope,
} from "../src/lib/crm-read-scope";
import {
  createFixtureHostResolutionDeps,
  type DomainLookupRow,
} from "../src/lib/tenancy/resolve-workspace-host";
import { resolveRequestTenancy } from "../src/lib/tenancy/resolve-request-tenancy";
import {
  isPlatformAdminSurfaceHostname,
  isTenantHostnameBoundCrmHost,
} from "../src/lib/tenancy/tenant-staff-context";
import { TENANT_B_TEST_WORKSPACE_ID } from "../src/lib/tenancy/test-fixtures/tenant-b-brand";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS_HOUZZAT = "ws_houzzat_fixture";
const WS_CANARY = TENANT_B_TEST_WORKSPACE_ID;
const OWNER_B = "owner_b_user";

const FIXTURE_ROWS: DomainLookupRow[] = [
  {
    hostname: "tenant-canary.houzzatpro.com",
    kind: "PLATFORM",
    role: "PRIMARY",
    workspaceId: WS_CANARY,
    workspaceSlug: "tenant-canary",
    domainStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
  },
  {
    hostname: "houzzat.houzzatpro.com",
    kind: "PLATFORM",
    role: "PRIMARY",
    workspaceId: WS_HOUZZAT,
    workspaceSlug: "houzzat",
    domainStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
  },
];

const deps = createFixtureHostResolutionDeps(FIXTURE_ROWS);

function requestFor(host: string) {
  return new Request(`https://${host}/agent/leads`);
}

function withWorkspaceMode(fn: () => void | Promise<void>) {
  const prevDomain = process.env.TENANT_DOMAIN_SCOPE;
  const prevRead = process.env.WORKSPACE_READ_SCOPE;
  process.env.TENANT_DOMAIN_SCOPE = "workspace";
  process.env.WORKSPACE_READ_SCOPE = "workspace";
  return Promise.resolve(fn()).finally(() => {
    if (prevDomain === undefined) delete process.env.TENANT_DOMAIN_SCOPE;
    else process.env.TENANT_DOMAIN_SCOPE = prevDomain;
    if (prevRead === undefined) delete process.env.WORKSPACE_READ_SCOPE;
    else process.env.WORKSPACE_READ_SCOPE = prevRead;
  });
}

async function testTenancyResolutionAB() {
  await withWorkspaceMode(async () => {
    const canary = await resolveRequestTenancy(
      requestFor("tenant-canary.houzzatpro.com"),
      deps,
    );
    assert.ok(canary.ok);
    assert.equal(canary.workspaceId, WS_CANARY);
    assert.equal(canary.workspaceSlug, "tenant-canary");

    const houzzat = await resolveRequestTenancy(
      requestFor("houzzat.houzzatpro.com"),
      deps,
    );
    assert.ok(houzzat.ok);
    assert.equal(houzzat.workspaceId, WS_HOUZZAT);
    assert.notEqual(canary.workspaceId, houzzat.workspaceId);
  });
}

async function testHostnameClassification() {
  await withWorkspaceMode(() => {
    assert.equal(
      isTenantHostnameBoundCrmHost("tenant-canary.houzzatpro.com"),
      true,
    );
    assert.equal(isTenantHostnameBoundCrmHost("houzzatpro.com"), false);
    assert.equal(isTenantHostnameBoundCrmHost("other.houzzatpro.com"), true);
    assert.equal(isTenantHostnameBoundCrmHost("houzzat.com"), true);
    assert.equal(isPlatformAdminSurfaceHostname("houzzatpro.com"), true);
    assert.equal(
      isPlatformAdminSurfaceHostname("tenant-canary.houzzatpro.com"),
      false,
    );
    assert.equal(isPlatformAdminSurfaceHostname("houzzat.com"), false);
  });
}

async function testWorkspaceReadScopeUsesWorkspaceId() {
  const ctx = {
    user: { id: OWNER_B },
    organizationId: "demo-agent",
    organizationIds: ["demo-agent"],
    canSeeTeamLeads: true,
    isPlatformAdmin: false,
    workspaceId: WS_CANARY,
    isWorkspaceMember: true,
    isWorkspaceCrmAllowed: true,
    hasAmbiguousWorkspaceMembership: false,
  };

  assert.deepEqual(leadTenantWhere(ctx), { workspaceId: WS_CANARY });

  assert.equal(
    canAccessLead(ctx, {
      organizationId: "demo-agent",
      workspaceId: WS_HOUZZAT,
      assignedAgentId: null,
    }),
    false,
  );
  assert.equal(
    canAccessLead(ctx, {
      organizationId: "demo-agent",
      workspaceId: WS_CANARY,
      assignedAgentId: null,
    }),
    true,
  );
}

async function testUnknownHostDenied() {
  await withWorkspaceMode(async () => {
    const tenancy = await resolveRequestTenancy(
      requestFor("unknown-tenant.houzzatpro.com"),
      deps,
    );
    assert.equal(tenancy.ok, false);
  });
}

function testStructuralWiring() {
  const agent = read("src/lib/agent.ts");
  const tenantStaff = read("src/lib/tenancy/tenant-staff-context.ts");
  const wrangler = read("wrangler.tenant-canary.jsonc");
  const adminLayout = read("src/app/(admin)/admin/layout.tsx");

  assert.ok(agent.includes("shouldUseHostnameBoundStaffContext"));
  assert.ok(agent.includes("buildHostnameBoundAgentContext"));
  assert.ok(agent.includes("tryTenantStaffContext"));
  assert.ok(agent.includes("isPlatformAdmin: false"));
  assert.ok(tenantStaff.includes("isTenantHostnameBoundCrmHost"));
  assert.ok(wrangler.includes('"WORKSPACE_TEAM_SCOPE": "workspace"'));
  assert.ok(adminLayout.includes("authorizeTenantCommandCentre"));
  assert.ok(adminLayout.includes("resolveAdminSurfaceMode"));
  assert.ok(adminLayout.includes('redirect("/agent")'));
  // Global platform HQ must not reopen on tenant hosts without membership.
  assert.ok(adminLayout.includes('surface === "tenant"'));
}

async function main() {
  const prevRead = process.env.WORKSPACE_READ_SCOPE;
  const prevDomain = process.env.TENANT_DOMAIN_SCOPE;
  process.env.WORKSPACE_READ_SCOPE = "workspace";
  process.env.TENANT_DOMAIN_SCOPE = "workspace";
  try {
    assert.equal(parseCrmReadScope(), "workspace");
    await testHostnameClassification();
    await testTenancyResolutionAB();
    testWorkspaceReadScopeUsesWorkspaceId();
    await testUnknownHostDenied();
    testStructuralWiring();
    console.log("tenant-crm-host-isolation:selftest: ok");
  } finally {
    if (prevRead === undefined) delete process.env.WORKSPACE_READ_SCOPE;
    else process.env.WORKSPACE_READ_SCOPE = prevRead;
    if (prevDomain === undefined) delete process.env.TENANT_DOMAIN_SCOPE;
    else process.env.TENANT_DOMAIN_SCOPE = prevDomain;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
