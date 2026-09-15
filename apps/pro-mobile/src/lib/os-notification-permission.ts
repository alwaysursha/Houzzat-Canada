/**
 * Stage 5.10 / 5.11 — OS notification permission helpers (Android).
 * Separate from HouzzatPRO preference toggles.
 *
 * Runtime POST_NOTIFICATIONS is Android 13+ (API 33) only, and only after
 * WORKSPACE_ACTIVE (caller). Never throws — denied must not break the app.
 */

import { Linking, PermissionsAndroid, Platform } from "react-native";
import {
  ANDROID_POST_NOTIFICATIONS_API,
  shouldRequestAndroidPostNotifications,
} from "./os-notification-permission-policy";

export type OsNotificationPermissionStatus =
  | "granted"
  | "denied"
  | "never_asked"
  | "unsupported";

export {
  ANDROID_POST_NOTIFICATIONS_API,
  shouldRequestAndroidPostNotifications,
};

let requestedPostNotificationsThisSession = false;

export function androidApiLevel(version: number | string = Platform.Version): number {
  return typeof version === "number" ? version : Number.parseInt(String(version), 10) || 0;
}

export function resetAndroidPostNotificationsSessionForTests(): void {
  requestedPostNotificationsThisSession = false;
}

export async function getOsNotificationPermissionStatus(): Promise<OsNotificationPermissionStatus> {
  if (Platform.OS !== "android") return "unsupported";
  const api = androidApiLevel();
  if (api < ANDROID_POST_NOTIFICATIONS_API) {
    // Pre-13: notifications generally available without runtime permission.
    return "granted";
  }
  try {
    const result = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    return result ? "granted" : "denied";
  } catch {
    return "unsupported";
  }
}

/**
 * After auth: prompt once per process if Android 13+ and not granted.
 * Never throws. Does not block callers that fire-and-forget this.
 */
export async function ensureAndroidPostNotificationsPermission(): Promise<OsNotificationPermissionStatus> {
  if (Platform.OS !== "android") return "unsupported";
  const api = androidApiLevel();
  if (api < ANDROID_POST_NOTIFICATIONS_API) return "granted";

  try {
    const alreadyGranted = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    if (
      !shouldRequestAndroidPostNotifications({
        os: "android",
        apiLevel: api,
        alreadyGranted,
        alreadyRequestedThisSession: requestedPostNotificationsThisSession,
      })
    ) {
      return alreadyGranted ? "granted" : "denied";
    }

    requestedPostNotificationsThisSession = true;
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    return result === PermissionsAndroid.RESULTS.GRANTED ? "granted" : "denied";
  } catch {
    return "denied";
  }
}

/** Open system app settings (user can enable notifications there). */
export async function openAppNotificationSettings(): Promise<boolean> {
  try {
    await Linking.openSettings();
    return true;
  } catch {
    return false;
  }
}
