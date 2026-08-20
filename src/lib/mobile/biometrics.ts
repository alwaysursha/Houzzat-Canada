/**
 * Native biometric app unlock (Auth.js session remains the auth authority).
 * Web no-ops — only runs inside the Capacitor shell.
 *
 * Model: session cookie/JWT + local biometric UI gate.
 * Never stores raw passwords. Never silently calls signIn("credentials").
 */

import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import {
  BiometryType,
  NativeBiometric,
} from "@capgo/capacitor-native-biometric";
import {
  migrateBiometricMode,
  shouldKeepBiometricsEnabledOnLogout,
  type BiometricLegacyMode,
} from "@/lib/mobile/biometric-policy";

const ENABLED_KEY = "houzzat.biometrics.enabled";
const MODE_KEY = "houzzat.biometrics.mode";
/** Set after the post-sign-in opt-in is shown (accept or decline). */
const OFFERED_KEY = "houzzat.biometrics.offered";
/**
 * Set on explicit Sign out so the gate does not cover the signed-out UI
 * until the next successful Auth.js sign-in.
 */
const INTENTIONAL_SIGNOUT_KEY = "houzzat.intentionalSignOut";
/** Consistency check only — never a secret. */
const BOUND_USER_KEY = "houzzat.biometrics.boundUserId";
/** Idempotent migration marker (credentials → unlock). */
const MIGRATED_KEY = "houzzat.biometrics.migratedUnlockV1";
/**
 * Sync early-paint flag (localStorage). Means biometrics are enabled on this
 * device — NOT that the current document must prompt. Survives hard nav and
 * cold start; used only as a hint to show an opaque cover until we know
 * whether this WebView browsing session is already unlocked.
 */
export const BIOMETRIC_EARLY_GATE_KEY = "houzzat.biometrics.earlyGate";
/**
 * Foreground unlock marker (sessionStorage). Survives hard in-app document
 * navigations (Account) in the same WebView browsing session. Cleared on
 * force-stop / genuine cold start, background timeout, and logout.
 * Never used as server authentication.
 */
export const BIOMETRIC_FOREGROUND_UNLOCK_KEY =
  "houzzat.biometrics.fgUnlocked";

/** Legacy Keystore namespace — deleted on migrate / logout / disable. */
export const BIOMETRIC_SERVER = "houzzat.com";

/** @deprecated Always unlock after migration. Kept for Preference reads. */
export type BiometricMode = BiometricLegacyMode;

export type BiometricAvailability = {
  available: boolean;
  label: string;
  biometryType: BiometryType;
  /** Plugin error / lockout hint when unavailable. */
  errorCode?: number | string;
};

let migrationInFlight: Promise<void> | null = null;

function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function biometryLabel(type: BiometryType): string {
  const android = (() => {
    try {
      return Capacitor.getPlatform() === "android";
    } catch {
      return false;
    }
  })();

  switch (type) {
    case BiometryType.NONE:
      return "Biometric unlock";
    case BiometryType.TOUCH_ID:
      return "Touch ID";
    case BiometryType.FACE_ID:
      // Never call Android face unlock "Face ID".
      return android ? "Face unlock" : "Face ID";
    case BiometryType.FINGERPRINT:
      return "Fingerprint";
    case BiometryType.FACE_AUTHENTICATION:
      return "Face unlock";
    case BiometryType.IRIS_AUTHENTICATION:
      return "Iris";
    case BiometryType.MULTIPLE:
      return "Biometric unlock";
    case BiometryType.DEVICE_CREDENTIAL:
      return "Device lock";
    default: {
      const _exhaustive: never = type;
      void _exhaustive;
      return "Biometric unlock";
    }
  }
}

function setEarlyGateSync(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (on) {
      window.localStorage.setItem(BIOMETRIC_EARLY_GATE_KEY, "1");
    } else {
      window.localStorage.removeItem(BIOMETRIC_EARLY_GATE_KEY);
    }
  } catch {
    // ignore
  }
}

/** Sync read for first paint — no Preferences / network. */
export function readBiometricEarlyGateSync(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(BIOMETRIC_EARLY_GATE_KEY) === "1";
  } catch {
    return false;
  }
}

/** True when this WebView browsing session already unlocked biometrics. */
export function readForegroundUnlockedSync(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(BIOMETRIC_FOREGROUND_UNLOCK_KEY) === "1";
  } catch {
    return false;
  }
}

/** Mark current native browsing session unlocked (survives hard Account nav). */
export function markForegroundSessionUnlocked(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(BIOMETRIC_FOREGROUND_UNLOCK_KEY, "1");
  } catch {
    // ignore
  }
}

