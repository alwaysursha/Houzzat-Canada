/**
 * Final HouzzatPRO mobile V1 UI source guards.
 * Run: node --import tsx apps/pro-mobile/test/mobile-v1-ui-polish.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ADMIN_BOTTOM_NAV_LABELS,
  AGENT_BOTTOM_NAV_LABELS,
} from "../src/lib/drawer-nav-items";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testPasswordEyeToggle() {
  const signIn = read("src/screens/SignInScreen.tsx");
  // Premium emoji visual + reliable remount toggle (no PasswordEyeIcon)
  assert.ok(signIn.includes("👁"));
  assert.ok(signIn.includes("👁‍🗨"));
  assert.ok(signIn.includes('key={showPassword ? "password-visible"'));
  assert.ok(signIn.includes("setShowPassword((prev) => !prev)"));
  assert.ok(signIn.includes("secureTextEntry={!showPassword}"));
  assert.equal(signIn.includes("PasswordEyeIcon"), false);
  console.log("[ui] password eye premium visual + reliable toggle... PASS");
}

function testNoPlatformAdminLink() {
  const signIn = read("src/screens/SignInScreen.tsx");
  assert.equal(signIn.includes("Platform admin sign-in"), false);
  assert.equal(signIn.includes('mode: "platform"'), false);
  assert.equal(signIn.includes("handlePlatformSubmit"), false);
  console.log("[ui] platform admin link removed... PASS");
}

function testNavHapticsSafe() {
  const haptics = read("src/lib/nav-haptics.ts");
  assert.ok(haptics.includes("Vibration.vibrate"));
  assert.ok(haptics.includes("NAV_HAPTIC_MIN_GAP_MS"));
  assert.ok(haptics.includes("canVibrate"));
  assert.ok(haptics.includes("catch"));
  const manifest = read("android/app/src/main/AndroidManifest.xml");
  assert.ok(
    manifest.includes("android.permission.VIBRATE"),
    "Android release requires VIBRATE for Vibration API",
  );
  const agent = read("src/screens/AgentShell.tsx");
  const cc = read("src/screens/CommandCentreShell.tsx");
  assert.ok(agent.includes("triggerNavHaptic"));
  assert.ok(cc.includes("triggerNavHaptic"));
  console.log("[ui] bottom-nav haptics + VIBRATE permission... PASS");
}

function testAgentBottomNav() {
  const agent = read("src/screens/AgentShell.tsx");
  for (const label of AGENT_BOTTOM_NAV_LABELS) {
    assert.ok(agent.includes(label), `Agent nav missing ${label}`);
  }
  const barStart = agent.indexOf("function AgentBottomTabBar");
  const barEnd = agent.indexOf("function AgentPrimaryTabs", barStart);
  assert.ok(barStart > 0 && barEnd > barStart);
  const bottomBlock = agent.slice(barStart, barEnd);
  assert.equal(bottomBlock.includes(">Tasks<"), false);
  assert.equal(bottomBlock.includes('navigate("Tasks")'), false);
  assert.equal(bottomBlock.includes("ChatsScreen"), false);
  assert.ok(agent.includes("ChatsScreen"));
  assert.ok(agent.includes('name="Chats"'));
  console.log("[ui] agent bottom nav 5-tab locked... PASS");
}

function testAdminBottomNav() {
  const cc = read("src/screens/CommandCentreShell.tsx");
  for (const label of ADMIN_BOTTOM_NAV_LABELS) {
    assert.ok(cc.includes(label), `Admin nav missing ${label}`);
  }
  assert.ok(cc.includes("LeadRoutingScreen"));
  assert.ok(cc.includes('selectTab("leadRouting"'));
  assert.ok(cc.includes('selectTab("people"'));
  assert.ok(cc.includes('selectTab("crm"'));
  assert.ok(cc.includes("TeamScreen"));
  assert.ok(cc.includes("LeadsScreen"));
  // Old 6-tab destinations not on bottom bar
  const bottomStart = cc.indexOf("Bottom Navigation");
  const bottomEnd = cc.indexOf("NativeDrawer", bottomStart);
  const bottomBlock = cc.slice(bottomStart, bottomEnd);
  assert.equal(bottomBlock.includes(">Chats<"), false);
  assert.equal(bottomBlock.includes(">Calendar<"), false);
  assert.equal(bottomBlock.includes(">Team<"), false);
  assert.equal(bottomBlock.includes(">Leads<"), false);
  console.log("[ui] admin bottom nav 5-tab locked... PASS");
}

function testAgentServicesBanner() {
  const banner = read("src/components/AgentServicesComingSoonBanner.tsx");
  const launchpad = read("src/screens/LaunchpadScreen.tsx");
  assert.ok(banner.includes("AGENT SERVICES"));
  assert.ok(banner.includes("Coming Soon"));
  assert.ok(banner.includes("More tools. One place."));
  assert.equal(banner.includes("onPress"), false);
  assert.equal(banner.includes("TouchableOpacity"), false);
  assert.ok(launchpad.includes("AgentServicesComingSoonBanner"));
  console.log("[ui] agent services banner placement... PASS");
}

function testGlobeWhite() {
  const agent = read("src/screens/AgentShell.tsx");
  assert.ok(agent.includes("globeIcon"));
  const globeBlock = agent.slice(
    agent.indexOf("globeIcon:"),
    agent.indexOf("callNewBtn:"),
  );
  assert.ok(globeBlock.includes("#FFFFFF"));
  console.log("[ui] activity globe white... PASS");
}

function testAuthNotRegressed() {
  const auth = read("src/state/auth-controller.ts");
  assert.ok(auth.includes("/auth/discover"));
  assert.ok(auth.includes('mode: "tenant"'));
  assert.ok(auth.includes('mode: "platform"'));
  assert.ok(auth.includes("IDENTITY_SELECTION"));
  assert.ok(auth.includes("RATE_LIMITED"));
  console.log("[ui] mobile auth preserved (backend platform mode intact)... PASS");
}

function main() {
  testPasswordEyeToggle();
  testNoPlatformAdminLink();
  testNavHapticsSafe();
  testAgentBottomNav();
  testAdminBottomNav();
  testAgentServicesBanner();
  testGlobeWhite();
  testAuthNotRegressed();
  console.log("\n[mobile-v1-ui-polish] ALL PASS\n");
}

main();
