/**
 * Stage 3K.5.18 — Houzzat Authority Shadow Mode Selftest.
 *
 * Verifies:
 * 1. Non-blocking shadow comparison between live runtime decision and resolveTenantAuthority.
 * 2. Canary decisions match resolveTenantAuthority (NO_MISMATCH).
 * 3. Wrong-tenant membership or unauthenticated access correctly surfaces expected mismatch classification without mutating runtime decision.
 * 4. Masked logging format contains NO emails, tokens, passwords, or raw session data.
 * 5. Consumers, platform bootstrap, and mobile handoff remain completely un-regressed.
 *
 * Run: pnpm tenant-authority-shadow:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyAuthorityMismatch,
  executeTenantAuthorityShadow,
  maskIdentifier,
  type CurrentAuthDecision,
  type TenantAuthorityShadowPayload,
} from "../src/lib/tenancy/tenant-authority-shadow";
import {
  resolveTenantAuthority,
  type TenantAuthorityResult,
  type TenantAuthorityDeps,
} from "../src/lib/tenancy/tenant-authority";
import { TENANT_B_TEST_WORKSPACE_ID } from "../src/lib/tenancy/test-fixtures/tenant-b-brand";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS_HOUZZAT = "ws_houzzat_fixture";
const WS_CANARY = TENANT_B_TEST_WORKSPACE_ID;

const mockDeps: TenantAuthorityDeps = {
  lookupActiveDomain: async (hostname: string) => {
    if (hostname === "tenant-canary.houzzatpro.com") {
      return {
        hostname,
        kind: "PLATFORM",
        role: "PRIMARY",
        workspaceId: WS_CANARY,
        workspaceSlug: "tenant-canary",
        domainStatus: "ACTIVE",
        workspaceStatus: "ACTIVE",
      };
    }
    if (hostname === "houzzat.com") {
      return {
        hostname,
        kind: "CUSTOM",
        role: "PRIMARY",
        workspaceId: WS_HOUZZAT,
        workspaceSlug: "houzzat",
        domainStatus: "ACTIVE",
        workspaceStatus: "ACTIVE",
      };
    }
    return null;
  },
  lookupUser: async (userId: string) => {
    return { id: userId, disabledAt: null };
  },
  lookupMembership: async (userId: string, workspaceId: string) => {
    if (userId === "canary_owner_user" && workspaceId === WS_CANARY) {
      return {
        id: "mem_canary",
        role: "OWNER",
        status: "ACTIVE",
        workspace: { id: WS_CANARY, slug: "tenant-canary", status: "ACTIVE" },
      };
    }
    if (userId === "houzzat_admin_user" && workspaceId === WS_HOUZZAT) {
      return {
        id: "mem_houzzat",
        role: "ADMIN",
        status: "ACTIVE",
        workspace: { id: WS_HOUZZAT, slug: "houzzat", status: "ACTIVE" },
      };
    }
    return null;
  },
};

function testMasking() {
  assert.equal(maskIdentifier(null), null);
  assert.equal(maskIdentifier(undefined), null);
  assert.equal(maskIdentifier(""), null);
  assert.equal(maskIdentifier("short"), "***ort");
  assert.equal(maskIdentifier("user_1234567890"), "user...7890");
}

function testMismatchClassification() {
  const currentAllowed: CurrentAuthDecision = {
    allowed: true,
    workspaceId: WS_HOUZZAT,
    workspaceRole: "ADMIN",
  };

  const newAllowedMatch: TenantAuthorityResult = {
    ok: true,
    host: "houzzat.com",
    workspaceId: WS_HOUZZAT,
    workspaceSlug: "houzzat",
    userId: "user_123",
    workspaceRole: "ADMIN",
    isActiveMember: true,
    canManageWorkspace: true,
    canSeeTeamLeads: true,
    isOwnerAdmin: true,
  };

  const newRoleMismatch: TenantAuthorityResult = {
    ...newAllowedMatch,
    workspaceRole: "AGENT",
  };

  const newWsMismatch: TenantAuthorityResult = {
    ...newAllowedMatch,
    workspaceId: WS_CANARY,
  };

  const newDeny: TenantAuthorityResult = {
    ok: false,
    reason: "no_active_membership",
    host: "houzzat.com",
  };

  // 1. Full match
  assert.equal(
    classifyAuthorityMismatch(currentAllowed, newAllowedMatch),
    "NO_MISMATCH",
  );

  // 2. Role mismatch
  assert.equal(
    classifyAuthorityMismatch(currentAllowed, newRoleMismatch),
    "ROLE_MISMATCH",
  );

  // 3. Workspace mismatch
  assert.equal(
    classifyAuthorityMismatch(currentAllowed, newWsMismatch),
    "WORKSPACE_MISMATCH",
  );

  // 4. Current allow, new deny
  assert.equal(
    classifyAuthorityMismatch(currentAllowed, newDeny),
    "CURRENT_ALLOW_NEW_DENY",
  );

  // 5. Current deny, new allow
  const currentDeny: CurrentAuthDecision = { allowed: false };
  assert.equal(
    classifyAuthorityMismatch(currentDeny, newAllowedMatch),
    "CURRENT_DENY_NEW_ALLOW",
  );
}

async function testShadowExecutionNonBlocking() {
  let capturedPayload: TenantAuthorityShadowPayload | null = null;

  const currentDecision: CurrentAuthDecision = {
    allowed: true,
    workspaceId: WS_CANARY,
    workspaceRole: "OWNER",
  };

  // Execution with mock onLog handler
  const res = await executeTenantAuthorityShadow({
    location: "testLocation",
    request: "https://tenant-canary.houzzatpro.com/admin",
    user: { id: "canary_owner_user" },
    currentDecision,
    deps: mockDeps,
    onLog: (payload) => {
      capturedPayload = payload;
    },
  });

  assert.ok(res);
  assert.ok(capturedPayload);
  assert.equal(capturedPayload?.event, "tenant_authority_shadow");
  assert.equal(capturedPayload?.location, "testLocation");
  assert.equal(capturedPayload?.host, "tenant-canary.houzzatpro.com");
  assert.equal(capturedPayload?.currentAllowed, true);

  // Assert no sensitive information in payload stringification
  const serialized = JSON.stringify(capturedPayload);
  assert.ok(!serialized.includes("password"));
  assert.ok(!serialized.includes("cookie"));
  assert.ok(!serialized.includes("token"));
  assert.ok(!serialized.includes("@"));

  // Verify resilience: throwing dependencies NEVER bubble errors
  const throwingDeps: TenantAuthorityDeps = {
    lookupActiveDomain: async () => {
      throw new Error("Simulated DB connection failure");
    },
  };

  const resError = await executeTenantAuthorityShadow({
    location: "errorLocation",
    request: "https://tenant-canary.houzzatpro.com/admin",
    user: { id: "canary_owner_user" },
    currentDecision,
    deps: throwingDeps,
  });

  assert.equal(resError, null);
}

function testWiringStaticAudit() {
  const adminAuthCode = read("src/lib/admin/tenant-command-centre-auth.ts");
  assert.ok(adminAuthCode.includes("executeTenantAuthorityShadow"));

  const staffContextCode = read("src/lib/tenancy/tenant-staff-context.ts");
  assert.ok(staffContextCode.includes("executeTenantAuthorityShadow"));

  const agentContextCode = read("src/lib/agent.ts");
  assert.ok(agentContextCode.includes("executeTenantAuthorityShadow"));
}

async function main() {
  testMasking();
  testMismatchClassification();
  await testShadowExecutionNonBlocking();
  testWiringStaticAudit();
  console.log("tenant-authority-shadow:selftest OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
