/**
 * Phase 3 — strict workspace identity security matrix (selftest).
 *
 * Proves isolation invariants with pure helpers + source guards.
 * Does NOT write production data.
 *
 * Run: pnpm identity:phase3:isolation:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeIdentityEmail,
  parseTenantBoundTokenIdentifier,
  tenantBoundTokenIdentifier,
} from "../src/lib/auth/workspace-identity";
import { assertTokenWorkspaceBinding } from "../src/lib/auth/session-workspace-binding";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS_A = "ws_workspace_a_fixture";
const WS_B = "ws_workspace_b_fixture";
const EMAIL = "sameperson@example.com";

function testTokenIdentifiersAreTenantBound() {
  const idA = tenantBoundTokenIdentifier("password-reset", WS_A, EMAIL);
  const idB = tenantBoundTokenIdentifier("password-reset", WS_B, EMAIL);
  assert.notEqual(idA, idB, "reset tokens must differ per workspace");

  const parsedA = parseTenantBoundTokenIdentifier("password-reset", idA);
  const parsedB = parseTenantBoundTokenIdentifier("password-reset", idB);
  assert.deepEqual(parsedA, {
    workspaceId: WS_A,
    email: normalizeIdentityEmail(EMAIL),
  });
  assert.deepEqual(parsedB, {
    workspaceId: WS_B,
    email: normalizeIdentityEmail(EMAIL),
  });

  const verifyA = tenantBoundTokenIdentifier("email-verify", WS_A, EMAIL);
  const verifyB = tenantBoundTokenIdentifier("email-verify", WS_B, EMAIL);
  assert.notEqual(verifyA, verifyB);
  assert.equal(
    parseTenantBoundTokenIdentifier("email-verify", verifyA)?.workspaceId,
    WS_A,
  );
  assert.equal(
    parseTenantBoundTokenIdentifier("password-reset", verifyA),
    null,
    "verify token must not parse as password-reset",
  );
  console.log("[phase3] tenant-bound reset/verify identifiers... PASS");
}

function testJwtWorkspaceBinding() {
  // A token must not authorize B
  const rejectCross = assertTokenWorkspaceBinding({
    tokenWorkspaceId: WS_A,
    isPlatformSession: false,
    hostnameIsPlatform: false,
    hostnameWorkspaceId: WS_B,
  });
  assert.equal(rejectCross.ok, false);
  if (!rejectCross.ok) {
    assert.equal(rejectCross.reason, "workspace_mismatch");
  }

  const acceptSame = assertTokenWorkspaceBinding({
    tokenWorkspaceId: WS_A,
    isPlatformSession: false,
    hostnameIsPlatform: false,
    hostnameWorkspaceId: WS_A,
  });
  assert.equal(acceptSame.ok, true);

  // Platform session must not silently become tenant
  const rejectPlatformOnTenant = assertTokenWorkspaceBinding({
    tokenWorkspaceId: null,
    isPlatformSession: true,
    hostnameIsPlatform: false,
    hostnameWorkspaceId: WS_A,
  });
  assert.equal(rejectPlatformOnTenant.ok, false);

  const acceptPlatform = assertTokenWorkspaceBinding({
    tokenWorkspaceId: null,
    isPlatformSession: true,
    hostnameIsPlatform: true,
    hostnameWorkspaceId: null,
  });
  assert.equal(acceptPlatform.ok, true);

  // Legacy JWT without workspaceId MUST fail closed on tenant hosts
  // (auth.ts may upgrade only when DB User.workspaceId matches hostname).
  const legacyMissing = assertTokenWorkspaceBinding({
    tokenWorkspaceId: undefined,
    isPlatformSession: undefined,
    hostnameIsPlatform: false,
    hostnameWorkspaceId: WS_A,
  });
  assert.equal(legacyMissing.ok, false);
  if (!legacyMissing.ok) {
    assert.equal(legacyMissing.reason, "missing_token_workspace");
  }

  const auth = read("src/lib/auth.ts");
  assert.ok(
    auth.includes('binding.reason === "missing_token_workspace"'),
    "auth must special-case legacy missing workspaceId for safe upgrade",
  );
  assert.ok(
    auth.includes("return null"),
    "auth must clear session when binding fails",
  );
  // Must not retain the unsafe gate that skipped rejection for unbound tokens
  assert.equal(
    auth.includes(
      "if (!binding.ok && (token.workspaceId != null || token.isPlatformSession))",
    ),
    false,
    "unsafe legacy JWT bypass gate must be removed",
  );

  console.log("[phase3] JWT/session workspace binding... PASS");
}

function testInMemoryDualWorkspaceIdentityModel() {
  // Simulate post-cutover User rows (same email, different workspace + password).
  type Row = {
    id: string;
    email: string;
    workspaceId: string | null;
    password: string;
    name: string;
  };
  const users: Row[] = [
    {
      id: "user_a",
      email: EMAIL,
      workspaceId: WS_A,
      password: "hash-A",
      name: "Profile-A",
    },
    {
      id: "user_b",
      email: EMAIL,
      workspaceId: WS_B,
      password: "hash-B",
      name: "Profile-B",
    },
    {
      id: "orphan",
      email: EMAIL,
      workspaceId: null,
      password: "hash-orphan",
      name: "Orphan",
    },
    {
      id: "platform",
      email: "teamalisyed@gmail.com",
      workspaceId: null,
      password: "hash-platform",
      name: "Platform",
    },
  ];

  function findTenant(workspaceId: string, email: string) {
    const e = normalizeIdentityEmail(email);
    return (
      users.find((u) => u.workspaceId === workspaceId && u.email === e) ?? null
    );
  }
  function findNull(email: string) {
    const e = normalizeIdentityEmail(email);
    return users.find((u) => u.workspaceId == null && u.email === e) ?? null;
  }
  function authTenant(
    workspaceId: string,
    email: string,
    passwordHash: string,
  ) {
    const u = findTenant(workspaceId, email);
    if (!u || u.password !== passwordHash) return null;
    return u;
  }

  // same email can exist in both workspaces
  assert.ok(findTenant(WS_A, EMAIL));
  assert.ok(findTenant(WS_B, EMAIL));
  assert.notEqual(findTenant(WS_A, EMAIL)!.id, findTenant(WS_B, EMAIL)!.id);

  // Password-A cannot authenticate B
  assert.equal(authTenant(WS_B, EMAIL, "hash-A"), null);
  assert.equal(authTenant(WS_A, EMAIL, "hash-B"), null);
  assert.equal(authTenant(WS_A, EMAIL, "hash-A")?.name, "Profile-A");
  assert.equal(authTenant(WS_B, EMAIL, "hash-B")?.name, "Profile-B");

  // Profile A never appears as B
  assert.notEqual(
    authTenant(WS_A, EMAIL, "hash-A")!.name,
    authTenant(WS_B, EMAIL, "hash-B")!.name,
  );

  // NULL orphan does not resolve on tenant login/signup lookup
  assert.equal(findTenant(WS_A, EMAIL)?.id, "user_a");
  assert.notEqual(findTenant(WS_A, EMAIL)?.id, "orphan");
  // orphan does not block tenant signup (tenant lookup misses orphan)
  const orphanEmail = "orphan-only@example.com";
  users.push({
    id: "orphan2",
    email: orphanEmail,
    workspaceId: null,
    password: "x",
    name: "Orphan2",
  });
  assert.equal(findTenant(WS_A, orphanEmail), null);
  assert.ok(findNull(orphanEmail));

  // Platform NULL user cannot tenant-login
  assert.equal(findTenant(WS_A, "teamalisyed@gmail.com"), null);
  assert.ok(findNull("teamalisyed@gmail.com"));

  // Omer split fixture: same email, Houzzat consumer vs RE/MAX staff rows
  const houzzat = {
    id: "omer_houzzat",
    email: "omsyed88@gmail.com",
    workspaceId: WS_A,
    password: "shared-then-diverges",
    name: "Omer Consumer",
  };
  const remax = {
    id: "omer_remax",
    email: "omsyed88@gmail.com",
    workspaceId: WS_B,
    password: "shared-then-diverges",
    name: "Omer Staff",
  };
  users.push(houzzat, remax);
  assert.equal(findTenant(WS_A, "omsyed88@gmail.com")?.id, "omer_houzzat");
  assert.equal(findTenant(WS_B, "omsyed88@gmail.com")?.id, "omer_remax");
  // passwords can diverge after split
  remax.password = "remax-only";
  assert.equal(authTenant(WS_A, "omsyed88@gmail.com", "shared-then-diverges")?.id, "omer_houzzat");
  assert.equal(authTenant(WS_B, "omsyed88@gmail.com", "shared-then-diverges"), null);
  assert.equal(authTenant(WS_B, "omsyed88@gmail.com", "remax-only")?.id, "omer_remax");

  console.log("[phase3] dual-workspace identity model... PASS");
}

function testSourceGuards() {
  const auth = read("src/lib/auth.ts");
  const signup = read("src/app/api/auth/sign-up/route.ts");
  const boundary = read("src/lib/tenancy/tenant-auth-boundary.ts");
  const reset = read("src/lib/auth/password-reset.ts");
  const verify = read("src/lib/auth/email-verification.ts");
  const migration = read(
    "prisma/migrations/20260922170000_phase3_workspace_email_uniqueness/migration.sql",
  );
  const schema = read("prisma/schema.prisma");

  assert.ok(auth.includes("findTenantUserByEmail"));
  assert.ok(auth.includes("findNullWorkspaceUserByEmail"));
  assert.equal(
    /allowDangerousEmailAccountLinking:\s*true/.test(auth),
    false,
  );
  assert.equal(auth.includes('from "next-auth/providers/google"'), false);
  assert.ok(auth.includes("assertTokenWorkspaceBinding"));

  assert.ok(signup.includes("findTenantUserIdByEmail"));
  assert.ok(signup.includes("workspaceId"));
  assert.equal(signup.includes("findUnique({\n      where: { email }"), false);

  assert.ok(
    boundary.includes("user.workspaceId === resolvedWorkspaceId"),
    "consumer auth must require matching workspaceId",
  );
  assert.equal(
    boundary.includes("Consumers are authorized to sign in on active tenant websites."),
    false,
    "legacy global consumer exception must be removed",
  );

  assert.ok(reset.includes("tenantBoundTokenIdentifier"));
  assert.ok(reset.includes("findTenantUserByEmail"));
  assert.ok(verify.includes("tenantBoundTokenIdentifier"));
  assert.ok(verify.includes("findTenantUserByEmail"));

  assert.ok(migration.includes("User_workspaceId_email_tenant_key"));
  assert.ok(migration.includes("User_email_null_workspace_key"));
  assert.ok(migration.includes("DROP INDEX IF EXISTS \"User_email_key\""));
  assert.ok(migration.includes("Account_workspace_provider_account_tenant_key"));

  assert.ok(schema.includes("email                  String"));
  assert.equal(
    /email\s+String\s+@unique/.test(schema.split("model User")[1]!.split("model Account")[0]!),
    false,
    "User.email must not retain @unique",
  );
  assert.equal(
    schema.includes("@@unique([provider, providerAccountId])"),
    false,
    "Account must not keep global provider unique",
  );

  // Maria independence still guarded by Phase 0 join removal
  assert.equal(
    auth.includes("joinConsumerToTenantWorkspaceLead"),
    false,
  );

  console.log("[phase3] source guards (auth/signup/oauth/migration)... PASS");
}

function testOmerSplitToolingExists() {
  const split = read("scripts/identity-phase3-omer-split.ts");
  assert.ok(split.includes("applyHardBlocked"));
  assert.ok(split.includes("HARD-BLOCKED"));
  assert.ok(split.includes("EXACT PRODUCTION CUTOVER ORDER"));
  assert.ok(split.includes("Do NOT copy"));
  assert.ok(split.includes("cmsgv80pa0004psp7xl2l2yzj"));
  console.log("[phase3] Omer split PLAN tooling... PASS");
}

function main() {
  testTokenIdentifiersAreTenantBound();
  testJwtWorkspaceBinding();
  testInMemoryDualWorkspaceIdentityModel();
  testSourceGuards();
  testOmerSplitToolingExists();
  console.log("\n[identity-phase3-isolation] ALL PASS\n");
}

main();
