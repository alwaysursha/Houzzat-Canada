import { isEmailComposerDraftDirty } from "@/lib/agent/email-composer/send-result";
import type {
  EmailComposerDraft,
  EmailComposerOpenInput,
  EmailComposerSendSnapshot,
  EmailComposerWindowState,
} from "@/lib/agent/email-composer/types";

export type EmailComposerStore = {
  windowState: EmailComposerWindowState;
  /** Lead id whose draft is shown in the shell (null when closed). */
  activeLeadId: string | null;
  draftsByLeadId: Record<string, EmailComposerDraft>;
  /** In-flight send snapshot; survives host lead navigation. */
  inFlight: EmailComposerSendSnapshot | null;
  statusMessage: string | null;
  statusTone: "success" | "error" | "info" | null;
  pending: boolean;
  discardOpen: boolean;
};

let emailComposerIdSeq = 0;

export function createEmailComposerId(prefix: string): string {
  emailComposerIdSeq += 1;
  const rand =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${emailComposerIdSeq}`;
  return `${prefix}_${rand}`;
}

export function createEmptyEmailComposerStore(): EmailComposerStore {
  return {
    windowState: "closed",
    activeLeadId: null,
    draftsByLeadId: {},
    inFlight: null,
    statusMessage: null,
    statusTone: null,
    pending: false,
    discardOpen: false,
  };
}

function emptyDraft(input: {
  leadId: string;
  toEmail: string;
  consented: boolean;
  recipientName: string | null;
}): EmailComposerDraft {
  return {
    leadId: input.leadId,
    compositionId: createEmailComposerId("comp"),
    toEmail: input.toEmail,
    consented: input.consented,
    recipientName: input.recipientName,
    subject: "",
    body: "",
  };
}

export function getActiveEmailComposerDraft(
  store: EmailComposerStore,
): EmailComposerDraft | null {
  if (!store.activeLeadId) return null;
  return store.draftsByLeadId[store.activeLeadId] ?? null;
}

export function emailComposerHasUnsentChanges(
  store: EmailComposerStore,
): boolean {
  const draft = getActiveEmailComposerDraft(store);
  if (!draft) return false;
  return isEmailComposerDraftDirty(draft);
}

export function emailComposerSendInProgress(
  store: EmailComposerStore,
): boolean {
  return store.inFlight !== null;
}

export function createEmailComposerSendSnapshot(input: {
  draft: EmailComposerDraft;
  hostLeadId: string;
}): EmailComposerSendSnapshot {
  return {
    requestId: createEmailComposerId("req"),
    leadId: input.draft.leadId,
    compositionId: input.draft.compositionId,
    hostLeadId: input.hostLeadId,
    subject: input.draft.subject.trim(),
    body: input.draft.body.trim(),
  };
}

export function shouldRefreshHostAfterEmailSend(input: {
  sentLeadId: string;
  hostLeadId: string;
}): boolean {
  return input.sentLeadId === input.hostLeadId;
}

/**
 * Open (or focus) the composer for a lead. Binds recipient from the open call.
 * Preserves in-memory subject/body for that leadId when reopening.
 */
export function openEmailComposer(
  store: EmailComposerStore,
  input: EmailComposerOpenInput,
): EmailComposerStore {
  const toEmail = input.toEmail?.trim() || "";
  if (!input.leadId.trim() || !toEmail) {
    return {
      ...store,
      statusMessage: "This lead has no email address.",
      statusTone: "error",
    };
  }

  const existing = store.draftsByLeadId[input.leadId];
  const draft: EmailComposerDraft = existing
    ? {
        ...existing,
        toEmail,
        consented: input.consented,
        recipientName: input.recipientName?.trim() || existing.recipientName,
      }
    : emptyDraft({
        leadId: input.leadId,
        toEmail,
        consented: input.consented,
        recipientName: input.recipientName?.trim() || null,
      });

  const sendingThisLead = store.inFlight?.leadId === input.leadId;

  return {
    ...store,
    windowState: store.windowState === "minimized" ? "open" : "open",
    activeLeadId: input.leadId,
    draftsByLeadId: {
      ...store.draftsByLeadId,
      [input.leadId]: draft,
    },
    statusMessage: sendingThisLead
      ? null
      : input.consented
        ? null
        : "CASL consent required before sending.",
    statusTone: sendingThisLead
      ? null
      : input.consented
        ? null
        : "info",
    pending: sendingThisLead,
    discardOpen: false,
  };
}

export function minimizeEmailComposer(
  store: EmailComposerStore,
): EmailComposerStore {
  if (store.windowState === "closed" || !store.activeLeadId) return store;
  return { ...store, windowState: "minimized", discardOpen: false };
}

export function restoreEmailComposer(
  store: EmailComposerStore,
): EmailComposerStore {
  if (store.windowState !== "minimized" || !store.activeLeadId) return store;
  return { ...store, windowState: "open" };
}

export function maximizeEmailComposer(
  store: EmailComposerStore,
): EmailComposerStore {
  if (store.windowState === "closed" || !store.activeLeadId) return store;
  return {
    ...store,
    windowState: store.windowState === "maximized" ? "open" : "maximized",
    discardOpen: false,
  };
}

export function requestCloseEmailComposer(
  store: EmailComposerStore,
): EmailComposerStore {
  if (store.windowState === "closed") return store;
  if (store.inFlight && store.activeLeadId === store.inFlight.leadId) {
    return store;
  }
  if (emailComposerHasUnsentChanges(store)) {
    return { ...store, discardOpen: true };
  }
  return closeEmailComposer(store);
}

export function confirmDiscardEmailComposer(
  store: EmailComposerStore,
): EmailComposerStore {
  const leadId = store.activeLeadId;
  if (!leadId) {
    return { ...store, discardOpen: false, windowState: "closed" };
  }
  // Never discard the composition that is currently sending.
  if (store.inFlight?.leadId === leadId) {
    return { ...store, discardOpen: false };
  }
  const nextDrafts = { ...store.draftsByLeadId };
  delete nextDrafts[leadId];
  return {
    ...store,
    windowState: "closed",
    activeLeadId: null,
    draftsByLeadId: nextDrafts,
    statusMessage: null,
    statusTone: null,
    pending: false,
    discardOpen: false,
  };
}

export function cancelDiscardEmailComposer(
  store: EmailComposerStore,
): EmailComposerStore {
  return { ...store, discardOpen: false };
}

export function closeEmailComposer(
  store: EmailComposerStore,
): EmailComposerStore {
  return {
    ...store,
    windowState: "closed",
    activeLeadId: null,
    statusMessage: null,
    statusTone: null,
    pending: false,
    discardOpen: false,
    // inFlight preserved — network completion still owns the send snapshot.
  };
}

/**
 * Host navigated to another lead — hide composer; keep drafts and in-flight send.
 */
export function onEmailComposerHostLeadChange(
  store: EmailComposerStore,
  hostLeadId: string,
): EmailComposerStore {
  if (!store.activeLeadId || store.activeLeadId === hostLeadId) {
    return store;
  }
  if (store.windowState === "closed") {
    return { ...store, activeLeadId: null, discardOpen: false };
  }
  return {
    ...store,
    windowState: "closed",
    activeLeadId: null,
    statusMessage: null,
    statusTone: null,
    pending: false,
    discardOpen: false,
    // draftsByLeadId + inFlight intentionally retained
  };
}

export function patchActiveEmailComposerDraft(
  store: EmailComposerStore,
  patch: Partial<Pick<EmailComposerDraft, "subject" | "body">>,
): EmailComposerStore {
  const leadId = store.activeLeadId;
  if (!leadId) return store;
  if (store.inFlight?.leadId === leadId) return store;
  const current = store.draftsByLeadId[leadId];
  if (!current) return store;
  return {
    ...store,
    draftsByLeadId: {
      ...store.draftsByLeadId,
      [leadId]: { ...current, ...patch },
    },
    statusMessage:
      store.statusTone === "success" ? null : store.statusMessage,
    statusTone: store.statusTone === "success" ? null : store.statusTone,
  };
}

export function beginEmailComposerSend(
  store: EmailComposerStore,
  snapshot: EmailComposerSendSnapshot,
): EmailComposerStore {
  if (store.inFlight) return store;
  return {
    ...store,
    inFlight: snapshot,
    pending: true,
    statusMessage: null,
    statusTone: null,
    discardOpen: false,
  };
}

function completionAppliesToVisibleUi(
  store: EmailComposerStore,
  leadId: string,
): boolean {
  return (
    store.activeLeadId === leadId &&
    store.windowState !== "closed" &&
    store.inFlight?.leadId === leadId
  );
}

/**
 * Apply send completion for a specific requestId.
 * Stale completions (wrong request) are ignored entirely.
 * Success always clears that lead's draft; UI status only updates when that
 * composition is still the visible active one.
 */
export function applyEmailComposerSendCompletion(
  store: EmailComposerStore,
  input: {
    requestId: string;
    outcome: "success" | "blocked";
    message?: string;
  },
): EmailComposerStore {
  const flight = store.inFlight;
  if (!flight || flight.requestId !== input.requestId) {
    return store;
  }

  const leadId = flight.leadId;
  const visible = completionAppliesToVisibleUi(store, leadId);

  if (input.outcome === "success") {
    const nextDrafts = { ...store.draftsByLeadId };
    delete nextDrafts[leadId];
    if (!visible) {
      return {
        ...store,
        inFlight: null,
        draftsByLeadId: nextDrafts,
        pending: false,
      };
    }
    return {
      ...store,
      inFlight: null,
      draftsByLeadId: nextDrafts,
      pending: false,
      statusMessage: "Email sent and logged.",
      statusTone: "success",
      windowState: store.windowState === "minimized" ? "open" : store.windowState,
      discardOpen: false,
    };
  }

  // blocked / error — keep draft for retry; only surface error on the same UI.
  if (!visible) {
    return {
      ...store,
      inFlight: null,
      pending: false,
    };
  }
  return {
    ...store,
    inFlight: null,
    pending: false,
    statusMessage: input.message?.trim() || "Send failed.",
    statusTone: "error",
  };
}

export function finishEmailComposerSendSuccess(
  store: EmailComposerStore,
  requestId: string,
): EmailComposerStore {
  return applyEmailComposerSendCompletion(store, {
    requestId,
    outcome: "success",
  });
}

export function finishEmailComposerSendBlocked(
  store: EmailComposerStore,
  requestId: string,
  message: string,
): EmailComposerStore {
  return applyEmailComposerSendCompletion(store, {
    requestId,
    outcome: "blocked",
    message,
  });
}

export function clearEmailComposerSuccessAndClose(
  store: EmailComposerStore,
): EmailComposerStore {
  if (store.statusTone !== "success") return store;
  return closeEmailComposer(store);
}
