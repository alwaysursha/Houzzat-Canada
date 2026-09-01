/**
 * Stage 5.2 — Native More / Agent Utilities tests.
 *
 * More = Instant Shell drawer destinations + Account hub.
 * Substantial modules stay native "coming later" (no browser CRM).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  clearAllWorkspaceCaches,
  clearGlobalAppointmentsCache,
  globalAppointmentCache,
  globalTaskCache,
  taskCache,
} from "../src/lib/lead-tab-cache";
import {
  clearLeadListCache,
  leadCacheStore,
  setLeadCacheStore,
} from "../src/lib/lead-list-cache";
import { DRAWER_NAV_ITEMS } from "../src/lib/drawer-nav-items";
import { MORE_UTILITY_META } from "../src/lib/more-utility-meta";

const REPO_ROOT = join(__dirname, "../../..");
const AGENT_SHELL = join(
  REPO_ROOT,
  "apps/pro-mobile/src/screens/AgentShell.tsx",
);
const CC_SHELL = join(
  REPO_ROOT,
  "apps/pro-mobile/src/screens/CommandCentreShell.tsx",
);
const MORE_HUB = join(
  REPO_ROOT,
  "apps/pro-mobile/src/screens/MoreHubScreen.tsx",
);
const MORE_UTIL = join(
  REPO_ROOT,
  "apps/pro-mobile/src/screens/MoreUtilityScreen.tsx",
);
const DRAWER = join(
  REPO_ROOT,
  "apps/pro-mobile/src/components/NativeDrawer.tsx",
);
const AUTH = join(
  REPO_ROOT,
  "apps/pro-mobile/src/state/auth-controller.ts",
);
const INSTANT_SHELL = join(
  REPO_ROOT,
  "src/components/agent/AgentMobileInstantShell.tsx",
);

async function runStage52Tests() {
  console.log("=================================================================");
  console.log("STAGE 5.2 — NATIVE MORE / AGENT UTILITIES TESTS");
  console.log("=================================================================\n");

  console.log("[1/12] Web Instant Shell More drawer destinations...");
  {
    const web = readFileSync(INSTANT_SHELL, "utf8");
    assert.ok(web.includes("/agent/statistics"));
    assert.ok(web.includes("/agent/inbox"));
    assert.ok(web.includes("/agent/cma"));
    assert.ok(web.includes("/agent/team"));
    assert.ok(web.includes("/agent/notifications"));
    assert.ok(web.includes("/agent/search"));
    assert.ok(web.includes("SignOutButton"));
    console.log("  -> PASS");
  }

  console.log("[2/12] Native drawer matches Instant Shell utility set...");
  {
    const ids = DRAWER_NAV_ITEMS.map((i) => i.id);
    assert.ok(ids.includes("launchpad"));
    assert.ok(ids.includes("leads"));
    assert.ok(ids.includes("tasks"));
    assert.ok(ids.includes("calendar"));
    assert.ok(ids.includes("account"));
    assert.ok(ids.includes("statistics"));
    assert.ok(ids.includes("inbox"));
    assert.ok(ids.includes("cma"));
    assert.ok(ids.includes("team"));
    assert.ok(ids.includes("notifications"));
    assert.ok(ids.includes("search"));
    const utilities = DRAWER_NAV_ITEMS.filter((i) => i.utilityId);
    assert.equal(utilities.length >= 6, true);
    console.log("  -> PASS");
  }

  console.log("[3/12] MoreHub + MoreUtility wired in AgentShell...");
  {
    const shell = readFileSync(AGENT_SHELL, "utf8");
    assert.ok(shell.includes("MoreHubScreen"));
    assert.ok(shell.includes("MoreUtilityScreen"));
    assert.ok(shell.includes("activeUtility"));
    assert.equal(shell.includes("href=\"/agent"), false);
    assert.equal(shell.includes("WebView"), false);
    const hub = readFileSync(MORE_HUB, "utf8");
    assert.ok(hub.includes("User Profile"));
    assert.ok(hub.includes("Active Workspace"));
    assert.ok(hub.includes("Switch Workspace"));
    assert.ok(hub.includes("Sign Out of HouzzatPRO"));
    console.log("  -> PASS");
  }

  console.log("[4/12] Coming-later utilities never open browser CRM...");
  {
    const util = readFileSync(MORE_UTIL, "utf8");
    assert.ok(util.includes("Coming later"));
    assert.ok(util.includes("never opens browser CRM"));
    for (const key of Object.keys(MORE_UTILITY_META)) {
      assert.ok(MORE_UTILITY_META[key as keyof typeof MORE_UTILITY_META].webPath);
    }
    assert.equal(util.includes("Linking.openURL"), false);
    assert.equal(util.includes("WebView"), false);
    console.log("  -> PASS");
  }

  console.log("[5/12] Central clearAllWorkspaceCaches...");
  {
    const cacheSrc = readFileSync(
      join(REPO_ROOT, "apps/pro-mobile/src/lib/lead-tab-cache.ts"),
      "utf8",
    );
    assert.ok(cacheSrc.includes("clearAllWorkspaceCaches"));
    assert.ok(cacheSrc.includes("registerLeadDetailCacheClearer"));
    const auth = readFileSync(AUTH, "utf8");
    assert.ok(auth.includes("clearAllWorkspaceCaches"));
    assert.ok(auth.includes("clearLeadListCache"));
    console.log("  -> PASS");
  }

  console.log("[6/12] Calendar cache clear matches Stage 5.1 key...");
  {
    globalAppointmentCache.clear();
    globalAppointmentCache.set("ws_a:calendar", {
      appointments: [],
      from: "",
      to: "",
      timestamp: 1,
    });
    globalAppointmentCache.set("ws_b:calendar", {
      appointments: [],
      from: "",
      to: "",
      timestamp: 1,
    });
    clearGlobalAppointmentsCache("ws_a");
    assert.equal(globalAppointmentCache.has("ws_a:calendar"), false);
    assert.equal(globalAppointmentCache.has("ws_b:calendar"), true);
    console.log("  -> PASS");
  }

  console.log("[7/12] clearAllWorkspaceCaches isolates tenants...");
  {
    taskCache.clear();
    globalTaskCache.clear();
    taskCache.set("ws_canary:lead1:tasks", { tasks: [], timestamp: 1 });
    taskCache.set("ws_houzzat:lead1:tasks", { tasks: [], timestamp: 1 });
    globalTaskCache.set("ws_canary:global-tasks", {
      tasks: [],
      timestamp: 1,
    });
    setLeadCacheStore({
      workspaceId: "ws_canary",
      leads: [],
      totalCount: 0,
      timestamp: 1,
    });
    clearAllWorkspaceCaches("ws_canary");
    clearLeadListCache("ws_canary");
    assert.equal(taskCache.has("ws_canary:lead1:tasks"), false);
    assert.equal(taskCache.has("ws_houzzat:lead1:tasks"), true);
    assert.equal(globalTaskCache.has("ws_canary:global-tasks"), false);
    assert.equal(leadCacheStore, null);
    console.log("  -> PASS");
  }

  console.log("[8/12] No biometrics / no new backend routes...");
  {
    const drawer = readFileSync(DRAWER, "utf8");
    assert.equal(/biometric/i.test(drawer), false);
    const hub = readFileSync(MORE_HUB, "utf8");
    assert.equal(/biometric/i.test(hub), false);
    assert.equal(
      readFileSync(AGENT_SHELL, "utf8").includes("/api/mobile/v2/"),
      false,
    );
    console.log("  -> PASS");
  }

  console.log("[9/12] CommandCentre More hub preserves Agent Desk...");
  {
    const cc = readFileSync(CC_SHELL, "utf8");
    assert.ok(cc.includes("MoreHubScreen"));
    assert.ok(cc.includes("onOpenAgentDesk"));
    assert.ok(cc.includes("MoreUtilityScreen"));
    const hub = readFileSync(MORE_HUB, "utf8");
    assert.ok(hub.includes("Open Personal Agent Desk"));
    console.log("  -> PASS");
  }

  console.log("[10/12] Drawer open is local state (no shell reload)...");
  {
    const shell = readFileSync(AGENT_SHELL, "utf8");
    assert.ok(shell.includes("setDrawerOpen(true)"));
    assert.ok(shell.includes("NativeDrawer"));
    assert.equal(shell.includes("router."), false);
    assert.equal(shell.includes("window.location"), false);
    console.log("  -> PASS");
  }

  console.log("[11/12] Role authority remains WorkspaceMember.role...");
  {
    const shell = readFileSync(AGENT_SHELL, "utf8");
    assert.ok(shell.includes("activeMembership?.role"));
    assert.equal(shell.includes("user.role"), false);
    console.log("  -> PASS");
  }

  console.log("[12/12] Recommended deferred stages documented...");
  {
    assert.ok(MORE_UTILITY_META.statistics.nextStage.includes("Statistics"));
    assert.ok(MORE_UTILITY_META.search.nextStage.includes("Properties"));
    assert.ok(MORE_UTILITY_META.notifications.nextStage.includes("Notification"));
    console.log("  -> PASS");
  }

  console.log("\nSTAGE 5.2 — ALL TESTS PASSED\n");
}

runStage52Tests().catch((err) => {
  console.error(err);
  process.exit(1);
});
