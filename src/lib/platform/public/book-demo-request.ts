import { headers } from "next/headers";
import { BOOK_DEMO_PATH } from "@/lib/platform/public/book-demo-copy";
import { isHouzzatProPlatformRoot } from "@/lib/tenancy/platform-hostname";

/**
 * True when request is the HouzzatPRO platform-root /book-a-demo page.
 * Tenant hostnames must not render this route.
 */
export async function isHouzzatProPlatformBookDemoRequest(): Promise<boolean> {
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

  if (path !== BOOK_DEMO_PATH) return false;

  const host =
    headerStore.get("x-forwarded-host")?.split(":")[0]?.trim() ??
    headerStore.get("host")?.split(":")[0]?.trim() ??
    null;

  if (!host) return false;

  return isHouzzatProPlatformRoot(host);
}
