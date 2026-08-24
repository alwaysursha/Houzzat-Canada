"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Capacitor } from "@capacitor/core";
import { sanitizeStaffCallbackPath } from "@/lib/auth/pro-sign-in-routing";
import {
  HOUZZATPRO_STAFF_ONLY_PATH,
  HOUZZATPRO_START_PATH,
  resolveAppShell,
  syncAppShellCookie,
} from "@/lib/mobile/app-shell";
import { hardGo } from "@/lib/mobile/nav-back";
import { peekPendingPushNavigation } from "@/lib/notifications/pending-push-nav";

function isProRouterPath(pathname: string): boolean {
  return (
    pathname === HOUZZATPRO_START_PATH ||
    pathname === `${HOUZZATPRO_START_PATH}/`
  );
}

/**
 * HouzzatPro cold-start router.
 *
 * Uses the existing SessionProvider role (no extra Neon/API call).
 * App identity never grants staff access — role checks remain server-side
 * on /admin and /agent.
 *
 * Pending push deep-links win over the generic /agent|/admin landing so a
 * notification tap is not wiped by startup routing.
 */
export function HouzzatProStartup() {
  const { status, data } = useSession();
  const pathname = usePathname() || "/";
  const routed = useRef(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (!isProRouterPath(pathname)) return;
    if (routed.current) return;

    let cancelled = false;
    void (async () => {
      const shell = await resolveAppShell();
      if (cancelled) return;
      syncAppShellCookie(shell);
      if (shell !== "houzzatpro") return;
      if (status === "loading") return;

      routed.current = true;

      const pendingHref = peekPendingPushNavigation()?.href ?? null;

      if (status !== "authenticated" || !data?.user) {
        const callback = sanitizeStaffCallbackPath(
          pendingHref,
          HOUZZATPRO_START_PATH,
        );
        hardGo(
          `/pro/sign-in?callbackUrl=${encodeURIComponent(callback)}`,
        );
        return;
      }

      if (pendingHref) {
        hardGo(pendingHref);
        return;
      }

      const role = data.user.role;
      if (role === "ADMIN") {
        hardGo("/admin");
        return;
      }
      if (role === "AGENT") {
        hardGo("/agent");
        return;
      }
      hardGo(HOUZZATPRO_STAFF_ONLY_PATH);
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname, status, data?.user]);

  return null;
}
