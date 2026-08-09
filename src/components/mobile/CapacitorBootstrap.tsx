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
        // Android 15+ forces edge-to-edge; web safe-area + green strip handle the bar.
        // Keep overlay so inset env() vars are populated for the header.
        await StatusBar.setOverlaysWebView({ overlay: true });
        await StatusBar.setBackgroundColor({ color: STATUS_BAR_GREEN });
        // Light icons/text on the green safe-area strip.
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
