/**
 * Phase 3 — Leads tab owns a native stack. Lead Profile is pushed, not overlaid.
 *
 * Run: node --import tsx apps/pro-mobile/test/phase-3-leads-stack.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");

function readApp(rel: string) {
  return readFileSync(join(APP, rel), "utf8");
}

function sliceBetween(source: string, start: string, end: string) {
  const from = source.indexOf(start);
  assert.ok(from >= 0, `missing ${start}`);
  const to = source.indexOf(end, from);
  assert.ok(to > from, `missing ${end} after ${start}`);
  return source.slice(from, to);
}

function run() {
  console.log("=================================================================");
  console.log("PHASE 3 — LEADS STACK");
  console.log("=================================================================\n");

  const agent = readApp("src/screens/AgentShell.tsx");
  const types = readApp("src/navigation/types.ts");
  const cc = readApp("src/screens/CommandCentreShell.tsx");
  const detail = readApp("src/screens/LeadDetailScreen.tsx");
  const leads = readApp("src/screens/LeadsScreen.tsx");
  const chats = readApp("src/screens/ChatsScreen.tsx");

  console.log("[1] Leads tab is a nested native stack with list as root...");
  assert.ok(types.includes("export type LeadsStackParamList"));
  assert.ok(types.includes("LeadsList: undefined"));
  assert.ok(types.includes("LeadProfile: { leadId: string; leadIds?: string[] }"));
  assert.ok(agent.includes("createNativeStackNavigator<LeadsStackParamList>()"));
  const leadsTab = sliceBetween(agent, "function LeadsTab()", "function ChatsTab");
  assert.ok(leadsTab.includes('initialRouteName="LeadsList"'));
  assert.ok(leadsTab.includes('name="LeadsList"'));
  assert.ok(leadsTab.includes('name="LeadProfile"'));
  assert.ok(leadsTab.includes("component={LeadsListRoute}"));
  assert.ok(leadsTab.includes("component={LeadProfileRoute}"));
  assert.ok(leadsTab.includes("headerShown: false"));
  console.log("  -> stack: PASS\n");

  console.log("[2] Profile is the existing screen, pushed, and X pops...");
  const profile = sliceBetween(agent, "function LeadProfileRoute()", "function LeadsTab");
  assert.ok(profile.includes("<LeadDetailScreen"));
  assert.ok(profile.includes("navigation.goBack()"));
  assert.ok(profile.includes("navigation.setParams({ leadId: id })"));
  const list = sliceBetween(agent, "function LeadsListRoute()", "function LeadProfileRoute");
  assert.ok(list.includes("<LeadsScreen"));
  assert.ok(list.includes('navigation.navigate("LeadProfile"'));
  assert.equal(agent.includes("leadDetailOverlay"), false);
  assert.equal(agent.includes('name="ChatThread"'), false);
  assert.equal(agent.includes("BackHandler"), false);
  console.log("  -> profile: PASS\n");

  console.log("[3] Existing hardware back pops the leads stack...");
  const onBack = sliceBetween(agent, "useAndroidHardwareBack({", "isAtRoot:");
  assert.ok(onBack.includes("popLeadsStackIfPushed()"));
  assert.ok(onBack.indexOf("popLeadsStackIfPushed()") < onBack.indexOf('navigateTab("launchpad"'));
  assert.ok(onBack.includes("chatsThreadOpen"));
  assert.equal(onBack.includes("canGoBack"), false);
  console.log("  -> back: PASS\n");

  console.log("[4] Other Agent entry points push Lead Profile...");
  assert.ok(agent.includes("function pushLeadProfile") || agent.includes("const pushLeadProfile"));
  assert.ok(agent.includes('navigate("Leads"'));
  assert.ok(agent.includes('screen: "LeadProfile"'));
  assert.ok(agent.includes("pushLeadProfile(leadId, leadIds)"));
  assert.ok(agent.includes("pushLeadProfile(leadId)"));
  console.log("  -> entry points: PASS\n");

  console.log("[5] Profile UI and list cache contract stay...");
  assert.ok(detail.includes('accessibilityLabel="Close"'));
  assert.ok(detail.includes("onBack"));
  assert.ok(leads.includes("selectedLeadId"));
  assert.ok(leads.includes("onSelectLead"));
  console.log("  -> preserve: PASS\n");

  console.log("[6] Chat thread and Owner/Admin navigation stay...");
  assert.ok(chats.includes("selectedLeadId"));
  assert.equal(chats.includes("createNativeStackNavigator"), false);
  assert.ok(cc.includes("if (selectedLeadId)"));
  assert.ok(cc.includes("leadDetailOverlay"));
  assert.equal(cc.includes("createNativeStackNavigator"), false);
  assert.equal(cc.includes("@react-navigation/bottom-tabs"), false);
  console.log("  -> boundaries: PASS\n");

  console.log("PHASE 3 LEADS STACK: ALL PASS\n");
}

run();
