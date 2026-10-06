/**
 * When a HouzzatPRO Web Call action should show Call Outcome.
 * The dialog stays closed until the tel: handoff has settled:
 * the page left and came back, or the dialer never took the tab away.
 * Nothing here writes CRM data.
 */

export const WEB_DIALER_STAYED_FOREGROUND_MS = 600;

export type WebCallPageState = "visible" | "hidden";

export type WebCallOutcomeFlow =
  | { status: "idle" }
  | {
      status: "pending_return";
      requestId: string;
      leadId: string;
      handedOff: boolean;
      leftPage: boolean;
    }
  | { status: "open"; requestId: string; leadId: string };

export function startWebCallOutcomeFlow(
  requestId: string,
  leadId: string,
): WebCallOutcomeFlow {
  return {
    status: "pending_return",
    requestId,
    leadId,
    handedOff: false,
    leftPage: false,
  };
}

export function cancelWebCallOutcomeFlow(): WebCallOutcomeFlow {
  return { status: "idle" };
}

export function webCallOutcomeRequestIdForLead(
  flow: WebCallOutcomeFlow,
  leadId: string,
): string | null {
  if (flow.status === "idle") return null;
  return flow.leadId === leadId ? flow.requestId : null;
}

/**
 * One initiation per lead keeps the same request ID.
 * A different lead replaces the pending/open session (one dialog).
 */
export function beginWebCallOutcome(
  flow: WebCallOutcomeFlow,
  input: { leadId: string; requestId: string },
): WebCallOutcomeFlow {
  if (flow.status !== "idle" && flow.leadId === input.leadId) {
    return flow;
  }
  return startWebCallOutcomeFlow(input.requestId, input.leadId);
}

export function noteWebDialerHandedOff(
  flow: WebCallOutcomeFlow,
): WebCallOutcomeFlow {
  if (flow.status !== "pending_return") return flow;
  return { ...flow, handedOff: true };
}

export function noteWebCallPageState(
  flow: WebCallOutcomeFlow,
  next: WebCallPageState,
): WebCallOutcomeFlow {
  if (flow.status !== "pending_return") return flow;
  if (next === "hidden") {
    return { ...flow, leftPage: true };
  }
  if (next === "visible" && flow.handedOff && flow.leftPage) {
    return { status: "open", requestId: flow.requestId, leadId: flow.leadId };
  }
  return flow;
}

export function settleWebForegroundFallback(
  flow: WebCallOutcomeFlow,
  armedRequestId: string,
  page: WebCallPageState,
): WebCallOutcomeFlow {
  if (page !== "visible") return flow;
  if (flow.status !== "pending_return") return flow;
  if (flow.requestId !== armedRequestId) return flow;
  if (!flow.handedOff || flow.leftPage) return flow;
  return { status: "open", requestId: flow.requestId, leadId: flow.leadId };
}

export function webCallPageStateFromDocument(doc: {
  visibilityState?: string;
}): WebCallPageState {
  return doc.visibilityState === "hidden" ? "hidden" : "visible";
}

export function webCallOutcomeDialogOpen(flow: WebCallOutcomeFlow): boolean {
  return flow.status === "open";
}
