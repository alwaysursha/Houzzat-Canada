"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";

const STATUS_BAR_GREEN = "#1A7B59";

/**
 * Native-shell polish when Houzzat runs inside Capacitor.
 * Safe no-op in regular browsers.
 */
export function CapacitorBootstrap() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    void (async () => {
      try {
        // Keep the system status bar as a solid brand bar (not overlaid on white UI).
        await StatusBar.setOverlaysWebView({ overlay: false });
        await StatusBar.setBackgroundColor({ color: STATUS_BAR_GREEN });
        // Light icons/text for a dark green status bar.
        await StatusBar.setStyle({ style: Style.Light });
      } catch {
        // Older WebViews / unsupported platforms — ignore.
      }
    })();

    const sub = CapApp.addListener("backButton", ({ canGoBack }) => {
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
