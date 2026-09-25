/**
 * Android 16 — system Back is delivered through OnBackPressedCallback
 * into the existing ReactActivity path, without a manifest opt-out.
 *
 * Run: node --import tsx apps/pro-mobile/test/android-16-back-bridge.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");

function readApp(rel: string) {
  return readFileSync(join(APP, rel), "utf8");
}

function run() {
  console.log("=================================================================");
  console.log("ANDROID 16 — BACK DISPATCHER BRIDGE");
  console.log("=================================================================\n");

  const activity = readApp(
    "android/app/src/main/java/com/houzzat/pro/MainActivity.kt",
  );
  const manifest = readApp("android/app/src/main/AndroidManifest.xml");
  const gradle = readApp("android/build.gradle");
  const agent = readApp("src/screens/AgentShell.tsx");

  console.log("[1] API 36 activity registers one OnBackPressedCallback...");
  assert.ok(gradle.includes("targetSdkVersion = 36"));
  assert.ok(activity.includes("OnBackPressedCallback"));
  assert.ok(activity.includes("applicationInfo.targetSdkVersion >= 36"));
  assert.ok(activity.includes("onBackPressedDispatcher.addCallback(this, predictiveBackCallback)"));
  assert.ok(activity.includes("super.onCreate(null)"));
  assert.equal(manifest.includes('enableOnBackInvokedCallback="false"'), false);
  console.log("  -> registration: PASS\n");

  console.log("[2] Callback enters existing onBackPressed, then re-enables...");
  const callback = activity.slice(
    activity.indexOf("private val predictiveBackCallback"),
    activity.indexOf("override fun getMainComponentName"),
  );
  assert.ok(callback.includes("isEnabled = false"));
  assert.ok(callback.indexOf("isEnabled = false") < callback.indexOf("onBackPressed()"));
  assert.ok(callback.indexOf("onBackPressed()") < callback.lastIndexOf("isEnabled = true"));
  console.log("  -> forward: PASS\n");

  console.log("[3] exitApp disables the callback before the default back...");
  const exit = activity.slice(
    activity.indexOf("override fun invokeDefaultOnBackPressed"),
    activity.indexOf("override fun onNewIntent"),
  );
  assert.ok(exit.includes("predictiveBackCallback.isEnabled = false"));
  assert.ok(exit.includes("super.invokeDefaultOnBackPressed()"));
  assert.ok(exit.includes("predictiveBackCallback.isEnabled = true"));
  assert.ok(
    exit.indexOf("predictiveBackCallback.isEnabled = false") <
      exit.indexOf("super.invokeDefaultOnBackPressed()"),
  );
  assert.ok(
    exit.indexOf("super.invokeDefaultOnBackPressed()") <
      exit.indexOf("predictiveBackCallback.isEnabled = true"),
  );
  console.log("  -> exit: PASS\n");

  console.log("[4] No extra JS BackHandler and Leads stack stay...");
  assert.equal(agent.includes("BackHandler.addEventListener"), false);
  assert.ok(agent.includes('name="LeadProfile"'));
  assert.ok(agent.includes("embeddedInShell"));
  assert.ok(agent.includes("popLeadsStackIfPushed()"));
  console.log("  -> js unchanged: PASS\n");

  console.log("ANDROID 16 BACK BRIDGE: ALL PASS\n");
}

run();