/** Invalidate foreground unlock (background timeout, logout, lock). */
export function clearForegroundSessionUnlocked(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(BIOMETRIC_FOREGROUND_UNLOCK_KEY);
  } catch {
    // ignore
  }
}

async function deleteLegacyNativeCredentials(): Promise<void> {
  if (!isNative()) return;
  try {
    await NativeBiometric.deleteCredentials({ server: BIOMETRIC_SERVER });
  } catch {
    // ignore missing / already deleted
  }
}

export async function getBiometricAvailability(): Promise<BiometricAvailability> {
  if (!isNative()) {
    return {
      available: false,
      label: "Biometric unlock",
      biometryType: BiometryType.NONE,
    };
  }
  try {
    const result = await NativeBiometric.isAvailable({ useFallback: false });
    return {
      available: result.isAvailable,
      label: biometryLabel(result.biometryType),
      biometryType: result.biometryType,
      errorCode: result.errorCode,
    };
  } catch {
    return {
      available: false,
      label: "Biometric unlock",
      biometryType: BiometryType.NONE,
    };
  }
}

export async function isBiometricsEnabled(): Promise<boolean> {
  if (!isNative()) return false;
  const { value } = await Preferences.get({ key: ENABLED_KEY });
  return value === "1";
}

export async function getBiometricMode(): Promise<BiometricMode | null> {
  if (!(await isBiometricsEnabled())) return null;
  const { value } = await Preferences.get({ key: MODE_KEY });
  return value === "credentials" || value === "unlock" ? value : "unlock";
}

export async function hasStoredBiometricCredentials(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { isSaved } = await NativeBiometric.isCredentialsSaved({
      server: BIOMETRIC_SERVER,
    });
    return isSaved;
  } catch {
    return false;
  }
}

/**
 * One-shot safe migration: credentials → unlock, delete Keystore secrets.
 * Idempotent. Does not force logout or ask for the old password.
 */
export async function migrateLegacyBiometricCredentialsOnce(): Promise<void> {
  if (!isNative()) return;
  if (migrationInFlight) {
    await migrationInFlight;
    return;
  }

  migrationInFlight = (async () => {
    try {
      const { value: migrated } = await Preferences.get({ key: MIGRATED_KEY });
      const modeValue = (await Preferences.get({ key: MODE_KEY })).value;
      const mode =
        modeValue === "credentials" || modeValue === "unlock"
          ? modeValue
          : null;
      const hasCreds = await hasStoredBiometricCredentials();

      if (migrated === "1" && mode !== "credentials" && !hasCreds) {
        return;
      }

      const plan = migrateBiometricMode(
        mode === "credentials" ? "credentials" : "unlock",
      );

      if (await isBiometricsEnabled()) {
        await Preferences.set({ key: MODE_KEY, value: plan.nextMode });
        if (!(await wasIntentionalSignOut())) {
          setEarlyGateSync(true);
        }
      }

      if (plan.shouldDeleteNativeCredentials || hasCreds || mode === "credentials") {
        await deleteLegacyNativeCredentials();
      }

      await Preferences.set({ key: MIGRATED_KEY, value: "1" });
    } catch {
      // Best-effort; next launch retries.
    }
  })();

  try {
    await migrationInFlight;
  } finally {
    migrationInFlight = null;
  }
}

