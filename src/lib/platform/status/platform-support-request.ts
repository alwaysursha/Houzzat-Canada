import { headers } from "next/headers";
import { isHouzzatProPlatformRoot } from "@/lib/tenancy/platform-hostname";

const SUPPORT_PATH = "/support";

/**
 * True when request is the HouzzatPRO platform-root /support landing page.
 * Tenant hostnames must not render this route (marketing layout keeps 404).
 */
export async function isHouzzatProPlatformSupportRequest(): Promise<boolean> {
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

  if (path !== SUPPORT_PATH) return false;

  const host =
    headerStore.get("x-forwarded-host")?.split(":")[0]?.trim() ??
    headerStore.get("host")?.split(":")[0]?.trim() ??
    null;

  if (!host) return false;

  return isHouzzatProPlatformRoot(host);
}
