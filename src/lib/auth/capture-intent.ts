import {
  authSuccessReturnPath,
  safeInternalCallbackUrl,
} from "@/lib/auth/safe-callback-url";

/**
 * Pending visitor action, kept beside callbackUrl.
 * callbackUrl says where to return. This says what to resume.
 * Browser storage only — no database row.
 */
export const CAPTURE_INTENT_STORAGE_KEY = "houzzat:capture-intent";

/** Short enough that a leftover action cannot fire on a later visit. */
export const CAPTURE_INTENT_TTL_MS = 15 * 60 * 1000;

const CLOCK_SKEW_MS = 60 * 1000;
const RECORD_VERSION = 1;

export const CAPTURE_INTENT_TYPES = [
  "VIEW_LISTING",
  "SAVE_LISTING",
  "SAVE_SEARCH",
  "PROPERTY_WATCH",
  "AREA_WATCH",
  "REQUEST_VIEWING",
  "CONTACT_AGENT",
  "START_CHAT",
  "ROUTE_PLANNER",
] as const;

export type CaptureIntentType = (typeof CAPTURE_INTENT_TYPES)[number];

const MLS_ONLY_INTENT_TYPES = [
  "VIEW_LISTING",
  "SAVE_LISTING",
  "PROPERTY_WATCH",
] as const;

type MlsOnlyIntentType = (typeof MLS_ONLY_INTENT_TYPES)[number];

export const VIEWING_CAPTURE_KINDS = ["showing", "virtual_viewing"] as const;

export type ViewingCaptureKind = (typeof VIEWING_CAPTURE_KINDS)[number];

const MESSAGE_MAX = 2000;
const FOCUS_NOTES_MAX = 1000;

export const AREA_WATCH_TRANSACTIONS = ["SALE", "LEASE", "ALL"] as const;

export type AreaWatchTransaction = (typeof AREA_WATCH_TRANSACTIONS)[number];

export const AREA_WATCH_SEGMENTS = ["RESIDENTIAL", "COMMERCIAL"] as const;

export type AreaWatchSegment = (typeof AREA_WATCH_SEGMENTS)[number];

type CaptureIntentBase = {
  callbackPath: string;
  createdAt: number;
  host: string;
};

export type CaptureIntent =
  | (CaptureIntentBase & {
      type: MlsOnlyIntentType;
      mlsNumber: string;
    })
  | (CaptureIntentBase & {
      type: "REQUEST_VIEWING";
      mlsNumber: string;
      kind: ViewingCaptureKind;
      message: string | null;
      focusNotes: string | null;
    })
  | (CaptureIntentBase & {
      type: "CONTACT_AGENT";
      mlsNumber: string;
      message: string | null;
    })
  | (CaptureIntentBase & {
      type: "SAVE_SEARCH";
    })
  | (CaptureIntentBase & {
      type: "AREA_WATCH";
      city: string;
      community: string | null;
      transactionType: AreaWatchTransaction;
      segment: AreaWatchSegment;
    })
  | (CaptureIntentBase & {
      type: "START_CHAT";
    })
  | (CaptureIntentBase & {
      type: "ROUTE_PLANNER";
      mlsNumber: string | null;
    });

export type CaptureIntentDraft =
  | {
      type: MlsOnlyIntentType;
      callbackPath: string;
      mlsNumber: string;
    }
  | {
      type: "REQUEST_VIEWING";
      callbackPath: string;
      mlsNumber: string;
      kind: ViewingCaptureKind;
      message?: string | null;
      focusNotes?: string | null;
    }
  | {
      type: "CONTACT_AGENT";
      callbackPath: string;
      mlsNumber: string;
      message?: string | null;
    }
  | {
      type: "SAVE_SEARCH";
      callbackPath: string;
    }
  | {
      type: "AREA_WATCH";
      callbackPath: string;
      city: string;
      community?: string | null;
      transactionType: AreaWatchTransaction;
      segment: AreaWatchSegment;
    }
  | {
      type: "START_CHAT";
      callbackPath: string;
    }
  | {
      type: "ROUTE_PLANNER";
      callbackPath: string;
      mlsNumber?: string | null;
    };

