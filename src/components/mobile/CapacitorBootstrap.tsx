"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";
import {
  closeListingSheet,
  isListingSheetOpen,
} from "@/lib/mobile/listing-sheet-store";
import { hardGo, takeNavBackHref } from "@/lib/mobile/nav-back";

const STATUS_BAR_GREEN = "#1A7B59";

/**
 * Native-shell polish when Houzzat runs inside Capacitor.
 *
 * Back priority: close listing sheet → hard-nav remembered path → exit.
 * Closing the sheet never reloads the homepage underneath.
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
        closeListingSheet();
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
