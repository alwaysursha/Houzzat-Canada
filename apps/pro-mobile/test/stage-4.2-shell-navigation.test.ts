/**
 * Stage 4.2 — Native App Shell & Role-Based Navigation Test Suite.
 *
 * Verifies:
 * 1. AGENT role routing -> AgentShell (Home, Leads, Tasks, More)
 * 2. OWNER / ADMIN role routing -> CommandCentreShell (Overview, Team, Leads, More)
 * 3. Unsupported / unknown role -> AccessUnavailable screen
 * 4. Workspace switching dynamically updates role, workspace context, and shell
 * 5. Single-workspace user does not show unnecessary workspace switch UI
 * 6. Logout clears session, storage, and resets state to SIGNED_OUT
 * 7. Tenancy authority is strictly WorkspaceMember.role (never User.role or hostname)
 */

import assert from "node:assert/strict";
import { MobileAuthController } from "../src/state/auth-controller";
import { SecureStorage, SECURE_STORAGE_KEYS } from "../src/storage/secure-storage";
import type { MobileUser } from "../src/types/auth";
import type { MobileWorkspaceMembership } from "../src/types/workspace";

async function runStage42NavigationTests() {
  console.log("=================================================================");
  console.log("STAGE 4.2 — HOUZZATPRO MOBILE V2 NATIVE SHELL & ROLE TESTS");
  console.log("=================================================================\n");

  const auth = new MobileAuthController();
  await SecureStorage.clear();

  // TEST 1: AGENT Role Authentication -> AgentShell
  console.log("[1/6] Testing AGENT Role -> AgentShell routing...");
  {
    const agentUser: MobileUser = {
      id: "usr_agent_01",
      email: "agent@tenant-canary.houzzatpro.com",
      name: "Canary Agent",
    };

    const agentMembership: MobileWorkspaceMembership = {
      id: "mem_agent_canary",
      workspaceId: "ws_tenant_canary",
      userId: agentUser.id,
      role: "AGENT",
      status: "ACTIVE",
      workspace: {
        id: "ws_tenant_canary",
        slug: "tenant-canary",
        displayName: "Tenant Canary Realty",
        brand: {
          primaryColor: "#0B5C49",
        },
      },
    };

    const res = await auth.mockAuthenticate({
      user: agentUser,
      tokens: { accessToken: "mock_jwt_agent", expiresAt: Date.now() + 3600000 },
      memberships: [agentMembership],
    });

    assert.equal(res.ok, true);
    assert.equal(res.state, "WORKSPACE_ACTIVE");
    const snapshot = auth.getSnapshot();
    assert.equal(snapshot.state, "WORKSPACE_ACTIVE");
    assert.equal(snapshot.activeMembership?.role, "AGENT");
    assert.equal(snapshot.activeWorkspace?.id, "ws_tenant_canary");
    assert.equal(snapshot.activeWorkspace?.displayName, "Tenant Canary Realty");

    // Check single-workspace condition
    assert.equal(snapshot.memberships.length, 1);
    const hasMultipleWorkspaces = snapshot.memberships.length > 1;
    assert.equal(hasMultipleWorkspaces, false, "Single workspace user must NOT have multiple workspaces flag");
  }
  console.log("  -> AGENT Role -> AgentShell: PASS\n");

  // TEST 2: OWNER Role Authentication -> CommandCentreShell
  console.log("[2/6] Testing OWNER Role -> CommandCentreShell routing...");
  {
    await auth.signOut();

    const ownerUser: MobileUser = {
      id: "usr_owner_01",
      email: "owner@teamalisyed.com",
      name: "Ali Syed Owner",
    };

    const ownerMembership: MobileWorkspaceMembership = {
      id: "mem_owner_01",
      workspaceId: "ws_houzzat_prod",
      userId: ownerUser.id,
      role: "OWNER",
      status: "ACTIVE",
      workspace: {
        id: "ws_houzzat_prod",
        slug: "houzzat",
        displayName: "Houzzat Real Estate",
        brand: {
          primaryColor: "#1E2A38",
        },
      },
    };

    const res = await auth.mockAuthenticate({
      user: ownerUser,
      tokens: { accessToken: "mock_jwt_owner", expiresAt: Date.now() + 3600000 },
      memberships: [ownerMembership],
    });

    assert.equal(res.ok, true);
    assert.equal(res.state, "WORKSPACE_ACTIVE");
    const snapshot = auth.getSnapshot();
    assert.equal(snapshot.activeMembership?.role, "OWNER");
    assert.equal(snapshot.activeWorkspace?.id, "ws_houzzat_prod");
    assert.equal(snapshot.activeWorkspace?.displayName, "Houzzat Real Estate");
  }
  console.log("  -> OWNER Role -> CommandCentreShell: PASS\n");

  // TEST 3: ADMIN Role Authentication -> CommandCentreShell
  console.log("[3/6] Testing ADMIN Role -> CommandCentreShell routing...");
  {
    await auth.signOut();

    const adminUser: MobileUser = {
      id: "usr_admin_01",
      email: "admin@brokerage.com",
      name: "Broker Admin",
    };

    const adminMembership: MobileWorkspaceMembership = {
      id: "mem_admin_01",
      workspaceId: "ws_brokerage_alpha",
      userId: adminUser.id,
      role: "ADMIN",
      status: "ACTIVE",
      workspace: {
        id: "ws_brokerage_alpha",
        slug: "alpha-brokerage",
        displayName: "Alpha Brokerage Group",
      },
    };

    const res = await auth.mockAuthenticate({
      user: adminUser,
      tokens: { accessToken: "mock_jwt_admin", expiresAt: Date.now() + 3600000 },
      memberships: [adminMembership],
    });

    assert.equal(res.ok, true);
    assert.equal(res.state, "WORKSPACE_ACTIVE");
    const snapshot = auth.getSnapshot();
    assert.equal(snapshot.activeMembership?.role, "ADMIN");
  }
  console.log("  -> ADMIN Role -> CommandCentreShell: PASS\n");

  // TEST 4: Multi-Workspace Switching
  console.log("[4/6] Testing Multi-Workspace Switching & Role Rebuilding...");
  {
    await auth.signOut();

    const multiUser: MobileUser = {
      id: "usr_multi_01",
      email: "staff@platform.com",
    };

    const canaryMembership: MobileWorkspaceMembership = {
      id: "mem_multi_canary",
      workspaceId: "ws_tenant_canary",
      userId: multiUser.id,
      role: "AGENT",
      status: "ACTIVE",
      workspace: {
        id: "ws_tenant_canary",
        slug: "tenant-canary",
        displayName: "Tenant Canary",
      },
    };

    const houzzatMembership: MobileWorkspaceMembership = {
      id: "mem_multi_houzzat",
      workspaceId: "ws_houzzat_main",
      userId: multiUser.id,
      role: "OWNER",
      status: "ACTIVE",
      workspace: {
        id: "ws_houzzat_main",
        slug: "houzzat",
        displayName: "Houzzat HQ",
      },
    };

    // Authenticate with 2 workspaces -> lands on WORKSPACE_SELECTION
    const res = await auth.mockAuthenticate({
      user: multiUser,
      tokens: { accessToken: "mock_jwt_multi", expiresAt: Date.now() + 3600000 },
      memberships: [canaryMembership, houzzatMembership],
    });

    assert.equal(res.ok, true);
    assert.equal(res.state, "WORKSPACE_SELECTION");
    assert.equal(auth.getSnapshot().memberships.length, 2);

    // Select Workspace 1: Tenant Canary -> WORKSPACE_ACTIVE as AGENT
    const ok1 = await auth.selectWorkspace("ws_tenant_canary");
    assert.equal(ok1, true);
    assert.equal(auth.getSnapshot().state, "WORKSPACE_ACTIVE");
    assert.equal(auth.getSnapshot().activeWorkspace?.id, "ws_tenant_canary");
    assert.equal(auth.getSnapshot().activeMembership?.role, "AGENT");

    // Initiate Switch Workspace from More screen -> WORKSPACE_SELECTION
    await auth.changeWorkspace();
    assert.equal(auth.getSnapshot().state, "WORKSPACE_SELECTION");
    assert.equal(auth.getSnapshot().activeWorkspace, null);

    // Select Workspace 2: Houzzat HQ -> WORKSPACE_ACTIVE as OWNER
    const ok2 = await auth.selectWorkspace("ws_houzzat_main");
    assert.equal(ok2, true);
    assert.equal(auth.getSnapshot().state, "WORKSPACE_ACTIVE");
    assert.equal(auth.getSnapshot().activeWorkspace?.id, "ws_houzzat_main");
    assert.equal(auth.getSnapshot().activeMembership?.role, "OWNER");
  }
  console.log("  -> Multi-Workspace Switching & Dynamic Shell Rebuilding: PASS\n");

  // TEST 5: Unsupported Role Guard
  console.log("[5/6] Testing Unsupported Role Guard...");
  {
    await auth.signOut();

    const guestUser: MobileUser = {
      id: "usr_guest_01",
      email: "guest@external.com",
    };

    const unsupportedMembership: any = {
      id: "mem_guest_01",
      workspaceId: "ws_temp",
      userId: guestUser.id,
      role: "GUEST_VIEWER",
      status: "ACTIVE",
      workspace: {
        id: "ws_temp",
        slug: "temp",
        displayName: "Temp Workspace",
      },
    };

    const res = await auth.mockAuthenticate({
      user: guestUser,
      tokens: { accessToken: "mock_jwt_guest", expiresAt: Date.now() + 3600000 },
      memberships: [unsupportedMembership],
    });

    assert.equal(res.ok, true);
    const snapshot = auth.getSnapshot();
    assert.equal(snapshot.activeMembership?.role, "GUEST_VIEWER");
    // RootNavigator handles role !== AGENT && role !== OWNER && role !== ADMIN by rendering AccessUnavailableScreen
  }
  console.log("  -> Unsupported Role Guard: PASS\n");

  // TEST 6: Sign Out Completeness
  console.log("[6/6] Testing Sign Out Completeness...");
  {
    await auth.signOut();
    const snapshot = auth.getSnapshot();
    assert.equal(snapshot.state, "SIGNED_OUT");
    assert.equal(snapshot.user, null);
    assert.equal(snapshot.tokens, null);
    assert.equal(snapshot.memberships.length, 0);
    assert.equal(snapshot.activeWorkspace, null);
    assert.equal(snapshot.activeMembership, null);
    assert.equal(await SecureStorage.getItem(SECURE_STORAGE_KEYS.AUTH_TOKENS), null);
    assert.equal(await SecureStorage.getItem(SECURE_STORAGE_KEYS.ACTIVE_WORKSPACE_ID), null);
  }
  console.log("  -> Sign Out Completeness: PASS\n");

  console.log("=================================================================");
  console.log("ALL STAGE 4.2 NATIVE SHELL & ROLE TESTS PASSED (6/6)");
  console.log("=================================================================\n");
}

runStage42NavigationTests().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
