/**
 * Stage 3K.5.34 — Auth.js SessionProvider focus revalidation policy.
 *
 * HouzzatPRO native shell disables window-focus session revalidation to eliminate
 * synthetic focus storm loops from Android WebView (keyboard, drawers, overlays, status bar).
 * Browser/web and consumer Houzzat shells retain standard focus revalidation.
 */

import { HOUZZATPRO_APP_ID, nativeAppIdFromUserAgent } from "@/lib/mobile/app-shell";

export function shouldRefetchSessionOnWindowFocus(
  userAgent: string | null | undefined,
): boolean {
  if (!userAgent) return true;
  const appId = nativeAppIdFromUserAgent(userAgent);
  if (appId === HOUZZATPRO_APP_ID) {
    return false;
  }
  if (userAgent.includes("com.houzzat.pro")) {
    return false;
  }
  return true;
}
