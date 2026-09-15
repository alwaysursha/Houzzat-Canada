/**
 * Foreground FCM tray display (Kotlin service contract).
 * Run: node --import tsx test/stage-5.11-foreground-push-display.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function testForegroundPostsAndBackgroundDoesNot() {
  const svc = read("android/app/src/main/java/com/houzzat/pro/HouzzatProFirebaseMessagingService.kt");
  assert.ok(svc.includes("onMessageReceived"));
  assert.ok(svc.includes("isAppInForeground"));
  assert.ok(svc.includes("if (!isAppInForeground()) return"));
  assert.ok(svc.includes("postForegroundNotification"));
  assert.ok(svc.includes("NotificationCompat.Builder"));
}

function testPreservesTitleBodyAndNavExtras() {
  const svc = read("android/app/src/main/java/com/houzzat/pro/HouzzatProFirebaseMessagingService.kt");
  assert.ok(svc.includes("message.notification?.title"));
  assert.ok(svc.includes("message.notification?.body"));
  assert.ok(svc.includes('message.data["href"]'));
  assert.ok(svc.includes('message.data["type"]'));
  assert.ok(svc.includes('putExtra("href", href)'));
  assert.ok(svc.includes('putExtra("type", type)'));
  assert.equal(svc.includes("lead_online"), false, "must not hardcode lead_online");
}

function testChannelPermissionAndTapPath() {
  const svc = read("android/app/src/main/java/com/houzzat/pro/HouzzatProFirebaseMessagingService.kt");
  const fcm = read("android/app/src/main/java/com/houzzat/pro/FcmModule.kt");
  const activity = read("android/app/src/main/java/com/houzzat/pro/MainActivity.kt");

  assert.ok(svc.includes("FcmModule.CHANNEL_ID") || svc.includes("houzzat_pro_alerts"));
  assert.ok(fcm.includes('CHANNEL_ID = "houzzat_pro_alerts"'));
  assert.ok(svc.includes("POST_NOTIFICATIONS"));
  assert.ok(svc.includes("areNotificationsEnabled"));
  assert.ok(svc.includes("MainActivity::class.java"));
  assert.ok(activity.includes("emitNotificationOpened"));
  assert.ok(activity.includes("onNewIntent"));
}

testForegroundPostsAndBackgroundDoesNot();
testPreservesTitleBodyAndNavExtras();
testChannelPermissionAndTapPath();

console.log("stage-5.11-foreground-push-display: ok");
