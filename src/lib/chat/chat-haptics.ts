/**
 * Best-effort chat haptics. Never blocks interactions.
 * Uses navigator.vibrate when available; iOS Safari typically ignores it.
 * Respects prefers-reduced-motion.
 */

export type ChatHapticKind =
  | "long-press"
  | "swipe-reply"
  | "reaction"
  | "voice-start"
  | "voice-stop"
  | "light";

const PATTERNS: Record<ChatHapticKind, number | number[]> = {
  "long-press": 12,
  "swipe-reply": 10,
  reaction: 8,
  "voice-start": 14,
  "voice-stop": [8, 30, 8],
  light: 6,
};

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function chatHaptic(kind: ChatHapticKind): void {
  if (typeof navigator === "undefined") return;
  if (prefersReducedMotion()) return;
  const vibrate = navigator.vibrate?.bind(navigator);
  if (!vibrate) return;
  try {
    vibrate(PATTERNS[kind]);
  } catch {
    // unsupported / denied
  }
}
