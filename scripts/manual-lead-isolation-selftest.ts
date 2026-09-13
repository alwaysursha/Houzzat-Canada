/**
 * Manual Add Lead workspace isolation (hostname-authoritative).
 * Run: pnpm manual-lead-isolation:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  importLeadDuplicateWhere,
  resolveLeadImportOwnership,
  type LeadImportStaffContext,
} from "../src/lib/agent/lead-import-ownership";
import { canAccessLead } from "../src/lib/crm-read-scope";
import { detectClientWorkspaceOverride } from "../src/lib/tenancy/public-lead-workspace";
import {
  createFixtureHostResolutionDeps,
  type DomainLookupRow,
} from "../src/lib/tenancy/resolve-workspace-host";
import { resolveRequestTenancy } from "../src/lib/tenancy/resolve-request-tenancy";
import { TENANT_B_TEST_WORKSPACE_ID } from "../src/lib/tenancy/test-fixtures/tenant-b-brand";
import { HOUZZAT_FIXTURE_WORKSPACE_ID } from "../src/lib/tenancy/test-fixtures/tenant-b-lead-routing";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const SHARED_ORG = "demo-agent";
const WS_TENANT_A = "ws_tenant_a_add_lead_fixture";
const WS_TENANT_B = TENANT_B_TEST_WORKSPACE_ID;
const WS_HOUZZAT = HOUZZAT_FIXTURE_WORKSPACE_ID;
const SHARED_EMAIL = "manual.add.lead@example.com";

const FIXTURE_ROWS: DomainLookupRow[] = [
  {
    hostname: "tenant-a.houzzatpro.com",
    kind: "PLATFORM",
    role: "PRIMARY",
    workspaceId: WS_TENANT_A,
    workspaceSlug: "tenant-a",
    domainStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
  },
  {
    hostname: "tenant-canary.houzzatpro.com",
    kind: "PLATFORM",
    role: "PRIMARY",
    workspaceId: WS_TENANT_B,
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
  return new Request(`https://${host}/api/agent/leads`);
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

function staffCtx(
  workspaceId: string | null,
  patch?: Partial<LeadImportStaffContext>,
): LeadImportStaffContext {
  return {
    organizationId: SHARED_ORG,
    workspaceId,
    isWorkspaceMember: true,
    isWorkspaceCrmAllowed: true,
    hasAmbiguousWorkspaceMembership: false,
    ...patch,
  };
}

function crmCtx(workspaceId: string) {
  return {
    user: { id: "agent_add_lead_fixture" },
    organizationId: SHARED_ORG,
    organizationIds: [SHARED_ORG],
    canSeeTeamLeads: true,
    isPlatformAdmin: false,
    workspaceId,
    isWorkspaceMember: true,
    isWorkspaceCrmAllowed: true,
    hasAmbiguousWorkspaceMembership: false,
  };
}

function testTenantAAddLeadBelongsOnlyToTenantA() {
  const ownership = resolveLeadImportOwnership(staffCtx(WS_TENANT_A));
  assert.equal(ownership.ok, true);
  if (!ownership.ok) return;
  assert.equal(ownership.workspaceId, WS_TENANT_A);
  assert.notEqual(ownership.workspaceId, WS_TENANT_B);
  assert.notEqual(ownership.workspaceId, WS_HOUZZAT);

  const created = {
    organizationId: SHARED_ORG,
    workspaceId: ownership.workspaceId,
    assignedAgentId: "agent_add_lead_fixture",
  };
  assert.equal(canAccessLead(crmCtx(WS_TENANT_A), created), true);
  assert.equal(canAccessLead(crmCtx(WS_TENANT_B), created), false);
  assert.equal(canAccessLead(crmCtx(WS_HOUZZAT), created), false);
  console.log("[0] Tenant A Add Lead belongs only to Tenant A... PASS");
}

function testTenantBDoesNotCollideViaSharedOrg() {
  const tenantALead = {
    workspaceId: WS_TENANT_A,
    organizationId: SHARED_ORG,
  };
  const whereB = importLeadDuplicateWhere({
    email: SHARED_EMAIL,
    workspaceId: WS_TENANT_B,
    organizationId: SHARED_ORG,
  });
  assert.equal(whereB.workspaceId, WS_TENANT_B);
  assert.equal("organizationId" in whereB, false);
  assert.notEqual(whereB.workspaceId, tenantALead.workspaceId);
  assert.equal(tenantALead.organizationId, SHARED_ORG);
  console.log("[1] Tenant B does not collide via shared organization... PASS");
}

function testTenantAddLeadCannotLandInHouzzat() {
  const ownership = resolveLeadImportOwnership(staffCtx(WS_TENANT_A));
  assert.equal(ownership.ok, true);
  if (!ownership.ok) return;
  assert.notEqual(ownership.workspaceId, WS_HOUZZAT);
  console.log("[2] Tenant Add Lead cannot land in Houzzat... PASS");
}

function testHouzzatAddLeadCannotAppearInTenants() {
  const ownership = resolveLeadImportOwnership(staffCtx(WS_HOUZZAT));
  assert.equal(ownership.ok, true);
  if (!ownership.ok) return;
  assert.equal(ownership.workspaceId, WS_HOUZZAT);

  const houzzatLead = {
    organizationId: SHARED_ORG,
    workspaceId: ownership.workspaceId,
    assignedAgentId: "houzzat_agent",
  };
  assert.equal(canAccessLead(crmCtx(WS_HOUZZAT), houzzatLead), true);
  assert.equal(canAccessLead(crmCtx(WS_TENANT_A), houzzatLead), false);
  assert.equal(canAccessLead(crmCtx(WS_TENANT_B), houzzatLead), false);
  console.log("[3] Houzzat Add Lead cannot appear in Tenant A/B... PASS");
}

function testClientCannotOverrideHostnameWorkspace() {
  const spoof = detectClientWorkspaceOverride({
    name: "Ada Lovelace",
    email: SHARED_EMAIL,
    workspaceId: WS_HOUZZAT,
    tenant: "houzzat",
  });
  assert.ok(spoof);
  assert.ok(spoof.keys.includes("workspaceId"));
  assert.ok(spoof.keys.includes("tenant"));

  const missing = resolveLeadImportOwnership(staffCtx(null));
  assert.equal(missing.ok, false);
  if (missing.ok) return;
  assert.equal(missing.status, 403);
  console.log("[4] client tenant keys cannot override hostname... PASS");
}

async function testHostnameBrandAuthority() {
  const tenantA = await resolveRequestTenancy(
    requestFor("tenant-a.houzzatpro.com"),
    deps,
  );
  const tenantB = await resolveRequestTenancy(
    requestFor("tenant-canary.houzzatpro.com"),
    deps,
  );
  const houzzat = await resolveRequestTenancy(
    requestFor("houzzat.houzzatpro.com"),
    deps,
  );
  assert.ok(tenantA.ok);
  assert.ok(tenantB.ok);
  assert.ok(houzzat.ok);

  const fromHostA = resolveLeadImportOwnership(staffCtx(tenantA.workspaceId));
  const fromHostB = resolveLeadImportOwnership(staffCtx(tenantB.workspaceId));
  const fromHostH = resolveLeadImportOwnership(staffCtx(houzzat.workspaceId));
  assert.equal(fromHostA.ok && fromHostA.workspaceId, WS_TENANT_A);
  assert.equal(fromHostB.ok && fromHostB.workspaceId, WS_TENANT_B);
  assert.equal(fromHostH.ok && fromHostH.workspaceId, WS_HOUZZAT);
  console.log("[5] TENANT = BRAND hostname authority... PASS");
}

function testAddLeadRouteWiring() {
  const route = read("src/app/api/agent/leads/route.ts");
  const create = read("src/lib/agent/create-manual-lead.ts");
  const ui = read("src/components/agent/LeadsTableClient.tsx");

  assert.ok(route.includes("resolveLeadImportOwnership(ctx)"));
  assert.ok(route.includes("detectClientWorkspaceOverride"));
  assert.ok(route.includes("workspaceId: ownership.workspaceId"));
  assert.ok(route.includes("organizationId: ownership.organizationId"));
  assert.ok(!route.includes("resolveLeadCrmOwnership"));
  assert.ok(!route.includes("parsed.data.workspaceId"));
  assert.ok(!route.includes("json.workspaceId"));
  assert.ok(!route.includes("findOpenOrgLeadForEmail"));

  const postFn = route.slice(route.indexOf("export async function POST"));
  const patchFn = route.slice(route.indexOf("export async function PATCH"));
  assert.ok(postFn.includes("detectClientWorkspaceOverride"));
  assert.ok(postFn.includes("createManualLead"));
  assert.ok(!patchFn.startsWith("export async function POST"));
  assert.ok(patchFn.includes("canAccessLead"));

  assert.ok(create.includes("trustedWorkspaceId"));
  assert.ok(create.includes("input.workspaceId"));
  assert.ok(create.includes("finalizeWritableLeadClassification"));
  assert.ok(!create.includes("stampClassification"));

  assert.ok(ui.includes('fetch("/api/agent/leads"'));
  assert.ok(ui.includes("name: addName.trim()"));
  assert.ok(!ui.includes("workspaceId:"));
  console.log("[6] POST /api/agent/leads wiring (no client workspaceId)... PASS");
}

async function main() {
  console.log("\n=== MANUAL ADD LEAD WORKSPACE ISOLATION ===\n");
  await withWorkspaceMode(async () => {
    testTenantAAddLeadBelongsOnlyToTenantA();
    testTenantBDoesNotCollideViaSharedOrg();
    testTenantAddLeadCannotLandInHouzzat();
    testHouzzatAddLeadCannotAppearInTenants();
    testClientCannotOverrideHostnameWorkspace();
    await testHostnameBrandAuthority();
    testAddLeadRouteWiring();
  });
  console.log("\nMANUAL ADD LEAD WORKSPACE ISOLATION SELFTEST PASSED\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
