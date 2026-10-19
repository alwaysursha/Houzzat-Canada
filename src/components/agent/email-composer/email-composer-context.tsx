"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import {
  beginEmailComposerSend,
  cancelDiscardEmailComposer,
  clearEmailComposerSuccessAndClose,
  closeEmailComposer,
  confirmDiscardEmailComposer,
  createEmailComposerSendSnapshot,
  createEmptyEmailComposerStore,
  emailComposerSendInProgress,
  finishEmailComposerSendBlocked,
  finishEmailComposerSendSuccess,
  getActiveEmailComposerDraft,
  maximizeEmailComposer,
  minimizeEmailComposer,
  onEmailComposerHostLeadChange,
  openEmailComposer,
  patchActiveEmailComposerDraft,
  requestCloseEmailComposer,
  restoreEmailComposer,
  shouldRefreshHostAfterEmailSend,
  type EmailComposerStore,
} from "@/lib/agent/email-composer/composer-state";
import {
  canSubmitEmailComposer,
  interpretAgentEmailSendResponse,
} from "@/lib/agent/email-composer/send-result";
import type {
  EmailComposerOpenInput,
  EmailComposerWindowState,
} from "@/lib/agent/email-composer/types";

type EmailComposerAction =
  | { type: "replace"; store: EmailComposerStore }
  | { type: "hostLead"; hostLeadId: string };

