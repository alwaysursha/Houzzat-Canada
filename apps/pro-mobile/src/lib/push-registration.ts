/**
 * Stage 5.11 — Register / refresh / unregister HouzzatPRO FCM against PushDevice.
 *
 * Shell always houzzatpro. No second device model. Prefs unchanged (Stage 5.10).
 */

import { mobileApiClient } from "../api/client";
import { SecureStorage, SECURE_STORAGE_KEYS } from "../storage/secure-storage";
import {
  ensureProAlertsChannel,
  getFcmToken,
  isFcmBridgeAvailable,
} from "./fcm-bridge";
import { ensureAndroidPostNotificationsPermission } from "./os-notification-permission";

const PUSH_TOKEN_KEY = "houzzat_pro_v2_push_token";
const PUSH_USER_KEY = "houzzat_pro_v2_push_user";

let lastRegisteredToken: string | null = null;
let lastRegisteredUserId: string | null = null;
let registerInFlight: Promise<void> | null = null;

async function storeBinding(token: string, userId: string): Promise<void> {
  await SecureStorage.setItem(PUSH_TOKEN_KEY, token);
  await SecureStorage.setItem(PUSH_USER_KEY, userId);
  lastRegisteredToken = token;
  lastRegisteredUserId = userId;
}

async function clearBinding(): Promise<void> {
  await SecureStorage.removeItem(PUSH_TOKEN_KEY);
  await SecureStorage.removeItem(PUSH_USER_KEY);
  lastRegisteredToken = null;
  lastRegisteredUserId = null;
}

async function readStoredToken(): Promise<string | null> {
  const token = await SecureStorage.getItem(PUSH_TOKEN_KEY);
  return token && token.length >= 16 ? token : null;
}

export async function registerHouzzatProPush(userId: string): Promise<void> {
  if (!isFcmBridgeAvailable()) return;
  if (!userId) return;

  if (registerInFlight) {
    await registerInFlight;
    return;
  }

  registerInFlight = (async () => {
    // Prompt (API 33+) before getToken so a grant cannot land on an unregistered token.
    await ensureAndroidPostNotificationsPermission().catch(() => undefined);
    await ensureProAlertsChannel();
    const token = await getFcmToken();
    if (!token) return;

    if (
      lastRegisteredToken === token &&
      lastRegisteredUserId === userId
    ) {
      return;
    }

    const res = await mobileApiClient.post<{
      registered?: boolean;
      shell?: string;
    }>("/push/register", {
      token,
      platform: "android",
      shell: "houzzatpro",
    });

    if (res.ok) {
      await storeBinding(token, userId);
    }
  })();

  try {
    await registerInFlight;
  } finally {
    registerInFlight = null;
  }
}

/** Token refresh while still signed in — re-upsert PushDevice. */
export async function onFcmTokenRefresh(
  token: string,
  userId: string | null,
): Promise<void> {
  if (!userId || !token || token.length < 16) return;
  const res = await mobileApiClient.post("/push/register", {
    token,
    platform: "android",
    shell: "houzzatpro",
  });
  if (res.ok) {
    await storeBinding(token, userId);
  }
}

/**
 * Call BEFORE clearing auth tokens.
 * Only removes this device token when still owned by `userId`.
 */
export async function unregisterHouzzatProPushForLogout(
  userId: string | null,
  accessToken: string | null,
): Promise<void> {
  if (!userId) {
    await clearBinding();
    return;
  }

  const token =
    lastRegisteredToken ||
    (await readStoredToken());

  if (!token) {
    await clearBinding();
    return;
  }

  try {
    if (accessToken) {
      await mobileApiClient.post(
        "/push/unregister",
        { token },
        { token: accessToken, _authRetried: true },
      );
    }
  } catch {
    // Best-effort — account switch upsert still rebinds token.
  } finally {
    await clearBinding();
  }
}

/** Exported for tests — does not touch SecureStorage. */
export function __resetPushRegistrationMemory(): void {
  lastRegisteredToken = null;
  lastRegisteredUserId = null;
  registerInFlight = null;
}

export { PUSH_TOKEN_KEY, PUSH_USER_KEY, SECURE_STORAGE_KEYS };
