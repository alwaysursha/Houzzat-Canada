"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import {
  OPEN_HOUZZAT_PRO_PATH,
  resolveAppShell,
  syncAppShellCookie,
} from "@/lib/mobile/app-shell";
import { hardGo } from "@/lib/mobile/nav-back";

/**
 * Second line of defence for native shells whose binary predates the native
 * User-Agent marker (middleware handles marker-equipped requests before SSR).
 *
 * Any native shell gets an opaque cover as soon as hydration runs, so a cold
 * `/admin` or `/agent` load stops showing staff UI while Capacitor identity
 * resolves. The cover is removed only for HouzzatPro.
 * Web renders nothing and is completely unaffected. No Neon/API calls.
 */
export function StaffRouteConsumerGate() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const cover = document.createElement("div");
    cover.dataset.staffShellCover = "";
    cover.setAttribute("aria-hidden", "true");
    cover.style.cssText =
      "position:fixed;inset:0;z-index:2147483000;background:#ffffff";
    document.body.appendChild(cover);

    let cancelled = false;
    void (async () => {
      const shell = await resolveAppShell();
      if (cancelled) return;
      syncAppShellCookie(shell);
      if (shell === "houzzatpro") {
        cover.remove();
        return;
      }
      hardGo(OPEN_HOUZZAT_PRO_PATH);
    })();

    return () => {
      cancelled = true;
      cover.remove();
    };
  }, []);

  return null;
}