export async function verifyBiometricIdentity(reason?: string): Promise<boolean> {
  if (!isNative()) return false;
  const availability = await getBiometricAvailability();
  if (!availability.available) return false;
  try {
    await NativeBiometric.verifyIdentity({
      reason: reason ?? `Unlock Houzzat with ${availability.label}`,
      title: "Unlock Houzzat",
      subtitle: availability.label,
      description: "Confirm it’s you to continue.",
      negativeButtonText: "Cancel",
      maxAttempts: 3,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Enable unlock-only biometrics after verifying hardware + biometry once.
 * Does not store email/password.
 */
export async function enableBiometricsUnlockOnly(input?: {
  userId?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isNative()) return { ok: false, error: "Not available on web." };
  const availability = await getBiometricAvailability();
  if (!availability.available) {
    return {
      ok: false,
      error:
        availability.errorCode != null
          ? `${availability.label} isn’t available right now. Check device settings.`
          : `${availability.label} is not available on this device.`,
    };
  }

  const verified = await verifyBiometricIdentity(
    `Enable ${availability.label} for Houzzat`,
  );
  if (!verified) return { ok: false, error: "Biometric verification failed." };

  try {
    await deleteLegacyNativeCredentials();
    await Preferences.set({ key: ENABLED_KEY, value: "1" });
    await Preferences.set({ key: MODE_KEY, value: "unlock" });
    await Preferences.set({ key: OFFERED_KEY, value: "1" });
    await Preferences.set({ key: MIGRATED_KEY, value: "1" });
    if (input?.userId) {
      await Preferences.set({ key: BOUND_USER_KEY, value: input.userId });
    }
    setEarlyGateSync(true);
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not enable biometrics." };
  }
}

/**
 * @deprecated Password storage removed. Delegates to unlock-only.
 */
export async function enableBiometricsWithCredentials(_input: {
  email: string;
  password: string;
  userId?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  return enableBiometricsUnlockOnly({ userId: _input.userId });
}

export async function disableBiometrics(): Promise<void> {
  if (!isNative()) return;
  await deleteLegacyNativeCredentials();
  await Preferences.remove({ key: ENABLED_KEY });
  await Preferences.remove({ key: MODE_KEY });
  await Preferences.remove({ key: BOUND_USER_KEY });
  setEarlyGateSync(false);
  clearForegroundSessionUnlocked();
}

/**
 * Call before navigating to /api/auth/logout on native.
 * Clears legacy Keystore secrets. Keeps unlock preference for next login
 * when {@link shouldKeepBiometricsEnabledOnLogout} is true.
 */
export async function prepareExplicitSignOut(): Promise<void> {
  if (!isNative()) return;
  try {
    await Preferences.set({ key: INTENTIONAL_SIGNOUT_KEY, value: "1" });
    await deleteLegacyNativeCredentials();
    const enabled = await isBiometricsEnabled();
    if (enabled) {
      await Preferences.set({ key: MODE_KEY, value: "unlock" });
    }
    await Preferences.remove({ key: BOUND_USER_KEY });
    if (!shouldKeepBiometricsEnabledOnLogout()) {
      await Preferences.remove({ key: ENABLED_KEY });
      await Preferences.remove({ key: MODE_KEY });
    }
    setEarlyGateSync(false);
    clearForegroundSessionUnlocked();
  } catch {
    // ignore
  }
}

export async function wasIntentionalSignOut(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { value } = await Preferences.get({ key: INTENTIONAL_SIGNOUT_KEY });
    return value === "1";
  } catch {
    return false;
  }
}

/**
 * Clear after ANY successful Auth.js login (password, Google/OAuth, etc.).
 * Re-arms the early gate when the device preference is still enabled.
 */
export async function clearIntentionalSignOut(input?: {
  userId?: string | null;
}): Promise<void> {
  if (!isNative()) return;
  try {
    await Preferences.remove({ key: INTENTIONAL_SIGNOUT_KEY });
    if (input?.userId) {
      await Preferences.set({ key: BOUND_USER_KEY, value: input.userId });
    }
    if (await isBiometricsEnabled()) {
      await Preferences.set({ key: MODE_KEY, value: "unlock" });
      setEarlyGateSync(true);
    }
  } catch {
    // ignore
  }
}

export async function getBoundBiometricUserId(): Promise<string | null> {
  if (!isNative()) return null;
  try {
    const { value } = await Preferences.get({ key: BOUND_USER_KEY });
    return value || null;
  } catch {
    return null;
  }
}

export async function bindBiometricUserId(userId: string): Promise<void> {
  if (!isNative() || !userId) return;
  try {
    await Preferences.set({ key: BOUND_USER_KEY, value: userId });
  } catch {
    // ignore
  }
}

/**
 * On authenticated session: migrate legacy secrets, rebind user if needed.
 * Safe to call once per native startup / account path.
 */
export async function reconcileBiometricsForSession(input: {
  userId: string | null;
}): Promise<void> {
  if (!isNative()) return;
  await migrateLegacyBiometricCredentialsOnce();
  if (!input.userId) return;
  if (!(await isBiometricsEnabled())) return;
  if (await wasIntentionalSignOut()) return;

  const bound = await getBoundBiometricUserId();
  if (!bound || bound !== input.userId) {
    await deleteLegacyNativeCredentials();
    await Preferences.set({ key: MODE_KEY, value: "unlock" });
    await bindBiometricUserId(input.userId);
  }
  setEarlyGateSync(true);
}

export async function markBiometricsOptInOffered(): Promise<void> {
  if (!isNative()) return;
  await Preferences.set({ key: OFFERED_KEY, value: "1" });
}

/**
 * @deprecated Legacy password path removed. Always returns null.
 */
export async function loadBiometricCredentials(): Promise<{
  email: string;
  password: string;
} | null> {
  return null;
}

/** Offer enable once after credentials sign-in (native only). */
export async function shouldOfferBiometricsOptIn(): Promise<boolean> {
  if (!isNative()) return false;
  if (await isBiometricsEnabled()) return false;
  const { value: offered } = await Preferences.get({ key: OFFERED_KEY });
  if (offered === "1") return false;
  const availability = await getBiometricAvailability();
  return availability.available;
}
