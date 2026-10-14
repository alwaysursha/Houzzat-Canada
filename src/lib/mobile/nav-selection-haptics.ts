/**
 * Subtle selection haptics for HouzzatPro Private staff bottom tabs.
 * Private UI + native Capacitor only — no-ops on production PRO InstantShell
 * and mobile Chrome. Native plugin only — no web Vibration API fallback.
 *
 * Important: the Capacitor selection-arm API alone does NOT vibrate on
 * Android. Use impact(Light) for a single tap.
 */
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { HOUZZATPRO_PRIVATE_UI_UA_MARKER } from "@/lib/mobile/app-shell";

let lastHapticAt = 0;
const MIN_GAP_MS = 80;

function isPrivateProUi(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.userAgent.includes(HOUZZATPRO_PRIVATE_UI_UA_MARKER);
}

/** Light impact feedback for intentional bottom-nav taps only. */
export function triggerStaffNavSelectionHaptic(): void {
  if (!isPrivateProUi()) return;
  if (!Capacitor.isNativePlatform()) return;

  const now = Date.now();
  if (now - lastHapticAt < MIN_GAP_MS) return;
  lastHapticAt = now;

  void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {
    // Plugin unavailable / OS haptics disabled — never block navigation.
  });
}

/** Test-only */
export function resetStaffNavSelectionHapticThrottleForTests(): void {
  lastHapticAt = 0;
}
