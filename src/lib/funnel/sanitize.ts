import {
  FUNNEL_CLIENT_EVENT_NAMES,
  FUNNEL_EVENT_NAMES,
  FUNNEL_MAX_DEDUPE_LEN,
  FUNNEL_MAX_KEY_LEN,
  FUNNEL_MAX_META_JSON_CHARS,
  FUNNEL_MAX_MLS_LEN,
  FUNNEL_META_ALLOWED_KEYS,
  FUNNEL_OCCURRED_AT_SKEW_MS,
  FUNNEL_SERVER_ONLY_EVENT_NAMES,
  type FunnelEventName,
} from "@/lib/funnel/constants";

const PII_META_BLOCKLIST = [
  "email",
  "phone",
  "name",
  "firstName",
  "lastName",
  "fullName",
  "password",
  "address",
] as const;

export type FunnelSanitizeErrorCode =
  | "UNKNOWN_EVENT"
  | "SERVER_ONLY_EVENT"
  | "MISSING_VISITOR_SESSION"
  | "INVALID_OCCURRED_AT"
  | "PAYLOAD_TOO_LARGE"
  | "CLIENT_USER_ID_FORBIDDEN"
  | "CLIENT_WORKSPACE_ID_FORBIDDEN";

export class FunnelSanitizeError extends Error {
  readonly code: FunnelSanitizeErrorCode;

  constructor(code: FunnelSanitizeErrorCode, message: string) {
    super(message);
    this.name = "FunnelSanitizeError";
    this.code = code;
  }
}

export function isFunnelEventName(value: string): value is FunnelEventName {
  return (FUNNEL_EVENT_NAMES as readonly string[]).includes(value);
}

export function isClientAllowedFunnelEvent(name: FunnelEventName): boolean {
  return (FUNNEL_CLIENT_EVENT_NAMES as readonly string[]).includes(name);
}

export function isServerOnlyFunnelEvent(name: FunnelEventName): boolean {
  return (FUNNEL_SERVER_ONLY_EVENT_NAMES as readonly string[]).includes(name);
}

export function cleanOpaqueKey(
  value: unknown,
  max = FUNNEL_MAX_KEY_LEN,
): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!t || t.length > max) return null;
  // Reject values that look like emails or phones.
  if (t.includes("@")) return null;
  if (/^\+?\d{7,}$/.test(t.replace(/[\s()-]/g, ""))) return null;
  return t;
}

export function cleanMlsNumber(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const mls = value.trim().toUpperCase();
  if (!mls || mls.length > FUNNEL_MAX_MLS_LEN) return null;
  if (!/^[A-Z0-9]{3,32}$/.test(mls)) return null;
  return mls;
}

export function cleanDedupeKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim().slice(0, FUNNEL_MAX_DEDUPE_LEN);
  if (!t) return null;
  if (t.includes("@")) return null;
  return t;
}

export function sanitizeFunnelMeta(
  raw: unknown,
): Record<string, string> | null {
  if (raw == null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new FunnelSanitizeError(
      "PAYLOAD_TOO_LARGE",
      "meta must be a plain object",
    );
  }
  const out: Record<string, string> = {};
  const allowed = new Set<string>(FUNNEL_META_ALLOWED_KEYS);
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if ((PII_META_BLOCKLIST as readonly string[]).includes(key)) continue;
    if (!allowed.has(key)) continue;
    if (typeof value !== "string") continue;
    const cleaned = value.trim().slice(0, 80);
    if (!cleaned || cleaned.includes("@")) continue;
    out[key] = cleaned;
  }
  const json = JSON.stringify(out);
  if (json.length > FUNNEL_MAX_META_JSON_CHARS) {
    throw new FunnelSanitizeError(
      "PAYLOAD_TOO_LARGE",
      "meta exceeds size limit",
    );
  }
  return Object.keys(out).length ? out : null;
}

export function clampOccurredAt(
  value: unknown,
  now = new Date(),
): Date {
  if (value == null || value === "") return now;
  const d =
    value instanceof Date
      ? value
      : typeof value === "string" || typeof value === "number"
        ? new Date(value)
        : null;
  if (!d || Number.isNaN(d.getTime())) {
    throw new FunnelSanitizeError(
      "INVALID_OCCURRED_AT",
      "occurredAt must be a valid timestamp",
    );
  }
  const skew = FUNNEL_OCCURRED_AT_SKEW_MS;
  const min = now.getTime() - skew;
  const max = now.getTime() + 5 * 60_000;
  const ms = Math.min(max, Math.max(min, d.getTime()));
  return new Date(ms);
}

export type ClientFunnelPayload = {
  eventName: FunnelEventName;
  visitorKey: string;
  sessionKey: string;
  occurredAt: Date;
  mlsNumber: string | null;
  dedupeKey: string;
  meta: Record<string, string> | null;
};

/**
 * Validate a public/client ingest body.
 * Rejects workspaceId, userId, and server-only event names.
 */
export function parseClientFunnelPayload(
  body: unknown,
  now = new Date(),
): ClientFunnelPayload {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new FunnelSanitizeError("PAYLOAD_TOO_LARGE", "Invalid JSON body");
  }
  const raw = body as Record<string, unknown>;

  if ("workspaceId" in raw && raw.workspaceId != null) {
    throw new FunnelSanitizeError(
      "CLIENT_WORKSPACE_ID_FORBIDDEN",
      "workspaceId must not be supplied by the client",
    );
  }
  if ("userId" in raw && raw.userId != null) {
    throw new FunnelSanitizeError(
      "CLIENT_USER_ID_FORBIDDEN",
      "userId must not be supplied by the client",
    );
  }

  const eventRaw = typeof raw.eventName === "string" ? raw.eventName.trim() : "";
  if (!isFunnelEventName(eventRaw)) {
    throw new FunnelSanitizeError("UNKNOWN_EVENT", "Unknown funnel event type");
  }
  if (isServerOnlyFunnelEvent(eventRaw)) {
    throw new FunnelSanitizeError(
      "SERVER_ONLY_EVENT",
      "This event type cannot be submitted by the client",
    );
  }

  const visitorKey = cleanOpaqueKey(raw.visitorKey);
  const sessionKey = cleanOpaqueKey(raw.sessionKey);
  if (!visitorKey || !sessionKey) {
    throw new FunnelSanitizeError(
      "MISSING_VISITOR_SESSION",
      "visitorKey and sessionKey are required",
    );
  }

  const mlsNumber = cleanMlsNumber(raw.mlsNumber);
  const occurredAt = clampOccurredAt(raw.occurredAt, now);
  const meta = sanitizeFunnelMeta(raw.meta);

  const clientDedupe = cleanDedupeKey(raw.dedupeKey);
  const dedupeKey =
    clientDedupe ??
    [
      eventRaw,
      visitorKey,
      sessionKey,
      mlsNumber ?? "-",
      String(Math.floor(occurredAt.getTime() / 60_000)),
    ].join(":");

  if (dedupeKey.length > FUNNEL_MAX_DEDUPE_LEN) {
    throw new FunnelSanitizeError(
      "PAYLOAD_TOO_LARGE",
      "dedupeKey exceeds size limit",
    );
  }

  return {
    eventName: eventRaw,
    visitorKey,
    sessionKey,
    occurredAt,
    mlsNumber,
    dedupeKey: dedupeKey.slice(0, FUNNEL_MAX_DEDUPE_LEN),
    meta,
  };
}
