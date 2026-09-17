/**
 * Houzzat iOS FCM token registration (structural).
 * Run: pnpm houzzat-ios-fcm-register:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function main() {
  const client = read("src/lib/notifications/push-client.ts");
  const fcm = read("src/lib/notifications/houzzat-fcm.ts");
  const native = read("ios/App/App/HouzzatFcmPlugin.swift");
  const bridgeVc = read("ios/App/App/HouzzatBridgeViewController.swift");
  const scene = read("ios/App/App/SceneDelegate.swift");
  const storyboard = read("ios/App/App/Base.lproj/Main.storyboard");
  const register = read("src/app/api/notifications/register/route.ts");

  assert.ok(fcm.includes('registerPlugin<HouzzatFcmPlugin>("HouzzatFcm")'));
  assert.ok(fcm.includes('eventName: "fcmToken"'));
  assert.ok(native.includes('jsName = "HouzzatFcm"'));
  assert.ok(native.includes("getToken"));
  assert.ok(native.includes('notifyListeners("fcmToken"'));
  assert.ok(bridgeVc.includes("registerPluginInstance(HouzzatFcmPlugin())"));
  assert.ok(bridgeVc.includes("override func capacitorDidLoad()"));
  assert.ok(scene.includes("HouzzatBridgeViewController()"));
  assert.ok(storyboard.includes('customClass="HouzzatBridgeViewController"'));

  assert.ok(client.includes('from "@/lib/notifications/houzzat-fcm"'));
  assert.ok(client.includes("HouzzatFcm.getToken()"));
  assert.ok(client.includes('HouzzatFcm.addListener("fcmToken"'));
  assert.ok(client.includes('await postRegister(value, "houzzat")'));
  assert.ok(client.includes("await PushNotifications.register()"));
  assert.ok(client.includes("PushNotifications.requestPermissions()"));
  assert.ok(client.includes("PushNotifications.checkPermissions()"));

  const listener = client.slice(
    client.indexOf("async function ensureRegistrationListener"),
    client.indexOf("export async function registerPushForSession"),
  );
  assert.ok(listener.includes("if (isHouzzatIos())"));
  assert.ok(listener.includes("void registerHouzzatIosFcmToken()"));
  assert.ok(
    listener.includes("void registerHouzzatIosFcmToken();\n        return;"),
    "Houzzat iOS must not POST Capacitor registration (APNs) token",
  );
  assert.ok(listener.includes("void postRegister(value, registrationShell)"));

  assert.ok(client.includes("if (stored && !isHouzzatIos())"));
  assert.ok(client.includes("if (isHouzzatIos()) {\n        await registerHouzzatIosFcmToken()"));

  assert.ok(register.includes('platform: z.enum(["android", "ios", "web"])'));
  assert.ok(register.includes('shell: z.enum(["houzzat", "houzzatpro"])'));

  const proDelegate = read("ios-pro/App/App/AppDelegate.swift");
  assert.ok(
    !proDelegate.includes("HouzzatFirebaseMessaging"),
    "must not modify HouzzatPRO iOS AppDelegate",
  );

  console.log("houzzat-ios-fcm-register-selftest: OK");
}

main();
