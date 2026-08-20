/**
 * Native push token helpers (Preferences). Used for register dedupe + logout unregister.
 */

import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

const TOKEN_KEY = "houzzat.push.token";
const BOUND_USER_KEY = "houzzat.push.boundUserId";
const PENDING_UNREGISTER_KEY = "houzzat.push.pendingUnregister";
const PERMISSION_DENIED_KEY = "houzzat.push.permissionDenied";

function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export type PendingUnregister = {
  token: string;
  /** Only delete the row if it still belongs to this user. */
  userId: string;
};

export async function getStoredPushToken(): Promise<string | null> {
  if (!isNative()) return null;
  try {
    const { value } = await Preferences.get({ key: TOKEN_KEY });
    return value?.trim() || null;
  } catch {
    return null;
  }
}

export async function getBoundPushUserId(): Promise<string | null> {
  if (!isNative()) return null;
  try {
    const { value } = await Preferences.get({ key: BOUND_USER_KEY });
    return value?.trim() || null;
  } catch {
    return null;
  }
}

export async function setStoredPushBinding(
  token: string,
  userId: string,
): Promise<void> {
  if (!isNative()) return;
  try {
    await Preferences.set({ key: TOKEN_KEY, value: token });
    await Preferences.set({ key: BOUND_USER_KEY, value: userId });
  } catch {
    // ignore
  }
}

export async function clearStoredPushBinding(): Promise<void> {
  if (!isNative()) return;
  try {
    await Preferences.remove({ key: TOKEN_KEY });
    await Preferences.remove({ key: BOUND_USER_KEY });
  } catch {
    // ignore
  }
}

export async function getPendingUnregister(): Promise<PendingUnregister | null> {
  if (!isNative()) return null;
  try {
    const { value } = await Preferences.get({ key: PENDING_UNREGISTER_KEY });
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<PendingUnregister>;
    if (
      typeof parsed.token !== "string" ||
      !parsed.token.trim() ||
      typeof parsed.userId !== "string" ||
      !parsed.userId.trim()
    ) {
      return null;
    }
    return { token: parsed.token.trim(), userId: parsed.userId.trim() };
  } catch {
    return null;
  }
}

export async function setPendingUnregister(
  pending: PendingUnregister,
): Promise<void> {
  if (!isNative()) return;
  try {
    await Preferences.set({
      key: PENDING_UNREGISTER_KEY,
      value: JSON.stringify(pending),
    });
  } catch {
    // ignore
  }
}

export async function clearPendingUnregister(): Promise<void> {
  if (!isNative()) return;
  try {
    await Preferences.remove({ key: PENDING_UNREGISTER_KEY });
  } catch {
    // ignore
  }
}

export async function wasPushPermissionDenied(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { value } = await Preferences.get({ key: PERMISSION_DENIED_KEY });
    return value === "1";
  } catch {
    return false;
  }
}

export async function markPushPermissionDenied(): Promise<void> {
  if (!isNative()) return;
  try {
    await Preferences.set({ key: PERMISSION_DENIED_KEY, value: "1" });
  } catch {
    // ignore
  }
}

export async function clearPushPermissionDenied(): Promise<void> {
  if (!isNative()) return;
  try {
    await Preferences.remove({ key: PERMISSION_DENIED_KEY });
  } catch {
    // ignore
  }
}
