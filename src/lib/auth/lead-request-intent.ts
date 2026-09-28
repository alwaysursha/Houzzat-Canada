import {
  requireAuthForIntent,
  type CaptureIntent,
  type CaptureIntentStore,
} from "@/lib/auth/capture-intent";
import { registerCaptureIntentHandler } from "@/lib/auth/capture-intent-dispatch";

type OpenAuth = (options: {
  mode?: "sign-in" | "sign-up";
  callbackUrl: string;
}) => void;

export const LEAD_REQUEST_RESTORE_KEY = "houzzat:lead-request-restore";
export const LEAD_REQUEST_RESTORE_EVENT = "houzzat:lead-request-restore";

export type LeadRequestKind = "inquiry" | "showing" | "virtual_viewing";

/**
 * One-time handoff after auth. Name, email, and phone never belong here.
 * Consent is omitted so the customer confirms it again at submit.
 */
export type LeadRequestRestore = {
  mlsNumber: string;
  kind: LeadRequestKind;
  message: string | null;
  focusNotes: string | null;
  callbackPath: string;
  restoredAt: number;
};

export type LeadRequestFormSeed = {
  kind: LeadRequestKind;
  message: string | null;
  focusNotes: string | null;
  consentChecked: false;
};

export function openGuestLeadRequestIntent(input: {
  type: "REQUEST_VIEWING" | "CONTACT_AGENT";
  mlsNumber: string;
  kind: LeadRequestKind;
  callbackPath: string;
  message?: string | null;
  focusNotes?: string | null;
  host: string;
  now: number;
  store: CaptureIntentStore;
  openAuth: OpenAuth;
  mode?: "sign-in" | "sign-up";
}):
  | { ok: true; intent: CaptureIntent }
  | { ok: false; reason: "invalid" } {
  if (input.type === "CONTACT_AGENT") {
    if (input.kind !== "inquiry") return { ok: false, reason: "invalid" };
    return requireAuthForIntent({
      draft: {
        type: "CONTACT_AGENT",
        callbackPath: input.callbackPath,
        mlsNumber: input.mlsNumber,
        message: input.message,
      },
      host: input.host,
      now: input.now,
      store: input.store,
      openAuth: input.openAuth,
      mode: input.mode ?? "sign-in",
    });
  }
  if (input.kind !== "showing" && input.kind !== "virtual_viewing") {
    return { ok: false, reason: "invalid" };
  }
  return requireAuthForIntent({
    draft: {
      type: "REQUEST_VIEWING",
      callbackPath: input.callbackPath,
      mlsNumber: input.mlsNumber,
      kind: input.kind,
      message: input.message,
      focusNotes: input.kind === "virtual_viewing" ? input.focusNotes : null,
    },
    host: input.host,
    now: input.now,
    store: input.store,
    openAuth: input.openAuth,
    mode: input.mode ?? "sign-in",
  });
}

export function leadRequestRestoreFromIntent(
  intent: CaptureIntent,
  restoredAt: number,
): LeadRequestRestore | null {
  if (intent.type === "REQUEST_VIEWING") {
    return {
      mlsNumber: intent.mlsNumber,
      kind: intent.kind,
      message: intent.message,
      focusNotes: intent.kind === "virtual_viewing" ? intent.focusNotes : null,
      callbackPath: intent.callbackPath,
      restoredAt,
    };
  }
  if (intent.type === "CONTACT_AGENT") {
    return {
      mlsNumber: intent.mlsNumber,
      kind: "inquiry",
      message: intent.message,
      focusNotes: null,
      callbackPath: intent.callbackPath,
      restoredAt,
    };
  }
  return null;
}

/** Form fields the restored UI may apply. Identity and consent stay out. */
export function leadRequestFormSeed(
  restore: LeadRequestRestore,
): LeadRequestFormSeed {
  return {
    kind: restore.kind,
    message: restore.message,
    focusNotes: restore.kind === "virtual_viewing" ? restore.focusNotes : null,
    consentChecked: false,
  };
}

