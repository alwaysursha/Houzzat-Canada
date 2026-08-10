/**
 * Native biometric unlock + Keystore credential helpers.
 * Web no-ops — only runs inside the Capacitor shell.
 */

import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import {
  AccessControl,
  BiometryType,
  NativeBiometric,
} from "@capgo/capacitor-native-biometric";

const ENABLED_KEY = "houzzat.biometrics.enabled";
const MODE_KEY = "houzzat.biometrics.mode";
/** Set after the post-sign-in opt-in is shown (accept or decline). */
const OFFERED_KEY = "houzzat.biometrics.offered";
/** Keychain/Keystore namespace for stored email+password. */
export const BIOMETRIC_SERVER = "houzzat.com";

export type BiometricMode = "credentials" | "unlock";

export type BiometricAvailability = {
  available: boolean;
  label: string;
  biometryType: BiometryType;
};

function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function biometryLabel(type: BiometryType): string {
  switch (type) {
    case BiometryType.NONE:
      return "Biometrics";
    case BiometryType.TOUCH_ID:
      return "Touch ID";
    case BiometryType.FACE_ID:
      return "Face ID";
    case BiometryType.FINGERPRINT:
      return "Fingerprint";
    case BiometryType.FACE_AUTHENTICATION:
      return "Face unlock";
    case BiometryType.IRIS_AUTHENTICATION:
      return "Iris";
    case BiometryType.MULTIPLE:
      return "Biometrics";
    case BiometryType.DEVICE_CREDENTIAL:
      return "Device lock";
    default: {
      const _exhaustive: never = type;
      void _exhaustive;
      return "Biometrics";
    }
  }
}

export async function getBiometricAvailability(): Promise<BiometricAvailability> {
  if (!isNative()) {
    return {
      available: false,
      label: "Biometrics",
      biometryType: BiometryType.NONE,
    };
  }
  try {
    const result = await NativeBiometric.isAvailable({ useFallback: false });
    return {
      available: result.isAvailable,
      label: biometryLabel(result.biometryType),
      biometryType: result.biometryType,
    };
  } catch {
    return {
      available: false,
      label: "Biometrics",
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
  return value === "credentials" || value === "unlock"
    ? value
    : "unlock";
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
 * Enable biometrics after a successful email/password sign-in.
 * Stores credentials in Keychain/Keystore (protected by biometry).
 */
export async function enableBiometricsWithCredentials(input: {
  email: string;
  password: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isNative()) return { ok: false, error: "Not available on web." };
  const availability = await getBiometricAvailability();
  if (!availability.available) {
    return { ok: false, error: `${availability.label} is not available.` };
  }

  const verified = await verifyBiometricIdentity(
    `Enable ${availability.label} for Houzzat`,
  );
  if (!verified) return { ok: false, error: "Biometric verification failed." };

  try {
    await NativeBiometric.setCredentials({
      username: input.email.trim().toLowerCase(),
      password: input.password,
      server: BIOMETRIC_SERVER,
      accessControl: AccessControl.BIOMETRY_ANY,
      title: "Protect Houzzat login",
      negativeButtonText: "Cancel",
    });
    await Preferences.set({ key: ENABLED_KEY, value: "1" });
    await Preferences.set({ key: MODE_KEY, value: "credentials" });
    await Preferences.set({ key: OFFERED_KEY, value: "1" });
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not save credentials securely." };
  }
}

/**
 * Unlock-only mode (e.g. Google sign-in) — no password stored.
 */
export async function enableBiometricsUnlockOnly(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  if (!isNative()) return { ok: false, error: "Not available on web." };
  const availability = await getBiometricAvailability();
  if (!availability.available) {
    return { ok: false, error: `${availability.label} is not available.` };
  }

  const verified = await verifyBiometricIdentity(
    `Enable ${availability.label} for Houzzat`,
  );
  if (!verified) return { ok: false, error: "Biometric verification failed." };

  try {
    await Preferences.set({ key: ENABLED_KEY, value: "1" });
    await Preferences.set({ key: MODE_KEY, value: "unlock" });
    await Preferences.set({ key: OFFERED_KEY, value: "1" });
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not enable biometrics." };
  }
}

export async function disableBiometrics(): Promise<void> {
  if (!isNative()) return;
  try {
    await NativeBiometric.deleteCredentials({ server: BIOMETRIC_SERVER });
  } catch {
    // ignore
  }
  await Preferences.remove({ key: ENABLED_KEY });
  await Preferences.remove({ key: MODE_KEY });
}

export async function markBiometricsOptInOffered(): Promise<void> {
  if (!isNative()) return;
  await Preferences.set({ key: OFFERED_KEY, value: "1" });
}

/**
 * After verifyIdentity, load Keystore credentials for re-login.
 * Prefer getSecureCredentials when accessControl was used at save time.
 */
export async function loadBiometricCredentials(): Promise<{
  email: string;
  password: string;
} | null> {
  if (!isNative()) return null;
  try {
    const secure = await NativeBiometric.getSecureCredentials({
      server: BIOMETRIC_SERVER,
      reason: "Sign in to Houzzat",
      title: "Sign in",
      negativeButtonText: "Cancel",
    });
    if (secure.username && secure.password) {
      return {
        email: secure.username.trim().toLowerCase(),
        password: secure.password,
      };
    }
  } catch {
    // Fall through to unprotected getCredentials (legacy / AccessControl.NONE).
  }

  try {
    const creds = await NativeBiometric.getCredentials({
      server: BIOMETRIC_SERVER,
    });
    if (creds.username && creds.password) {
      return {
        email: creds.username.trim().toLowerCase(),
        password: creds.password,
      };
    }
  } catch {
    // ignore
  }
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
