/** Stage 3K.5.10.6 — HouzzatPRO application bootstrap (not sales marketing). */
import {
  HOUZZATPRO_APP_BOOTSTRAP_HOSTNAME,
  HOUZZATPRO_APP_BOOTSTRAP_ORIGIN,
  isHouzzatProAppBootstrapHost,
} from "@/lib/tenancy/platform-hostname";

export const HOUZZATPRO_BOOTSTRAP_PATH = "/pro";
/** @deprecated Prefer HOUZZATPRO_APP_BOOTSTRAP_ORIGIN — sales apex is not the app host. */
export const HOUZZATPRO_BOOTSTRAP_ORIGIN = HOUZZATPRO_APP_BOOTSTRAP_ORIGIN;
export const HOUZZATPRO_BOOTSTRAP_SERVER_URL = `${HOUZZATPRO_APP_BOOTSTRAP_ORIGIN}${HOUZZATPRO_BOOTSTRAP_PATH}`;
export const HOUZZATPRO_MOBILE_HANDOFF_PATH = "/pro/mobile/handoff";

export { HOUZZATPRO_APP_BOOTSTRAP_HOSTNAME, HOUZZATPRO_APP_BOOTSTRAP_ORIGIN };

/**
 * Neutral SaaS / mobile application bootstrap host.
 * NOT houzzatpro.com (sales centre) and NOT any tenant hostname.
 */
export function isPlatformMobileBootstrapHost(
  hostname: string | null | undefined,
): boolean {
  return isHouzzatProAppBootstrapHost(hostname);
}

export function isApprovedProCapacitorServerUrl(url: string): boolean {
  return url.trim().replace(/\/$/, "") === HOUZZATPRO_BOOTSTRAP_SERVER_URL;
}
