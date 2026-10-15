/**
 * Production Pro FullCRM candidate (v1.0.7) — compatibility + wiring.
 * Run: pnpm exec tsx scripts/pro-fullcrm-promote-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  HOUZZATPRO_FULL_CRM_UA_MARKER,
  HOUZZATPRO_PRIVATE_UI_UA_MARKER,
  prefersProFullCrmExperience,
  shouldUseProNativeInstantShell,
} from "../src/lib/mobile/app-shell";
import { resolveHouzzatProPrivateStartupDestination } from "../src/lib/mobile/workspace-destination";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const LEGACY_PRO_UA =
  "Mozilla/5.0 HouzzatNative/1 (com.houzzat.pro)";
const FULLCRM_PRO_UA =
  `Mozilla/5.0 HouzzatNative/1 (com.houzzat.pro) ${HOUZZATPRO_FULL_CRM_UA_MARKER}`;
const PRIVATE_PRO_UA =
  `Mozilla/5.0 HouzzatNative/1 (com.houzzat.pro) ${HOUZZATPRO_PRIVATE_UI_UA_MARKER}`;

function testCompatibilityMatrix() {
  assert.equal(HOUZZATPRO_FULL_CRM_UA_MARKER, "HouzzatProFullCRM/1");
  assert.equal(prefersProFullCrmExperience(LEGACY_PRO_UA), false);
  assert.equal(prefersProFullCrmExperience(FULLCRM_PRO_UA), true);
  assert.equal(prefersProFullCrmExperience(PRIVATE_PRO_UA), true);

  // Legacy Play install keeps InstantShell until update.
  assert.equal(shouldUseProNativeInstantShell(LEGACY_PRO_UA), true);
  assert.equal(shouldUseProNativeInstantShell(FULLCRM_PRO_UA), false);
  assert.equal(shouldUseProNativeInstantShell(PRIVATE_PRO_UA), false);

  assert.equal(
    resolveHouzzatProPrivateStartupDestination("/admin", LEGACY_PRO_UA),
    "/admin",
  );
  assert.equal(
    resolveHouzzatProPrivateStartupDestination("/admin", FULLCRM_PRO_UA),
    "/agent",
  );
  assert.equal(
    resolveHouzzatProPrivateStartupDestination("/admin", PRIVATE_PRO_UA),
    "/agent",
  );
  assert.equal(
    resolveHouzzatProPrivateStartupDestination("/onboarding", FULLCRM_PRO_UA),
    "/onboarding",
  );
}

function testProductionNativeIdentity() {
  const build = read("android-pro/app/build.gradle");
  assert.ok(build.includes('applicationId "com.houzzat.pro"'));
  assert.ok(build.includes("versionCode 9"));
  assert.ok(build.includes('versionName "1.0.7"'));
  assert.ok(build.includes("androidx.webkit:webkit"));
  assert.equal(build.includes("com.houzzat.pro.private"), false);
  assert.equal(build.includes("PrivateFirebaseApp"), false);

  const manifest = read("android-pro/app/src/main/AndroidManifest.xml");
  assert.ok(manifest.includes("android.permission.VIBRATE"));
  assert.equal(manifest.includes("PrivateFirebaseApp"), false);

  const main = read(
    "android-pro/app/src/main/java/com/houzzat/pro/MainActivity.java",
  );
  assert.ok(main.includes("registerNativeBridgeForAllowNavigationOrigins"));
  assert.ok(main.includes("WebViewCompat.addDocumentStartJavaScript"));
  assert.equal(main.includes("PrivateFirebaseApp"), false);
  assert.equal(main.includes("com.houzzat.pro.private"), false);

  const gs = read("android-pro/app/google-services.json");
  assert.ok(gs.includes('"package_name": "com.houzzat.pro"'));
  assert.equal(gs.includes("com.houzzat.pro.private"), false);

  const capTs = read("capacitor.config.pro.ts");
  assert.ok(capTs.includes('appId: "com.houzzat.pro"'));
  assert.ok(capTs.includes(HOUZZATPRO_FULL_CRM_UA_MARKER));
  assert.equal(capTs.includes("HouzzatProPrivateUI"), false);
  assert.equal(capTs.includes("com.houzzat.pro.private"), false);

  const capJson = read("android-pro/app/src/main/assets/capacitor.config.json");
  assert.ok(capJson.includes('"appId": "com.houzzat.pro"'));
  assert.ok(capJson.includes(HOUZZATPRO_FULL_CRM_UA_MARKER));
  assert.equal(capJson.includes("HouzzatProPrivateUI"), false);

  const plugins = read("android-pro/app/src/main/assets/capacitor.plugins.json");
  assert.ok(plugins.includes("@capacitor/haptics"));

  // Private tree must remain untouched by this promotion.
  const privateCap = read(
    "android-pro-private/app/src/main/assets/capacitor.config.json",
  );
  assert.ok(privateCap.includes("com.houzzat.pro.private"));
  assert.ok(privateCap.includes("HouzzatProPrivateUI/1"));
}

function testHapticsWiring() {
  const haptics = read("src/lib/mobile/nav-selection-haptics.ts");
  assert.ok(haptics.includes("prefersProFullCrmExperience"));
  assert.ok(haptics.includes("ImpactStyle.Light"));
  assert.ok(haptics.includes("Haptics.impact"));
  assert.equal(haptics.includes("Haptics.selectionStart"), false);
  assert.equal(haptics.includes("navigator.vibrate"), false);
}

function main() {
  testCompatibilityMatrix();
  testProductionNativeIdentity();
  testHapticsWiring();
  console.log("pro-fullcrm-promote-selftest: ok");
}

main();
