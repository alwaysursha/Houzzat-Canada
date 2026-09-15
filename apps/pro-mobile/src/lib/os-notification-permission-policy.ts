/** Android 13+ (API 33) requires a runtime POST_NOTIFICATIONS prompt. */
export const ANDROID_POST_NOTIFICATIONS_API = 33;

/** Pure decision: when to show the Android 13+ system notification prompt. */
export function shouldRequestAndroidPostNotifications(input: {
  os: string;
  apiLevel: number;
  alreadyGranted: boolean;
  alreadyRequestedThisSession: boolean;
}): boolean {
  if (input.os !== "android") return false;
  if (input.apiLevel < ANDROID_POST_NOTIFICATIONS_API) return false;
  if (input.alreadyGranted) return false;
  if (input.alreadyRequestedThisSession) return false;
  return true;
}
