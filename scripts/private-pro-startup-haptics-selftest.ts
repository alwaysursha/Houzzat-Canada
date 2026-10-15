/**
 * HouzzatPro Private — Agent Profile default landing + nav haptics wiring.
 * Run: pnpm exec tsx scripts/private-pro-startup-haptics-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  HOUZZATPRO_PRIVATE_UI_UA_MARKER,
  shouldUseProNativeInstantShell,
} from "../src/lib/mobile/app-shell";
import {
  PRIVATE_PRO_DEFAULT_LANDING_PATH,
  resolveHouzzatProPrivateStartupDestination,
  resolveWorkspaceMemberMobileDestination,
} from "../src/lib/mobile/workspace-destination";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const PROD_PRO_UA =
  "Mozilla/5.0 HouzzatNative/1 (com.houzzat.pro)";
const PRIVATE_PRO_UA =
  `Mozilla/5.0 HouzzatNative/1 (com.houzzat.pro) ${HOUZZATPRO_PRIVATE_UI_UA_MARKER}`;
const CHROME_UA =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36";

function testLaunchpadRouteConfirmed() {
  assert.equal(PRIVATE_PRO_DEFAULT_LANDING_PATH, "/agent");
  const page = read("src/app/(agent)/agent/page.tsx");
  assert.ok(page.includes('title: "Launchpad · Agent CRM"'));
  assert.ok(page.includes("LaunchpadDeferredQuickModules"));
  assert.ok(page.includes("Quick Modules"));
  const modules = read("src/components/agent/QuickModulesPanel.tsx");
  assert.ok(modules.includes("Call New Leads"));
  assert.ok(modules.includes("Online Leads"));
}

function testPrivateStartupRemap() {
  // Role defaults unchanged for non-private clients.
  assert.equal(resolveWorkspaceMemberMobileDestination("OWNER"), "/admin");
  assert.equal(resolveWorkspaceMemberMobileDestination("ADMIN"), "/admin");
  assert.equal(resolveWorkspaceMemberMobileDestination("AGENT"), "/agent");

  // Private OWNER/ADMIN → Launchpad; AGENT already Launchpad.
  assert.equal(
    resolveHouzzatProPrivateStartupDestination("/admin", PRIVATE_PRO_UA),
    "/agent",
  );
  assert.equal(
    resolveHouzzatProPrivateStartupDestination("/agent", PRIVATE_PRO_UA),
    "/agent",
  );

  // Production PRO + Chrome unchanged.
  assert.equal(
    resolveHouzzatProPrivateStartupDestination("/admin", PROD_PRO_UA),
    "/admin",
  );
  assert.equal(
    resolveHouzzatProPrivateStartupDestination("/agent", CHROME_UA),
    "/agent",
  );

  // Preserve intentional paths (onboarding, deep links, notifications).
  assert.equal(
    resolveHouzzatProPrivateStartupDestination("/onboarding", PRIVATE_PRO_UA),
    "/onboarding",
  );
  assert.equal(
    resolveHouzzatProPrivateStartupDestination(
      "/agent/leads",
      PRIVATE_PRO_UA,
    ),
    "/agent/leads",
  );
  assert.equal(
    resolveHouzzatProPrivateStartupDestination(
      "/admin/people",
      PRIVATE_PRO_UA,
    ),
    "/admin/people",
  );
  assert.equal(
    resolveHouzzatProPrivateStartupDestination(
      "/agent/profile",
      PRIVATE_PRO_UA,
    ),
    "/agent/profile",
  );

  // Private still uses full CRM shell (not InstantShell).
  assert.equal(shouldUseProNativeInstantShell(PRIVATE_PRO_UA), false);
}

function testWiring() {
  const controller = read("src/lib/mobile/pro-native-auth-controller.ts");
  assert.ok(controller.includes("resolveHouzzatProPrivateStartupDestination"));
  assert.ok(controller.includes("finalizeStaffStartupDestination"));

  const bootstrap = read("src/components/mobile/ProWorkspaceBootstrap.tsx");
  assert.ok(bootstrap.includes("resolveHouzzatProPrivateStartupDestination"));

  const agentShell = read("src/components/agent/AgentShell.tsx");
  assert.ok(agentShell.includes("triggerStaffNavSelectionHaptic"));
  assert.ok(agentShell.includes("onClick={() => triggerStaffNavSelectionHaptic()}"));

  const adminShell = read("src/components/admin/AdminShell.tsx");
  assert.ok(adminShell.includes("triggerStaffNavSelectionHaptic"));

  const haptics = read("src/lib/mobile/nav-selection-haptics.ts");
  assert.ok(haptics.includes("@capacitor/haptics"));
  assert.ok(haptics.includes("prefersProFullCrmExperience"));
  assert.ok(haptics.includes("ImpactStyle.Light"));
  assert.ok(haptics.includes("Haptics.impact"));
  assert.equal(haptics.includes("navigator.vibrate"), false);
  // selectionStart alone is a silent arm on Android — must not be the tap call path.
  assert.equal(haptics.includes("Haptics.selectionStart"), false);
  assert.equal(haptics.includes("Capacitor.isNativePlatform()"), true);

  const plugins = read(
    "android-pro-private/app/src/main/assets/capacitor.plugins.json",
  );
  assert.ok(plugins.includes("@capacitor/haptics"));

  const manifest = read("android-pro-private/app/src/main/AndroidManifest.xml");
  assert.ok(manifest.includes("android.permission.VIBRATE"));

  // Production FullCRM candidate also carries VIBRATE; Private tree remains intact.
  const prodManifest = read("android-pro/app/src/main/AndroidManifest.xml");
  assert.ok(prodManifest.includes("android.permission.VIBRATE"));
  assert.equal(prodManifest.includes("PrivateFirebaseApp"), false);
}

function main() {
  testLaunchpadRouteConfirmed();
  testPrivateStartupRemap();
  testWiring();
  console.log("private-pro-startup-haptics-selftest: ok");
}

main();
