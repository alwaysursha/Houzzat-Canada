/**
 * Houzzat native push: register, unregister, tap → safe internal navigation.
 * Consumer + Pro shells both use this module; shell is resolved at register time.
 */

import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { resolveAppShell } from "@/lib/mobile/app-shell";
import { hardGo } from "@/lib/mobile/nav-back";
import { scheduleAfterFirstPaint } from "@/lib/mobile/schedule-idle";
import {
  bindPendingPushNavigationUser,
  clearPendingPushNavigation,
  hydratePendingPushNavigation,
  markPushNavigationFinished,
  markPushNavigationStarted,
  shouldDeferPushNavigationConsume,
  stashPendingPushNavigation,
  takePendingPushNavigation,
} from "@/lib/notifications/pending-push-nav";
import { isBiometricGateLocked } from "@/lib/mobile/biometric-gate-state";
import {
  clearPendingUnregister,
  clearPushPermissionDenied,
  clearStoredPushBinding,
  getBoundPushUserId,
  getPendingUnregister,
  getStoredPushToken,
  markPushPermissionDenied,
  setPendingUnregister,
  setStoredPushBinding,
  wasPushPermissionDenied,
} from "@/lib/notifications/push-device-store";
import {
  HOUZZAT_PRO_ALERTS_CHANNEL_DESCRIPTION,
  HOUZZAT_PRO_ALERTS_CHANNEL_ID,
  HOUZZAT_PRO_ALERTS_CHANNEL_IMPORTANCE,
  HOUZZAT_PRO_ALERTS_CHANNEL_NAME,
  HOUZZAT_PRO_ALERTS_CHANNEL_VISIBILITY,
  HOUZZAT_UPDATES_CHANNEL_DESCRIPTION,
  HOUZZAT_UPDATES_CHANNEL_ID,
  HOUZZAT_UPDATES_CHANNEL_IMPORTANCE,
  HOUZZAT_UPDATES_CHANNEL_NAME,
  HOUZZAT_UPDATES_CHANNEL_VISIBILITY,
} from "@/lib/notifications/android-channel";
import { HouzzatFcm } from "@/lib/notifications/houzzat-fcm";

let actionListenerAttached = false;
let registrationListenerAttached = false;
let iosFcmRefreshListenerAttached = false;
let registerInFlight = false;
let consumerChannelReady = false;
let proChannelReady = false;
let lastRegisteredToken: string | null = null;
let lastPostedToken: string | null = null;
let lastPostedUserId: string | null = null;
let registrationShell: "houzzat" | "houzzatpro" = "houzzat";
let registrationUserId: string | null = null;

function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function platform(): "android" | "ios" {
  return Capacitor.getPlatform() === "ios" ? "ios" : "android";
}

/**
 * Ensure HIGH-importance consumer channel exists (heads-up banners).
 * No-op on iOS / Pro. Safe to call repeatedly — Android ignores recreate
 * with the same id (importance stays as first-created).
 */
export async function ensureHouzzatUpdatesChannel(): Promise<void> {
  if (!isNative() || platform() !== "android" || consumerChannelReady) return;
  try {
    await PushNotifications.createChannel({
      id: HOUZZAT_UPDATES_CHANNEL_ID,
      name: HOUZZAT_UPDATES_CHANNEL_NAME,
      description: HOUZZAT_UPDATES_CHANNEL_DESCRIPTION,
      importance: HOUZZAT_UPDATES_CHANNEL_IMPORTANCE,
      visibility: HOUZZAT_UPDATES_CHANNEL_VISIBILITY,
      vibration: true,
      // Omit sound → system default for HIGH channels.
    });
    consumerChannelReady = true;
  } catch {
    // Plugin / older Android — FCM may still land in default channel.
  }
}

/**
 * Ensure HIGH-importance HouzzatPro staff channel exists (heads-up + private lock screen).
 * No-op on iOS / consumer. New channel id — no sticky upgrade from consumer.
 */
export async function ensureHouzzatProAlertsChannel(): Promise<void> {
  if (!isNative() || platform() !== "android" || proChannelReady) return;
  try {
    await PushNotifications.createChannel({
      id: HOUZZAT_PRO_ALERTS_CHANNEL_ID,
      name: HOUZZAT_PRO_ALERTS_CHANNEL_NAME,
      description: HOUZZAT_PRO_ALERTS_CHANNEL_DESCRIPTION,
      importance: HOUZZAT_PRO_ALERTS_CHANNEL_IMPORTANCE,
      visibility: HOUZZAT_PRO_ALERTS_CHANNEL_VISIBILITY,
      vibration: true,
    });
    proChannelReady = true;
  } catch {
    // Plugin / older Android — FCM may still land in default channel.
  }
}

