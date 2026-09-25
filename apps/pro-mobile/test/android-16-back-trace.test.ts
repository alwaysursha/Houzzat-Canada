/**
 * Temporary HOUZZAT_BACK_TRACE instrumentation. Logs only; back behavior stays.
 *
 * Run: node --import tsx apps/pro-mobile/test/android-16-back-trace.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const PREFIX = "HOUZZAT_BACK_TRACE";

function readApp(rel: string) {
  return readFileSync(join(APP, rel), "utf8");
}

function run() {
  console.log("=================================================================");
  console.log("ANDROID 16 — BACK TRACE (instrumentation only)");
  console.log("=================================================================\n");

  const activity = readApp(
    "android/app/src/main/java/com/houzzat/pro/MainActivity.kt",
  );
  const agent = readApp("src/screens/AgentShell.tsx");
  const hook = readApp("src/hooks/useAndroidHardwareBack.ts");
  const bridge = readApp("src/lib/android-hardware-back.ts");
  const manifest = readApp("android/app/src/main/AndroidManifest.xml");
  const backHandler = readApp(
    "node_modules/react-native/Libraries/Utilities/BackHandler.android.js",
  );
  const navigation = readApp(
    "node_modules/@react-navigation/native/lib/commonjs/useBackButton.native.js",
  );
  const emitter = readApp(
    "node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/modules/core/DeviceEventManagerModule.kt",
  );
  const instance = readApp(
    "node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/ReactInstanceManager.java",
  );

  console.log("[1] Native callback, onBackPressed, and default exit are logged...");
  assert.ok(activity.includes(`private const val BACK_TRACE = "${PREFIX}"`));
  assert.ok(activity.includes("native callback handleOnBackPressed"));
  assert.ok(activity.includes("native ReactActivity.onBackPressed enter"));
  assert.ok(activity.includes("native invokeDefaultOnBackPressed enter"));
  const callback = activity.slice(
    activity.indexOf("override fun handleOnBackPressed"),
    activity.indexOf("override fun getMainComponentName"),
  );
  assert.ok(callback.indexOf("isEnabled = false") < callback.indexOf("onBackPressed()"));
  assert.ok(callback.indexOf("onBackPressed()") < callback.lastIndexOf("isEnabled = true"));
  const exit = activity.slice(
    activity.indexOf("override fun invokeDefaultOnBackPressed"),
    activity.indexOf("override fun onNewIntent"),
  );
  assert.ok(
    exit.indexOf("predictiveBackCallback.isEnabled = false") <
      exit.indexOf("super.invokeDefaultOnBackPressed()"),
  );
  assert.ok(
    exit.indexOf("super.invokeDefaultOnBackPressed()") <
      exit.indexOf("predictiveBackCallback.isEnabled = true"),
  );
  assert.equal(manifest.includes('enableOnBackInvokedCallback="false"'), false);
  console.log("  -> native: PASS\n");

  console.log("[2] Emit and JS delivery are logged without a new BackHandler...");
  assert.ok(emitter.includes(PREFIX));
  assert.ok(emitter.includes("native DeviceEventManagerModule.emitHardwareBackPressed"));
  assert.ok(emitter.includes("native invokeDefaultBackPressHandler queued"));
  assert.ok(instance.includes(PREFIX));
  assert.ok(instance.includes("native ReactInstanceManager.onBackPressed emit"));
  assert.ok(backHandler.includes(`${PREFIX} js hardwareBackPress delivered`));
  assert.ok(backHandler.includes(`${PREFIX} js BackHandler.exitApp`));
  assert.ok(navigation.includes(`${PREFIX} react-navigation useBackButton subscribed`));
  assert.ok(navigation.includes("navigation.goBack()"));
  assert.equal((bridge.match(/nativeSub = bridge.addEventListener\("hardwareBackPress"/g) ?? []).length, 1);
  assert.equal(agent.includes("BackHandler.addEventListener"), false);
  assert.equal(hook.includes("BackHandler.addEventListener"), false);
  console.log("  -> delivery: PASS\n");

  console.log("[3] AgentShell logs tab, leads ref, and stack without changing pop order...");
  const onBack = agent.slice(agent.indexOf("onBack: () => {"), agent.indexOf("isAtRoot:"));
  assert.ok(onBack.includes("leadsBackSnapshot(activeRoute)"));
  assert.ok(onBack.includes("js agent-shell consumed leads-pop"));
  assert.ok(onBack.indexOf("popLeadsStackIfPushed()") < onBack.indexOf('navigateTab("launchpad"'));
  assert.ok(agent.includes("embeddedInShell"));
  console.log("  -> shell: PASS\n");

  console.log("ANDROID 16 BACK TRACE: ALL PASS\n");
}

run();
