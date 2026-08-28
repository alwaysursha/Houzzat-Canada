/**
 * Stage 3K.5.10.9 — complete HouzzatPRO logout destinations.
 * Host-local Auth.js cookies only (no Domain= / parent-domain cookies).
 */
import {
  HOUZZATPRO_APP_ID,
  nativeAppIdFromUserAgent,
  type AppShell,
} from "@/lib/mobile/app-shell";
import {
  HOUZZATPRO_APP_BOOTSTRAP_ORIGIN,
  isPlatformMobileBootstrapHost,
} from "@/lib/mobile/platform-bootstrap";

export const PRO_SIGNED_OUT_SIGN_IN_PATH = "/pro/sign-in?signedOut=1";
export const WEB_SIGNED_OUT_HOME_PATH = "/?signedOut=1";

/** Absolute platform GET logout — clears app.houzzatpro.com session then lands on sign-in. */
export function platformCompleteLogoutUrl(): string {
  return `${HOUZZATPRO_APP_BOOTSTRAP_ORIGIN}/api/auth/logout`;
}

export function isHouzzatProShellIdentity(input: {
  shell?: AppShell | null;
  userAgent?: string | null;
}): boolean {
  if (input.shell === "houzzatpro") return true;
  return nativeAppIdFromUserAgent(input.userAgent) === HOUZZATPRO_APP_ID;
}

/**
 * After clearing the *current* host session:
 * - HouzzatPRO native/Pro UA on a tenant host → cross-host platform logout URL
 * - Already on app bootstrap host → local /pro/sign-in
 * - Normal web → tenant homepage
 */
export function resolveCompleteSignOutDestination(input: {
  hostname: string | null | undefined;
  shell?: AppShell | null;
  userAgent?: string | null;
}): string {
  const pro = isHouzzatProShellIdentity(input);
  if (!pro) return WEB_SIGNED_OUT_HOME_PATH;
  if (isPlatformMobileBootstrapHost(input.hostname)) {
    return PRO_SIGNED_OUT_SIGN_IN_PATH;
  }
  return platformCompleteLogoutUrl();
}

/** Allow only same-origin paths or the dedicated platform logout URL. */
export function isSafeSignOutDestination(destination: string): boolean {
  if (destination.startsWith("/") && !destination.startsWith("//")) {
    return true;
  }
  try {
    const url = new URL(destination);
    return (
      url.origin === HOUZZATPRO_APP_BOOTSTRAP_ORIGIN &&
      url.pathname === "/api/auth/logout"
    );
  } catch {
    return false;
  }
}
