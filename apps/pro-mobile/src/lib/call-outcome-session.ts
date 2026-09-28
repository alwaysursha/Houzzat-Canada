/**
 * When the native Call action should show Call Outcome.
 * The sheet stays closed until the dialer handoff has settled:
 * the app left and came back, or the dialer never took the app away.
 * Nothing here writes CRM data.
 */

export const DIALER_STAYED_FOREGROUND_MS = 600;

export type CallOutcomeAppState =
  | "active"
  | "background"
  | "inactive"
  | "unknown"
  | "extension";

export type CallOutcomeFlow =
  | { status: "idle" }
  | {
      status: "pending_return";
      requestId: string;
      handedOff: boolean;
      leftApp: boolean;
    }
  | { status: "open"; requestId: string };

export function createCallOutcomeRequestId(): string {
  const webCrypto = globalThis.crypto;
  if (webCrypto && typeof webCrypto.randomUUID === "function") {
    return webCrypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...bytes].map((part) => part.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function startCallOutcomeFlow(requestId: string): CallOutcomeFlow {
  return {
    status: "pending_return",
    requestId,
    handedOff: false,
    leftApp: false,
  };
}

export function cancelCallOutcomeFlow(): CallOutcomeFlow {
  return { status: "idle" };
}

export function noteDialerHandedOff(flow: CallOutcomeFlow): CallOutcomeFlow {
  if (flow.status !== "pending_return") return flow;
  return { ...flow, handedOff: true };
}

export function noteCallOutcomeAppState(
  flow: CallOutcomeFlow,
  next: CallOutcomeAppState,
): CallOutcomeFlow {
  if (flow.status !== "pending_return") return flow;
  if (next === "background" || next === "inactive") {
    return { ...flow, leftApp: true };
  }
  if (next === "active" && flow.handedOff && flow.leftApp) {
    return { status: "open", requestId: flow.requestId };
  }
  return flow;
}

/** Open after a handoff if the app already left and is active again. */
export function openCallOutcomeIfReturned(
  flow: CallOutcomeFlow,
  appState: CallOutcomeAppState,
): CallOutcomeFlow {
  if (
    flow.status === "pending_return" &&
    flow.handedOff &&
    flow.leftApp &&
    appState === "active"
  ) {
    return { status: "open", requestId: flow.requestId };
  }
  return flow;
}

/**
 * The 600ms fallback may open only the armed session that never left the app.
 * A dismissed session, a session that already left, and a newer Call are ignored.
 */
export function settleForegroundFallback(
  flow: CallOutcomeFlow,
  armedRequestId: string,
  appState: CallOutcomeAppState,
): CallOutcomeFlow {
  if (appState !== "active") return flow;
  if (flow.status !== "pending_return") return flow;
  if (flow.requestId !== armedRequestId) return flow;
  if (!flow.handedOff || flow.leftApp) return flow;
  return { status: "open", requestId: flow.requestId };
}

export function revealCallOutcomeWithoutLeave(flow: CallOutcomeFlow): CallOutcomeFlow {
  if (flow.status !== "pending_return") return flow;
  return settleForegroundFallback(flow, flow.requestId, "active");
}

export function callOutcomeRequestId(flow: CallOutcomeFlow): string | null {
  return flow.status === "idle" ? null : flow.requestId;
}
