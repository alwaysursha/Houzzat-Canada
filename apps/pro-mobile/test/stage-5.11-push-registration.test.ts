/**
 * Stage 5.11 — Native HouzzatPRO Push Registration tests.
 *
 * Canonical PushDevice + Mobile v2 register/unregister.
 * Shell = houzzatpro. No Prisma migration. No biometrics. Prefs unchanged.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  resolvePushNavTarget,
  sanitizePushHref,
} from "../src/lib/push-href";

const REPO_ROOT = join(__dirname, "../../..");
const REGISTER = join(
  REPO_ROOT,
  "src/app/api/mobile/v2/push/register/route.ts",
);
const UNREGISTER = join(
  REPO_ROOT,
  "src/app/api/mobile/v2/push/unregister/route.ts",
);
const WEB_REGISTER = join(
  REPO_ROOT,
  "src/app/api/notifications/register/route.ts",
);
const SCHEMA = join(REPO_ROOT, "prisma/schema.prisma");
const GOOGLE_SERVICES = join(
  REPO_ROOT,
  "apps/pro-mobile/android/app/google-services.json",
);
const MANIFEST = join(
  REPO_ROOT,
  "apps/pro-mobile/android/app/src/main/AndroidManifest.xml",
);
const APP_GRADLE = join(
  REPO_ROOT,
  "apps/pro-mobile/android/app/build.gradle",
);
const ROOT_GRADLE = join(
  REPO_ROOT,
  "apps/pro-mobile/android/build.gradle",
);
const FCM_MODULE = join(
  REPO_ROOT,
  "apps/pro-mobile/android/app/src/main/java/com/houzzat/pro/FcmModule.kt",
);
const FCM_SERVICE = join(
  REPO_ROOT,
  "apps/pro-mobile/android/app/src/main/java/com/houzzat/pro/HouzzatProFirebaseMessagingService.kt",
);
const PUSH_REG = join(
  REPO_ROOT,
  "apps/pro-mobile/src/lib/push-registration.ts",
);
const AUTH = join(
  REPO_ROOT,
  "apps/pro-mobile/src/state/auth-controller.ts",
);
const APP = join(REPO_ROOT, "apps/pro-mobile/App.tsx");
const PREFS_ROUTE = join(
  REPO_ROOT,
  "src/app/api/mobile/v2/notification-preferences/route.ts",
);
const PREFS_SCREEN = join(
  REPO_ROOT,
  "apps/pro-mobile/src/screens/NotificationPreferencesScreen.tsx",
);
const PUSH_SEND = join(REPO_ROOT, "src/lib/notifications/push.ts");
const WORKSPACE_RECIPIENTS = join(
  REPO_ROOT,
  "src/lib/workspace-notification-recipients.ts",
);

function runStage511Tests() {
  console.log("\n=== STAGE 5.11 — NATIVE PUSH REGISTRATION ===\n");

  console.log("[1] Firebase google-services.json for com.houzzat.pro...");
  {
    assert.equal(existsSync(GOOGLE_SERVICES), true);
    const json = readFileSync(GOOGLE_SERVICES, "utf8");
    assert.ok(json.includes("houzzat-aa1b0"));
    assert.ok(json.includes("com.houzzat.pro"));
    console.log("  -> PASS");
  }

  console.log("[2] PushDevice model unchanged (no workspaceId)...");
  {
    const schema = readFileSync(SCHEMA, "utf8");
    const start = schema.indexOf("model PushDevice");
    assert.ok(start > 0);
    const block = schema.slice(start, start + 400);
    assert.ok(block.includes("userId"));
    assert.ok(block.includes("token"));
    assert.ok(block.includes("shell"));
    assert.ok(block.includes("platform"));
    assert.equal(block.includes("workspaceId"), false);
    console.log("  -> PASS");
  }

  console.log("[3] Existing web register + new Mobile v2 register...");
  {
    assert.equal(existsSync(WEB_REGISTER), true);
    assert.equal(existsSync(REGISTER), true);
    assert.equal(existsSync(UNREGISTER), true);
    const reg = readFileSync(REGISTER, "utf8");
    assert.ok(reg.includes("authorizeMobileWorkspaceAccess"));
    assert.ok(reg.includes('shell: "houzzatpro"'));
    assert.ok(reg.includes("pushDevice.upsert"));
    assert.ok(reg.includes("access.userId"));
    assert.ok(reg.includes("userId is not accepted"));
    console.log("  -> PASS");
  }

  console.log("[4] Reject unknown fields / non-houzzatpro shell...");
  {
    const reg = readFileSync(REGISTER, "utf8");
    assert.ok(reg.includes("Unknown fields"));
    assert.ok(reg.includes("shell must be houzzatpro"));
    assert.ok(reg.includes('z.enum(["android", "ios", "web"])'));
    console.log("  -> PASS");
  }

  console.log("[5] Unregister scoped to authenticated user only...");
  {
    const un = readFileSync(UNREGISTER, "utf8");
    assert.ok(un.includes("authorizeMobileWorkspaceAccess"));
    assert.ok(un.includes("userId: access.userId"));
    assert.ok(un.includes("deleteMany"));
    assert.equal(un.includes("onlyUserId"), false);
    console.log("  -> PASS");
  }

  console.log("[6] Android FCM wiring (gradle + manifest + module)...");
  {
    const appG = readFileSync(APP_GRADLE, "utf8");
    const rootG = readFileSync(ROOT_GRADLE, "utf8");
    const man = readFileSync(MANIFEST, "utf8");
    assert.ok(rootG.includes("com.google.gms:google-services"));
    assert.ok(appG.includes("com.google.gms.google-services"));
    assert.ok(appG.includes("firebase-messaging"));
    assert.ok(appG.includes('applicationId "com.houzzat.pro"'));
    assert.ok(man.includes("HouzzatProFirebaseMessagingService"));
    assert.ok(man.includes("houzzat_pro_alerts"));
    assert.ok(man.includes("ic_stat_houzzat_pro"));
    assert.equal(existsSync(FCM_MODULE), true);
    assert.equal(existsSync(FCM_SERVICE), true);
    const svc = readFileSync(FCM_SERVICE, "utf8");
    assert.ok(svc.includes("onNewToken"));
    assert.ok(svc.includes("NotificationCompat"));
    assert.ok(svc.includes("isAppInForeground"));
    assert.ok(svc.includes("houzzat_pro_alerts") || svc.includes("FcmModule.CHANNEL_ID"));
    console.log("  -> PASS");
  }

  console.log("[7] Native registration lifecycle + logout cleanup...");
  {
    const push = readFileSync(PUSH_REG, "utf8");
    const auth = readFileSync(AUTH, "utf8");
    const app = readFileSync(APP, "utf8");
    assert.ok(push.includes('shell: "houzzatpro"'));
    assert.ok(push.includes("/push/register"));
    assert.ok(push.includes("/push/unregister"));
    assert.ok(push.includes("unregisterHouzzatProPushForLogout"));
    assert.ok(push.includes("ensureAndroidPostNotificationsPermission"));
    const registerStart = push.indexOf("export async function registerHouzzatProPush");
    const registerBody = push.slice(registerStart);
    const permIdx = registerBody.indexOf("ensureAndroidPostNotificationsPermission");
    const tokenIdx = registerBody.indexOf("getFcmToken");
    assert.ok(permIdx > 0 && tokenIdx > permIdx);
    assert.ok(auth.includes("unregisterHouzzatProPushForLogout"));
    assert.ok(app.includes("PushRegistrationBootstrap"));
    console.log("  -> PASS");
  }

  console.log("[8] Account-switch upsert semantics (token unique)...");
  {
    const reg = readFileSync(REGISTER, "utf8");
    // Same token → update userId to authenticated user (A→B rebind)
    assert.ok(reg.includes("where: { token:"));
    assert.ok(reg.includes("update:"));
    assert.ok(reg.includes("userId: access.userId"));
    console.log("  -> PASS");
  }

  console.log("[9] Workspace switch does not invent workspaceId on device...");
  {
    const push = readFileSync(PUSH_REG, "utf8");
    assert.equal(push.includes("workspaceId"), false);
    const reg = readFileSync(REGISTER, "utf8");
    assert.equal(reg.includes("workspaceId:"), false);
    console.log("  -> PASS");
  }

  console.log("[10] Push href sanitize + native destinations...");
  {
    assert.equal(sanitizePushHref("https://houzzat.com/agent/leads"), null);
    assert.equal(sanitizePushHref("//evil"), null);
    assert.equal(sanitizePushHref("/agent/open-lead/abc"), "/agent/open-lead/abc");
    assert.deepEqual(resolvePushNavTarget("/agent/open-lead/lead_1"), {
      kind: "lead",
      leadId: "lead_1",
    });
    assert.deepEqual(resolvePushNavTarget("/agent/leads?lead=lead_2"), {
      kind: "lead",
      leadId: "lead_2",
    });
    assert.deepEqual(resolvePushNavTarget("/agent/tasks"), { kind: "tasks" });
    assert.deepEqual(resolvePushNavTarget("/agent/unknown"), { kind: "home" });
    assert.deepEqual(resolvePushNavTarget("https://tenant-canary.houzzatpro.com"), {
      kind: "home",
    });
    console.log("  -> PASS");
  }

  console.log("[11] Tenant-safe send targeting still membership-scoped...");
  {
    const push = readFileSync(PUSH_SEND, "utf8");
    assert.ok(push.includes("shellForAudience"));
    assert.ok(existsSync(WORKSPACE_RECIPIENTS));
    const recipients = readFileSync(WORKSPACE_RECIPIENTS, "utf8");
    assert.ok(
      recipients.includes("authorizeStaffRecipientForLead") ||
        recipients.includes("WorkspaceMember") ||
        recipients.includes("workspaceId"),
    );
    console.log("  -> PASS");
  }

  console.log("[12] Stage 5.10 preferences unchanged...");
  {
    const prefs = readFileSync(PREFS_ROUTE, "utf8");
    const screen = readFileSync(PREFS_SCREEN, "utf8");
    assert.ok(prefs.includes("pushNotificationPrefs"));
    assert.ok(prefs.includes("staffCategoriesForUi"));
    assert.ok(screen.includes("NotificationPreferencesScreen"));
    assert.ok(screen.includes("caslNotConfigurableHere") || prefs.includes("caslNotConfigurableHere"));
    console.log("  -> PASS");
  }

  console.log("[13] No biometrics / no new push vendor...");
  {
    const push = readFileSync(PUSH_REG, "utf8");
    assert.equal(push.toLowerCase().includes("biometric"), false);
    assert.equal(push.includes("OneSignal"), false);
    assert.equal(push.includes("MobilePushDevice"), false);
    const appG = readFileSync(APP_GRADLE, "utf8");
    assert.equal(appG.includes("onesignal"), false);
    console.log("  -> PASS");
  }

  console.log("\nSTAGE 5.11 — ALL TESTS PASSED\n");
}

runStage511Tests();
