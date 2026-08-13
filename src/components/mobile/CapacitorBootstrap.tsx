"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";
import {
  backListingSheet,
  canListingSheetBack,
  closeListingSheet,
  isListingSheetOpen,
} from "@/lib/mobile/listing-sheet-store";
import { hardGo, takeNavBackHref } from "@/lib/mobile/nav-back";
import {
  closeTopStaffOverlay,
  hasStaffOverlay,
} from "@/lib/mobile/staff-overlay-stack";

const STATUS_BAR_GREEN = "#1A7B59";

/**
 * Native-shell polish when Houzzat runs inside Capacitor.
 *
 * Back priority:
 * listing sheet → staff drawers/modals → hard-nav memory → history → exit.
 * Closing overlays never leaves body scroll locked (acquireScrollLock).
 */
export function CapacitorBootstrap() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    void (async () => {
      try {
        await StatusBar.setOverlaysWebView({ overlay: true });
        await StatusBar.setBackgroundColor({ color: STATUS_BAR_GREEN });
        await StatusBar.setStyle({ style: Style.Light });
      } catch {
        // ignore
      }
    })();

    const sub = CapApp.addListener("backButton", ({ canGoBack }) => {
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

  return null;
}
