/**
 * Lead import workspace isolation (hostname-authoritative).
 * Run: pnpm lead-import-isolation:selftest
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
const WS_TENANT_A = "ws_tenant_a_import_fixture";
const WS_TENANT_B = TENANT_B_TEST_WORKSPACE_ID;
const WS_HOUZZAT = HOUZZAT_FIXTURE_WORKSPACE_ID;
const SHARED_EMAIL = "imported.lead@example.com";

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
  return new Request(`https://${host}/api/agent/leads/import`);
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
    user: { id: "agent_import_fixture" },
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

function testTenantAImportBelongsOnlyToTenantA() {
  const ownership = resolveLeadImportOwnership(staffCtx(WS_TENANT_A));
  assert.equal(ownership.ok, true);
  if (!ownership.ok) return;
  assert.equal(ownership.workspaceId, WS_TENANT_A);
  assert.notEqual(ownership.workspaceId, WS_TENANT_B);
  assert.notEqual(ownership.workspaceId, WS_HOUZZAT);

  const tenantA = crmCtx(WS_TENANT_A);
  const imported = {
    organizationId: SHARED_ORG,
    workspaceId: ownership.workspaceId,
    assignedAgentId: "agent_import_fixture",
  };
  assert.equal(canAccessLead(tenantA, imported), true);
  assert.equal(canAccessLead(crmCtx(WS_TENANT_B), imported), false);
  assert.equal(canAccessLead(crmCtx(WS_HOUZZAT), imported), false);
  console.log("[0] Tenant A import belongs only to Tenant A... PASS");
}

function testTenantBDoesNotSeeTenantAAsDuplicate() {
  const tenantALead = {
    id: "lead_tenant_a",
    workspaceId: WS_TENANT_A,
    organizationId: SHARED_ORG,
    status: "NEW_LEAD",
  };

  const whereB = importLeadDuplicateWhere({
    email: SHARED_EMAIL,
    workspaceId: WS_TENANT_B,
    organizationId: SHARED_ORG,
  });
  const whereA = importLeadDuplicateWhere({
    email: SHARED_EMAIL,
    workspaceId: WS_TENANT_A,
    organizationId: SHARED_ORG,
  });

  assert.equal(whereB.workspaceId, WS_TENANT_B);
  assert.equal(whereA.workspaceId, WS_TENANT_A);
  assert.equal("organizationId" in whereB, false);
  assert.equal("organizationId" in whereA, false);
  assert.notEqual(whereB.workspaceId, tenantALead.workspaceId);

  const orgScopedWouldCollide = {
    organizationId: SHARED_ORG,
    status: { not: "PAST_CLIENT" },
    customer: { email: SHARED_EMAIL },
  };
  assert.equal(orgScopedWouldCollide.organizationId, tenantALead.organizationId);
  console.log("[1] Tenant B does not treat Tenant A lead as its duplicate... PASS");
}

function testTenantImportCannotLandInHouzzat() {
  const ownership = resolveLeadImportOwnership(staffCtx(WS_TENANT_A));
  assert.equal(ownership.ok, true);
  if (!ownership.ok) return;
  assert.notEqual(ownership.workspaceId, WS_HOUZZAT);

  const spoofHouzzat = detectClientWorkspaceOverride({
    leads: [{ name: "Ada", email: SHARED_EMAIL }],
    workspaceId: WS_HOUZZAT,
  });
  assert.ok(spoofHouzzat);
  assert.ok(spoofHouzzat.keys.includes("workspaceId"));
  console.log("[2] Tenant import cannot land in Houzzat... PASS");
}

function testHouzzatImportCannotAppearInAnotherTenant() {
  const ownership = resolveLeadImportOwnership(staffCtx(WS_HOUZZAT));
  assert.equal(ownership.ok, true);
  if (!ownership.ok) return;
  assert.equal(ownership.workspaceId, WS_HOUZZAT);
  assert.notEqual(ownership.workspaceId, WS_TENANT_A);
  assert.notEqual(ownership.workspaceId, WS_TENANT_B);

  const houzzatLead = {
    organizationId: SHARED_ORG,
    workspaceId: ownership.workspaceId,
    assignedAgentId: "houzzat_agent",
  };
  assert.equal(canAccessLead(crmCtx(WS_HOUZZAT), houzzatLead), true);
  assert.equal(canAccessLead(crmCtx(WS_TENANT_A), houzzatLead), false);
  assert.equal(canAccessLead(crmCtx(WS_TENANT_B), houzzatLead), false);

  const whereTenantA = importLeadDuplicateWhere({
    email: SHARED_EMAIL,
    workspaceId: WS_TENANT_A,
    organizationId: SHARED_ORG,
  });
  assert.notEqual(whereTenantA.workspaceId, houzzatLead.workspaceId);
  console.log("[3] Houzzat import cannot appear in another tenant... PASS");
}

function testFailClosedWithoutTrustedWorkspace() {
  const missing = resolveLeadImportOwnership(staffCtx(null));
  assert.equal(missing.ok, false);
  if (missing.ok) return;
  assert.equal(missing.status, 403);

  const notMember = resolveLeadImportOwnership(
    staffCtx(WS_TENANT_A, { isWorkspaceMember: false }),
  );
  assert.equal(notMember.ok, false);

  const crmOff = resolveLeadImportOwnership(
    staffCtx(WS_TENANT_A, { isWorkspaceCrmAllowed: false }),
  );
  assert.equal(crmOff.ok, false);

  const ambiguous = resolveLeadImportOwnership(
    staffCtx(WS_TENANT_A, { hasAmbiguousWorkspaceMembership: true }),
  );
  assert.equal(ambiguous.ok, false);
  console.log("[4] workspace CRM fails closed without trusted workspace... PASS");
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
  assert.equal(tenantA.workspaceId, WS_TENANT_A);
  assert.equal(tenantB.workspaceId, WS_TENANT_B);
  assert.equal(houzzat.workspaceId, WS_HOUZZAT);

  const fromHostA = resolveLeadImportOwnership(staffCtx(tenantA.workspaceId));
  const fromHostB = resolveLeadImportOwnership(staffCtx(tenantB.workspaceId));
  const fromHostH = resolveLeadImportOwnership(staffCtx(houzzat.workspaceId));
  assert.equal(fromHostA.ok && fromHostA.workspaceId, WS_TENANT_A);
  assert.equal(fromHostB.ok && fromHostB.workspaceId, WS_TENANT_B);
  assert.equal(fromHostH.ok && fromHostH.workspaceId, WS_HOUZZAT);
  console.log("[5] TENANT = BRAND hostname authority... PASS");
}

function testStructuralWiring() {
  const route = read("src/app/api/agent/leads/import/route.ts");
  const create = read("src/lib/agent/create-manual-lead.ts");
  const helper = read("src/lib/agent/lead-import-ownership.ts");
  const modal = read("src/components/agent/LeadImportModal.tsx");

  assert.ok(route.includes("resolveLeadImportOwnership(ctx)"));
  assert.ok(route.includes("detectClientWorkspaceOverride"));
  assert.ok(route.includes("findOpenImportLeadForEmail"));
  assert.ok(route.includes("workspaceId: ownership.workspaceId"));
  assert.ok(!route.includes("resolveLeadCrmOwnership"));
  assert.ok(!route.includes("findOpenOrgLeadForEmail"));
  assert.ok(!route.includes("parsed.data.workspaceId"));
  assert.ok(!route.includes("json.workspaceId"));

  assert.ok(helper.includes("isActiveHostnameBoundReadMode"));
  assert.ok(helper.includes("ctx.workspaceId"));
  assert.ok(!helper.includes("resolveLeadCrmOwnership"));

  assert.ok(create.includes("trustedWorkspaceId"));
  assert.ok(create.includes("input.workspaceId"));
  assert.ok(create.includes("resolveLeadCrmOwnership"));

  assert.ok(!modal.includes("workspaceId"));
  console.log("[6] import route wiring (no client workspaceId)... PASS");
}

async function main() {
  console.log("\n=== LEAD IMPORT WORKSPACE ISOLATION ===\n");
  await withWorkspaceMode(async () => {
    testTenantAImportBelongsOnlyToTenantA();
    testTenantBDoesNotSeeTenantAAsDuplicate();
    testTenantImportCannotLandInHouzzat();
    testHouzzatImportCannotAppearInAnotherTenant();
    testFailClosedWithoutTrustedWorkspace();
    await testHostnameBrandAuthority();
    testStructuralWiring();
  });
  console.log("\nLEAD IMPORT WORKSPACE ISOLATION SELFTEST PASSED\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
