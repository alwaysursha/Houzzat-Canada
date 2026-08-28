/**
 * Stage 3K.5.10.10 — complete HouzzatPRO dual-host logout + safe cross-host completion.
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

/**
 * Validates allowable post-logout return destinations (open-redirect protection).
 * Supports same-origin paths, localhost (dev), houzzat.com, *.houzzatpro.com,
 * and valid tenant custom domain hostnames.
 */
export function isSafeSignOutReturnUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (trimmed.startsWith("/") && !trimmed.startsWith("//") && !trimmed.includes("\\")) {
    return true;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }
    // Reject userinfo (@ credentials)
    if (parsed.username || parsed.password) {
      return false;
    }
    const hostname = parsed.hostname.toLowerCase();
    if (!hostname || hostname.includes("..") || hostname.includes("\\")) {
      return false;
    }
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return true;
    }
    if (hostname === "houzzat.com" || hostname.endsWith(".houzzat.com")) {
      return true;
    }
    if (hostname === "houzzatpro.com" || hostname.endsWith(".houzzatpro.com")) {
      return true;
    }
    // Valid tenant custom domain hostname format (RFC 1123 compliant)
    const validDomainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
    return validDomainRegex.test(hostname);
  } catch {
    return false;
  }
}

/** Absolute platform GET logout — clears app.houzzatpro.com session then redirects safely. */
export function platformCompleteLogoutUrl(options?: {
  returnTo?: string | null;
}): string {
  const base = `${HOUZZATPRO_APP_BOOTSTRAP_ORIGIN}/api/auth/logout`;
  if (options?.returnTo && isSafeSignOutReturnUrl(options.returnTo)) {
    return `${base}?returnTo=${encodeURIComponent(options.returnTo)}`;
  }
  return base;
}

export function isHouzzatProShellIdentity(input: {
  shell?: AppShell | null;
  userAgent?: string | null;
}): boolean {
  if (input.shell === "houzzatpro") return true;
  return nativeAppIdFromUserAgent(input.userAgent) === HOUZZATPRO_APP_ID;
}

export function isStaffSignOutContext(input: {
  pathname?: string | null;
  isStaff?: boolean | null;
}): boolean {
  if (input.isStaff === true) return true;
  const path = (input.pathname ?? "").toLowerCase();
  return (
    path === "/admin" ||
    path.startsWith("/admin/") ||
    path === "/agent" ||
    path.startsWith("/agent/") ||
    path === "/pro" ||
    path.startsWith("/pro/")
  );
}

/**
 * Resolves the destination after clearing the current host's session:
 * 1. Native HouzzatPRO app on tenant → platform logout (clears app host, lands on /pro/sign-in?signedOut=1)
 * 2. Any client already on app.houzzatpro.com → local /pro/sign-in?signedOut=1
 * 3. Desktop HouzzatPRO staff flow on tenant (/admin, /agent, /pro) → platform logout with returnTo tenant home
 * 4. Normal consumer web on tenant → local tenant homepage (/?signedOut=1)
 */
export function resolveCompleteSignOutDestination(input: {
  hostname: string | null | undefined;
  pathname?: string | null;
  shell?: AppShell | null;
  userAgent?: string | null;
  isStaff?: boolean | null;
}): string {
  const isNativePro = isHouzzatProShellIdentity(input);
  const onPlatformHost = isPlatformMobileBootstrapHost(input.hostname);

  if (isNativePro) {
    if (onPlatformHost) {
      return PRO_SIGNED_OUT_SIGN_IN_PATH;
    }
    return platformCompleteLogoutUrl();
  }

  if (onPlatformHost) {
    return PRO_SIGNED_OUT_SIGN_IN_PATH;
  }

  const isStaff = isStaffSignOutContext(input);
  if (isStaff && input.hostname) {
    const returnTo = `https://${input.hostname}${WEB_SIGNED_OUT_HOME_PATH}`;
    return platformCompleteLogoutUrl({ returnTo });
  }

  return WEB_SIGNED_OUT_HOME_PATH;
}

/** Allow only same-origin paths or the dedicated platform logout URL. */
export function isSafeSignOutDestination(destination: string): boolean {
  if (!destination || typeof destination !== "string") return false;
  if (destination.startsWith("/") && !destination.startsWith("//")) {
    return true;
  }
  try {
    const url = new URL(destination);
    if (
      url.origin === HOUZZATPRO_APP_BOOTSTRAP_ORIGIN &&
      url.pathname === "/api/auth/logout"
    ) {
      const returnTo = url.searchParams.get("returnTo");
      if (!returnTo) return true;
      return isSafeSignOutReturnUrl(returnTo);
    }
    return false;
  } catch {
    return false;
  }
}
