"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { newCallOutcomeRequestId } from "@/lib/agent/call-outcome-presentation";
import {
  WEB_DIALER_STAYED_FOREGROUND_MS,
  beginWebCallOutcome,
  cancelWebCallOutcomeFlow,
  noteWebCallPageState,
  noteWebDialerHandedOff,
  settleWebForegroundFallback,
  webCallOutcomeRequestIdForLead,
  webCallPageStateFromDocument,
  type WebCallOutcomeFlow,
} from "@/lib/agent/call-outcome-web-session";

export function useWebCallOutcomeSession(options?: {
  /** When set, navigating to another lead dismisses a pending/open prompt. */
  resetWhenLeadId?: string;
}) {
  const [flow, setFlow] = useState<WebCallOutcomeFlow>({ status: "idle" });
  const flowRef = useRef(flow);
  flowRef.current = flow;
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const scopedLeadId = options?.resetWhenLeadId;

  const clearFallback = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const commit = useCallback(
    (next: WebCallOutcomeFlow) => {
      flowRef.current = next;
      setFlow(next);
      if (next.status !== "pending_return") clearFallback();
    },
    [clearFallback],
  );

  const beginCall = useCallback(
    (input: { leadId: string; target: HTMLElement }) => {
      const existing = webCallOutcomeRequestIdForLead(
        flowRef.current,
        input.leadId,
      );
      const requestId = existing ?? newCallOutcomeRequestId();
      const started = beginWebCallOutcome(flowRef.current, {
        leadId: input.leadId,
        requestId,
      });
      const handed = noteWebDialerHandedOff(started);
      returnFocusRef.current = input.target;
      commit(handed);
      if (handed.status !== "pending_return") return;
      clearFallback();
      const armedRequestId = handed.requestId;
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        commit(
          settleWebForegroundFallback(
            flowRef.current,
            armedRequestId,
            webCallPageStateFromDocument(document),
          ),
        );
      }, WEB_DIALER_STAYED_FOREGROUND_MS);
    },
    [clearFallback, commit],
  );

  const dismiss = useCallback(() => {
    commit(cancelWebCallOutcomeFlow());
  }, [commit]);

  useEffect(() => {
    function applyPageState() {
      commit(
        noteWebCallPageState(
          flowRef.current,
          webCallPageStateFromDocument(document),
        ),
      );
    }
    document.addEventListener("visibilitychange", applyPageState);
    window.addEventListener("pageshow", applyPageState);
    window.addEventListener("focus", applyPageState);
    return () => {
      document.removeEventListener("visibilitychange", applyPageState);
      window.removeEventListener("pageshow", applyPageState);
      window.removeEventListener("focus", applyPageState);
      clearFallback();
    };
  }, [clearFallback, commit]);

  useEffect(() => {
    if (scopedLeadId == null) return;
    const current = flowRef.current;
    if (current.status !== "idle" && current.leadId !== scopedLeadId) {
      commit(cancelWebCallOutcomeFlow());
    }
  }, [commit, scopedLeadId]);

  return {
    flow,
    returnFocusRef,
    beginCall,
    dismiss,
  };
}
