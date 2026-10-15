/**
 * Subtle selection haptics for HouzzatPro FullCRM staff bottom tabs.
 * FullCRM Pro native only (Private UI marker or production FullCRM marker) —
 * no-ops on legacy InstantShell Play builds and mobile Chrome.
 * Native plugin only — no web Vibration API fallback.
 *
 * Important: the Capacitor selection-arm API alone does NOT vibrate on
 * Android. Use impact(Light) for a single tap.
 */
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { prefersProFullCrmExperience } from "@/lib/mobile/app-shell";

let lastHapticAt = 0;
const MIN_GAP_MS = 80;

/** Light impact feedback for intentional bottom-nav taps only. */
export function triggerStaffNavSelectionHaptic(): void {
  if (typeof navigator === "undefined") return;
  if (!prefersProFullCrmExperience(navigator.userAgent)) return;
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
