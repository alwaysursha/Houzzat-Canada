"use client";

import { SplashScreen } from "@capacitor/splash-screen";
import { useLayoutEffect } from "react";
import { HOUZZAT_APP_ID, nativeAppIdFromUserAgent } from "@/lib/mobile/app-shell";
import {
  HOUZZAT_BOOT_SESSION_KEY,
  HOUZZAT_BOOT_SPLASH_CSS,
} from "@/lib/mobile/houzzat-boot-splash-script";

const HOLD_MS = 1100;
const FADE_MS = 380;

function isConsumerNative() {
  if (typeof navigator === "undefined") return false;
  return nativeAppIdFromUserAgent(navigator.userAgent) === HOUZZAT_APP_ID;
}

function shouldSkipPath(pathname: string) {
  return (
    pathname.startsWith("/pro") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/agent")
  );
}

function ensureOverlay() {
  if (!document.getElementById("hz-boot-pre-css")) {
    const css = document.createElement("style");
    css.id = "hz-boot-pre-css";
    css.textContent = HOUZZAT_BOOT_SPLASH_CSS;
    document.documentElement.appendChild(css);
  }
  if (document.getElementById("hz-boot-pre")) return;
  const d = document.createElement("div");
  d.id = "hz-boot-pre";
  d.setAttribute("aria-hidden", "true");
  d.innerHTML =
    '<div class="bg"></div><div class="wash"></div><div class="stage"><img class="mark" src="/images/houzzat-house-mark.png" alt="" width="168" height="168"/><div class="word">Houzzat</div></div>';
  document.body.appendChild(d);
}

function teardownOverlay() {
  document.getElementById("hz-boot-pre")?.remove();
  document.getElementById("hz-boot-pre-css")?.remove();
}

/**
 * Continues the native splash into the cinematic welcome, then home.
 * The first HTML script already painted #hz-boot-pre; this hides the
 * Capacitor layer and runs the bloom so it does not feel like a third screen.
 */
export function HouzzatBootSplash() {
  useLayoutEffect(() => {
    void SplashScreen.hide().catch(() => undefined);

    if (!isConsumerNative() || shouldSkipPath(window.location.pathname)) {
      teardownOverlay();
      return;
    }

    let alreadyShown = false;
    try {
      alreadyShown = sessionStorage.getItem(HOUZZAT_BOOT_SESSION_KEY) === "1";
    } catch {
      alreadyShown = false;
    }

    if (alreadyShown) {
      teardownOverlay();
      return;
    }

    try {
      sessionStorage.setItem(HOUZZAT_BOOT_SESSION_KEY, "1");
    } catch {
      // ignore
    }

    ensureOverlay();
    const overlay = document.getElementById("hz-boot-pre");
    overlay?.classList.add("hz-boot--run");

    const fadeTimer = window.setTimeout(() => {
      overlay?.classList.add("hz-boot--out");
    }, HOLD_MS);
    const removeTimer = window.setTimeout(() => {
      teardownOverlay();
    }, HOLD_MS + FADE_MS);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(removeTimer);
    };
  }, []);

  return null;
}