export type CaptureIntentRejectReason =
  | "none"
  | "invalid"
  | "expired"
  | "host_mismatch";

export type CaptureIntentStore = {
  get(): string | null;
  set(value: string): void;
  remove(): void;
};

export type CaptureIntentContext = {
  host: string;
  now: number;
};

type CaptureIntentResult<T> =
  | { ok: true; intent: T }
  | { ok: false; reason: Exclude<CaptureIntentRejectReason, "none"> };

const MLS_ONLY_TYPE_SET = new Set<string>(MLS_ONLY_INTENT_TYPES);

function isCaptureIntentType(value: string): value is CaptureIntentType {
  return (CAPTURE_INTENT_TYPES as readonly string[]).includes(value);
}

export function normalizeCaptureIntentHost(raw: string): string | null {
  const host = raw.trim().toLowerCase().replace(/\.$/, "");
  if (!host || host.length > 253) return null;
  if (host.includes("/") || host.includes(":") || host.includes("\\")) {
    return null;
  }
  if (/\s/.test(host)) return null;
  return host;
}

function strictCallbackPath(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const safe = safeInternalCallbackUrl(trimmed, "");
  if (!safe || safe !== trimmed) return null;
  return authSuccessReturnPath(safe);
}

function normalizeMls(raw: string): string | null {
  const mls = raw.trim().toUpperCase();
  if (!/^[A-Z0-9]{3,32}$/.test(mls)) return null;
  return mls;
}

function normalizePlace(raw: string): string | null {
  const place = raw.trim().replace(/\s+/g, " ");
  if (!place || place.length > 80) return null;
  if (/[\u0000-\u001f\u007f]/.test(place)) return null;
  return place;
}

/** Empty becomes null. undefined means the text is not safe to keep. */
function normalizeOptionalText(
  raw: string | null | undefined,
  max: number,
): string | null | undefined {
  if (raw == null) return null;
  const text = raw.trim();
  if (!text) return null;
  if (text.length > max) return undefined;
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) return undefined;
  return text;
}

function hasOnlyKeys(value: object, allowed: readonly string[]): boolean {
  const keys = new Set(allowed);
  return Object.keys(value).every((key) => keys.has(key));
}

function rejectInvalid(): CaptureIntentResult<CaptureIntent> {
  return { ok: false, reason: "invalid" };
}

