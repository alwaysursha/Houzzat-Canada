/**
 * Exact-host Vercel test credentials exception for MASTER_ADMIN /platform login.
 * Run: pnpm vercel-test-platform-login:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  HOUZZAT_VERCEL_TEST_HOSTNAME,
  isHouzzatVercelTestHost,
  isVercelTestMasterAdminCredentialsException,
} from "../src/lib/auth/pro-sign-in-routing";
import { allowVercelTestMasterAdminCredentialsLogin } from "../src/lib/tenancy/tenant-auth-boundary";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const MASTER = {
  role: "MASTER_ADMIN" as const,
  status: "ACTIVE" as const,
};

function testExactHostHelper() {
  assert.equal(HOUZZAT_VERCEL_TEST_HOSTNAME, "houzzat-vercel-test.vercel.app");
  assert.equal(
    isVercelTestMasterAdminCredentialsException({
      hostname: "houzzat-vercel-test.vercel.app",
      operator: MASTER,
    }),
    true,
  );
  assert.equal(
    isVercelTestMasterAdminCredentialsException({
      hostname: "HOUZZAT-VERCEL-TEST.VERCEL.APP",
      operator: MASTER,
    }),
    true,
  );
  assert.equal(
    isVercelTestMasterAdminCredentialsException({
      hostname: "houzzat-vercel-test.vercel.app",
      operator: { role: "MASTER_ADMIN", status: "DISABLED" },
    }),
    false,
  );
  assert.equal(
    isVercelTestMasterAdminCredentialsException({
      hostname: "houzzat-vercel-test.vercel.app",
      operator: { role: "SALES", status: "ACTIVE" },
    }),
    false,
  );
  assert.equal(
    isVercelTestMasterAdminCredentialsException({
      hostname: "houzzat-vercel-test.vercel.app",
      operator: { role: "BILLING", status: "ACTIVE" },
    }),
    false,
  );
  assert.equal(
    isVercelTestMasterAdminCredentialsException({
      hostname: "houzzat-vercel-test.vercel.app",
      operator: null,
    }),
    false,
  );
  assert.equal(
    isVercelTestMasterAdminCredentialsException({
      hostname: "preview.vercel.app",
      operator: MASTER,
    }),
    false,
  );
  assert.equal(
    isVercelTestMasterAdminCredentialsException({
      hostname: "something.vercel.app",
      operator: MASTER,
    }),
    false,
  );
  assert.equal(
    isVercelTestMasterAdminCredentialsException({
      hostname: "app.houzzatpro.com",
      operator: MASTER,
    }),
    false,
  );
  assert.equal(
    isVercelTestMasterAdminCredentialsException({
      hostname: "re-max-realty.houzzatpro.com",
      operator: MASTER,
    }),
    false,
  );
  assert.equal(
    isVercelTestMasterAdminCredentialsException({
      hostname: "houzzat.com",
      operator: MASTER,
    }),
    false,
  );
  assert.equal(isHouzzatVercelTestHost("houzzat-vercel-test.vercel.app.evil.com"), false);
}

async function testAllowLoginLookup() {
  const lookupMaster = async () => MASTER;
  const lookupNone = async () => null;

  assert.equal(
    await allowVercelTestMasterAdminCredentialsLogin({
      hostname: "houzzat-vercel-test.vercel.app",
      userId: "master_admin",
      lookupPlatformOperator: lookupMaster,
    }),
    true,
  );
  assert.equal(
    await allowVercelTestMasterAdminCredentialsLogin({
      hostname: "houzzat-vercel-test.vercel.app",
      userId: "remax_owner",
      lookupPlatformOperator: lookupNone,
    }),
    false,
  );
  assert.equal(
    await allowVercelTestMasterAdminCredentialsLogin({
      hostname: "re-max-realty.houzzatpro.com",
      userId: "master_admin",
      lookupPlatformOperator: lookupMaster,
    }),
    false,
  );
  assert.equal(
    await allowVercelTestMasterAdminCredentialsLogin({
      hostname: "app.houzzatpro.com",
      userId: "master_admin",
      lookupPlatformOperator: lookupMaster,
    }),
    false,
  );

  let productionLookupCalled = false;
  assert.equal(
    await allowVercelTestMasterAdminCredentialsLogin({
      hostname: "houzzat.com",
      userId: "master_admin",
      lookupPlatformOperator: async () => {
        productionLookupCalled = true;
        return MASTER;
      },
    }),
    false,
  );
  assert.equal(productionLookupCalled, false);
}

function testSourceGuards() {
  const boundary = read("src/lib/tenancy/tenant-auth-boundary.ts");
  assert.ok(boundary.includes("allowVercelTestMasterAdminCredentialsLogin"));
  assert.ok(boundary.includes("isVercelTestMasterAdminCredentialsException"));
  assert.ok(boundary.includes("isHouzzatVercelTestHost"));
  assert.ok(!boundary.includes("*.vercel.app"));
  assert.ok(!boundary.includes('endsWith(".vercel.app")'));
  const tenantAccessFn = boundary.slice(
    boundary.indexOf("export async function requireTenantWorkspaceAccess"),
  );
  assert.equal(
    tenantAccessFn.includes("allowVercelTestMasterAdminCredentialsLogin"),
    false,
  );
  assert.equal(tenantAccessFn.includes("platformOperator.findUnique"), false);

  const platformAuth = read("src/lib/platform/auth/require-platform-operator.ts");
  assert.equal(platformAuth.includes("isHouzzatVercelTestHost"), false);
  assert.equal(platformAuth.includes("isVercelTestMasterAdminCredentialsException"), false);
  assert.ok(platformAuth.includes("assertActiveMasterAdminOperator"));

  const platformUi = read("src/lib/platform/ui/auth.ts");
  assert.ok(platformUi.includes("requirePlatformOperator"));
  assert.ok(platformUi.includes("/platform/access-denied"));

  const agent = read("src/lib/agent.ts");
  assert.ok(agent.includes("isVercelTestHostnameStaffMember"));
  assert.ok(agent.includes("isStaffWorkspaceMemberRole"));
  assert.equal(agent.includes("allowVercelTestMasterAdminCredentialsLogin"), false);
  assert.equal(agent.includes("isVercelTestMasterAdminCredentialsException"), false);

  const routing = read("src/lib/auth/pro-sign-in-routing.ts");
  assert.ok(!routing.includes('endsWith(".vercel.app")'));
  assert.ok(routing.includes("=== HOUZZAT_VERCEL_TEST_HOSTNAME"));
}

async function main() {
  testExactHostHelper();
  await testAllowLoginLookup();
  testSourceGuards();
  console.log("vercel-test-platform-login-selftest: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