function reducer(
  state: EmailComposerStore,
  action: EmailComposerAction,
): EmailComposerStore {
  switch (action.type) {
    case "replace":
      return action.store;
    case "hostLead":
      return onEmailComposerHostLeadChange(state, action.hostLeadId);
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export type EmailComposerApi = {
  windowState: EmailComposerWindowState;
  draft: ReturnType<typeof getActiveEmailComposerDraft>;
  statusMessage: string | null;
  statusTone: EmailComposerStore["statusTone"];
  pending: boolean;
  discardOpen: boolean;
  canSubmit: boolean;
  openComposer: (input: EmailComposerOpenInput) => void;
  minimize: () => void;
  restore: () => void;
  toggleMaximize: () => void;
  requestClose: () => void;
  confirmDiscard: () => void;
  cancelDiscard: () => void;
  setSubject: (value: string) => void;
  setBody: (value: string) => void;
  send: () => Promise<void>;
};

const EmailComposerContext = createContext<EmailComposerApi | null>(null);

export function EmailComposerProvider({
  hostLeadId,
  onSent,
  children,
}: {
  hostLeadId: string;
  /** Called only when the host still shows the lead that was sent. */
  onSent?: (sentLeadId: string) => void;
  children: ReactNode;
}) {
  const [store, dispatch] = useReducer(
    reducer,
    undefined,
    createEmptyEmailComposerStore,
  );
  const storeRef = useRef(store);
  storeRef.current = store;
  const sendingRef = useRef(false);
  const activeRequestIdRef = useRef<string | null>(null);
  const hostLeadIdRef = useRef(hostLeadId);
  hostLeadIdRef.current = hostLeadId;
  const onSentRef = useRef(onSent);
  onSentRef.current = onSent;

  useEffect(() => {
    dispatch({ type: "hostLead", hostLeadId });
  }, [hostLeadId]);

  useEffect(() => {
    if (store.statusTone !== "success") return;
    const timer = window.setTimeout(() => {
      dispatch({
        type: "replace",
        store: clearEmailComposerSuccessAndClose(storeRef.current),
      });
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [store.statusTone]);

  const openComposer = useCallback((input: EmailComposerOpenInput) => {
    dispatch({
      type: "replace",
      store: openEmailComposer(storeRef.current, input),
    });
  }, []);

  const minimize = useCallback(() => {
    dispatch({
      type: "replace",
      store: minimizeEmailComposer(storeRef.current),
    });
  }, []);

  const restore = useCallback(() => {
    dispatch({
      type: "replace",
      store: restoreEmailComposer(storeRef.current),
    });
  }, []);

  const toggleMaximize = useCallback(() => {
    dispatch({
      type: "replace",
      store: maximizeEmailComposer(storeRef.current),
    });
  }, []);

  const requestClose = useCallback(() => {
    dispatch({
      type: "replace",
      store: requestCloseEmailComposer(storeRef.current),
    });
  }, []);

  const confirmDiscard = useCallback(() => {
    dispatch({
      type: "replace",
      store: confirmDiscardEmailComposer(storeRef.current),
    });
  }, []);

  const cancelDiscard = useCallback(() => {
    dispatch({
      type: "replace",
      store: cancelDiscardEmailComposer(storeRef.current),
    });
  }, []);

  const setSubject = useCallback((value: string) => {
    dispatch({
      type: "replace",
      store: patchActiveEmailComposerDraft(storeRef.current, {
        subject: value,
      }),
    });
  }, []);

  const setBody = useCallback((value: string) => {
    dispatch({
      type: "replace",
      store: patchActiveEmailComposerDraft(storeRef.current, { body: value }),
    });
  }, []);

  const send = useCallback(async () => {
    if (sendingRef.current || emailComposerSendInProgress(storeRef.current)) {
      return;
    }
    const current = storeRef.current;
    const draft = getActiveEmailComposerDraft(current);
    if (!draft) return;
    if (
      !canSubmitEmailComposer({
        toEmail: draft.toEmail,
        consented: draft.consented,
        subject: draft.subject,
        body: draft.body,
        pending: current.pending,
        inFlight: Boolean(current.inFlight),
      })
    ) {
      dispatch({
        type: "replace",
        store: {
          ...current,
          pending: false,
          statusMessage: !draft.consented
            ? "CASL consent required before sending."
            : "Add a subject and message before sending.",
          statusTone: "error",
        },
      });
      return;
    }

    const snapshot = createEmailComposerSendSnapshot({
      draft,
      hostLeadId: hostLeadIdRef.current,
    });

    sendingRef.current = true;
    activeRequestIdRef.current = snapshot.requestId;
    dispatch({
      type: "replace",
      store: beginEmailComposerSend(current, snapshot),
    });

    try {
      const res = await fetch("/api/agent/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          mode: "single",
          leadId: snapshot.leadId,
          subject: snapshot.subject,
          body: snapshot.body,
        }),
      });
      let json: unknown = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      const outcome = interpretAgentEmailSendResponse({
        httpStatus: res.status,
        json:
          json && typeof json === "object"
            ? (json as Parameters<
                typeof interpretAgentEmailSendResponse
              >[0]["json"])
            : null,
      });

      // Ignore completion if this request is no longer the active in-flight send.
      if (storeRef.current.inFlight?.requestId !== snapshot.requestId) {
        return;
      }

      if (outcome.kind === "sent") {
        dispatch({
          type: "replace",
          store: finishEmailComposerSendSuccess(
            storeRef.current,
            snapshot.requestId,
          ),
        });
        if (
          shouldRefreshHostAfterEmailSend({
            sentLeadId: snapshot.leadId,
            hostLeadId: hostLeadIdRef.current,
          })
        ) {
          onSentRef.current?.(snapshot.leadId);
        }
        return;
      }

      dispatch({
        type: "replace",
        store: finishEmailComposerSendBlocked(
          storeRef.current,
          snapshot.requestId,
          outcome.message,
        ),
      });
    } catch {
      if (storeRef.current.inFlight?.requestId !== snapshot.requestId) {
        return;
      }
      dispatch({
        type: "replace",
        store: finishEmailComposerSendBlocked(
          storeRef.current,
          snapshot.requestId,
          "Could not reach the email service. Try again.",
        ),
      });
    } finally {
      if (activeRequestIdRef.current === snapshot.requestId) {
        sendingRef.current = false;
        activeRequestIdRef.current = null;
      }
    }
  }, []);

  const draft = getActiveEmailComposerDraft(store);
  const inFlight = emailComposerSendInProgress(store);
  const canSubmit = draft
    ? canSubmitEmailComposer({
        toEmail: draft.toEmail,
        consented: draft.consented,
        subject: draft.subject,
        body: draft.body,
        pending: store.pending,
        inFlight,
      })
    : false;

  const api = useMemo<EmailComposerApi>(
    () => ({
      windowState: store.windowState,
      draft,
      statusMessage: store.statusMessage,
      statusTone: store.statusTone,
      pending: store.pending,
      discardOpen: store.discardOpen,
      canSubmit,
      openComposer,
      minimize,
      restore,
      toggleMaximize,
      requestClose,
      confirmDiscard,
      cancelDiscard,
      setSubject,
      setBody,
      send,
    }),
    [
      store.windowState,
      store.statusMessage,
      store.statusTone,
      store.pending,
      store.discardOpen,
      draft,
      canSubmit,
      openComposer,
      minimize,
      restore,
      toggleMaximize,
      requestClose,
      confirmDiscard,
      cancelDiscard,
      setSubject,
      setBody,
      send,
    ],
  );

  return (
    <EmailComposerContext.Provider value={api}>
      {children}
    </EmailComposerContext.Provider>
  );
}

export function useEmailComposer(): EmailComposerApi {
  const ctx = useContext(EmailComposerContext);
  if (!ctx) {
    throw new Error("useEmailComposer must be used within EmailComposerProvider");
  }
  return ctx;
}

/** Optional hook for surfaces that may render outside the provider. */
export function useEmailComposerOptional(): EmailComposerApi | null {
  return useContext(EmailComposerContext);
}

// Keep closeEmailComposer referenced for tests / future hard-close paths.
void closeEmailComposer;