function buildIntent(
  draft: CaptureIntentDraft,
  stamped: { host: string; createdAt: number },
): CaptureIntentResult<CaptureIntent> {
  const callbackPath = strictCallbackPath(draft.callbackPath);
  if (!callbackPath) return rejectInvalid();
  const base = {
    callbackPath,
    createdAt: stamped.createdAt,
    host: stamped.host,
  };

  switch (draft.type) {
    case "VIEW_LISTING":
    case "SAVE_LISTING":
    case "PROPERTY_WATCH": {
      const mlsNumber = normalizeMls(draft.mlsNumber);
      if (!mlsNumber) return rejectInvalid();
      return { ok: true, intent: { ...base, type: draft.type, mlsNumber } };
    }
    case "REQUEST_VIEWING": {
      const mlsNumber = normalizeMls(draft.mlsNumber);
      if (!mlsNumber) return rejectInvalid();
      if (draft.kind !== "showing" && draft.kind !== "virtual_viewing") {
        return rejectInvalid();
      }
      const message = normalizeOptionalText(draft.message, MESSAGE_MAX);
      if (message === undefined) return rejectInvalid();
      const focusNotes =
        draft.kind === "virtual_viewing"
          ? normalizeOptionalText(draft.focusNotes, FOCUS_NOTES_MAX)
          : null;
      if (focusNotes === undefined) return rejectInvalid();
      if (draft.kind !== "virtual_viewing" && draft.focusNotes) {
        return rejectInvalid();
      }
      return {
        ok: true,
        intent: {
          ...base,
          type: "REQUEST_VIEWING",
          mlsNumber,
          kind: draft.kind,
          message,
          focusNotes,
        },
      };
    }
    case "CONTACT_AGENT": {
      const mlsNumber = normalizeMls(draft.mlsNumber);
      if (!mlsNumber) return rejectInvalid();
      const message = normalizeOptionalText(draft.message, MESSAGE_MAX);
      if (message === undefined) return rejectInvalid();
      return {
        ok: true,
        intent: {
          ...base,
          type: "CONTACT_AGENT",
          mlsNumber,
          message,
        },
      };
    }
    case "SAVE_SEARCH": {
      const pathOnly = callbackPath.split("?")[0] ?? "";
      if (pathOnly !== "/search") return rejectInvalid();
      return { ok: true, intent: { ...base, type: "SAVE_SEARCH" } };
    }
    case "AREA_WATCH": {
      const city = normalizePlace(draft.city);
      if (!city) return rejectInvalid();
      const community =
        draft.community == null || draft.community === ""
          ? null
          : normalizePlace(draft.community);
      if (draft.community != null && draft.community !== "" && !community) {
        return rejectInvalid();
      }
      if (
        draft.transactionType !== "SALE" &&
        draft.transactionType !== "LEASE" &&
        draft.transactionType !== "ALL"
      ) {
        return rejectInvalid();
      }
      if (
        draft.segment !== "RESIDENTIAL" &&
        draft.segment !== "COMMERCIAL"
      ) {
        return rejectInvalid();
      }
      return {
        ok: true,
        intent: {
          ...base,
          type: "AREA_WATCH",
          city,
          community,
          transactionType: draft.transactionType,
          segment: draft.segment,
        },
      };
    }
    case "START_CHAT":
      return { ok: true, intent: { ...base, type: "START_CHAT" } };
    case "ROUTE_PLANNER": {
      if (draft.mlsNumber == null || draft.mlsNumber === "") {
        return {
          ok: true,
          intent: { ...base, type: "ROUTE_PLANNER", mlsNumber: null },
        };
      }
      const mlsNumber = normalizeMls(draft.mlsNumber);
      if (!mlsNumber) return rejectInvalid();
      return {
        ok: true,
        intent: { ...base, type: "ROUTE_PLANNER", mlsNumber },
      };
    }
    default: {
      const _exhaustive: never = draft;
      void _exhaustive;
      return rejectInvalid();
    }
  }
}

