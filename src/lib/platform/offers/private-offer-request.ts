import { headers } from "next/headers";
import { PRIVATE_OFFER_PATH_PREFIX } from "@/lib/platform/offers/constants";
import { isHouzzatProPlatformRoot } from "@/lib/tenancy/platform-hostname";

/**
 * True when request is HouzzatPRO platform-root /subscribe/{token}.
 * Tenant hosts must not render private commercial proposals.
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

  if (!path.startsWith(`${PRIVATE_OFFER_PATH_PREFIX}/`)) return false;
  const tokenPart = path.slice(PRIVATE_OFFER_PATH_PREFIX.length + 1);
  if (!tokenPart || tokenPart.includes("/")) return false;

  const host =
    headerStore.get("x-forwarded-host")?.split(":")[0]?.trim() ??
    headerStore.get("host")?.split(":")[0]?.trim() ??
    null;

  if (!host) return false;
  return isHouzzatProPlatformRoot(host);
}