async function postRegister(token: string, shell: "houzzat" | "houzzatpro") {
  if (
    lastPostedToken === token &&
    lastPostedUserId &&
    lastPostedUserId === registrationUserId
  ) {
    return;
  }
  const res = await fetch("/api/notifications/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token,
      platform: platform(),
      shell,
    }),
  });
  if (res.ok) {
    lastPostedToken = token;
    lastPostedUserId = registrationUserId;
    if (registrationUserId) {
      await setStoredPushBinding(token, registrationUserId);
    }
  }
}

async function deleteTokenOnServer(input: {
  token: string;
  onlyUserId?: string;
}): Promise<boolean> {
  try {
    const res = await fetch("/api/notifications/unregister", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Flush offline logout unregister without harming a rebinding account. */
export async function flushPendingPushUnregister(): Promise<void> {
  if (!isNative()) return;
  const pending = await getPendingUnregister();
  if (!pending) return;
  const ok = await deleteTokenOnServer({
    token: pending.token,
    onlyUserId: pending.userId,
  });
  if (ok) {
    await clearPendingUnregister();
    const stored = await getStoredPushToken();
    if (stored === pending.token) {
      await clearStoredPushBinding();
      lastRegisteredToken = null;
      lastPostedToken = null;
      lastPostedUserId = null;
    }
  }
}

function navigateToPushHref(href: string) {
  if (typeof window === "undefined") return;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (current === href) return;
  markPushNavigationStarted();
  try {
    hardGo(href);
  } finally {
    markPushNavigationFinished();
  }
}

/** Consume a stashed tap destination exactly once (after biometric unlock if gated). */
export function consumePendingPushNavigation(options?: {
  expectedUserId?: string | null;
}): void {
  if (isBiometricGateLocked()) return;
  // Pro bootstrap / handoff must finish before CRM deep links run.
  if (shouldDeferPushNavigationConsume()) return;
  const href = takePendingPushNavigation({
    expectedUserId: options?.expectedUserId,
  });
  if (!href) return;
  navigateToPushHref(href);
}

export {
  bindPendingPushNavigationUser,
  clearPendingPushNavigation,
  hydratePendingPushNavigation,
};

function handleActionPerformed(notification: {
  id?: string;
  data?: Record<string, unknown>;
}) {
  const data = notification.data ?? {};
  const messageId =
    notification.id ??
    (typeof data["google.message_id"] === "string"
      ? data["google.message_id"]
      : null);
  if (!stashPendingPushNavigation({ href: data.href, id: messageId })) return;
  // Keep destination pending while biometric lock covers the app.
  if (isBiometricGateLocked()) return;
  // Cold-start on Pro bootstrap host: stash only — handoff restores later.
  if (shouldDeferPushNavigationConsume()) return;
  const taken = takePendingPushNavigation();
  if (taken) navigateToPushHref(taken);
}

/**
 * Attach tap listener once per JS context (before auth).
 * Retained Capacitor events cover warm + many cold starts.
 */
export async function ensurePushActionListener(): Promise<void> {
  if (!isNative() || actionListenerAttached) return;
  actionListenerAttached = true;
  try {
    await hydratePendingPushNavigation();
    await ensureHouzzatUpdatesChannel();
    await PushNotifications.addListener(
      "pushNotificationActionPerformed",
      (action) => {
        handleActionPerformed({
          id: action.notification?.id,
          data: action.notification?.data as
            | Record<string, unknown>
            | undefined,
        });
      },
    );
  } catch {
    actionListenerAttached = false;
  }
}

function isHouzzatIos(): boolean {
  return platform() === "ios" && registrationShell === "houzzat";
}

async function postHouzzatIosFcmToken(token: string): Promise<void> {
  const value = token.trim();
  if (!value || !isHouzzatIos()) return;
  lastRegisteredToken = value;
  await postRegister(value, "houzzat");
}

/** FCM token from native HouzzatFcm — never the Capacitor APNs token. */
async function registerHouzzatIosFcmToken(): Promise<void> {
  if (!isHouzzatIos()) return;
  try {
    const result = await HouzzatFcm.getToken();
    const value = result?.token?.trim();
    if (!value) return;
    await postHouzzatIosFcmToken(value);
  } catch {
    // APNs may still be settling; fcmToken listener retries.
  }
}

async function ensureHouzzatIosFcmRefreshListener(): Promise<void> {
  if (iosFcmRefreshListenerAttached || !isHouzzatIos()) return;
  iosFcmRefreshListenerAttached = true;
  try {
    await HouzzatFcm.addListener("fcmToken", (event) => {
      const value = event?.token?.trim();
      if (!value || !isHouzzatIos()) return;
      void postHouzzatIosFcmToken(value);
    });
  } catch {
    iosFcmRefreshListenerAttached = false;
  }
}

async function ensureRegistrationListener(): Promise<void> {
  if (registrationListenerAttached) return;
  registrationListenerAttached = true;
  try {
    await PushNotifications.addListener("registration", (token) => {
      if (isHouzzatIos()) {
        void registerHouzzatIosFcmToken();
        return;
      }
      const value = token.value?.trim();
      if (!value) return;
      lastRegisteredToken = value;
      void postRegister(value, registrationShell);
    });
    await ensureHouzzatIosFcmRefreshListener();
  } catch {
    registrationListenerAttached = false;
  }
}

/**
 * Request permission (if appropriate) and register FCM token.
 * Skips auto-prompt when the user previously denied.
 */
export async function registerPushForSession(options?: {
  userId?: string | null;
  /** When true, prompt even if previously denied (Account → Enable). */
  forcePrompt?: boolean;
}): Promise<"registered" | "denied" | "skipped" | "error"> {
  if (!isNative()) return "skipped";

  await flushPendingPushUnregister();
  await ensurePushActionListener();

  try {
    const shell = await resolveAppShell();
    if (shell !== "houzzat" && shell !== "houzzatpro") return "skipped";
    registrationShell = shell;
    registrationUserId = options?.userId?.trim() || null;

    if (shell === "houzzat") {
      await ensureHouzzatUpdatesChannel();
    } else if (shell === "houzzatpro") {
      await ensureHouzzatProAlertsChannel();
    }

    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === "granted") {
      await clearPushPermissionDenied();
    } else if (perm.receive === "denied") {
      await markPushPermissionDenied();
      return "denied";
    } else if (
      perm.receive === "prompt" ||
      perm.receive === "prompt-with-rationale"
    ) {
      if (!options?.forcePrompt && (await wasPushPermissionDenied())) {
        return "denied";
      }
      perm = await PushNotifications.requestPermissions();
      if (perm.receive !== "granted") {
        await markPushPermissionDenied();
        return "denied";
      }
      await clearPushPermissionDenied();
    } else {
      return "skipped";
    }

    await ensureRegistrationListener();

    const stored = await getStoredPushToken();
    if (stored && !isHouzzatIos()) {
      lastRegisteredToken = stored;
      await postRegister(stored, shell);
    }

    if (registerInFlight) return "registered";
    registerInFlight = true;
    try {
      await PushNotifications.register();
      if (isHouzzatIos()) {
        await registerHouzzatIosFcmToken();
      }
    } finally {
      registerInFlight = false;
    }
    return "registered";
  } catch {
    return "error";
  }
}

/**
 * Unregister THIS device token only. Best-effort; logout must not block.
 * Offline → pending Preferences cleanup scoped to the prior userId.
 */
export async function unregisterCurrentPushDevice(options?: {
  userId?: string | null;
}): Promise<void> {
  if (!isNative()) return;

  const token =
    (await getStoredPushToken()) || lastRegisteredToken || lastPostedToken;
  if (!token) return;

  const userId =
    options?.userId?.trim() ||
    (await getBoundPushUserId()) ||
    lastPostedUserId;

  const ok = await deleteTokenOnServer(
    userId ? { token, onlyUserId: userId } : { token },
  );
  if (ok) {
    await clearPendingUnregister();
    await clearStoredPushBinding();
    lastRegisteredToken = null;
    lastPostedToken = null;
    lastPostedUserId = null;
    return;
  }

  if (userId) {
    await setPendingUnregister({ token, userId });
  }
  await clearStoredPushBinding();
  lastRegisteredToken = null;
  lastPostedToken = null;
  lastPostedUserId = null;
}

/** Explicit enable from Account → Notifications. */
export async function enablePushFromSettings(userId?: string | null): Promise<
  "registered" | "denied" | "skipped" | "error"
> {
  await clearPushPermissionDenied();
  return registerPushForSession({ forcePrompt: true, userId });
}

/** Defer registration until after first paint (Home stays snappy). */
export function schedulePushRegistration(run: () => void): () => void {
  return scheduleAfterFirstPaint(run, { timeoutMs: 2_800 });
}
