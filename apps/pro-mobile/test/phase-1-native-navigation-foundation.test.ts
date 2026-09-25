/**
 * Phase 1 — Native Navigation foundation tests.
 *
 * Static + auth-controller checks: packages, Android wiring, AppRoot hosting
 * existing shells, auth/workspace authority unchanged. Does not migrate tabs.
 *
 * Run: node --import tsx apps/pro-mobile/test/phase-1-native-navigation-foundation.test.ts
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MobileAuthController } from "../src/state/auth-controller";
import { SecureStorage } from "../src/storage/secure-storage";
import type { MobileUser } from "../src/types/auth";
import type { MobileWorkspaceMembership } from "../src/types/workspace";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");

function readApp(rel: string) {
  return readFileSync(join(APP, rel), "utf8");
}

function pkgJson() {
  return JSON.parse(readApp("package.json")) as {
    dependencies: Record<string, string>;
  };
}

async function run() {
  console.log("=================================================================");
  console.log("PHASE 1 — NATIVE NAVIGATION FOUNDATION");
  console.log("=================================================================\n");

  // --- Packages ---
  console.log("[1] Pinned React Navigation packages...");
  {
    const deps = pkgJson().dependencies;
    assert.equal(deps["@react-navigation/native"], "7.0.14");
    assert.equal(deps["@react-navigation/native-stack"], "7.2.0");
    assert.equal(deps["@react-navigation/bottom-tabs"], "7.2.0");
    assert.equal(deps["react-native-screens"], "4.4.0");
    assert.equal(deps["react-native-safe-area-context"], "5.0.0");
    assert.equal(deps["react-native"], "0.76.7");

    assert.ok(
      existsSync(join(APP, "node_modules/@react-navigation/native/package.json")),
      "native package present",
    );
    assert.ok(
      existsSync(join(APP, "node_modules/react-native-screens/android")),
      "screens android present",
    );
    assert.ok(
      existsSync(
        join(APP, "node_modules/react-native-safe-area-context/android"),
      ),
      "safe-area android present",
    );
  }
  console.log("  -> packages: PASS\n");

  // --- Android native ---
  console.log("[2] Android native wiring...");
  {
    const settings = readApp("android/settings.gradle");
    assert.ok(settings.includes("include ':react-native-screens'"));
    assert.ok(settings.includes("include ':react-native-safe-area-context'"));

    const appGradle = readApp("android/app/build.gradle");
    assert.ok(appGradle.includes("project(':react-native-screens')"));
    assert.ok(appGradle.includes("project(':react-native-safe-area-context')"));

    const mainApp = readApp(
      "android/app/src/main/java/com/houzzat/pro/MainApplication.kt",
    );
    assert.ok(mainApp.includes("RNScreensPackage"));
    assert.ok(mainApp.includes("SafeAreaContextPackage"));

    const mainActivity = readApp(
      "android/app/src/main/java/com/houzzat/pro/MainActivity.kt",
    );
    assert.ok(
      mainActivity.includes("super.onCreate(null)"),
      "screens requires null savedInstanceState",
    );
  }
  console.log("  -> Android wiring: PASS\n");

  // --- Navigator structure ---
  console.log("[3] Navigator structure + AppRoot shells...");
  {
    const app = readApp("App.tsx");
    assert.ok(app.includes("SafeAreaProvider"));
    assert.ok(app.includes("NavigationContainer"));
    assert.ok(app.includes("enableScreens"));
    assert.ok(app.includes("AuthProvider"));

    const root = readApp("src/navigation/RootNavigator.tsx");
    assert.ok(root.includes("createNativeStackNavigator"));
    assert.ok(root.includes('state === "BOOTING"'));
    assert.ok(root.includes('state === "BOOTSTRAP_RETRY"'));
    assert.ok(root.includes('state === "SIGNED_OUT"'));
    assert.ok(root.includes('state === "WORKSPACE_SELECTION"'));
    assert.ok(root.includes('state === "WORKSPACE_ACTIVE"'));
    assert.ok(root.includes("AppRoot"));
    assert.ok(
      !root.includes('from "../screens/AgentShell"'),
      "AgentShell must live in AppRoot, not RootNavigator",
    );
    assert.ok(
      !root.includes('from "../screens/CommandCentreShell"'),
      "CommandCentreShell must live in AppRoot, not RootNavigator",
    );

    const appRoot = readApp("src/navigation/AppRoot.tsx");
    assert.ok(appRoot.includes("AgentShell"));
    assert.ok(appRoot.includes("CommandCentreShell"));
    assert.ok(appRoot.includes("AccessUnavailableScreen"));
    assert.ok(appRoot.includes("activeMembership?.role"));
    assert.ok(
      appRoot.includes('role === "AGENT"') ||
        appRoot.includes('role === "AGENT"'),
    );
    assert.ok(appRoot.includes('role === "OWNER"'));
    assert.ok(appRoot.includes('role === "ADMIN"'));

    // Existing shells must still own their own tab state (not migrated).
    const agent = readApp("src/screens/AgentShell.tsx");
    const cc = readApp("src/screens/CommandCentreShell.tsx");
    assert.ok(agent.includes("createBottomTabNavigator"));
    assert.ok(cc.includes("activeTab") || cc.includes("setActiveTab"));
    assert.ok(
      !cc.includes("@react-navigation/bottom-tabs"),
      "Owner/Admin bottom tabs are not part of Phase 2",
    );
  }
  console.log("  -> navigator structure: PASS\n");

  // --- Auth / workspace authority unchanged ---
  console.log("[4] auth-controller + workspace authority unchanged...");
  {
    const authCtrl = readApp("src/state/auth-controller.ts");
    assert.ok(authCtrl.includes("WORKSPACE_ACTIVE"));
    assert.ok(authCtrl.includes("bootstrap"));
    assert.ok(authCtrl.includes("onAppForeground") || authCtrl.includes("signOut"));

    const root = readApp("src/navigation/RootNavigator.tsx");
    assert.ok(
      root.includes("useAuth"),
      "navigator mirrors auth state, does not own it",
    );
    assert.ok(
      !root.includes("SecureStorage"),
      "navigator must not touch credential storage",
    );
    assert.ok(
      !root.includes("selectWorkspace"),
      "navigator must not select workspace",
    );

    const appRoot = readApp("src/navigation/AppRoot.tsx");
    assert.ok(
      !appRoot.includes("selectWorkspace") && !appRoot.includes("login("),
      "AppRoot must not mutate auth",
    );
  }
  console.log("  -> authority: PASS\n");

  // --- Back machinery preserved (no new BackHandler patch) ---
  console.log("[5] Existing Back machinery preserved...");
  {
    assert.ok(existsSync(join(APP, "src/hooks/useAndroidHardwareBack.ts")));
    assert.ok(existsSync(join(APP, "src/lib/android-back-stack.ts")));
    assert.ok(existsSync(join(APP, "src/lib/android-hardware-back.ts")));
    const root = readApp("src/navigation/RootNavigator.tsx");
    const appRoot = readApp("src/navigation/AppRoot.tsx");
    assert.ok(!root.includes("BackHandler"));
    assert.ok(!appRoot.includes("BackHandler"));
    assert.ok(!root.includes("useAndroidHardwareBack"));
    assert.ok(!appRoot.includes("useAndroidHardwareBack"));
  }
  console.log("  -> Back preserved: PASS\n");

  // --- Auth flows (controller) ---
  console.log("[6] Cold boot / signed-out / sign-in / workspace / shells...");
  {
    await SecureStorage.clear();
    const auth = new MobileAuthController();
    assert.equal(auth.getSnapshot().state, "BOOTING");

    // Signed-out after clear + no credentials path is exercised by mock logout below.
    const agentUser: MobileUser = {
      id: "usr_p1_agent",
      email: "agent@tenant-canary.houzzatpro.com",
      name: "Phase1 Agent",
    };
    const agentMem: MobileWorkspaceMembership = {
      id: "mem_p1_agent",
      workspaceId: "ws_tenant_canary",
      userId: agentUser.id,
      role: "AGENT",
      status: "ACTIVE",
      workspace: {
        id: "ws_tenant_canary",
        slug: "tenant-canary",
        displayName: "Tenant Canary Realty",
        brand: { primaryColor: "#0B5C49" },
      },
    };

    const single = await auth.mockAuthenticate({
      user: agentUser,
      tokens: { accessToken: "mock_jwt_p1_agent", expiresAt: Date.now() + 3600000 },
      memberships: [agentMem],
    });
    assert.equal(single.ok, true);
    assert.equal(single.state, "WORKSPACE_ACTIVE");
    assert.equal(auth.getSnapshot().activeMembership?.role, "AGENT");
    // AppRoot would render AgentShell for AGENT
    assert.equal(auth.getSnapshot().activeWorkspace?.id, "ws_tenant_canary");

    await auth.signOut();
    assert.equal(auth.getSnapshot().state, "SIGNED_OUT");

    // Multi-workspace → selection then OWNER shell
    const ownerUser: MobileUser = {
      id: "usr_p1_owner",
      email: "owner@teamalisyed.com",
      name: "Phase1 Owner",
    };
    const memAgent: MobileWorkspaceMembership = {
      id: "mem_p1_a",
      workspaceId: "ws_a",
      userId: ownerUser.id,
      role: "AGENT",
      status: "ACTIVE",
      workspace: {
        id: "ws_a",
        slug: "ws-a",
        displayName: "Workspace A",
        brand: { primaryColor: "#111" },
      },
    };
    const memOwner: MobileWorkspaceMembership = {
      id: "mem_p1_b",
      workspaceId: "ws_b",
      userId: ownerUser.id,
      role: "OWNER",
      status: "ACTIVE",
      workspace: {
        id: "ws_b",
        slug: "ws-b",
        displayName: "Workspace B",
        brand: { primaryColor: "#222" },
      },
    };

    const multi = await auth.mockAuthenticate({
      user: ownerUser,
      tokens: { accessToken: "mock_jwt_p1_owner", expiresAt: Date.now() + 3600000 },
      memberships: [memAgent, memOwner],
    });
    assert.equal(multi.ok, true);
    const afterLogin = auth.getSnapshot().state;
    assert.ok(
      afterLogin === "WORKSPACE_SELECTION" ||
        afterLogin === "IDENTITY_SELECTION" ||
        afterLogin === "PLATFORM_AUTHENTICATED" ||
        afterLogin === "WORKSPACE_ACTIVE",
      `unexpected multi-workspace state: ${afterLogin}`,
    );

    if (afterLogin !== "WORKSPACE_ACTIVE") {
      const selected = await auth.selectWorkspace("ws_b");
      assert.equal(selected, true);
    } else if (auth.getSnapshot().activeWorkspace?.id !== "ws_b") {
      const selected = await auth.selectWorkspace("ws_b");
      assert.equal(selected, true);
    }
    assert.equal(auth.getSnapshot().state, "WORKSPACE_ACTIVE");
    assert.equal(auth.getSnapshot().activeMembership?.role, "OWNER");
    assert.equal(auth.getSnapshot().activeWorkspace?.id, "ws_b");

    await auth.signOut();
    assert.equal(auth.getSnapshot().state, "SIGNED_OUT");
  }
  console.log("  -> auth flows: PASS\n");

  // --- Tenant isolation still controller-owned ---
  console.log("[7] Tenant/workspace isolation still auth-owned...");
  {
    await SecureStorage.clear();
    const auth = new MobileAuthController();
    const user: MobileUser = {
      id: "usr_iso",
      email: "iso@example.com",
      name: "Iso",
    };
    const a: MobileWorkspaceMembership = {
      id: "mem_iso_a",
      workspaceId: "ws_iso_a",
      userId: user.id,
      role: "AGENT",
      status: "ACTIVE",
      workspace: {
        id: "ws_iso_a",
        slug: "iso-a",
        displayName: "Iso A",
        brand: { primaryColor: "#001" },
      },
    };
    const b: MobileWorkspaceMembership = {
      id: "mem_iso_b",
      workspaceId: "ws_iso_b",
      userId: user.id,
      role: "ADMIN",
      status: "ACTIVE",
      workspace: {
        id: "ws_iso_b",
        slug: "iso-b",
        displayName: "Iso B",
        brand: { primaryColor: "#002" },
      },
    };
    const res = await auth.mockAuthenticate({
      user,
      tokens: { accessToken: "mock_jwt_iso", expiresAt: Date.now() + 3600000 },
      memberships: [a, b],
    });
    assert.equal(res.ok, true);
    assert.equal(res.state, "WORKSPACE_SELECTION");

    const okA = await auth.selectWorkspace("ws_iso_a");
    assert.equal(okA, true);
    assert.equal(auth.getSnapshot().activeWorkspace?.id, "ws_iso_a");
    assert.equal(auth.getSnapshot().activeMembership?.role, "AGENT");

    await auth.changeWorkspace();
    assert.equal(auth.getSnapshot().state, "WORKSPACE_SELECTION");

    const okB = await auth.selectWorkspace("ws_iso_b");
    assert.equal(okB, true);
    assert.equal(auth.getSnapshot().activeWorkspace?.id, "ws_iso_b");
    assert.equal(auth.getSnapshot().activeMembership?.role, "ADMIN");
  }
  console.log("  -> tenant isolation: PASS\n");

  console.log("PHASE 1 FOUNDATION TESTS: ALL PASS\n");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
