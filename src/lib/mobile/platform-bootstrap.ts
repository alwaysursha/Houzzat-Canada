/** Stage 3K.5.10 — HouzzatPRO platform mobile bootstrap surface. */
import { isHouzzatProPlatformRoot } from "@/lib/tenancy/reserved-domains";

export const HOUZZATPRO_BOOTSTRAP_PATH = "/pro";
export const HOUZZATPRO_BOOTSTRAP_ORIGIN = "https://houzzatpro.com";
export const HOUZZATPRO_BOOTSTRAP_SERVER_URL = `${HOUZZATPRO_BOOTSTRAP_ORIGIN}${HOUZZATPRO_BOOTSTRAP_PATH}`;
export const HOUZZATPRO_MOBILE_HANDOFF_PATH = "/pro/mobile/handoff";

export function isPlatformMobileBootstrapHost(
  hostname: string | null | undefined,
): boolean {
  if (!hostname) return false;
  return isHouzzatProPlatformRoot(hostname);
}

export function isApprovedProCapacitorServerUrl(url: string): boolean {
  return url.trim().replace(/\/$/, "") === HOUZZATPRO_BOOTSTRAP_SERVER_URL;
}
