/**
 * Android 13+ POST_NOTIFICATIONS prompt + FCM register ordering.
 * Run: node --import tsx test/stage-5.11-android-notification-permission.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ANDROID_POST_NOTIFICATIONS_API,
  shouldRequestAndroidPostNotifications,
} from "../src/lib/os-notification-permission-policy";

const ROOT = join(__dirname, "..");

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function testApi33PlusNotGrantedPrompts() {
  assert.equal(
    shouldRequestAndroidPostNotifications({
      os: "android",
      apiLevel: ANDROID_POST_NOTIFICATIONS_API,
      alreadyGranted: false,
      alreadyRequestedThisSession: false,
    }),
    true,
    "Android 13+ not granted → prompt",
  );
}

function testGrantedNoUnnecessaryPrompt() {
  assert.equal(
    shouldRequestAndroidPostNotifications({
      os: "android",
      apiLevel: 34,
      alreadyGranted: true,
      alreadyRequestedThisSession: false,
    }),
    false,
    "already granted → no prompt",
  );
  assert.equal(
    shouldRequestAndroidPostNotifications({
      os: "android",
      apiLevel: 34,
      alreadyGranted: false,
      alreadyRequestedThisSession: true,
    }),
    false,
    "already asked this session → no second prompt",
  );
}

function testAndroid12NoRuntimePrompt() {
  assert.equal(
    shouldRequestAndroidPostNotifications({
      os: "android",
      apiLevel: 32,
      alreadyGranted: false,
      alreadyRequestedThisSession: false,
    }),
    false,
    "Android <13 → no runtime prompt",
  );
}

function testIosNoRuntimePrompt() {
  assert.equal(
    shouldRequestAndroidPostNotifications({
      os: "ios",
      apiLevel: 34,
      alreadyGranted: false,
      alreadyRequestedThisSession: false,
    }),
    false,
  );
}

function testWiringOrderAndNonBlocking() {
  const os = read("src/lib/os-notification-permission.ts");
  const push = read("src/lib/push-registration.ts");
  const boot = read("src/components/PushRegistrationBootstrap.tsx");
  const signIn = read("src/screens/SignInScreen.tsx");
  const app = read("App.tsx");

  assert.ok(os.includes("PermissionsAndroid.request"));
  assert.ok(os.includes("shouldRequestAndroidPostNotifications"));
  assert.ok(push.includes("ensureAndroidPostNotificationsPermission"));

  const registerStart = push.indexOf("export async function registerHouzzatProPush");
  const registerBody = push.slice(registerStart);
  const permIdx = registerBody.indexOf("ensureAndroidPostNotificationsPermission");
  const tokenIdx = registerBody.indexOf("getFcmToken");
  assert.ok(permIdx > 0 && tokenIdx > permIdx, "grant/deny resolved before FCM getToken");
  assert.ok(push.includes("/push/register"));
  assert.ok(push.includes(".catch(() => undefined)"));

  assert.ok(boot.includes('state === "WORKSPACE_ACTIVE"'));
  assert.ok(boot.includes("void registerHouzzatProPush"));
  assert.ok(boot.includes("AppState.addEventListener"));
  assert.ok(
    !signIn.includes("PermissionsAndroid"),
    "must not prompt before authentication",
  );
  assert.ok(app.includes("PushRegistrationBootstrap"));
}

testApi33PlusNotGrantedPrompts();
testGrantedNoUnnecessaryPrompt();
testAndroid12NoRuntimePrompt();
testIosNoRuntimePrompt();
testWiringOrderAndNonBlocking();

console.log("stage-5.11-android-notification-permission: ok");
