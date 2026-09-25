/**
 * Phase 3 repair — Lead Profile hardware Back pops the stack, and the
 * embedded profile drops the overlay status-bar gap.
 *
 * Run: node --import tsx apps/pro-mobile/test/phase-3-leads-back-repair.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { leadsStackBackAction } from "../src/navigation/leads-stack-back";
import {
  __emitHardwareBackPress,
  __getAndroidHardwareBackExitAppCount,
  __resetAndroidHardwareBackForTests,
  addAndroidHardwareBackListener,
} from "../src/lib/android-hardware-back";

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
  console.log("PHASE 3 REPAIR — LEADS BACK + COMPACT PROFILE");
  console.log("=================================================================\n");

  const agent = readApp("src/screens/AgentShell.tsx");
  const detail = readApp("src/screens/LeadDetailScreen.tsx");
  const cc = readApp("src/screens/CommandCentreShell.tsx");
  const hook = readApp("src/hooks/useAndroidHardwareBack.ts");
  const backLib = readApp("src/lib/android-hardware-back.ts");

  console.log("[1] Pushed Lead Profile hardware Back pops to the list...");
  __resetAndroidHardwareBackForTests();
  const popped: Array<{ type: string; target?: string; payload?: { count: number } }> = [];
  const profileState = { key: "leads-stack-1", index: 1, routes: ["LeadsList", "LeadProfile"] };
  addAndroidHardwareBackListener(() => {
    const action = leadsStackBackAction(profileState);
    if (!action) return false;
    popped.push(action);
    return true;
  }, "leads-profile");
  const consumed = __emitHardwareBackPress();
  assert.equal(consumed, true);
  assert.equal(popped.length, 1);
  assert.equal(popped[0]?.type, "POP");
  assert.equal(popped[0]?.payload?.count, 1);
  assert.equal(popped[0]?.target, "leads-stack-1");
  assert.equal(__getAndroidHardwareBackExitAppCount(), 0);
  const onBack = sliceBetween(agent, "useAndroidHardwareBack({", "isAtRoot:");
  assert.ok(onBack.includes("popLeadsStackIfPushed()"));
  assert.ok(onBack.indexOf("popLeadsStackIfPushed()") < onBack.indexOf('navigateTab("launchpad"'));
  assert.ok(agent.includes("leadsStackBackAction(navigation.getState())"));
  assert.equal(sliceBetween(agent, "function useBindLeadsStackNavigation", "function popLeadsStackIfPushed").includes("= null"), false);
  console.log("  -> pop: PASS\n");

  console.log("[2] X still pops; list root does not...");
  const profile = sliceBetween(agent, "function LeadProfileRoute()", "function LeadsTab");
  assert.ok(profile.includes("onBack={() => navigation.goBack()}"));
  assert.equal(leadsStackBackAction({ key: "leads-stack-1", index: 0 }), null);
  assert.equal(leadsStackBackAction(null), null);
  console.log("  -> x and root: PASS\n");

  console.log("[3] Existing subscription is promoted ahead of useBackButton...");
  assert.ok(hook.includes("promoteAndroidHardwareBackSubscription"));
  assert.ok(hook.includes("addAndroidHardwareBackListener"));
  assert.equal(hook.includes("BackHandler.addEventListener"), false);
  assert.ok(backLib.includes("export function promoteAndroidHardwareBackSubscription"));
  assert.ok(backLib.includes("nativeSub.remove()"));
  assert.equal((backLib.match(/nativeSub = bridge.addEventListener\("hardwareBackPress"/g) ?? []).length, 1);
  console.log("  -> priority: PASS\n");

  console.log("[4] Agent stack uses compact padding; Owner/Admin overlay does not...");
  assert.ok(profile.includes("embeddedInShell"));
  assert.ok(detail.includes("embeddedInShell && styles.modalHeaderEmbedded"));
  assert.ok(detail.includes("modalHeaderEmbedded"));
  const embeddedStyle = sliceBetween(detail, "modalHeaderEmbedded:", "closeBtn:");
  assert.ok(embeddedStyle.includes("paddingTop: 8"));
  assert.ok(detail.includes("paddingTop: topHeaderPadding"));
  const ccDetail = sliceBetween(cc, "<LeadDetailScreen", "onPlanViewings");
  assert.equal(ccDetail.includes("embeddedInShell"), false);
  console.log("  -> spacing: PASS\n");

  console.log("PHASE 3 REPAIR: ALL PASS\n");
}

run();
