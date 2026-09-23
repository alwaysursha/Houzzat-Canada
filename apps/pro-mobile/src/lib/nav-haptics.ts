/**
 * Subtle navigation haptics for HouzzatPRO bottom tabs.
 *
 * Android REQUIRES android.permission.VIBRATE in the manifest. Calling
 * Vibration.vibrate without it throws a native SecurityException that can
 * crash the release process — JS try/catch alone is not enough on some builds.
 *
 * Fails soft when Vibration is unavailable (simulator / restricted devices).
 */
import { Platform, Vibration } from "react-native";

let lastNavHapticAt = 0;
const NAV_HAPTIC_MIN_GAP_MS = 80;

function canVibrate(): boolean {
  return (
    typeof Vibration !== "undefined" &&
    typeof Vibration.vibrate === "function"
  );
}

/** Light tap feedback for intentional bottom-nav presses. */
export function triggerNavHaptic(): void {
  const now = Date.now();
  if (now - lastNavHapticAt < NAV_HAPTIC_MIN_GAP_MS) return;
  lastNavHapticAt = now;

  if (!canVibrate()) return;

  try {
    if (Platform.OS === "android") {
      // Short single pulse — premium, not a rumble.
      Vibration.vibrate(10);
    } else if (Platform.OS === "ios") {
      Vibration.vibrate();
    }
  } catch {
    // Haptics optional — never block navigation.
  }
}

/** Test-only */
export function resetNavHapticThrottleForTests(): void {
  lastNavHapticAt = 0;
}
