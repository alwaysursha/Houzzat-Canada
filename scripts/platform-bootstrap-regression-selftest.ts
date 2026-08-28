/**
 * Stage 3K.5.14 — Platform Bootstrap & Admin Surface Regression Selftest.
 *
 * Verifies:
 * 1. Houzzat ADMIN platform bootstrap flow (app.houzzatpro.com -> houzzat.com -> /admin)
 * 2. Tenant Canary OWNER platform bootstrap flow (app.houzzatpro.com -> tenant-canary.houzzatpro.com -> /admin)
 * 3. AGENT role bootstrap destinations (/agent)
 * 4. Multi-workspace selector state
 * 5. Admin page surface resolution parity (no blank renders)
 * 6. UI safety and non-null transition/error fallback guarantees
 *
 * Run: pnpm platform-bootstrap:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isPlatformMobileBootstrapHost,
  shouldRunProWorkspaceBootstrap,
} from "../src/lib/mobile/platform-bootstrap";
import {
  resolveMobileWorkspaceBootstrapState,
  type MobileBootstrapMembership,
} from "../src/lib/mobile/workspace-bootstrap";
import { resolveWorkspaceMemberMobileDestination } from "../src/lib/mobile/workspace-destination";
import {
  resolveAdminSurfaceMode,
} from "../src/lib/admin/tenant-command-centre-auth";
import {
  HOUZZAT_FIXTURE_WORKSPACE_ID,
} from "../src/lib/tenancy/test-fixtures/tenant-b-lead-routing";
import { TENANT_B_TEST_WORKSPACE_ID } from "../src/lib/tenancy/test-fixtures/tenant-b-brand";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function createMembership(
  partial: Partial<MobileBootstrapMembership> &
    Pick<MobileBootstrapMembership, "workspaceId" | "role" | "slug" | "canonicalHostname">,
): MobileBootstrapMembership {
  return {
    name: partial.slug,
    displayName: partial.displayName ?? partial.slug,
    primaryColor: partial.primaryColor ?? "#0B5C49",
    canonicalOrigin: `https://${partial.canonicalHostname}`,
    ...partial,
  };
}

function testHouzzatAdminPlatformBootstrapFlow() {
  const houzzatAdmin = createMembership({
    workspaceId: HOUZZAT_FIXTURE_WORKSPACE_ID,
    role: "ADMIN",
    slug: "houzzat",
    displayName: "Houzzat Real Estate",
    canonicalHostname: "houzzat.com",
  });

  // On platform bootstrap host
  const bootstrapState = resolveMobileWorkspaceBootstrapState({
    authenticated: true,
    requestHostname: "app.houzzatpro.com",
    memberships: [houzzatAdmin],
    currentHostMembership: null,
  });

  assert.equal(bootstrapState.kind, "handoff");
  if (bootstrapState.kind === "handoff") {
    assert.equal(bootstrapState.membership.workspaceId, HOUZZAT_FIXTURE_WORKSPACE_ID);
    assert.equal(bootstrapState.membership.canonicalHostname, "houzzat.com");
    const dest = resolveWorkspaceMemberMobileDestination(bootstrapState.membership.role);
    assert.equal(dest, "/admin");
  }

  // Once arrived on tenant destination host
  const arrivedState = resolveMobileWorkspaceBootstrapState({
    authenticated: true,
    requestHostname: "houzzat.com",
    memberships: [houzzatAdmin],
    currentHostMembership: houzzatAdmin,
  });

  assert.equal(arrivedState.kind, "tenant_destination");
  if (arrivedState.kind === "tenant_destination") {
    assert.equal(arrivedState.destination, "/admin");
    assert.equal(arrivedState.membership.workspaceId, HOUZZAT_FIXTURE_WORKSPACE_ID);
  }
}

function testCanaryOwnerPlatformBootstrapFlow() {
  const canaryOwner = createMembership({
    workspaceId: TENANT_B_TEST_WORKSPACE_ID,
    role: "OWNER",
    slug: "tenant-canary",
    displayName: "Canary Brokerage",
    canonicalHostname: "tenant-canary.houzzatpro.com",
  });

  // On platform bootstrap host
  const bootstrapState = resolveMobileWorkspaceBootstrapState({
    authenticated: true,
    requestHostname: "app.houzzatpro.com",
    memberships: [canaryOwner],
    currentHostMembership: null,
  });

  assert.equal(bootstrapState.kind, "handoff");
  if (bootstrapState.kind === "handoff") {
    assert.equal(bootstrapState.membership.workspaceId, TENANT_B_TEST_WORKSPACE_ID);
    assert.equal(bootstrapState.membership.canonicalHostname, "tenant-canary.houzzatpro.com");
    const dest = resolveWorkspaceMemberMobileDestination(bootstrapState.membership.role);
    assert.equal(dest, "/admin");
  }

  // Once arrived on canary tenant host
  const arrivedState = resolveMobileWorkspaceBootstrapState({
    authenticated: true,
    requestHostname: "tenant-canary.houzzatpro.com",
    memberships: [canaryOwner],
    currentHostMembership: canaryOwner,
  });

  assert.equal(arrivedState.kind, "tenant_destination");
  if (arrivedState.kind === "tenant_destination") {
    assert.equal(arrivedState.destination, "/admin");
    assert.equal(arrivedState.membership.workspaceId, TENANT_B_TEST_WORKSPACE_ID);
  }
}

function testAgentDestinationRoleFlow() {
  const houzzatAgent = createMembership({
    workspaceId: HOUZZAT_FIXTURE_WORKSPACE_ID,
    role: "AGENT",
    slug: "houzzat",
    canonicalHostname: "houzzat.com",
  });

  const bootstrapState = resolveMobileWorkspaceBootstrapState({
    authenticated: true,
    requestHostname: "app.houzzatpro.com",
    memberships: [houzzatAgent],
    currentHostMembership: null,
  });

  assert.equal(bootstrapState.kind, "handoff");
  if (bootstrapState.kind === "handoff") {
    const dest = resolveWorkspaceMemberMobileDestination(bootstrapState.membership.role);
    assert.equal(dest, "/agent");
  }
}

function testMultiWorkspaceSelectorFlow() {
  const ws1 = createMembership({
    workspaceId: HOUZZAT_FIXTURE_WORKSPACE_ID,
    role: "ADMIN",
    slug: "houzzat",
    canonicalHostname: "houzzat.com",
  });
  const ws2 = createMembership({
    workspaceId: TENANT_B_TEST_WORKSPACE_ID,
    role: "AGENT",
    slug: "tenant-canary",
    canonicalHostname: "tenant-canary.houzzatpro.com",
  });

  const bootstrapState = resolveMobileWorkspaceBootstrapState({
    authenticated: true,
    requestHostname: "app.houzzatpro.com",
    memberships: [ws1, ws2],
    currentHostMembership: null,
  });

  assert.equal(bootstrapState.kind, "select_workspace");
  if (bootstrapState.kind === "select_workspace") {
    assert.equal(bootstrapState.memberships.length, 2);
  }
}

function testSurfaceResolutionParity() {
  // Test surface resolution across hosts
  // On tenant canary in workspace mode
  process.env.TENANT_DOMAIN_SCOPE = "workspace";
  const canarySurface = resolveAdminSurfaceMode("tenant-canary.houzzatpro.com");
  assert.equal(canarySurface, "tenant");

  const bootstrapHostSurfaceWs = resolveAdminSurfaceMode("app.houzzatpro.com");
  assert.equal(bootstrapHostSurfaceWs, "deny");

  delete process.env.TENANT_DOMAIN_SCOPE;

  // Admin page uses resolveAdminPageSurface unified helper
  const adminPageCode = read("src/app/(admin)/admin/page.tsx");
  assert.ok(adminPageCode.includes("resolveAdminPageSurface()"));
  assert.ok(adminPageCode.includes("TenantCommandCentreOverview"));
  assert.ok(adminPageCode.includes("loadAdminCriticalStats()"));

  // Admin layout uses AdminShell and handles surface modes
  const adminLayoutCode = read("src/app/(admin)/admin/layout.tsx");
  assert.ok(adminLayoutCode.includes("resolveAdminSurfaceMode(hostname)"));
  assert.ok(adminLayoutCode.includes("StaffRouteConsumerGate"));
}

function testSafeUiNoBlankScreens() {
  const bootstrapCode = read("src/components/mobile/ProWorkspaceBootstrap.tsx");
  const handoffExchangeCode = read("src/components/mobile/ProMobileHandoffExchange.tsx");
  const transitionCode = read("src/components/mobile/ProWorkspaceTransition.tsx");

  // Transition UI is styled and viewport locked
  assert.ok(transitionCode.includes("ProWorkspaceTransition"));
  assert.ok(transitionCode.includes("overflow-hidden"));
  assert.ok(transitionCode.includes("HouzzatProMark"));

  // Bootstrap returns transition UI on loading/handoff and explicit error views on failure
  assert.ok(bootstrapCode.includes("<ProWorkspaceTransition />"));
  assert.ok(bootstrapCode.includes("Unable to load workspaces"));
  assert.ok(bootstrapCode.includes("No active workspace"));

  // Handoff exchange component has fallback transition and visible error states
  assert.ok(handoffExchangeCode.includes("<ProWorkspaceTransition />"));
  assert.ok(handoffExchangeCode.includes("Workspace handoff failed"));
}

function main() {
  testHouzzatAdminPlatformBootstrapFlow();
  testCanaryOwnerPlatformBootstrapFlow();
  testAgentDestinationRoleFlow();
  testMultiWorkspaceSelectorFlow();
  testSurfaceResolutionParity();
  testSafeUiNoBlankScreens();
  console.log("platform-bootstrap:selftest OK");
}

main();
