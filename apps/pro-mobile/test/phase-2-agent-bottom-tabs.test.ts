/**
 * Phase 2 — Agent primary tabs are React Navigation bottom-tab routes.
 *
 * Run: node --import tsx apps/pro-mobile/test/phase-2-agent-bottom-tabs.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AGENT_BOTTOM_NAV_LABELS } from "../src/lib/drawer-nav-items";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");

function readApp(rel: string) {
  return readFileSync(join(APP, rel), "utf8");
}

function run() {
  console.log("=================================================================");
  console.log("PHASE 2 — AGENT BOTTOM TABS");
  console.log("=================================================================\n");

  const agent = readApp("src/screens/AgentShell.tsx");
  const cc = readApp("src/screens/CommandCentreShell.tsx");
  const types = readApp("src/navigation/types.ts");

  console.log("[1] Five primary routes, Tasks hidden from the bar...");
  for (const name of ["Launchpad", "Leads", "Chats", "Calendar", "More", "Tasks"]) {
    assert.ok(agent.includes(`name="${name}"`), `missing route ${name}`);
    if (name === "Leads") {
      assert.ok(types.includes("LeadsStackParamList"));
    } else {
      assert.ok(types.includes(`${name}: undefined`));
    }
  }
  assert.deepEqual([...AGENT_BOTTOM_NAV_LABELS], [
    "Launchpad",
    "Leads",
    "Chats",
    "Calendar",
    "More",
  ]);
  const bar = agent.slice(
    agent.indexOf("function AgentBottomTabBar"),
    agent.indexOf("function AgentPrimaryTabs"),
  );
  for (const label of AGENT_BOTTOM_NAV_LABELS) {
    assert.ok(bar.includes(label) || agent.includes(`${label}:`), label);
  }
  assert.ok(agent.includes("tabBarButton: () => null"));
  assert.equal(bar.includes('name="Tasks"'), false);
  console.log("  -> routes: PASS\n");

  console.log("[2] Visited tabs stay mounted; screens unchanged...");
  assert.ok(agent.includes("detachInactiveScreens={false}"));
  assert.ok(agent.includes("lazy: true"));
  assert.ok(agent.includes("freezeOnBlur: true"));
  assert.ok(agent.includes("<LaunchpadScreen"));
  assert.ok(agent.includes("<LeadsScreen"));
  assert.ok(agent.includes("<ChatsScreen"));
  assert.ok(agent.includes("<GlobalCalendarScreen"));
  assert.ok(agent.includes("<GlobalTasksScreen"));
  assert.ok(agent.includes("<MoreHubScreen"));
  assert.ok(agent.includes("<LeadDetailScreen"));
  assert.equal(agent.includes('name="LeadDetail"'), false);
  assert.equal(agent.includes('name="ChatThread"'), false);
  console.log("  -> screens: PASS\n");

  console.log("[3] Legacy back stays; Owner/Admin tabs are unchanged...");
  assert.ok(agent.includes("useAndroidHardwareBack"));
  assert.ok(agent.includes("chatsThreadOpen"));
  assert.ok(agent.includes("popLeadsStackIfPushed()"));
  assert.equal(agent.includes("BackHandler"), false);
  assert.ok(agent.includes('backBehavior="none"'));
  assert.ok(cc.includes("activeTab"));
  assert.equal(cc.includes("@react-navigation/bottom-tabs"), false);
  console.log("  -> boundaries: PASS\n");

  console.log("PHASE 2 AGENT BOTTOM TABS: ALL PASS\n");
}

run();
