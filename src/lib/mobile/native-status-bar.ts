"use client";

import { StatusBar, Style } from "@capacitor/status-bar";
import type { AppShell } from "@/lib/mobile/app-shell";

/**
 * Capacitor StatusBar.Style:
 * - Dark → light/white icons (for dark backgrounds)
 * - Light → dark icons (for light backgrounds)
 */

type Surface =
  | "pro-agent"
  | "pro-light"
  | "pro-mint"
  | "consumer"
  | "consumer-light";

function surfaceFor(pathname: string, shell: AppShell, lightOverlay: boolean): Surface {
  if (shell === "houzzatpro") {
    if (lightOverlay) return "pro-light";
    if (pathname.startsWith("/pro/sign-in")) return "pro-mint";
    // Admin and Agent shells both use the dark header (#1e2a38), so they need light/white icons
    if (pathname.startsWith("/admin") || pathname.startsWith("/agent")) return "pro-agent";
    return "pro-light";
  }
  // Light overlays (floating chat sheet, light modals) need dark status-bar icons.
  if (lightOverlay) return "consumer-light";
  if (pathname === "/account/chat" || pathname.startsWith("/account/chat/")) {
    return "consumer-light";
  }
  return "consumer";
}

export async function applyNativeStatusBar(input: {
  pathname: string;
  shell: AppShell;
  lightOverlay?: boolean;
}): Promise<void> {
  const surface = surfaceFor(
    input.pathname,
    input.shell,
    Boolean(input.lightOverlay),
  );
  switch (surface) {
    case "pro-agent":
      await StatusBar.setBackgroundColor({ color: "#1e2a38" });
      await StatusBar.setStyle({ style: Style.Dark });
      return;
    case "pro-mint":
      await StatusBar.setBackgroundColor({ color: "#63D9BD" });
      await StatusBar.setStyle({ style: Style.Light });
      return;
    case "pro-light":
      await StatusBar.setBackgroundColor({ color: "#F4F6F8" });
      await StatusBar.setStyle({ style: Style.Light });
      return;
    case "consumer":
      await StatusBar.setBackgroundColor({ color: "#1A7B59" });
      await StatusBar.setStyle({ style: Style.Dark });
      return;
    case "consumer-light":
      // Style.Light → dark icons on light mint/white chat surfaces.
      await StatusBar.setBackgroundColor({ color: "#F4FAF7" });
      await StatusBar.setStyle({ style: Style.Light });
      return;
    default: {
      const _exhaustive: never = surface;
      return _exhaustive;
    }
  }
}

let lightOverlay = false;
const listeners = new Set<() => void>();

export function setNativeStatusBarLightOverlay(value: boolean) {
  if (lightOverlay === value) return;
  lightOverlay = value;
  for (const listener of listeners) listener();
}

export function getNativeStatusBarLightOverlay() {
  return lightOverlay;
}

export function subscribeNativeStatusBarLightOverlay(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
