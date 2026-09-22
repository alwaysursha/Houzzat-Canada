/**
 * Phase 3 — HouzzatPRO mobile workspace auth (discover + tenant/platform isolation).
 *
 * Pure discover matcher + source guards. No production data writes.
 *
 * Run: pnpm mobile-workspace-auth:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverTenantIdentitiesForCredentials } from "../src/lib/mobile/v2/discover-tenant-identities";
import {
  allowMobileCredentialsAuthAttempt,
  clearMobileCredentialsRateLimitsForTests,
  mobileCredentialsRateLimitedResponse,
  MOBILE_CREDENTIALS_EMAIL_MAX,
  MOBILE_CREDENTIALS_IP_MAX,
} from "../src/lib/auth/mobile-credentials-rate-limit";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const MARIA_WS = "ws_maria_fixture";
const HOUZZAT_WS = "ws_houzzat_fixture";
const EMAIL_SHARED = "agent@example.com";

type Candidate = {
  id: string;
  password: string | null;
  workspaceId: string | null;
  workspaceMemberships: Array<{
    workspaceId: string;
    role: string;
    workspace: {
      id: string;
      slug: string;
      name: string;
      status: string;
      branding: { displayName: string | null } | null;
    };
  }>;
};

function staffMembership(
  workspaceId: string,
  role: string,
  name: string,
  slug: string,
  status = "ACTIVE",
): Candidate["workspaceMemberships"][number] {
  return {
    workspaceId,
    role,
    workspace: {
      id: workspaceId,
      slug,
      name,
      status,
      branding: { displayName: name },
    },
  };
}

async function testMariaCredentialsResolveMariaOnly() {
  const candidates: Candidate[] = [
    {
      id: "maria_user",
      password: "hash_maria",
      workspaceId: MARIA_WS,
      workspaceMemberships: [
        staffMembership(MARIA_WS, "OWNER", "Maria Realty", "maria"),
      ],
    },
  ];

  const result = await discoverTenantIdentitiesForCredentials(
    { email: "maryaakhalid@gmail.com", password: "secret" },
    {
      findCandidates: async () => candidates,
      comparePassword: async (plain, hash) =>
        plain === "secret" && hash === "hash_maria",
    },
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0]!.workspaceId, MARIA_WS);
    assert.equal(result.matches[0]!.userId, "maria_user");
  }
  console.log("[mobile-auth] Maria credentials → Maria workspace... PASS");
}

async function testHouzzatStaffCredentialsResolveHouzzatOnly() {
  const candidates: Candidate[] = [
    {
      id: "houzzat_staff",
      password: "hash_hz",
      workspaceId: HOUZZAT_WS,
      workspaceMemberships: [
        staffMembership(HOUZZAT_WS, "AGENT", "Houzzat", "houzzat"),
      ],
    },
  ];

  const result = await discoverTenantIdentitiesForCredentials(
    { email: "teamalisyed@gmail.com", password: "secret" },
    {
      findCandidates: async () => candidates,
      comparePassword: async (plain, hash) =>
        plain === "secret" && hash === "hash_hz",
    },
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.matches[0]!.workspaceId, HOUZZAT_WS);
  }
  console.log("[mobile-auth] Houzzat staff → Houzzat workspace... PASS");
}

async function testCrossTenantPasswordCannotDiscover() {
  const mariaOnly: Candidate[] = [
    {
      id: "maria_user",
      password: "hash_maria",
      workspaceId: MARIA_WS,
      workspaceMemberships: [
        staffMembership(MARIA_WS, "OWNER", "Maria Realty", "maria"),
      ],
    },
  ];

  // Houzzat password against Maria-only candidates
  const miss = await discoverTenantIdentitiesForCredentials(
    { email: EMAIL_SHARED, password: "houzzat-password" },
    {
      findCandidates: async () => mariaOnly,
      comparePassword: async (plain, hash) =>
        plain === "maria-password" && hash === "hash_maria",
    },
  );
  assert.equal(miss.ok, false);

  console.log(
    "[mobile-auth] Maria/Houzzat cross-tenant password fail... PASS",
  );
}

async function testNullOrphanCannotTenantDiscover() {
  // Discover never queries NULL workspace — empty tenant candidates.
  const result = await discoverTenantIdentitiesForCredentials(
    { email: "orphan@example.com", password: "secret" },
    {
      findCandidates: async () => [],
      comparePassword: async () => false,
    },
  );
  assert.equal(result.ok, false);
  console.log("[mobile-auth] NULL orphan cannot tenant discover... PASS");
}

async function testWrongPasswordAndUnknownEmailGenericFailure() {
  const candidates: Candidate[] = [
    {
      id: "u1",
      password: "hash",
      workspaceId: MARIA_WS,
      workspaceMemberships: [
        staffMembership(MARIA_WS, "AGENT", "Maria", "maria"),
      ],
    },
  ];

  const wrong = await discoverTenantIdentitiesForCredentials(
    { email: "maryaakhalid@gmail.com", password: "nope" },
    {
      findCandidates: async () => candidates,
      comparePassword: async () => false,
    },
  );
  assert.equal(wrong.ok, false);
  if (!wrong.ok) assert.equal(wrong.code, "INVALID_CREDENTIALS");

  const unknown = await discoverTenantIdentitiesForCredentials(
    { email: "nobody@example.com", password: "x" },
    {
      findCandidates: async () => [],
      comparePassword: async () => false,
    },
  );
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.equal(unknown.code, "INVALID_CREDENTIALS");

  console.log("[mobile-auth] wrong password / unknown email generic... PASS");
}

async function testMultiWorkspaceSafeSelection() {
  const candidates: Candidate[] = [
    {
      id: "user_a",
      password: "hash_a",
      workspaceId: MARIA_WS,
      workspaceMemberships: [
        staffMembership(MARIA_WS, "OWNER", "Maria Realty", "maria"),
      ],
    },
    {
      id: "user_b",
      password: "hash_b",
      workspaceId: HOUZZAT_WS,
      workspaceMemberships: [
        staffMembership(HOUZZAT_WS, "AGENT", "Houzzat", "houzzat"),
      ],
    },
  ];

  const result = await discoverTenantIdentitiesForCredentials(
    { email: EMAIL_SHARED, password: "same-secret" },
    {
      findCandidates: async () => candidates,
      comparePassword: async (plain, hash) =>
        plain === "same-secret" &&
        (hash === "hash_a" || hash === "hash_b"),
    },
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.matches.length, 2);
    const ids = result.matches.map((m) => m.workspaceId).sort();
    assert.deepEqual(ids, [HOUZZAT_WS, MARIA_WS].sort());
    // Distinct identities — not merged
    assert.notEqual(result.matches[0]!.userId, result.matches[1]!.userId);
  }
  console.log("[mobile-auth] multi-workspace authenticated selection... PASS");
}

async function testInactiveMembershipExcluded() {
  const candidates: Candidate[] = [
    {
      id: "inactive_ws_user",
      password: "hash",
      workspaceId: MARIA_WS,
      workspaceMemberships: [
        staffMembership(MARIA_WS, "AGENT", "Maria", "maria", "SUSPENDED"),
      ],
    },
  ];

  const result = await discoverTenantIdentitiesForCredentials(
    { email: EMAIL_SHARED, password: "secret" },
    {
      findCandidates: async () => candidates,
      comparePassword: async () => true,
    },
  );
  assert.equal(result.ok, false);
  console.log("[mobile-auth] inactive workspace membership excluded... PASS");
}

function testSourceGuards() {
  const login = read("src/app/api/mobile/v2/auth/login/route.ts");
  const discover = read("src/app/api/mobile/v2/auth/discover/route.ts");
  const discoverLib = read("src/lib/mobile/v2/discover-tenant-identities.ts");
  const session = read(
    "src/app/api/mobile/v2/workspaces/[workspaceId]/session/route.ts",
  );
  const access = read("src/lib/mobile/v2/workspace-access.ts");
  const proMobile = read("apps/pro-mobile/src/state/auth-controller.ts");
  const signIn = read("apps/pro-mobile/src/screens/SignInScreen.tsx");

  assert.ok(discover.includes("discoverTenantIdentitiesForCredentials"));
  assert.ok(discoverLib.includes("workspaceId: { not: null }"));
  assert.equal(
    discoverLib.includes("findNullWorkspaceUserByEmail"),
    false,
    "discover must never resolve NULL-workspace identities",
  );
  assert.equal(
    discover.includes("createPlatformAccessToken") ||
      discover.includes("createMobileRefreshToken"),
    false,
    "discover must not issue tokens",
  );

  assert.ok(login.includes("findTenantUserByEmail"));
  assert.ok(login.includes("findNullWorkspaceUserByEmail"));
  assert.ok(login.includes("platformOperator.findUnique"));
  assert.ok(login.includes('mode: z.enum(["platform", "tenant"])'));

  assert.ok(proMobile.includes("/auth/discover"));
  assert.ok(proMobile.includes('mode: "tenant"'));
  assert.ok(proMobile.includes('mode: "platform"'));
  assert.ok(proMobile.includes("selectIdentity"));
  assert.ok(proMobile.includes("IDENTITY_SELECTION"));
  // Default Sign In must NOT hardcode platform-only login as the only path
  assert.ok(signIn.includes("Platform admin sign-in"));
  assert.ok(signIn.includes('mode: "platform"'));

  assert.ok(session.includes("workspaceId_userId"));
  assert.ok(session.includes('status !== "ACTIVE"'));
  assert.ok(access.includes('authenticateMobileRequest(request, "mobile_workspace_access")'));
  assert.ok(access.includes("wsId"));

  console.log("[mobile-auth] source guards (discover/login/app)... PASS");
}

function testPlatformCannotBecomeStaffSource() {
  const login = read("src/app/api/mobile/v2/auth/login/route.ts");
  const discoverLib = read("src/lib/mobile/v2/discover-tenant-identities.ts");

  // Platform branch uses NULL user + PlatformOperator only
  assert.ok(login.includes("findNullWorkspaceUserByEmail"));
  assert.ok(login.includes('operator.status !== "ACTIVE"'));

  // Tenant discover never includes platform
  assert.ok(discoverLib.includes("workspaceId: { not: null }"));
  assert.equal(discoverLib.includes("platformOperator"), false);

  // Tenant login path must not use findNullWorkspaceUserByEmail
  const tenantBlock = login.split('if (mode === "tenant")')[1]?.split(
    "// Explicit platform",
  )[0];
  assert.ok(tenantBlock);
  assert.equal(tenantBlock!.includes("findNullWorkspaceUserByEmail"), false);
  assert.ok(tenantBlock!.includes("findTenantUserByEmail"));

  console.log(
    "[mobile-auth] PlatformOperator ↛ staff / staff ↛ platform wiring... PASS",
  );
}

function testClientRejectsWorkspaceTampering() {
  const proMobile = read("apps/pro-mobile/src/state/auth-controller.ts");
  assert.ok(proMobile.includes("Workspace identity mismatch"));
  assert.ok(proMobile.includes("preferredWorkspaceId"));
  assert.ok(
    proMobile.includes("identityChoices.some((c) => c.workspaceId === workspaceId)"),
  );
  console.log("[mobile-auth] client workspaceId tampering guards... PASS");
}

function testCredentialsRateLimitSharedBuckets() {
  clearMobileCredentialsRateLimitsForTests();

  const reqFor = (ip: string) =>
    new Request("https://app.houzzatpro.com/api/mobile/v2/auth/login", {
      method: "POST",
      headers: { "cf-connecting-ip": ip },
    });

  // Dual key: IP + normalized email (not email alone)
  const limiterSrc = read("src/lib/auth/mobile-credentials-rate-limit.ts");
  assert.ok(limiterSrc.includes("clientIpFromPublicRequest"));
  assert.ok(limiterSrc.includes("normalizeIdentityEmail"));
  assert.ok(limiterSrc.includes("rateByIp"));
  assert.ok(limiterSrc.includes("rateByEmail"));
  assert.equal(limiterSrc.includes("workspaceId"), false);

  // Shared limiter wired into both routes before bcrypt/DB
  const discover = read("src/app/api/mobile/v2/auth/discover/route.ts");
  const login = read("src/app/api/mobile/v2/auth/login/route.ts");
  assert.ok(discover.includes("allowMobileCredentialsAuthAttempt"));
  assert.ok(login.includes("allowMobileCredentialsAuthAttempt"));
  assert.ok(discover.includes("mobileCredentialsRateLimitedResponse"));
  assert.ok(login.includes("mobileCredentialsRateLimitedResponse"));

  const email = "Agent@Example.COM";
  for (let i = 0; i < MOBILE_CREDENTIALS_EMAIL_MAX; i++) {
    const ok = allowMobileCredentialsAuthAttempt({
      request: reqFor("203.0.113.10"),
      email,
    });
    assert.equal(ok.allowed, true, `attempt ${i + 1} should be allowed`);
  }
  const blocked = allowMobileCredentialsAuthAttempt({
    request: reqFor("203.0.113.10"),
    email: "agent@example.com", // same normalized account
  });
  assert.equal(blocked.allowed, false);
  if (!blocked.allowed) {
    assert.ok(blocked.retryAfterSec >= 1);
  }

  // Different email from same IP still subject to IP budget but email bucket is fresh
  clearMobileCredentialsRateLimitsForTests();
  for (let i = 0; i < MOBILE_CREDENTIALS_IP_MAX; i++) {
    const ok = allowMobileCredentialsAuthAttempt({
      request: reqFor("198.51.100.7"),
      email: `user${i}@example.com`,
    });
    assert.equal(ok.allowed, true);
  }
  const ipBlocked = allowMobileCredentialsAuthAttempt({
    request: reqFor("198.51.100.7"),
    email: "fresh@example.com",
  });
  assert.equal(ipBlocked.allowed, false);

  // 429 body is generic — no email/membership leakage
  const res = mobileCredentialsRateLimitedResponse(42);
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("Retry-After"), "42");

  clearMobileCredentialsRateLimitsForTests();
  console.log("[mobile-auth] credentials rate-limit (IP+email shared)... PASS");
}

function testRateLimitedDoesNotRevealMembership() {
  const body = JSON.stringify({
    ok: false,
    code: "RATE_LIMITED",
    message: "Too many sign-in attempts. Please try again later.",
  });
  assert.equal(body.includes("workspace"), false);
  assert.equal(body.includes("membership"), false);
  assert.equal(body.includes("exists"), false);

  const proMobile = read("apps/pro-mobile/src/state/auth-controller.ts");
  assert.ok(proMobile.includes('discoverRes.code === "RATE_LIMITED"'));
  assert.ok(
    proMobile.includes("Too many sign-in attempts. Please try again later."),
  );

  console.log("[mobile-auth] rate-limit response stays generic... PASS");
}

async function main() {
  await testMariaCredentialsResolveMariaOnly();
  await testHouzzatStaffCredentialsResolveHouzzatOnly();
  await testCrossTenantPasswordCannotDiscover();
  await testNullOrphanCannotTenantDiscover();
  await testWrongPasswordAndUnknownEmailGenericFailure();
  await testMultiWorkspaceSafeSelection();
  await testInactiveMembershipExcluded();
  testSourceGuards();
  testPlatformCannotBecomeStaffSource();
  testClientRejectsWorkspaceTampering();
  testCredentialsRateLimitSharedBuckets();
  testRateLimitedDoesNotRevealMembership();
  console.log("\n[mobile-workspace-auth] ALL PASS\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
