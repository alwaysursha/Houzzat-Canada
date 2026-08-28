/**
 * Stage 3K.5.18.2 — Native-only monotonic navigation latch.
 *
 * Guarantees that in the HouzzatPRO native shell (HouzzatNative/1):
 * BOOTSTRAPPING → HANDOFF_STARTED → TENANT_SESSION_ESTABLISHED → FINAL_DESTINATION
 * is strictly monotonic.
 *
 * Once terminal navigation begins (hardGo to tenant host or final CRM destination),
 * further duplicate bootstrap requests, retry timers, and hydration redirects become
 * inert.
 *
 * Scoped to sessionStorage so it automatically clears across browser sessions
 * and intentional sign-out.
 */

export type NativeRouteStage =
  | "IDLE"
  | "BOOTSTRAPPING"
  | "HANDOFF_STARTED"
  | "TENANT_SESSION_ESTABLISHED"
  | "FINAL_DESTINATION";

const LATCH_KEY = "houzzat_pro_native_nav_latch";

export function getNativeNavStage(): NativeRouteStage {
  if (typeof window === "undefined") return "IDLE";
  try {
    const raw = sessionStorage.getItem(LATCH_KEY);
    if (
      raw === "BOOTSTRAPPING" ||
      raw === "HANDOFF_STARTED" ||
      raw === "TENANT_SESSION_ESTABLISHED" ||
      raw === "FINAL_DESTINATION"
    ) {
      return raw;
    }
  } catch {
    // ignore
  }
  return "IDLE";
}

export function setNativeNavStage(stage: NativeRouteStage): void {
  if (typeof window === "undefined") return;
  try {
    if (stage === "IDLE") {
      sessionStorage.removeItem(LATCH_KEY);
    } else {
      sessionStorage.setItem(LATCH_KEY, stage);
    }
  } catch {
    // ignore
  }
}

export function clearNativeNavStage(): void {
  setNativeNavStage("IDLE");
}

export function isNativeHandoffInFlight(): boolean {
  const stage = getNativeNavStage();
  return stage === "HANDOFF_STARTED" || stage === "TENANT_SESSION_ESTABLISHED";
}
