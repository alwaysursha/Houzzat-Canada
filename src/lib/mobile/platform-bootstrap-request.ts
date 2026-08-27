import { headers } from "next/headers";
import { isPlatformMobileBootstrapHost } from "@/lib/mobile/platform-bootstrap";

const PLATFORM_PRO_PREFIX = "/pro";

/** True when request is HouzzatPRO platform bootstrap (/pro on houzzatpro.com root). */
export async function isHouzzatProPlatformBootstrapRequest(): Promise<boolean> {
  const headerStore = await headers();
  const pathname =
    headerStore.get("x-houzzat-request-path") ??
    headerStore.get("next-url") ??
    "";
  const host =
    headerStore.get("x-forwarded-host")?.split(":")[0]?.trim() ??
    headerStore.get("host")?.split(":")[0]?.trim() ??
    null;
  if (!isPlatformMobileBootstrapHost(host)) return false;
  const path = pathname.startsWith("http")
    ? (() => {
        try {
          return new URL(pathname).pathname;
        } catch {
          return pathname;
        }
      })()
    : pathname;
  return path === PLATFORM_PRO_PREFIX || path.startsWith(`${PLATFORM_PRO_PREFIX}/`);
}
