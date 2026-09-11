/**
 * Exact-host Vercel CRM access (houzzat-vercel-test.vercel.app).
 * Run: pnpm vercel-test-crm-access:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  HOUZZAT_VERCEL_TEST_HOSTNAME,
  isHouzzatVercelTestHost,
  shouldDeferStaffWebRoleToHostnameMembership,
} from "../src/lib/auth/pro-sign-in-routing";
import { isStaffWorkspaceMemberRole } from "../src/lib/mobile/workspace-destination";
import { canAccessTenantCommandCentreRole } from "../src/lib/admin/tenant-command-centre-auth";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testExactHostDeferral() {
  assert.equal(HOUZZAT_VERCEL_TEST_HOSTNAME, "houzzat-vercel-test.vercel.app");
  assert.equal(
    shouldDeferStaffWebRoleToHostnameMembership(
      "houzzat-vercel-test.vercel.app",
    ),
    true,
  );
  assert.equal(isHouzzatVercelTestHost("preview.vercel.app"), false);
  assert.equal(
    shouldDeferStaffWebRoleToHostnameMembership("app.houzzatpro.com"),
    false,
  );
  assert.equal(
    shouldDeferStaffWebRoleToHostnameMembership("re-max-realty.houzzatpro.com"),
    false,
  );
  assert.equal(
    shouldDeferStaffWebRoleToHostnameMembership("houzzat.com"),
    false,
  );
}

function testMembershipRoles() {
  assert.equal(isStaffWorkspaceMemberRole("OWNER"), true);
  assert.equal(isStaffWorkspaceMemberRole("ADMIN"), true);
  assert.equal(isStaffWorkspaceMemberRole("AGENT"), true);
  assert.equal(canAccessTenantCommandCentreRole("OWNER"), true);
  assert.equal(canAccessTenantCommandCentreRole("ADMIN"), true);
  assert.equal(canAccessTenantCommandCentreRole("AGENT"), false);
}

function testSourceGuards() {
  const mw = read("src/middleware.ts");
  assert.ok(mw.includes("shouldDeferStaffWebRoleToHostnameMembership"));
  assert.ok(mw.includes("isAgentRole(session.user.role)"));
  assert.ok(!mw.includes("*.vercel.app"));
  assert.ok(!mw.includes('endsWith(".vercel.app")'));

  const adminLayout = read("src/app/(admin)/admin/layout.tsx");
  assert.ok(adminLayout.includes("isHouzzatVercelTestHost(hostname)"));
  assert.ok(adminLayout.includes("authorizeTenantCommandCentre(request"));
  assert.ok(adminLayout.includes("isAgentRole(user.role)"));

  const agent = read("src/lib/agent.ts");
  assert.ok(agent.includes("isVercelTestHostnameStaffMember"));
  assert.ok(agent.includes("tryTenantStaffContext"));
  assert.ok(agent.includes("isStaffWorkspaceMemberRole"));
  assert.ok(agent.includes("isHouzzatVercelTestHost"));
  assert.ok(agent.includes("isAgentRole(user.role)"));
  assert.ok(!agent.includes("*.vercel.app"));
  assert.ok(!agent.includes("user.role = "));
  assert.equal(agent.includes("allowVercelTestMasterAdminCredentialsLogin"), false);

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

testExactHostDeferral();
testMembershipRoles();
testSourceGuards();
console.log("vercel-test-crm-access-selftest: ok");
