/**
 * Phase 3 — lead customer workspace guard + mobile auth isolation regression.
 * Run: pnpm identity:phase3:lead-guard:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertUserMayBeLeadCustomer,
  CrossWorkspaceCustomerIdentityError,
  isCrossWorkspaceCustomerIdentityError,
} from "../src/lib/agent/lead-customer-workspace-guard";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS_A = "ws_a";
const WS_B = "ws_b";

type FakeUser = { id: string; workspaceId: string | null };

function fakeDb(users: FakeUser[]) {
  return {
    user: {
      findUnique: async ({ where: { id } }: { where: { id: string } }) => {
        const row = users.find((u) => u.id === id);
        return row ? { id: row.id, workspaceId: row.workspaceId } : null;
      },
    },
  };
}

async function testLeadCustomerGuard() {
  const users: FakeUser[] = [
    { id: "omer_null", workspaceId: null },
    { id: "houzzat_user", workspaceId: WS_A },
    { id: "maria_user", workspaceId: WS_B },
    { id: "platform", workspaceId: null },
  ];
  const db = fakeDb(users);

  await assert.rejects(
    () =>
      assertUserMayBeLeadCustomer({
        userId: "omer_null",
        workspaceId: WS_B,
        db: db as never,
      }),
    (err: unknown) => isCrossWorkspaceCustomerIdentityError(err),
  );

  await assert.rejects(
    () =>
      assertUserMayBeLeadCustomer({
        userId: "houzzat_user",
        workspaceId: WS_B,
        db: db as never,
      }),
    (err: unknown) => err instanceof CrossWorkspaceCustomerIdentityError,
  );

  await assert.rejects(
    () =>
      assertUserMayBeLeadCustomer({
        userId: "platform",
        workspaceId: WS_A,
        db: db as never,
      }),
    (err: unknown) => isCrossWorkspaceCustomerIdentityError(err),
  );

  const ok = await assertUserMayBeLeadCustomer({
    userId: "maria_user",
    workspaceId: WS_B,
    db: db as never,
  });
  assert.equal(ok.workspaceId, WS_B);

  console.log("[phase3] lead customer workspace guard... PASS");
}

function testSourceWiring() {
  const resolve = read("src/lib/agent/resolve-workspace-lead.ts");
  const intake = read("src/lib/agent/lead-intake.ts");
  const mobile = read("src/app/api/mobile/v2/auth/login/route.ts");
  const auth = read("src/lib/auth.ts");
  const valuation = read("src/app/api/valuation/route.ts");
  const proMobile = read("apps/pro-mobile/src/state/auth-controller.ts");

  assert.ok(resolve.includes("assertUserMayBeLeadCustomer"));
  assert.ok(intake.includes("assertUserMayBeLeadCustomer"));
  assert.equal(auth.includes("joinConsumerToTenantWorkspaceLead"), false);
  assert.equal(
    existsJoinHelper(),
    false,
    "join-tenant-workspace-lead.ts must remain deleted locally",
  );

  assert.ok(mobile.includes('mode: z.enum(["platform", "tenant"])'));
  assert.ok(mobile.includes("findTenantUserByEmail"));
  assert.ok(mobile.includes("platformOperator.findUnique"));
  assert.ok(proMobile.includes("/auth/discover"));
  assert.ok(proMobile.includes('mode: "tenant"'));
  assert.ok(proMobile.includes('mode: "platform"'));
  assert.ok(proMobile.includes("IDENTITY_SELECTION"));
  assert.ok(proMobile.includes("completeTenantLogin") || proMobile.includes('mode: "tenant"'));

  // No silent NULL-workspace password auth for tenants
  assert.equal(
    /findFirst\(\{\s*where:\s*\{\s*email,\s*workspaceId:\s*null/.test(mobile),
    false,
  );

  assert.ok(valuation.includes("workspaceId: opts.workspaceId"));
  assert.ok(valuation.includes("sessionCustomerUsable"));

  // Tenant auth must not resolve User by global email alone
  assert.ok(auth.includes("findTenantUserByEmail"));
  assert.equal(/findUnique\(\{\s*where:\s*\{\s*email\s*\}/.test(auth), false);

  console.log("[phase3] source wiring (guard/mobile/auth)... PASS");
}

function existsJoinHelper() {
  try {
    read("src/lib/auth/join-tenant-workspace-lead.ts");
    return true;
  } catch {
    return false;
  }
}

function testAnonymousValuationStillCreatesWorkspaceUser() {
  const valuation = read("src/app/api/valuation/route.ts");
  assert.ok(valuation.includes("workspaceId: opts.workspaceId"));
  assert.ok(valuation.includes('where: { email, workspaceId: opts.workspaceId }'));
  assert.ok(
    valuation.includes("upsertCustomer: false") ||
      valuation.includes("publicResolveOrCreateLead"),
  );
  console.log("[phase3] anonymous valuation stays workspace-scoped... PASS");
}

function testMobileLoginIsolation() {
  const mobile = read("src/app/api/mobile/v2/auth/login/route.ts");
  assert.ok(mobile.includes("findTenantUserByEmail"));
  assert.ok(mobile.includes("findNullWorkspaceUserByEmail"));
  assert.ok(mobile.includes("platformOperator.findUnique"));
  assert.ok(mobile.includes('mode: z.enum(["platform", "tenant"])'));
  // Tenant path must not fall back to NULL workspaceId
  assert.equal(
    /workspaceId:\s*null/.test(mobile.split("mode === \"tenant\"")[1]?.split("// Explicit platform")[0] ?? "workspaceId: null"),
    false,
  );
  assert.ok(mobile.includes('operator.status !== "ACTIVE"'));
  console.log("[phase3] mobile login tenant vs platform isolation... PASS");
}

function testNoTenantAuthGlobalEmail() {
  const auth = read("src/lib/auth.ts");
  const signup = read("src/app/api/auth/sign-up/route.ts");
  const forgot = read("src/app/api/auth/forgot-password/route.ts");
  const mobile = read("src/app/api/mobile/v2/auth/login/route.ts");
  for (const [name, src] of [
    ["auth", auth],
    ["sign-up", signup],
    ["forgot-password", forgot],
    ["mobile-login", mobile],
  ] as const) {
    assert.equal(
      /user\.findUnique\(\s*\{\s*where:\s*\{\s*email\s*[,}]/.test(src),
      false,
      `${name} must not resolve User by global email alone`,
    );
  }
  assert.ok(auth.includes("findTenantUserByEmail"));
  assert.ok(signup.includes("findTenantUserIdByEmail") || signup.includes("workspaceId"));
  console.log("[phase3] no tenant auth global-email User resolution... PASS");
}

async function main() {
  await testLeadCustomerGuard();
  testSourceWiring();
  testAnonymousValuationStillCreatesWorkspaceUser();
  testMobileLoginIsolation();
  testNoTenantAuthGlobalEmail();
  console.log("\n[identity-phase3-lead-guard] ALL PASS\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