function callbackPathname(callbackPath: string): string {
  return callbackPath.split("?")[0] ?? "";
}

/**
 * Prepare the existing form. Does not POST /api/leads.
 * A missing listing page clears the handoff instead of leaving it to replay.
 */
export function resumeLeadRequestIntent(
  intent: CaptureIntent,
  deps: {
    pathname: string;
    now: number;
    writeRestore: (value: LeadRequestRestore) => void;
    clearRestore: () => void;
  },
): "restored" | "unavailable" | "ignored" {
  const restore = leadRequestRestoreFromIntent(intent, deps.now);
  if (!restore) return "ignored";
  if (deps.pathname !== callbackPathname(restore.callbackPath)) {
    deps.clearRestore();
    return "unavailable";
  }
  deps.writeRestore(restore);
  return "restored";
}

let retains = 0;
let stopViewing: (() => void) | null = null;
let stopContact: (() => void) | null = null;

function applyBrowserRestore(intent: CaptureIntent): void {
  if (typeof window === "undefined") return;
  resumeLeadRequestIntent(intent, {
    pathname: window.location.pathname,
    now: Date.now(),
    writeRestore: (value) => {
      sessionStorage.setItem(LEAD_REQUEST_RESTORE_KEY, JSON.stringify(value));
      window.dispatchEvent(new Event(LEAD_REQUEST_RESTORE_EVENT));
    },
    clearRestore: () => {
      sessionStorage.removeItem(LEAD_REQUEST_RESTORE_KEY);
    },
  });
}

function readBrowserRestore(): LeadRequestRestore | null {
  try {
    const raw = sessionStorage.getItem(LEAD_REQUEST_RESTORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LeadRequestRestore>;
    if (!parsed || typeof parsed.mlsNumber !== "string") return null;
    if (
      parsed.kind !== "inquiry" &&
      parsed.kind !== "showing" &&
      parsed.kind !== "virtual_viewing"
    ) {
      return null;
    }
    return {
      mlsNumber: parsed.mlsNumber,
      kind: parsed.kind,
      message: typeof parsed.message === "string" ? parsed.message : null,
      focusNotes:
        typeof parsed.focusNotes === "string" ? parsed.focusNotes : null,
      callbackPath:
        typeof parsed.callbackPath === "string" ? parsed.callbackPath : "",
      restoredAt:
        typeof parsed.restoredAt === "number" ? parsed.restoredAt : Date.now(),
    };
  } catch {
    return null;
  }
}

/** Read the handoff without clearing it. A hidden surface must not consume it. */
export function peekLeadRequestRestore(): LeadRequestRestore | null {
  if (typeof window === "undefined") return null;
  return readBrowserRestore();
}

export function takeLeadRequestRestore(
  mlsNumber: string,
): LeadRequestRestore | null {
  if (typeof window === "undefined") return null;
  const restore = readBrowserRestore();
  if (!restore) return null;
  if (restore.mlsNumber.trim().toUpperCase() !== mlsNumber.trim().toUpperCase()) {
    return null;
  }
  sessionStorage.removeItem(LEAD_REQUEST_RESTORE_KEY);
  return restore;
}

/**
 * Registered by the listing form surfaces. Claims the intent once, then
 * writes a restore the visible form reads. Never submits the request.
 */
export function retainLeadRequestIntentHandler(): () => void {
  retains += 1;
  if (retains === 1) {
    stopViewing = registerCaptureIntentHandler(
      "REQUEST_VIEWING",
      applyBrowserRestore,
    );
    stopContact = registerCaptureIntentHandler(
      "CONTACT_AGENT",
      applyBrowserRestore,
    );
  }
  return () => {
    retains -= 1;
    if (retains > 0) return;
    stopViewing?.();
    stopContact?.();
    stopViewing = null;
    stopContact = null;
  };
}
