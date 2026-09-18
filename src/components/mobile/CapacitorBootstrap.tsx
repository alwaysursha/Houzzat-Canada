"use client";

import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { StatusBar } from "@capacitor/status-bar";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
import { resolveAgentChatsHardwareBackHref } from "@/lib/agent/chats-inbox-query";
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
 * staff drawers/modals → hard-nav memory → Chat thread→list →
 * staff home → history → exit.
 * Closing overlays never leaves body scroll locked (acquireScrollLock).
 *
 * Also syncs the UX-only `houzzat_shell` cookie (never used for authorization).
 */
export function CapacitorBootstrap() {
  const [showExitToast, setShowExitToast] = useState(false);
  const exitToastTimer = useRef<NodeJS.Timeout | null>(null);

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

    let lastBackPressAt = 0;

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

      const currentPath = window.location.pathname;

      // When already at the primary home root of the shell, double tap exits the app
      const isHomeRoot =
        currentPath === "/" ||
        currentPath === "/admin" ||
        currentPath === "/agent";

      if (isHomeRoot) {
        const now = Date.now();
        if (now - lastBackPressAt < 2000) {
          setShowExitToast(false);
          void CapApp.exitApp();
        } else {
          lastBackPressAt = now;
          setShowExitToast(true);
          if (exitToastTimer.current) clearTimeout(exitToastTimer.current);
          exitToastTimer.current = setTimeout(() => {
            setShowExitToast(false);
          }, 2000);
        }
        return;
      }

      if (currentPath.startsWith("/listing/")) {
        hardGo("/");
        return;
      }

      // In staff portals (/admin/* or /agent/*), bring back to staff dashboard home
      if (currentPath.startsWith("/admin/")) {
        hardGo("/admin");
        return;
      }

      const chatsBackHref = resolveAgentChatsHardwareBackHref(
        currentPath,
        window.location.search,
      );
      if (chatsBackHref) {
        hardGo(chatsBackHref);
        return;
      }

      if (currentPath.startsWith("/agent/")) {
        hardGo("/agent");
        return;
      }

      if (canGoBack) {
        window.history.back();
        return;
      }

      void CapApp.exitApp();
    });

    return () => {
      if (exitToastTimer.current) clearTimeout(exitToastTimer.current);
      void sub.then((handle) => handle.remove());
    };
  }, []);

  return (
    <>
      <NativeStatusBarSync />
      {/* Toast Prompt for Double-Tap Exit */}
      <div
        className={`pointer-events-none fixed inset-x-0 bottom-16 z-[9999] flex justify-center px-4 transition-all duration-300 ease-out ${
          showExitToast
            ? "translate-y-0 opacity-100 scale-100"
            : "translate-y-3 opacity-0 scale-95"
        }`}
        aria-live="polite"
      >
        <div className="flex items-center gap-2.5 rounded-full border border-white/20 bg-[#1e2a38]/95 px-4 py-2.5 shadow-[0_8px_30px_rgb(0,0,0,0.35)] backdrop-blur-md">
          <div className="flex size-6 items-center justify-center rounded-full bg-canopy/25 text-canopy">
            <LogOut className="size-3.5 stroke-[2.2]" />
          </div>
          <span className="text-xs font-semibold tracking-wide text-white">
            Press back again to exit
          </span>
        </div>
      </div>
    </>
  );
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
