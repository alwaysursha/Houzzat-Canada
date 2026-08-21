"use client";

import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { StatusBar } from "@capacitor/status-bar";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  clearAppShellCookieOnWeb,
  resolveAppShell,
  syncAppShellCookie,
  type AppShell,
} from "@/lib/mobile/app-shell";
import {
  applyNativeStatusBar,
  getNativeStatusBarLightOverlay,
  subscribeNativeStatusBarLightOverlay,
} from "@/lib/mobile/native-status-bar";
import {
  backListingSheet,
  canListingSheetBack,
  closeListingSheet,
  isListingSheetOpen,
} from "@/lib/mobile/listing-sheet-store";
import {
  isListingSheetSearchOpen,
  requestCloseListingSheetSearch,
} from "@/lib/mobile/listing-sheet-search";
import {
  isMobileSearchSheetOpen,
  requestCloseMobileSearchSheet,
} from "@/lib/mobile/mobile-search-sheet";
import { hardGo, takeNavBackHref } from "@/lib/mobile/nav-back";
import {
  closeTopStaffOverlay,
  hasStaffOverlay,
} from "@/lib/mobile/staff-overlay-stack";

/**
 * Native-shell polish when Houzzat runs inside Capacitor.
 *
 * Back priority:
 * listing chrome search → mobile AC search sheet → listing sheet →
 * staff drawers/modals → hard-nav memory → history → exit.
 * Closing overlays never leaves body scroll locked (acquireScrollLock).
 *
 * Also syncs the UX-only `houzzat_shell` cookie (never used for authorization).
 */
export function CapacitorBootstrap() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      // Prevent stale consumer/pro hints from affecting normal web SSR/middleware.
      clearAppShellCookieOnWeb();
      return;
    }

    void (async () => {
      const shell = await resolveAppShell();
      syncAppShellCookie(shell);
      try {
        await StatusBar.setOverlaysWebView({ overlay: true });
        await applyNativeStatusBar({
          pathname: window.location.pathname,
          shell,
          lightOverlay: getNativeStatusBarLightOverlay(),
        });
      } catch {
        // ignore
      }
    })();

    const sub = CapApp.addListener("backButton", ({ canGoBack }) => {
      if (isListingSheetSearchOpen()) {
        requestCloseListingSheetSearch();
        return;
      }

      if (isMobileSearchSheetOpen() && requestCloseMobileSearchSheet()) {
        return;
      }

      if (isListingSheetOpen()) {
        if (canListingSheetBack()) {
          backListingSheet();
        } else {
          closeListingSheet();
        }
        return;
      }

      if (hasStaffOverlay() && closeTopStaffOverlay()) {
        return;
      }

      const remembered = takeNavBackHref();
      if (remembered) {
        hardGo(remembered);
        return;
      }

      if (window.location.pathname.startsWith("/listing/")) {
        hardGo("/");
        return;
      }

      if (canGoBack) {
        window.history.back();
        return;
      }

      void CapApp.exitApp();
    });

    return () => {
      void sub.then((handle) => handle.remove());
    };
  }, []);

  return <NativeStatusBarSync />;
}

function NativeStatusBarSync() {
  const pathname = usePathname();
  const [lightOverlay, setLightOverlay] = useState(
    getNativeStatusBarLightOverlay,
  );
  const [shell, setShell] = useState<AppShell | null>(null);

  useEffect(() => {
    return subscribeNativeStatusBarLightOverlay(() => {
      setLightOverlay(getNativeStatusBarLightOverlay());
    });
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let cancelled = false;
    void resolveAppShell().then((next) => {
      if (!cancelled) setShell(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !shell) return;
    void applyNativeStatusBar({ pathname, shell, lightOverlay }).catch(
      () => undefined,
    );
  }, [pathname, shell, lightOverlay]);

  return null;
}