function allowedKeys(type: CaptureIntentType): readonly string[] {
  const base = ["type", "callbackPath", "createdAt", "host"] as const;
  switch (type) {
    case "VIEW_LISTING":
    case "SAVE_LISTING":
    case "PROPERTY_WATCH":
      return [...base, "mlsNumber"];
    case "REQUEST_VIEWING":
      return [...base, "mlsNumber", "kind", "message", "focusNotes"];
    case "CONTACT_AGENT":
      return [...base, "mlsNumber", "message"];
    case "SAVE_SEARCH":
    case "START_CHAT":
      return base;
    case "AREA_WATCH":
      return [...base, "city", "community", "transactionType", "segment"];
    case "ROUTE_PLANNER":
      return [...base, "mlsNumber"];
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

function parseIntentObject(
  value: unknown,
  ctx: CaptureIntentContext,
): CaptureIntentResult<CaptureIntent> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return rejectInvalid();
  }
  const record = value as Record<string, unknown>;
  if (typeof record.type !== "string" || !isCaptureIntentType(record.type)) {
    return rejectInvalid();
  }
  if (!hasOnlyKeys(record, allowedKeys(record.type))) return rejectInvalid();
  if (typeof record.callbackPath !== "string") return rejectInvalid();
  if (typeof record.createdAt !== "number" || !Number.isFinite(record.createdAt)) {
    return rejectInvalid();
  }
  if (typeof record.host !== "string") return rejectInvalid();

  const host = normalizeCaptureIntentHost(ctx.host);
  const storedHost = normalizeCaptureIntentHost(record.host);
  if (!host || !storedHost) return rejectInvalid();
  if (storedHost !== host) return { ok: false, reason: "host_mismatch" };

  if (record.createdAt > ctx.now + CLOCK_SKEW_MS) return rejectInvalid();
  if (ctx.now - record.createdAt > CAPTURE_INTENT_TTL_MS) {
    return { ok: false, reason: "expired" };
  }

  if (MLS_ONLY_TYPE_SET.has(record.type)) {
    if (typeof record.mlsNumber !== "string") return rejectInvalid();
    return buildIntent(
      {
        type: record.type as MlsOnlyIntentType,
        callbackPath: record.callbackPath,
        mlsNumber: record.mlsNumber,
      },
      { host: storedHost, createdAt: record.createdAt },
    );
  }

  switch (record.type) {
    case "SAVE_SEARCH":
      return buildIntent(
        { type: "SAVE_SEARCH", callbackPath: record.callbackPath },
        { host: storedHost, createdAt: record.createdAt },
      );
    case "AREA_WATCH": {
      if (typeof record.city !== "string") return rejectInvalid();
      if (
        record.community != null &&
        typeof record.community !== "string"
      ) {
        return rejectInvalid();
      }
      if (
        record.transactionType !== "SALE" &&
        record.transactionType !== "LEASE" &&
        record.transactionType !== "ALL"
      ) {
        return rejectInvalid();
      }
      if (
        record.segment !== "RESIDENTIAL" &&
        record.segment !== "COMMERCIAL"
      ) {
        return rejectInvalid();
      }
      return buildIntent(
        {
          type: "AREA_WATCH",
          callbackPath: record.callbackPath,
          city: record.city,
          community: record.community ?? null,
          transactionType: record.transactionType,
          segment: record.segment,
        },
        { host: storedHost, createdAt: record.createdAt },
      );
    }
    case "START_CHAT":
      return buildIntent(
        { type: "START_CHAT", callbackPath: record.callbackPath },
        { host: storedHost, createdAt: record.createdAt },
      );
    case "ROUTE_PLANNER": {
      if (record.mlsNumber != null && typeof record.mlsNumber !== "string") {
        return rejectInvalid();
      }
      return buildIntent(
        {
          type: "ROUTE_PLANNER",
          callbackPath: record.callbackPath,
          mlsNumber:
            typeof record.mlsNumber === "string" ? record.mlsNumber : null,
        },
        { host: storedHost, createdAt: record.createdAt },
      );
    }
    case "REQUEST_VIEWING": {
      if (typeof record.mlsNumber !== "string") return rejectInvalid();
      if (record.kind !== "showing" && record.kind !== "virtual_viewing") {
        return rejectInvalid();
      }
      if (record.message != null && typeof record.message !== "string") {
        return rejectInvalid();
      }
      if (record.focusNotes != null && typeof record.focusNotes !== "string") {
        return rejectInvalid();
      }
      return buildIntent(
        {
          type: "REQUEST_VIEWING",
          callbackPath: record.callbackPath,
          mlsNumber: record.mlsNumber,
          kind: record.kind,
          message: typeof record.message === "string" ? record.message : null,
          focusNotes:
            typeof record.focusNotes === "string" ? record.focusNotes : null,
        },
        { host: storedHost, createdAt: record.createdAt },
      );
    }
    case "CONTACT_AGENT": {
      if (typeof record.mlsNumber !== "string") return rejectInvalid();
      if (record.message != null && typeof record.message !== "string") {
        return rejectInvalid();
      }
      return buildIntent(
        {
          type: "CONTACT_AGENT",
          callbackPath: record.callbackPath,
          mlsNumber: record.mlsNumber,
          message: typeof record.message === "string" ? record.message : null,
        },
        { host: storedHost, createdAt: record.createdAt },
      );
    }
    case "VIEW_LISTING":
    case "SAVE_LISTING":
    case "PROPERTY_WATCH":
      return rejectInvalid();
    default: {
      const _exhaustive: never = record.type;
      void _exhaustive;
      return rejectInvalid();
    }
  }
}

