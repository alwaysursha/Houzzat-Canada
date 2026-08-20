"use client";

import { SplashScreen } from "@capacitor/splash-screen";
import { useLayoutEffect } from "react";
import {
  HOUZZAT_ANDROID_BOOT_CSS,
  HOUZZAT_ANDROID_BOOT_FADE_MS,
  HOUZZAT_ANDROID_BOOT_KEY,
  HOUZZAT_ANDROID_BOOT_MARKUP,
  HOUZZAT_ANDROID_BOOT_MAX_MS,
  HOUZZAT_ANDROID_BOOT_MIN_MS,
  isHouzzatAndroidConsumer,
  shouldSkipHouzzatAndroidBoot,
} from "@/lib/mobile/houzzat-android-boot";

function hideNativeSplash() {
  void SplashScreen.hide({ fadeOutDuration: 0 }).catch(() => undefined);
}

function teardownCover() {
  document.getElementById("hz-android-boot")?.remove();
  document.getElementById("hz-android-boot-css")?.remove();
  document.documentElement.classList.remove("hz-android-booting");
}

function ensureCover() {
  if (!document.getElementById("hz-android-boot-css")) {
    const css = document.createElement("style");
    css.id = "hz-android-boot-css";
    css.textContent = HOUZZAT_ANDROID_BOOT_CSS;
    document.documentElement.appendChild(css);
  }
  document.documentElement.classList.add("hz-android-booting");
  if (document.getElementById("hz-android-boot")) return;
  const d = document.createElement("div");
  d.id = "hz-android-boot";
  d.setAttribute("aria-hidden", "true");
  d.setAttribute("data-started", String(Date.now()));
  d.innerHTML = HOUZZAT_ANDROID_BOOT_MARKUP;
  document.body.appendChild(d);
}

function isUsefulShellReady() {
  const path = window.location.pathname;
  const header =
    document.getElementById("houzzat-site-header") ??
    document.querySelector("header");
  if (path === "/" || path === "") {
    const hero = document.getElementById("home-hero");
    if (!hero || !header) return false;
    return hero.getBoundingClientRect().height > 24;
  }
  return Boolean(header);
}

/**
 * One Android consumer boot surface. Not a route.
 * Native splash stays up until this cover is in the DOM; then Home can
 * finish painting underneath and the cover fades.
 */
export function HouzzatAndroidBootCover() {
  useLayoutEffect(() => {
    const ua = navigator.userAgent;
    if (
      !isHouzzatAndroidConsumer(ua) ||
      shouldSkipHouzzatAndroidBoot(window.location.pathname)
    ) {
      hideNativeSplash();
      teardownCover();
      return;
    }

    try {
      if (sessionStorage.getItem(HOUZZAT_ANDROID_BOOT_KEY) === "1") {
        if (!document.getElementById("hz-android-boot")) {
          hideNativeSplash();
          teardownCover();
          return;
        }
      } else {
        sessionStorage.setItem(HOUZZAT_ANDROID_BOOT_KEY, "1");
      }
    } catch {
      // sessionStorage unavailable — still show this document's cover.
    }

    ensureCover();

    const overlay = document.getElementById("hz-android-boot");
    const startedAt = Number(overlay?.getAttribute("data-started")) || Date.now();
    let fading = false;
    let observer: MutationObserver | undefined;
    let handedOff = false;
    let poll = 0;

    const handoffNative = (force = false) => {
      if (handedOff) return;
      const img = overlay?.querySelector("img.mark");
      if (!force && img instanceof HTMLImageElement && !img.complete) return;
      handedOff = true;
      hideNativeSplash();
    };
    const mark = overlay?.querySelector("img.mark");
    if (mark instanceof HTMLImageElement && !mark.complete) {
      mark.addEventListener("load", () => handoffNative(true), { once: true });
      mark.addEventListener("error", () => handoffNative(true), { once: true });
    }
    const handoffTimer = window.setTimeout(() => handoffNative(true), 400);
    handoffNative();

    const fade = () => {
      if (fading) return;
      fading = true;
      observer?.disconnect();
      window.clearInterval(poll);
      handoffNative(true);
      overlay?.classList.add("hz-boot--out");
      window.setTimeout(() => {
        teardownCover();
      }, HOUZZAT_ANDROID_BOOT_FADE_MS);
    };

    const consider = () => {
      if (fading) return;
      const elapsed = Date.now() - startedAt;
      if (elapsed >= HOUZZAT_ANDROID_BOOT_MAX_MS) {
        fade();
        return;
      }
      if (elapsed < HOUZZAT_ANDROID_BOOT_MIN_MS) return;
      if (!isUsefulShellReady()) return;
      fade();
    };

    observer = new MutationObserver(consider);
    observer.observe(document.body, { childList: true, subtree: true });
    poll = window.setInterval(consider, 80);
    const minTimer = window.setTimeout(consider, HOUZZAT_ANDROID_BOOT_MIN_MS);
    const maxTimer = window.setTimeout(consider, HOUZZAT_ANDROID_BOOT_MAX_MS);
    consider();

    return () => {
      window.clearInterval(poll);
      window.clearTimeout(minTimer);
      window.clearTimeout(maxTimer);
      window.clearTimeout(handoffTimer);
      observer?.disconnect();
    };
  }, []);

  return null;
}
