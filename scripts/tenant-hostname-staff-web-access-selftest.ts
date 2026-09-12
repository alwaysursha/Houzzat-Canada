/**
 * Production tenant hostname staff web access (not a Vercel host exception).
 * Run: pnpm tenant-hostname-staff-web-access:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canAccessTenantCommandCentreRole } from "../src/lib/admin/tenant-command-centre-auth";
import {
  resolveProPostSignInHref,
  shouldDeferStaffWebRoleToHostnameMembership,
} from "../src/lib/auth/pro-sign-in-routing";
import { decideHostnameBoundStaffWebAccess } from "../src/lib/auth/tenant-staff-web-access";
import { isStaffWorkspaceMemberRole } from "../src/lib/mobile/workspace-destination";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const REMAX_HOST = "re-max-realty.houzzatpro.com";
const REMAX_WORKSPACE_ID = "cmtn5glsq0005psp7z8wk891q";
const HOUZZAT_WORKSPACE_ID = "ws_houzzat_fixture";

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function withTenantDomainScope(mode: "workspace" | "legacy", fn: () => void) {
  const prev = process.env.TENANT_DOMAIN_SCOPE;
  process.env.TENANT_DOMAIN_SCOPE = mode;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env.TENANT_DOMAIN_SCOPE;
    else process.env.TENANT_DOMAIN_SCOPE = prev;
  }
}

function testRemaxOwnerBuyerAdminAllowed() {
  withTenantDomainScope("workspace", () => {
    assert.equal(shouldDeferStaffWebRoleToHostnameMembership(REMAX_HOST), true);
    assert.equal(isStaffWorkspaceMemberRole("OWNER"), true);
    assert.equal(canAccessTenantCommandCentreRole("OWNER"), true);
    assert.equal(
      decideHostnameBoundStaffWebAccess({
        surface: "admin",
        hostname: REMAX_HOST,
        userRole: "BUYER",
        hostnameWorkspaceId: REMAX_WORKSPACE_ID,
        membership: {
          workspaceId: REMAX_WORKSPACE_ID,
          role: "OWNER",
          status: "ACTIVE",
        },
      }),
      "allow",
      "RE/MAX hostname + User.role=BUYER + ACTIVE OWNER → /admin allowed",
    );
  });
}

function testRemaxOwnerBuyerAgentAllowed() {
  withTenantDomainScope("workspace", () => {
    assert.equal(
      decideHostnameBoundStaffWebAccess({
        surface: "agent",
        hostname: REMAX_HOST,
        userRole: "BUYER",
        hostnameWorkspaceId: REMAX_WORKSPACE_ID,
        membership: {
          workspaceId: REMAX_WORKSPACE_ID,
          role: "OWNER",
          status: "ACTIVE",
        },
      }),
      "allow",
      "OWNER is permitted on /agent",
    );
    assert.equal(
      resolveProPostSignInHref("/agent", "BUYER", "OWNER"),
      "/agent",
    );
    assert.equal(
      resolveProPostSignInHref("/admin", "BUYER", "OWNER"),
      "/admin",
    );
  });
}

function testHouzzatMembershipDoesNotGrantRemaxCrm() {
  withTenantDomainScope("workspace", () => {
    assert.equal(
      decideHostnameBoundStaffWebAccess({
        surface: "admin",
        hostname: REMAX_HOST,
        userRole: "AGENT",
        hostnameWorkspaceId: REMAX_WORKSPACE_ID,
        membership: {
          workspaceId: HOUZZAT_WORKSPACE_ID,
          role: "OWNER",
          status: "ACTIVE",
        },
      }),
      "account",
      "Houzzat WorkspaceMember must not grant RE/MAX CRM",
    );
    assert.equal(
      decideHostnameBoundStaffWebAccess({
        surface: "agent",
        hostname: REMAX_HOST,
        userRole: "BUYER",
        hostnameWorkspaceId: REMAX_WORKSPACE_ID,
        membership: {
          workspaceId: HOUZZAT_WORKSPACE_ID,
          role: "AGENT",
          status: "ACTIVE",
        },
      }),
      "account",
    );
  });
}

function testBuyerNoStaffMembershipGoesToAccount() {
  withTenantDomainScope("workspace", () => {
    assert.equal(
      decideHostnameBoundStaffWebAccess({
        surface: "admin",
        hostname: REMAX_HOST,
        userRole: "BUYER",
        hostnameWorkspaceId: REMAX_WORKSPACE_ID,
        membership: null,
      }),
      "account",
    );
    assert.equal(
      decideHostnameBoundStaffWebAccess({
        surface: "agent",
        hostname: REMAX_HOST,
        userRole: "BUYER",
        hostnameWorkspaceId: REMAX_WORKSPACE_ID,
        membership: null,
      }),
      "account",
    );
    assert.equal(resolveProPostSignInHref("/admin", "BUYER"), "/pro/for-staff");
  });
}

function testPlatformUnchanged() {
  withTenantDomainScope("workspace", () => {
    assert.equal(
      shouldDeferStaffWebRoleToHostnameMembership("houzzatpro.com"),
      false,
    );
    assert.equal(
      shouldDeferStaffWebRoleToHostnameMembership("www.houzzatpro.com"),
      false,
    );
    assert.equal(
      shouldDeferStaffWebRoleToHostnameMembership("app.houzzatpro.com"),
      false,
    );
    assert.equal(
      shouldDeferStaffWebRoleToHostnameMembership("houzzat-vercel-test.vercel.app"),
      true,
    );
  });

  withTenantDomainScope("legacy", () => {
    assert.equal(shouldDeferStaffWebRoleToHostnameMembership(REMAX_HOST), false);
    assert.equal(
      shouldDeferStaffWebRoleToHostnameMembership("houzzat-vercel-test.vercel.app"),
      true,
    );
  });

  const platformAuth = read("src/lib/platform/auth/require-platform-operator.ts");
  assert.ok(platformAuth.includes("no User.role=ADMIN fallback"));
  assert.ok(platformAuth.includes("no WorkspaceMember fallback"));
  assert.equal(platformAuth.includes("tryTenantStaffContext"), false);
  assert.equal(platformAuth.includes("isAgentRole"), false);

  const platformLayout = read("src/app/platform/(shell)/layout.tsx");
  assert.ok(platformLayout.includes("requirePlatformPageAccess"));
  assert.equal(platformLayout.includes("shouldDeferStaffWebRoleToHostnameMembership"), false);
  assert.equal(platformLayout.includes("isAgentRole"), false);

  const uiAuth = read("src/lib/platform/ui/auth.ts");
  assert.ok(uiAuth.includes("requirePlatformOperator"));
}

function testSourceGuards() {
  const mw = read("src/middleware.ts");
  assert.ok(mw.includes("shouldDeferStaffWebRoleToHostnameMembership"));
  assert.ok(mw.includes("isAgentRole(session.user.role)"));
  assert.ok(!mw.includes("*.vercel.app"));
  assert.ok(!mw.includes('endsWith(".vercel.app")'));

  const adminLayout = read("src/app/(admin)/admin/layout.tsx");
  assert.ok(adminLayout.includes("shouldDeferStaffWebRoleToHostnameMembership"));
  assert.ok(adminLayout.includes("authorizeTenantCommandCentre(request"));
  assert.ok(adminLayout.includes("tryTenantStaffContext"));
  assert.ok(adminLayout.includes("redirectNonAdminFromAdminShell"));
  assert.equal(adminLayout.includes("isHouzzatVercelTestHost(hostname)"), false);

  const agent = read("src/lib/agent.ts");
  assert.ok(agent.includes("isHostnameBoundStaffMember"));
  assert.ok(agent.includes("tryTenantStaffContext"));
  assert.ok(agent.includes("isStaffWorkspaceMemberRole"));
  assert.ok(agent.includes("isHostnameBoundStaffAuthorityHost"));
  assert.equal(agent.includes("isVercelTestHostnameStaffMember"), false);
  assert.ok(agent.includes("isTenantHostnameBoundCrmHost"));

  const tenantStaff = read("src/lib/tenancy/tenant-staff-context.ts");
  const resolveFn = tenantStaff.slice(
    tenantStaff.indexOf("export async function resolveTenantStaffContext"),
  );
  assert.ok(resolveFn.includes("workspaceId: tenancy.workspaceId"));
  assert.ok(resolveFn.includes("status: \"ACTIVE\""));
  assert.ok(resolveFn.includes("isPlatformAdmin: false"));

  const tenantAccess = read("src/lib/tenancy/tenant-auth-boundary.ts");
  const requireFn = tenantAccess.slice(
    tenantAccess.indexOf("export async function requireTenantWorkspaceAccess"),
  );
  assert.equal(requireFn.includes("platformOperator"), false);
  assert.equal(
    requireFn.includes("allowVercelTestMasterAdminCredentialsLogin"),
    false,
  );
}

testRemaxOwnerBuyerAdminAllowed();
testRemaxOwnerBuyerAgentAllowed();
testHouzzatMembershipDoesNotGrantRemaxCrm();
testBuyerNoStaffMembershipGoesToAccount();
testPlatformUnchanged();
testSourceGuards();
console.log("tenant-hostname-staff-web-access-selftest: ok");