export function createCaptureIntent(
  draft: CaptureIntentDraft,
  ctx: CaptureIntentContext,
): CaptureIntentResult<CaptureIntent> {
  const host = normalizeCaptureIntentHost(ctx.host);
  if (!host || !Number.isFinite(ctx.now)) return rejectInvalid();
  return buildIntent(draft, { host, createdAt: ctx.now });
}

function readRecord(
  raw: string,
  ctx: CaptureIntentContext,
): CaptureIntentResult<CaptureIntent> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return rejectInvalid();
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return rejectInvalid();
  }
  const record = parsed as Record<string, unknown>;
  if (!hasOnlyKeys(record, ["v", "intent"])) return rejectInvalid();
  if (record.v !== RECORD_VERSION) return rejectInvalid();
  return parseIntentObject(record.intent, ctx);
}

export function saveCaptureIntent(
  store: CaptureIntentStore,
  intent: CaptureIntent,
): void {
  const record = { v: RECORD_VERSION, intent };
  store.set(JSON.stringify(record));
}

/**
 * Authenticate, then resume this action. Does not sign the visitor in.
 * Returns the callback path the existing auth modal should use.
 */
export function requireAuthForIntent(input: {
  draft: CaptureIntentDraft;
  host: string;
  now: number;
  store: CaptureIntentStore;
  openAuth: (options: {
    mode?: "sign-in" | "sign-up";
    callbackUrl: string;
    /** Presentation only. Not stored and not sent to an auth API. */
    intent?: CaptureIntentType;
    /**
     * Signup form convenience only. Not stored and not sent to an auth API.
     */
    signupPrefill?: { name: string; email: string } | null;
  }) => void;
  mode?: "sign-in" | "sign-up";
  /** Signup form convenience only. Never written into the capture intent. */
  signupPrefill?: { name: string; email: string } | null;
}):
  | { ok: true; intent: CaptureIntent }
  | { ok: false; reason: "invalid" } {
  const created = createCaptureIntent(input.draft, {
    host: input.host,
    now: input.now,
  });
  if (!created.ok) return { ok: false, reason: "invalid" };
  saveCaptureIntent(input.store, created.intent);
  input.openAuth({
    mode: input.mode ?? "sign-in",
    callbackUrl: created.intent.callbackPath,
    intent: created.intent.type,
    ...(input.signupPrefill ? { signupPrefill: input.signupPrefill } : {}),
  });
  return { ok: true, intent: created.intent };
}

/**
 * Read a pending intent without removing it.
 * Invalid, expired, and cross-host records stay in storage until the caller
 * decides to clear them.
 */
export function peekPendingIntent(
  store: CaptureIntentStore,
  ctx: CaptureIntentContext,
):
  | { ok: true; intent: CaptureIntent }
  | { ok: false; reason: CaptureIntentRejectReason } {
  const raw = store.get();
  if (raw == null || raw.trim() === "") {
    return { ok: false, reason: "none" };
  }
  return readRecord(raw, ctx);
}

/**
 * Take the pending intent once. Clears the store even when the record is
 * invalid, expired, or for another hostname.
 */
export function consumePendingIntent(
  store: CaptureIntentStore,
  ctx: CaptureIntentContext,
):
  | { ok: true; intent: CaptureIntent }
  | { ok: false; reason: CaptureIntentRejectReason } {
  const raw = store.get();
  if (raw == null || raw.trim() === "") {
    return { ok: false, reason: "none" };
  }
  store.remove();
  return readRecord(raw, ctx);
}
