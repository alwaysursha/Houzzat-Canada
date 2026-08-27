/**
 * Stage 3K.5.10.6 / 3K.5.10.7 — HouzzatPRO application bootstrap (not sales marketing).
 *
 * Edge-safe: must not import node: modules (middleware consumes these helpers).
 * Keep hostname string in sync with HOUZZATPRO_APP_BOOTSTRAP_HOSTNAME in
 * src/lib/tenancy/platform-hostname.ts.
 */

export const HOUZZATPRO_BOOTSTRAP_PATH = "/pro";
export const HOUZZATPRO_APP_BOOTSTRAP_HOSTNAME = "app.houzzatpro.com";
export const HOUZZATPRO_APP_BOOTSTRAP_ORIGIN = `https://${HOUZZATPRO_APP_BOOTSTRAP_HOSTNAME}`;
/** @deprecated Prefer HOUZZATPRO_APP_BOOTSTRAP_ORIGIN — sales apex is not the app host. */
export const HOUZZATPRO_BOOTSTRAP_ORIGIN = HOUZZATPRO_APP_BOOTSTRAP_ORIGIN;
export const HOUZZATPRO_BOOTSTRAP_SERVER_URL = `${HOUZZATPRO_APP_BOOTSTRAP_ORIGIN}${HOUZZATPRO_BOOTSTRAP_PATH}`;
export const HOUZZATPRO_MOBILE_HANDOFF_PATH = "/pro/mobile/handoff";

function normalizeHostHeader(hostname: string | null | undefined): string {
  return (hostname ?? "").split(":")[0]?.trim().toLowerCase() ?? "";
}

/**
 * Neutral SaaS / mobile application bootstrap host.
 * NOT houzzatpro.com (sales centre) and NOT any tenant hostname.
 */
export function isPlatformMobileBootstrapHost(
  hostname: string | null | undefined,
): boolean {
  return normalizeHostHeader(hostname) === HOUZZATPRO_APP_BOOTSTRAP_HOSTNAME;
}

export function isApprovedProCapacitorServerUrl(url: string): boolean {
  return url.trim().replace(/\/$/, "") === HOUZZATPRO_BOOTSTRAP_SERVER_URL;
}

/** Exact /pro cold-start path (no trailing query). */
export function isProBootstrapPath(pathname: string | null | undefined): boolean {
  const path = (pathname ?? "").split("?")[0] || "/";
  return path === HOUZZATPRO_BOOTSTRAP_PATH || path === `${HOUZZATPRO_BOOTSTRAP_PATH}/`;
}

/**
 * Whether ProWorkspaceBootstrap should run routing.
 * - Native Capacitor on /pro (any host the WebView is on)
 * - Browser on the dedicated app bootstrap host (app.houzzatpro.com)
 */
export function shouldRunProWorkspaceBootstrap(input: {
  pathname: string;
  hostname: string | null | undefined;
  isNative: boolean;
}): boolean {
  if (!isProBootstrapPath(input.pathname)) return false;
  if (input.isNative) return true;
  return isPlatformMobileBootstrapHost(input.hostname);
}

/**
 * Unauthenticated /pro → /pro/sign-in on the app bootstrap host.
 * Skipped when ?diag=1 (diagnostic freeze must not auto-redirect).
 */
export function shouldRedirectUnauthenticatedProToSignIn(input: {
  pathname: string;
  hostname: string | null | undefined;
  authenticated: boolean;
  diagParam: string | null | undefined;
}): boolean {
  if (input.authenticated) return false;
  if (input.diagParam === "1") return false;
  if (!isProBootstrapPath(input.pathname)) return false;
  return isPlatformMobileBootstrapHost(input.hostname);
}
