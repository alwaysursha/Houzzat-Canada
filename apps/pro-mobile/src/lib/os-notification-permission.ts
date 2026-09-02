/**
 * Stage 5.10 — OS notification permission helpers (Android).
 * Separate from HouzzatPRO preference toggles.
 */

import { Linking, PermissionsAndroid, Platform } from "react-native";

export type OsNotificationPermissionStatus =
  | "granted"
  | "denied"
  | "never_asked"
  | "unsupported";

export async function getOsNotificationPermissionStatus(): Promise<OsNotificationPermissionStatus> {
  if (Platform.OS !== "android") return "unsupported";
  const api = typeof Platform.Version === "number" ? Platform.Version : 0;
  if (api < 33) {
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

/** Open system app settings (user can enable notifications there). */
export async function openAppNotificationSettings(): Promise<boolean> {
  try {
    await Linking.openSettings();
    return true;
  } catch {
    return false;
  }
}
