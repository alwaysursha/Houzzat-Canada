/**
 * Stage 3K.5.18.2 / Stage 3K.5.19 — Native Route Latch Adapter.
 *
 * Synchronizes with and delegates to the authoritative ProNativeAuthController.
 */

import {
  proNativeAuthController,
  type NativeAuthState,
} from "@/lib/mobile/pro-native-auth-controller";

export type NativeRouteStage =
  | "IDLE"
  | "BOOTSTRAPPING"
  | "HANDOFF_STARTED"
  | "TENANT_SESSION_ESTABLISHED"
  | "FINAL_DESTINATION";

export function getNativeNavStage(): NativeRouteStage {
  const snapshot = proNativeAuthController.getSnapshot();
  switch (snapshot.state) {
    case "SIGNED_OUT":
    case "ERROR":
      return "IDLE";
    case "AUTHENTICATING":
    case "PLATFORM_SESSION_READY":
    case "DISCOVERING_WORKSPACE":
      return "BOOTSTRAPPING";
    case "HANDOFF_CREATING":
    case "HANDOFF_CREATED":
    case "HANDOFF_NAVIGATING":
    case "HANDOFF_EXCHANGING":
      return "HANDOFF_STARTED";
    case "TENANT_SESSION_READY":
      return "TENANT_SESSION_ESTABLISHED";
    case "FINAL_NAVIGATION":
    case "COMPLETE":
      return "FINAL_DESTINATION";
    default:
      return "IDLE";
  }
}

export function setNativeNavStage(stage: NativeRouteStage): void {
  // Map legacy stage back to auth controller state if needed
  switch (stage) {
    case "IDLE":
      proNativeAuthController.reset("SIGNED_OUT");
      break;
    case "BOOTSTRAPPING":
      // Managed by controller internally
      break;
    case "HANDOFF_STARTED":
      // Managed by controller internally
      break;
    case "TENANT_SESSION_ESTABLISHED":
      // Managed by controller internally
      break;
    case "FINAL_DESTINATION":
      // Managed by controller internally
      break;
  }
}

export function clearNativeNavStage(): void {
  proNativeAuthController.reset("SIGNED_OUT");
}

export function isNativeHandoffInFlight(): boolean {
  const stage = getNativeNavStage();
  return stage === "HANDOFF_STARTED" || stage === "TENANT_SESSION_ESTABLISHED";
}
