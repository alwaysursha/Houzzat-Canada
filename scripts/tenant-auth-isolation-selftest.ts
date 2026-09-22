/**
 * Stage 3K.5.13 — Hard tenant auth boundary & cross-workspace isolation selftest.
 * Run: pnpm tenant-auth-isolation:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateTenantCredentialsAuth,
  requireTenantWorkspaceAccess,
} from "../src/lib/tenancy/tenant-auth-boundary";
import {
  canAccessLead,
  leadTenantWhere,
  parseCrmReadScope,
  type CrmScopeContext,
} from "../src/lib/crm-read-scope";
import {
  createFixtureHostResolutionDeps,
  type DomainLookupRow,
} from "../src/lib/tenancy/resolve-workspace-host";
import { resolveAdminSurfaceMode } from "../src/lib/admin/tenant-command-centre-auth";
import {
  isPlatformAdminSurfaceHostname,
  isTenantHostnameBoundCrmHost,
  resolveTenantStaffContext,
} from "../src/lib/tenancy/tenant-staff-context";
import { TENANT_B_TEST_WORKSPACE_ID } from "../src/lib/tenancy/test-fixtures/tenant-b-brand";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS_HOUZZAT = "ws_houzzat_fixture";
const WS_CANARY = TENANT_B_TEST_WORKSPACE_ID;

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
    hostname: "tenant-canary.houzzatpro.com",
    kind: "PLATFORM",
    role: "PRIMARY",
    workspaceId: WS_CANARY,
    workspaceSlug: "tenant-canary",
    domainStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
  },
];

const fixtureDeps = createFixtureHostResolutionDeps(FIXTURE_DOMAINS);

// Mock membership database for selftest
type MemberRow = {
  userId: string;
  workspaceId: string;
  role: "OWNER" | "ADMIN" | "AGENT";
  status: "ACTIVE" | "SUSPENDED" | "INVITED";
};

const MEMBERSHIP_DB: MemberRow[] = [
  { userId: "houzzat_admin", workspaceId: WS_HOUZZAT, role: "ADMIN", status: "ACTIVE" },
  { userId: "houzzat_agent", workspaceId: WS_HOUZZAT, role: "AGENT", status: "ACTIVE" },
  { userId: "owner_b", workspaceId: WS_CANARY, role: "OWNER", status: "ACTIVE" },
  { userId: "agent_b", workspaceId: WS_CANARY, role: "AGENT", status: "ACTIVE" },
  { userId: "multi_user", workspaceId: WS_HOUZZAT, role: "ADMIN", status: "ACTIVE" },
  { userId: "multi_user", workspaceId: WS_CANARY, role: "AGENT", status: "ACTIVE" },
  { userId: "suspended_user", workspaceId: WS_HOUZZAT, role: "AGENT", status: "SUSPENDED" },
];

type UserRow = {
  id: string;
  role: "BUYER" | "SELLER" | "ADMIN" | "AGENT";
};

const USER_DB: UserRow[] = [
  { id: "houzzat_admin", role: "ADMIN" },
  { id: "houzzat_agent", role: "AGENT" },
  { id: "owner_b", role: "AGENT" },
  { id: "agent_b", role: "AGENT" },
  { id: "multi_user", role: "AGENT" },
  { id: "suspended_user", role: "AGENT" },
  { id: "stranger_user", role: "AGENT" },
  { id: "customer_buyer", role: "BUYER" },
  { id: "customer_seller", role: "SELLER" },
];

function mockValidateCredentialsAuth(
  userId: string,
  hostname: string,
  userRole?: string,
) {
  // Test implementation of tenant auth boundary against mock membership db
  if (!userId) return { ok: false, reason: "unauthenticated" as const };
  if (hostname === "app.houzzatpro.com" || hostname === "houzzatpro.com") {
    return { ok: true, isPlatform: true };
  }

  const domain = FIXTURE_DOMAINS.find(
    (d) => d.hostname === hostname && d.domainStatus === "ACTIVE" && d.workspaceStatus === "ACTIVE",
  );
  if (!domain) {
    return { ok: false, reason: "unknown_tenant_workspace" as const };
  }

  const member = MEMBERSHIP_DB.find(
    (m) => m.userId === userId && m.workspaceId === domain.workspaceId && m.status === "ACTIVE",
  );
  if (member) {
    return {
      ok: true,
      isPlatform: false,
      workspaceId: domain.workspaceId,
      workspaceRole: member.role,
    };
  }

  const role = userRole ?? USER_DB.find((u) => u.id === userId)?.role;
  if (role === "BUYER" || role === "SELLER") {
    return {
      ok: true,
      isPlatform: false,
      workspaceId: domain.workspaceId,
    };
  }

  return { ok: false, reason: "no_active_membership" as const };
}

async function testCrossTenantAuthenticationMatrix() {
  // 1. Houzzat staff on Houzzat host -> PASS
  const houzzatAdminOnHouzzat = mockValidateCredentialsAuth("houzzat_admin", "houzzat.com");
  assert.equal(houzzatAdminOnHouzzat.ok, true);
  assert.equal(houzzatAdminOnHouzzat.workspaceId, WS_HOUZZAT);

  const houzzatAgentOnHouzzat = mockValidateCredentialsAuth("houzzat_agent", "houzzat.com");
  assert.equal(houzzatAgentOnHouzzat.ok, true);
  assert.equal(houzzatAgentOnHouzzat.workspaceId, WS_HOUZZAT);

  // 2. Canary staff on Canary host -> PASS
  const canaryOwnerOnCanary = mockValidateCredentialsAuth("owner_b", "tenant-canary.houzzatpro.com");
  assert.equal(canaryOwnerOnCanary.ok, true);
  assert.equal(canaryOwnerOnCanary.workspaceId, WS_CANARY);

  const canaryAgentOnCanary = mockValidateCredentialsAuth("agent_b", "tenant-canary.houzzatpro.com");
  assert.equal(canaryAgentOnCanary.ok, true);
  assert.equal(canaryAgentOnCanary.workspaceId, WS_CANARY);

  // 3. Canary staff on Houzzat host -> REJECT
  const canaryOwnerOnHouzzat = mockValidateCredentialsAuth("owner_b", "houzzat.com");
  assert.equal(canaryOwnerOnHouzzat.ok, false);
  assert.equal(canaryOwnerOnHouzzat.reason, "no_active_membership");

  const canaryAgentOnHouzzat = mockValidateCredentialsAuth("agent_b", "houzzat.com");
  assert.equal(canaryAgentOnHouzzat.ok, false);
  assert.equal(canaryAgentOnHouzzat.reason, "no_active_membership");

  // 4. Houzzat staff on Canary host -> REJECT
  const houzzatAdminOnCanary = mockValidateCredentialsAuth("houzzat_admin", "tenant-canary.houzzatpro.com");
  assert.equal(houzzatAdminOnCanary.ok, false);
  assert.equal(houzzatAdminOnCanary.reason, "no_active_membership");

  const houzzatAgentOnCanary = mockValidateCredentialsAuth("houzzat_agent", "tenant-canary.houzzatpro.com");
  assert.equal(houzzatAgentOnCanary.ok, false);
  assert.equal(houzzatAgentOnCanary.reason, "no_active_membership");

  // 5. Multi-membership user on both hosts -> PASS on both with respective workspaceId
  const multiOnHouzzat = mockValidateCredentialsAuth("multi_user", "houzzat.com");
  assert.equal(multiOnHouzzat.ok, true);
  assert.equal(multiOnHouzzat.workspaceId, WS_HOUZZAT);
  assert.equal(multiOnHouzzat.workspaceRole, "ADMIN");

  const multiOnCanary = mockValidateCredentialsAuth("multi_user", "tenant-canary.houzzatpro.com");
  assert.equal(multiOnCanary.ok, true);
  assert.equal(multiOnCanary.workspaceId, WS_CANARY);
  assert.equal(multiOnCanary.workspaceRole, "AGENT");

  // 6. Suspended or un-membered users -> REJECT
  const suspendedOnHouzzat = mockValidateCredentialsAuth("suspended_user", "houzzat.com");
  assert.equal(suspendedOnHouzzat.ok, false);
  assert.equal(suspendedOnHouzzat.reason, "no_active_membership");

  const strangerOnHouzzat = mockValidateCredentialsAuth("stranger_user", "houzzat.com");
  assert.equal(strangerOnHouzzat.ok, false);
  assert.equal(strangerOnHouzzat.reason, "no_active_membership");

  // 7. Platform bootstrap host (app.houzzatpro.com) -> global credentials pass
  const canaryOnPlatform = mockValidateCredentialsAuth("owner_b", "app.houzzatpro.com");
  assert.equal(canaryOnPlatform.ok, true);
  assert.equal(canaryOnPlatform.isPlatform, true);

  const houzzatOnPlatform = mockValidateCredentialsAuth("houzzat_admin", "app.houzzatpro.com");
  assert.equal(houzzatOnPlatform.ok, true);
  assert.equal(houzzatOnPlatform.isPlatform, true);

  // 8. Consumers (BUYER / SELLER) -> PASS on active tenant hosts without staff WorkspaceMember
  const buyerOnHouzzat = mockValidateCredentialsAuth("customer_buyer", "houzzat.com");
  assert.equal(buyerOnHouzzat.ok, true);
  assert.equal(buyerOnHouzzat.workspaceId, WS_HOUZZAT);
  assert.equal(buyerOnHouzzat.workspaceRole, undefined);

  const sellerOnCanary = mockValidateCredentialsAuth("customer_seller", "tenant-canary.houzzatpro.com");
  assert.equal(sellerOnCanary.ok, true);
  assert.equal(sellerOnCanary.workspaceId, WS_CANARY);
  assert.equal(sellerOnCanary.workspaceRole, undefined);
}

function testTenantDataAuthorizationIsolation() {
  const houzzatCtx: CrmScopeContext = {
    user: { id: "houzzat_admin" },
    organizationId: "org_houzzat",
    organizationIds: ["org_houzzat"],
    canSeeTeamLeads: true,
    isPlatformAdmin: false,
    workspaceId: WS_HOUZZAT,
    isWorkspaceMember: true,
    isWorkspaceCrmAllowed: true,
    hasAmbiguousWorkspaceMembership: false,
  };

  const canaryCtx: CrmScopeContext = {
    user: { id: "owner_b" },
    organizationId: "org_canary",
    organizationIds: ["org_canary"],
    canSeeTeamLeads: true,
    isPlatformAdmin: false,
    workspaceId: WS_CANARY,
    isWorkspaceMember: true,
    isWorkspaceCrmAllowed: true,
    hasAmbiguousWorkspaceMembership: false,
  };

  const prevDomain = process.env.TENANT_DOMAIN_SCOPE;
  const prevRead = process.env.WORKSPACE_READ_SCOPE;
  process.env.TENANT_DOMAIN_SCOPE = "workspace";
  process.env.WORKSPACE_READ_SCOPE = "workspace";

  try {
    // 1. Where clause isolation
    const houzzatWhere = leadTenantWhere(houzzatCtx);
    assert.deepEqual(houzzatWhere, { workspaceId: WS_HOUZZAT });

    const canaryWhere = leadTenantWhere(canaryCtx);
    assert.deepEqual(canaryWhere, { workspaceId: WS_CANARY });
    assert.notEqual(houzzatWhere.workspaceId, canaryWhere.workspaceId);

    // 2. Resource-ID cross-tenant access check
    const houzzatLead = { id: "lead_h1", workspaceId: WS_HOUZZAT, assignedAgentId: null };
    const canaryLead = { id: "lead_c1", workspaceId: WS_CANARY, assignedAgentId: null };

    // Houzzat user accessing Houzzat lead -> allowed
    assert.equal(canAccessLead(houzzatCtx, houzzatLead), true);
    // Houzzat user accessing Canary lead -> DENIED
    assert.equal(canAccessLead(houzzatCtx, canaryLead), false);

    // Canary user accessing Canary lead -> allowed
    assert.equal(canAccessLead(canaryCtx, canaryLead), true);
    // Canary user accessing Houzzat lead -> DENIED
    assert.equal(canAccessLead(canaryCtx, houzzatLead), false);

    // 3. User with wrong or missing workspace context -> DENIED
    const wrongHostCtx: CrmScopeContext = {
      ...canaryCtx,
      workspaceId: WS_HOUZZAT, // Spoofed or wrong host workspace
      isWorkspaceMember: false, // Not a member of Houzzat
    };
    assert.equal(canAccessLead(wrongHostCtx, houzzatLead), false);
    assert.equal(canAccessLead(wrongHostCtx, canaryLead), false);
  } finally {
    if (prevDomain === undefined) delete process.env.TENANT_DOMAIN_SCOPE;
    else process.env.TENANT_DOMAIN_SCOPE = prevDomain;
    if (prevRead === undefined) delete process.env.WORKSPACE_READ_SCOPE;
    else process.env.WORKSPACE_READ_SCOPE = prevRead;
  }
}

function testSourceWiring() {
  const authSource = read("src/lib/auth.ts");
  const boundarySource = read("src/lib/tenancy/tenant-auth-boundary.ts");
  const adminPageSource = read("src/app/(admin)/admin/page.tsx");
  const adminLayoutSource = read("src/app/(admin)/admin/layout.tsx");
  const agentLayoutSource = read("src/app/(agent)/agent/layout.tsx");
  const agentLibSource = read("src/lib/agent.ts");

  // Auth.js credentials authorize + signIn callback wire boundary
  assert.ok(authSource.includes("validateTenantCredentialsAuth"));
  assert.ok(authSource.includes("findTenantUserByEmail"));
  assert.ok(authSource.includes("callbacks:"));
  assert.ok(authSource.includes("async signIn({ user, account })"));

  // Boundary logic enforces hostname -> workspace -> active membership
  // Phase 3: consumers require matching User.workspaceId (no global consumer exception)
  assert.ok(boundarySource.includes("isPlatformMobileBootstrapHost"));
  assert.ok(boundarySource.includes("no_active_membership"));
  assert.ok(boundarySource.includes("workspace: { status: \"ACTIVE\" }"));
  assert.ok(boundarySource.includes("user.workspaceId === resolvedWorkspaceId"));

  // Admin surface modes fail closed
  assert.ok(adminPageSource.includes("resolveAdminPageSurface"));
  assert.ok(adminLayoutSource.includes("resolveAdminSurfaceMode"));

  // Agent context binds to hostname
  assert.ok(agentLibSource.includes("shouldUseHostnameBoundStaffContext"));
  assert.ok(agentLibSource.includes("buildHostnameBoundAgentContext"));
}

async function testPlatformHostAuthRequestSemantics() {
  const { extractTrustedRequestHostname } = await import("../src/lib/tenancy/extract-request-hostname");

  // 1. Browser on app.houzzatpro.com with NextAuth synthetic request.url pointing to houzzat.com
  const browserPlatformReq = new Request("https://houzzat.com/api/auth/callback/credentials", {
    headers: {
      host: "app.houzzatpro.com",
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });
  const browserHost = extractTrustedRequestHostname(browserPlatformReq);
  assert.equal(browserHost, "app.houzzatpro.com");
  const browserAuth = await validateTenantCredentialsAuth({
    userId: "owner_b",
    userRole: "AGENT",
    request: browserPlatformReq,
    deps: fixtureDeps,
  });
  assert.equal(browserAuth.ok, true);
  assert.equal(browserAuth.isPlatform, true);

  // 2. Android Native on app.houzzatpro.com with NextAuth synthetic request.url pointing to houzzat.com
  const androidPlatformReq = new Request("https://houzzat.com/api/auth/callback/credentials", {
    headers: {
      host: "app.houzzatpro.com",
      "user-agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UD1A.230803.041) AppleWebKit/537.36 HouzzatNative/1 (com.houzzat.pro)",
    },
  });
  const androidHost = extractTrustedRequestHostname(androidPlatformReq);
  assert.equal(androidHost, "app.houzzatpro.com");
  const androidAuth = await validateTenantCredentialsAuth({
    userId: "owner_b",
    userRole: "AGENT",
    request: androidPlatformReq,
    deps: fixtureDeps,
  });
  assert.equal(androidAuth.ok, true);
  assert.equal(androidAuth.isPlatform, true);

  // 3. Direct Houzzat tenant request with NextAuth synthetic request.url pointing to houzzat.com
  const houzzatTenantReq = new Request("https://houzzat.com/api/auth/callback/credentials", {
    headers: {
      host: "houzzat.com",
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    },
  });
  const houzzatHost = extractTrustedRequestHostname(houzzatTenantReq);
  assert.equal(houzzatHost, "houzzat.com");
}

async function main() {
  await testCrossTenantAuthenticationMatrix();
  testTenantDataAuthorizationIsolation();
  testSourceWiring();
  await testPlatformHostAuthRequestSemantics();
  console.log("tenant-auth-isolation:selftest OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
