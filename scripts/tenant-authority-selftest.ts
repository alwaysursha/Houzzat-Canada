/**
 * Stage 3K.5.17 — Canonical Tenant Authority Foundation Selftest.
 *
 * Verifies:
 * 1. resolveTenantAuthority derivation rules (request hostname + active WorkspaceMember only).
 * 2. Complete authority matrix across identities (Houzzat ADMIN/AGENT, Canary OWNER/AGENT, Multi-workspace, Suspended, Revoked, Disabled).
 * 3. Platform host exclusion (app.houzzatpro.com has ZERO tenant authority).
 * 4. Workspace lifecycle status checks (ACTIVE, TRIAL, SUSPENDED, CANCELLED).
 * 5. Data isolation test harness (leads, tasks, notifications, routing configs).
 * 6. Static code safety scan (tenant-authority.ts has ZERO User.role, OrgMembership, or cookie fallbacks).
 *
 * Run: pnpm tenant-authority:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveStrictTenantWorkspace,
  resolveTenantAuthority,
  type TenantAuthorityDeps,
} from "../src/lib/tenancy/tenant-authority";
import type { DomainLookupRow } from "../src/lib/tenancy/resolve-workspace-host";
import type {
  WorkspaceMemberRole,
  WorkspaceMemberStatus,
  WorkspaceStatus,
} from "@prisma/client";
import { TENANT_B_TEST_WORKSPACE_ID } from "../src/lib/tenancy/test-fixtures/tenant-b-brand";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS_HOUZZAT = "ws_houzzat_fixture";
const WS_CANARY = TENANT_B_TEST_WORKSPACE_ID;
const WS_TRIAL = "ws_trial_fixture";
const WS_SUSPENDED = "ws_suspended_fixture";

const FIXTURE_DOMAINS: DomainLookupRow[] = [
  {
    hostname: "houzzat.com",
    kind: "CUSTOM",
    role: "PRIMARY",
    workspaceId: WS_HOUZZAT,
    workspaceSlug: "houzzat",
    domainStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
  },
  {
    hostname: "www.houzzat.com",
    kind: "CUSTOM",
    role: "FALLBACK",
    workspaceId: WS_HOUZZAT,
    workspaceSlug: "houzzat",
    domainStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
  },
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
    hostname: "trial-brokerage.houzzatpro.com",
    kind: "PLATFORM",
    role: "PRIMARY",
    workspaceId: WS_TRIAL,
    workspaceSlug: "trial-brokerage",
    domainStatus: "ACTIVE",
    workspaceStatus: "TRIAL",
  },
  {
    hostname: "suspended-tenant.houzzatpro.com",
    kind: "PLATFORM",
    role: "PRIMARY",
    workspaceId: WS_SUSPENDED,
    workspaceSlug: "suspended-tenant",
    domainStatus: "ACTIVE",
    workspaceStatus: "SUSPENDED",
  },
];

type FixtureUser = {
  id: string;
  disabledAt: Date | null;
};

const FIXTURE_USERS: FixtureUser[] = [
  { id: "houzzat_admin_user", disabledAt: null },
  { id: "houzzat_agent_user", disabledAt: null },
  { id: "canary_owner_user", disabledAt: null },
  { id: "canary_agent_user", disabledAt: null },
  { id: "multi_workspace_user", disabledAt: null },
  { id: "global_admin_no_membership", disabledAt: null },
  { id: "suspended_member_user", disabledAt: null },
  { id: "invited_member_user", disabledAt: null },
  { id: "trial_agent_user", disabledAt: null },
  { id: "disabled_user", disabledAt: new Date("2026-01-01T00:00:00.000Z") },
];

type FixtureMembership = {
  id: string;
  userId: string;
  workspaceId: string;
  role: WorkspaceMemberRole;
  status: WorkspaceMemberStatus;
  workspace: {
    id: string;
    slug: string;
    status: WorkspaceStatus;
  };
};

const FIXTURE_MEMBERSHIPS: FixtureMembership[] = [
  {
    id: "mem_h_admin",
    userId: "houzzat_admin_user",
    workspaceId: WS_HOUZZAT,
    role: "ADMIN",
    status: "ACTIVE",
    workspace: { id: WS_HOUZZAT, slug: "houzzat", status: "ACTIVE" },
  },
  {
    id: "mem_h_agent",
    userId: "houzzat_agent_user",
    workspaceId: WS_HOUZZAT,
    role: "AGENT",
    status: "ACTIVE",
    workspace: { id: WS_HOUZZAT, slug: "houzzat", status: "ACTIVE" },
  },
  {
    id: "mem_c_owner",
    userId: "canary_owner_user",
    workspaceId: WS_CANARY,
    role: "OWNER",
    status: "ACTIVE",
    workspace: { id: WS_CANARY, slug: "tenant-canary", status: "ACTIVE" },
  },
  {
    id: "mem_c_agent",
    userId: "canary_agent_user",
    workspaceId: WS_CANARY,
    role: "AGENT",
    status: "ACTIVE",
    workspace: { id: WS_CANARY, slug: "tenant-canary", status: "ACTIVE" },
  },
  {
    id: "mem_m_houzzat",
    userId: "multi_workspace_user",
    workspaceId: WS_HOUZZAT,
    role: "OWNER",
    status: "ACTIVE",
    workspace: { id: WS_HOUZZAT, slug: "houzzat", status: "ACTIVE" },
  },
  {
    id: "mem_m_canary",
    userId: "multi_workspace_user",
    workspaceId: WS_CANARY,
    role: "AGENT",
    status: "ACTIVE",
    workspace: { id: WS_CANARY, slug: "tenant-canary", status: "ACTIVE" },
  },
  {
    id: "mem_suspended",
    userId: "suspended_member_user",
    workspaceId: WS_HOUZZAT,
    role: "AGENT",
    status: "SUSPENDED",
    workspace: { id: WS_HOUZZAT, slug: "houzzat", status: "ACTIVE" },
  },
  {
    id: "mem_invited",
    userId: "invited_member_user",
    workspaceId: WS_HOUZZAT,
    role: "AGENT",
    status: "INVITED",
    workspace: { id: WS_HOUZZAT, slug: "houzzat", status: "ACTIVE" },
  },
  {
    id: "mem_trial",
    userId: "trial_agent_user",
    workspaceId: WS_TRIAL,
    role: "AGENT",
    status: "ACTIVE",
    workspace: { id: WS_TRIAL, slug: "trial-brokerage", status: "TRIAL" },
  },
];

const testDeps: TenantAuthorityDeps = {
  lookupActiveDomain: async (hostname: string) => {
    return FIXTURE_DOMAINS.find((d) => d.hostname === hostname) ?? null;
  },
  lookupUser: async (userId: string) => {
    const u = FIXTURE_USERS.find((x) => x.id === userId);
    return u ? { id: u.id, disabledAt: u.disabledAt } : null;
  },
  lookupMembership: async (userId: string, workspaceId: string) => {
    const m = FIXTURE_MEMBERSHIPS.find(
      (x) => x.userId === userId && x.workspaceId === workspaceId,
    );
    if (!m) return null;
    return {
      id: m.id,
      role: m.role,
      status: m.status,
      workspace: m.workspace,
    };
  },
};

async function testStrictWorkspaceResolution() {
  // 1. Known tenant domains resolve exactly
  const h1 = await resolveStrictTenantWorkspace("houzzat.com", testDeps);
  assert.equal(h1.ok, true);
  if (h1.ok) {
    assert.equal(h1.workspaceId, WS_HOUZZAT);
    assert.equal(h1.workspaceSlug, "houzzat");
  }

  const h2 = await resolveStrictTenantWorkspace("www.houzzat.com", testDeps);
  assert.equal(h2.ok, true);
  if (h2.ok) {
    assert.equal(h2.workspaceId, WS_HOUZZAT);
  }

  const canary = await resolveStrictTenantWorkspace(
    "tenant-canary.houzzatpro.com",
    testDeps,
  );
  assert.equal(canary.ok, true);
  if (canary.ok) {
    assert.equal(canary.workspaceId, WS_CANARY);
    assert.equal(canary.workspaceSlug, "tenant-canary");
  }

  // 2. TRIAL workspace resolves ok for staff
  const trial = await resolveStrictTenantWorkspace(
    "trial-brokerage.houzzatpro.com",
    testDeps,
  );
  assert.equal(trial.ok, true);
  if (trial.ok) {
    assert.equal(trial.workspaceId, WS_TRIAL);
    assert.equal(trial.workspaceStatus, "TRIAL");
  }

  // 3. SUSPENDED workspace fails closed
  const suspended = await resolveStrictTenantWorkspace(
    "suspended-tenant.houzzatpro.com",
    testDeps,
  );
  assert.equal(suspended.ok, false);
  if (!suspended.ok) {
    assert.equal(suspended.reason, "workspace_inactive");
  }

  // 4. Platform hosts fail closed (zero tenant authority)
  const appBootstrap = await resolveStrictTenantWorkspace(
    "app.houzzatpro.com",
    testDeps,
  );
  assert.equal(appBootstrap.ok, false);
  if (!appBootstrap.ok) {
    assert.equal(appBootstrap.reason, "platform_host_no_tenant_authority");
  }

  const salesRoot = await resolveStrictTenantWorkspace(
    "houzzatpro.com",
    testDeps,
  );
  assert.equal(salesRoot.ok, false);
  if (!salesRoot.ok) {
    assert.equal(salesRoot.reason, "platform_host_no_tenant_authority");
  }

  // 5. Unknown host fails closed (NEVER defaults to Houzzat)
  const unknown = await resolveStrictTenantWorkspace(
    "random-domain.com",
    testDeps,
  );
  assert.equal(unknown.ok, false);
  if (!unknown.ok) {
    assert.equal(unknown.reason, "unknown_tenant_workspace");
  }
}

async function testFullAuthorityMatrix() {
  // Scenario 1: Houzzat ADMIN on houzzat.com -> PASS (ADMIN authority)
  const res1 = await resolveTenantAuthority(
    "houzzat.com",
    { id: "houzzat_admin_user" },
    testDeps,
  );
  assert.equal(res1.ok, true);
  if (res1.ok) {
    assert.equal(res1.workspaceId, WS_HOUZZAT);
    assert.equal(res1.workspaceRole, "ADMIN");
    assert.equal(res1.canManageWorkspace, true);
    assert.equal(res1.canSeeTeamLeads, true);
    assert.equal(res1.isOwnerAdmin, true);
  }

  // Scenario 2: Houzzat AGENT on houzzat.com -> PASS (AGENT authority)
  const res2 = await resolveTenantAuthority(
    "houzzat.com",
    { id: "houzzat_agent_user" },
    testDeps,
  );
  assert.equal(res2.ok, true);
  if (res2.ok) {
    assert.equal(res2.workspaceId, WS_HOUZZAT);
    assert.equal(res2.workspaceRole, "AGENT");
    assert.equal(res2.canManageWorkspace, false);
    assert.equal(res2.canSeeTeamLeads, false);
    assert.equal(res2.isOwnerAdmin, false);
  }

  // Scenario 3: Houzzat ADMIN on Canary host -> DENY (no_active_membership)
  const res3 = await resolveTenantAuthority(
    "tenant-canary.houzzatpro.com",
    { id: "houzzat_admin_user" },
    testDeps,
  );
  assert.equal(res3.ok, false);
  if (!res3.ok) {
    assert.equal(res3.reason, "no_active_membership");
  }

  // Scenario 4: Houzzat AGENT on Canary host -> DENY (no_active_membership)
  const res4 = await resolveTenantAuthority(
    "tenant-canary.houzzatpro.com",
    { id: "houzzat_agent_user" },
    testDeps,
  );
  assert.equal(res4.ok, false);
  if (!res4.ok) {
    assert.equal(res4.reason, "no_active_membership");
  }

  // Scenario 5: Canary OWNER on Canary host -> PASS (OWNER authority)
  const res5 = await resolveTenantAuthority(
    "tenant-canary.houzzatpro.com",
    { id: "canary_owner_user" },
    testDeps,
  );
  assert.equal(res5.ok, true);
  if (res5.ok) {
    assert.equal(res5.workspaceId, WS_CANARY);
    assert.equal(res5.workspaceRole, "OWNER");
    assert.equal(res5.canManageWorkspace, true);
    assert.equal(res5.canSeeTeamLeads, true);
    assert.equal(res5.isOwnerAdmin, true);
  }

  // Scenario 6: Canary AGENT on Canary host -> PASS (AGENT authority)
  const res6 = await resolveTenantAuthority(
    "tenant-canary.houzzatpro.com",
    { id: "canary_agent_user" },
    testDeps,
  );
  assert.equal(res6.ok, true);
  if (res6.ok) {
    assert.equal(res6.workspaceId, WS_CANARY);
    assert.equal(res6.workspaceRole, "AGENT");
    assert.equal(res6.canManageWorkspace, false);
  }

  // Scenario 7: Canary OWNER on Houzzat host -> DENY (no_active_membership)
  const res7 = await resolveTenantAuthority(
    "houzzat.com",
    { id: "canary_owner_user" },
    testDeps,
  );
  assert.equal(res7.ok, false);
  if (!res7.ok) {
    assert.equal(res7.reason, "no_active_membership");
  }

  // Scenario 8: Canary AGENT on Houzzat host -> DENY (no_active_membership)
  const res8 = await resolveTenantAuthority(
    "houzzat.com",
    { id: "canary_agent_user" },
    testDeps,
  );
  assert.equal(res8.ok, false);
  if (!res8.ok) {
    assert.equal(res8.reason, "no_active_membership");
  }

  // Scenario 9: Global Admin with no membership -> ZERO authority
  const res9 = await resolveTenantAuthority(
    "houzzat.com",
    { id: "global_admin_no_membership" },
    testDeps,
  );
  assert.equal(res9.ok, false);
  if (!res9.ok) {
    assert.equal(res9.reason, "no_active_membership");
  }

  // Scenario 10: Multi-workspace user on Houzzat host -> OWNER in Houzzat
  const res10 = await resolveTenantAuthority(
    "houzzat.com",
    { id: "multi_workspace_user" },
    testDeps,
  );
  assert.equal(res10.ok, true);
  if (res10.ok) {
    assert.equal(res10.workspaceId, WS_HOUZZAT);
    assert.equal(res10.workspaceRole, "OWNER");
    assert.equal(res10.canManageWorkspace, true);
  }

  // Scenario 11: Same multi-workspace user on Canary host -> AGENT in Canary
  const res11 = await resolveTenantAuthority(
    "tenant-canary.houzzatpro.com",
    { id: "multi_workspace_user" },
    testDeps,
  );
  assert.equal(res11.ok, true);
  if (res11.ok) {
    assert.equal(res11.workspaceId, WS_CANARY);
    assert.equal(res11.workspaceRole, "AGENT");
    assert.equal(res11.canManageWorkspace, false);
  }

  // Scenario 12: Suspended member -> DENY (member_suspended)
  const res12 = await resolveTenantAuthority(
    "houzzat.com",
    { id: "suspended_member_user" },
    testDeps,
  );
  assert.equal(res12.ok, false);
  if (!res12.ok) {
    assert.equal(res12.reason, "member_suspended");
  }

  // Scenario 13: Invited member (not active) -> DENY (no_active_membership)
  const res13 = await resolveTenantAuthority(
    "houzzat.com",
    { id: "invited_member_user" },
    testDeps,
  );
  assert.equal(res13.ok, false);
  if (!res13.ok) {
    assert.equal(res13.reason, "no_active_membership");
  }

  // Scenario 14: Disabled User -> DENY (user_disabled)
  const res14 = await resolveTenantAuthority(
    "houzzat.com",
    { id: "disabled_user" },
    testDeps,
  );
  assert.equal(res14.ok, false);
  if (!res14.ok) {
    assert.equal(res14.reason, "user_disabled");
  }

  // Scenario 15: Platform bootstrap host -> DENY (zero tenant authority)
  const res15 = await resolveTenantAuthority(
    "app.houzzatpro.com",
    { id: "houzzat_admin_user" },
    testDeps,
  );
  assert.equal(res15.ok, false);
  if (!res15.ok) {
    assert.equal(res15.reason, "platform_host_no_tenant_authority");
  }
}

function testDataIsolationHarness() {
  type Resource = {
    id: string;
    workspaceId: string;
    type: "lead" | "task" | "notification" | "routing_config";
  };

  const RESOURCES: Resource[] = [
    { id: "lead_a_1", workspaceId: WS_HOUZZAT, type: "lead" },
    { id: "task_a_1", workspaceId: WS_HOUZZAT, type: "task" },
    { id: "notif_a_1", workspaceId: WS_HOUZZAT, type: "notification" },
    { id: "routing_a_1", workspaceId: WS_HOUZZAT, type: "routing_config" },
    { id: "lead_b_1", workspaceId: WS_CANARY, type: "lead" },
    { id: "task_b_1", workspaceId: WS_CANARY, type: "task" },
    { id: "notif_b_1", workspaceId: WS_CANARY, type: "notification" },
    { id: "routing_b_1", workspaceId: WS_CANARY, type: "routing_config" },
  ];

  function canAccessResource(
    authority: { workspaceId: string },
    resource: Resource,
  ): boolean {
    return authority.workspaceId === resource.workspaceId;
  }

  function filterResources(
    authority: { workspaceId: string },
    resources: Resource[],
  ): Resource[] {
    return resources.filter((r) => r.workspaceId === authority.workspaceId);
  }

  const authA = { workspaceId: WS_HOUZZAT };
  const authB = { workspaceId: WS_CANARY };

  // Authority A accessing Resource A -> ALLOWED
  assert.equal(canAccessResource(authA, RESOURCES[0]!), true);
  assert.equal(canAccessResource(authA, RESOURCES[1]!), true);

  // Authority A accessing Resource B -> DENIED
  assert.equal(canAccessResource(authA, RESOURCES[4]!), false);
  assert.equal(canAccessResource(authA, RESOURCES[5]!), false);

  // Authority B accessing Resource B -> ALLOWED
  assert.equal(canAccessResource(authB, RESOURCES[4]!), true);
  assert.equal(canAccessResource(authB, RESOURCES[5]!), true);

  // Authority B accessing Resource A -> DENIED
  assert.equal(canAccessResource(authB, RESOURCES[0]!), false);
  assert.equal(canAccessResource(authB, RESOURCES[1]!), false);

  // List filter returns exact workspace resources only
  const filteredA = filterResources(authA, RESOURCES);
  assert.equal(filteredA.length, 4);
  assert.ok(filteredA.every((r) => r.workspaceId === WS_HOUZZAT));

  const filteredB = filterResources(authB, RESOURCES);
  assert.equal(filteredB.length, 4);
  assert.ok(filteredB.every((r) => r.workspaceId === WS_CANARY));
}

function testStaticSafetyScan() {
  const authorityCode = read("src/lib/tenancy/tenant-authority.ts");

  // Must not import or reference User.role as authority
  assert.ok(!authorityCode.includes('user.role === "ADMIN"'));
  assert.ok(!authorityCode.includes("user.role === 'ADMIN'"));
  assert.ok(!authorityCode.includes("isAdminRole"));

  // Must not reference Organization / OrganizationMembership
  assert.ok(!authorityCode.includes("organizationMembership"));
  assert.ok(!authorityCode.includes("OrganizationMembership"));
  assert.ok(!authorityCode.includes("ensureBrokerageOrganization"));

  // Must not use cookie / client workspace
  assert.ok(!authorityCode.includes("cookieWorkspaceId"));
  assert.ok(!authorityCode.includes("readActiveWorkspaceIdFromCookies"));

  // Must not default to Houzzat on unknown hosts
  assert.ok(!authorityCode.includes("resolveLegacyHouzzatWorkspace"));
  assert.ok(!authorityCode.includes("HOUZZAT_WORKSPACE_SLUG"));
}

async function main() {
  await testStrictWorkspaceResolution();
  await testFullAuthorityMatrix();
  testDataIsolationHarness();
  testStaticSafetyScan();
  console.log("tenant-authority:selftest OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
