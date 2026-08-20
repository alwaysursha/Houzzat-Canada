/**
 * Pure biometric unlock policy (no Capacitor / network).
 * Auth.js remains the only server authentication authority.
 */

export type BiometricLegacyMode = "credentials" | "unlock";

export type BiometricSessionStatus =
  | "loading"
  | "authenticated"
  | "unauthenticated";

export type BiometricGatePhase =
  | "cover" // opaque cover while deciding / locking
  | "prompt" // show unlock UI + allow verify
  | "open" // no gate
  | "signed_out"; // dismiss gate; normal sign-in

/**
 * Decide whether the local biometric gate should cover / prompt.
 * Never recreates a server session from stored passwords.
 *
 * `foregroundSessionUnlocked` means this native WebView browsing session
 * already passed biometrics (survives hard Account navigations via
 * sessionStorage; cleared on cold start / force-stop / background timeout).
 * Route remounts must not re-prompt while it remains true.
 */
export function decideBiometricGatePhase(input: {
  biometricsEnabled: boolean;
  intentionalSignOut: boolean;
  sessionStatus: BiometricSessionStatus;
  /** Already unlocked in this native foreground browsing session. */
  foregroundSessionUnlocked?: boolean;
}): BiometricGatePhase {
  if (!input.biometricsEnabled || input.intentionalSignOut) {
    return "open";
  }
  if (input.sessionStatus === "unauthenticated") {
    return "signed_out";
  }
  // Trusted continuation (e.g. hard /account nav) — never treat remount as cold start.
  if (input.foregroundSessionUnlocked) {
    return "open";
  }
  if (input.sessionStatus === "loading") {
    return "cover";
  }
  return "prompt";
}

/**
 * Initial lock for first paint: enabled early-gate cover only when this
 * WebView browsing session has not already unlocked.
 */
export function shouldStartBiometricLocked(input: {
  biometricsEnabledHint: boolean;
  foregroundSessionUnlocked: boolean;
  intentionalSignOut?: boolean;
}): boolean {
  if (input.intentionalSignOut) return false;
  if (!input.biometricsEnabledHint) return false;
  if (input.foregroundSessionUnlocked) return false;
  return true;
}

/**
 * Migration: credentials mode → unlock. Idempotent result.
 */
export function migrateBiometricMode(
  mode: BiometricLegacyMode | null | undefined,
): {
  nextMode: "unlock";
  shouldDeleteNativeCredentials: boolean;
} {
  return {
    nextMode: "unlock",
    shouldDeleteNativeCredentials: mode === "credentials",
  };
}

/**
 * Prefer keeping the device unlock preference across logout, but it only
 * becomes active again after the next successful Auth.js sign-in.
 */
export function shouldKeepBiometricsEnabledOnLogout(): boolean {
  return true;
}

/**
 * Account-switch consistency: if a bound user exists and differs from the
 * current session user, rebind — never reuse another account's secrets.
 */
export function shouldRebindBiometricUser(input: {
  boundUserId: string | null;
  sessionUserId: string | null;
}): boolean {
  if (!input.sessionUserId) return false;
  if (!input.boundUserId) return true;
  return input.boundUserId !== input.sessionUserId;
}

/**
 * "Use password / Sign in another way" must end the protected session —
 * never just hide the lock overlay.
 */
export function usePasswordRequiresExplicitSignOut(): boolean {
  return true;
}
