/**
 * Subtle selection haptics for HouzzatPro Private staff bottom tabs.
 * Private UI only — no-ops on production PRO InstantShell and mobile Chrome.
 */
import { Capacitor } from "@capacitor/core";
import { Haptics } from "@capacitor/haptics";
import { HOUZZATPRO_PRIVATE_UI_UA_MARKER } from "@/lib/mobile/app-shell";

let lastHapticAt = 0;
const MIN_GAP_MS = 80;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function isPrivateProUi(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.userAgent.includes(HOUZZATPRO_PRIVATE_UI_UA_MARKER);
}

/** Light selection feedback for intentional bottom-nav taps only. */
export function triggerStaffNavSelectionHaptic(): void {
  if (!isPrivateProUi()) return;
  if (prefersReducedMotion()) return;

  const now = Date.now();
  if (now - lastHapticAt < MIN_GAP_MS) return;
  lastHapticAt = now;

  void (async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        await Haptics.selectionStart();
        return;
      }
    } catch {
      // Plugin missing / OS haptics off — try web fallback.
    }
    try {
      const vibrate = navigator.vibrate?.bind(navigator);
      if (vibrate) vibrate(10);
    } catch {
      // Unsupported — ignore.
    }
  })();
}

/** Test-only */
export function resetStaffNavSelectionHapticThrottleForTests(): void {
  lastHapticAt = 0;
}
