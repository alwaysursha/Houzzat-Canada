"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";
import { hardGo, takeNavBackHref } from "@/lib/mobile/nav-back";

const STATUS_BAR_GREEN = "#1A7B59";

/**
 * Native-shell polish when Houzzat runs inside Capacitor.
 *
 * Android Back must not call history.back() alone — after a listing hard-load,
 * Next still soft-handles popstate and 500s/1102s on Cloudflare. Prefer a
 * full document load to the remembered previous page.
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
        // Last resort — SoftNavShield strips the broken RSC header.
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
