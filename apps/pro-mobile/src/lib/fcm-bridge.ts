/**
 * Stage 5.11 — NativeModule bridge for HouzzatProFcm (Android).
 */

import { NativeEventEmitter, NativeModules, Platform } from "react-native";

type FcmNative = {
  ensureProAlertsChannel(): Promise<boolean>;
  getToken(): Promise<string>;
  getInitialNotification(): Promise<{ href?: string; type?: string } | null>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
};

const NativeFcm = NativeModules.HouzzatProFcm as FcmNative | undefined;

export function isFcmBridgeAvailable(): boolean {
  return Platform.OS === "android" && Boolean(NativeFcm);
}

export async function ensureProAlertsChannel(): Promise<void> {
  if (!NativeFcm) return;
  try {
    await NativeFcm.ensureProAlertsChannel();
  } catch {
    // Channel creation is best-effort; FCM may still deliver.
  }
}

export async function getFcmToken(): Promise<string | null> {
  if (!NativeFcm) return null;
  try {
    const token = await NativeFcm.getToken();
    if (typeof token !== "string" || token.trim().length < 16) return null;
    return token.trim();
  } catch {
    return null;
  }
}

export async function getInitialPushNotification(): Promise<{
  href: string;
  type: string;
} | null> {
  if (!NativeFcm) return null;
  try {
    const raw = await NativeFcm.getInitialNotification();
    if (!raw || typeof raw !== "object") return null;
    const href = typeof raw.href === "string" ? raw.href : "";
    const type = typeof raw.type === "string" ? raw.type : "";
    if (!href && !type) return null;
    return { href, type };
  } catch {
    return null;
  }
}

export function subscribeFcmTokenRefresh(
  onToken: (token: string) => void,
): () => void {
  if (!NativeFcm) return () => {};
  const emitter = new NativeEventEmitter(NativeModules.HouzzatProFcm);
  const sub = emitter.addListener("houzzatpro_fcm_token", (event: unknown) => {
    if (!event || typeof event !== "object") return;
    const token = (event as { token?: unknown }).token;
    if (typeof token === "string" && token.trim().length >= 16) {
      onToken(token.trim());
    }
  });
  return () => sub.remove();
}

export function subscribeFcmOpened(
  onOpened: (payload: { href: string; type: string }) => void,
): () => void {
  if (!NativeFcm) return () => {};
  const emitter = new NativeEventEmitter(NativeModules.HouzzatProFcm);
  const sub = emitter.addListener("houzzatpro_fcm_opened", (event: unknown) => {
    if (!event || typeof event !== "object") return;
    const href =
      typeof (event as { href?: unknown }).href === "string"
        ? (event as { href: string }).href
        : "";
    const type =
      typeof (event as { type?: unknown }).type === "string"
        ? (event as { type: string }).type
        : "";
    onOpened({ href, type });
  });
  return () => sub.remove();
}
