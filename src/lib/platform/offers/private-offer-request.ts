import { headers } from "next/headers";
import { PRIVATE_OFFER_PATH_PREFIX } from "@/lib/platform/offers/constants";
import { isHouzzatProPlatformRoot } from "@/lib/tenancy/platform-hostname";

/**
 * True when request is HouzzatPRO platform-root under /subscribe/*.
 * Covers private offer, embedded checkout, and payment status surfaces.
 * Tenant hosts must not render these chrome-free HouzzatPRO pages.
 */
export async function isHouzzatProPlatformPrivateOfferRequest(): Promise<boolean> {
  const headerStore = await headers();
  const pathname =
    headerStore.get("x-houzzat-request-path") ??
    headerStore.get("next-url") ??
    "";
  const path = pathname.startsWith("http")
    ? (() => {
        try {
          return new URL(pathname).pathname;
        } catch {
          return pathname;
        }
      })()
    : pathname;

  const prefix = `${PRIVATE_OFFER_PATH_PREFIX}/`;
  if (!path.startsWith(prefix)) return false;
  const rest = path.slice(prefix.length);
  if (!rest) return false;

  const host =
    headerStore.get("x-forwarded-host")?.split(":")[0]?.trim() ??
    headerStore.get("host")?.split(":")[0]?.trim() ??
    null;

  if (!host) return false;
  return isHouzzatProPlatformRoot(host);
}
