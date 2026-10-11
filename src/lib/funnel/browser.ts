/**
 * Browser-only funnel beacon helpers.
 * Always POSTs; server honors FUNNEL_EVENTS_ENABLED and skips when disabled.
 * Never throws; never blocks navigation or signup.
 */

import type { FunnelEventName } from "@/lib/funnel/constants";
import { FUNNEL_CLIENT_EVENT_NAMES } from "@/lib/funnel/constants";
import { mlsNumberFromListingHref } from "@/lib/listings/gallery-client";

const VISITOR_KEY = "houzzat:visitorKey";
const SESSION_KEY = "houzzat:sessionKey";

const clientAllowed = new Set<string>(FUNNEL_CLIENT_EVENT_NAMES);

/** Confirmed persist or server duplicate acknowledgement. */
const confirmedLocal = new Set<string>();
/** Feature-disabled / skipped — suppress further POSTs without claiming a write. */
const quietLocal = new Set<string>();
/** In-flight POSTs keyed by local dedupe identity. */
const inflightLocal = new Map<string, Promise<void>>();

type FunnelFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

let fetchImpl: FunnelFetch | null = null;

function ensureId(storage: Storage, key: string): string {
  let value = storage.getItem(key);
  if (!value) {
    value =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `v_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    storage.setItem(key, value);
  }
  return value;
}

export function readFunnelVisitorKeys(): {
  visitorKey: string | null;
  sessionKey: string | null;
} {
  if (typeof window === "undefined") {
    return { visitorKey: null, sessionKey: null };
  }
  try {
    return {
      visitorKey: localStorage.getItem(VISITOR_KEY),
      sessionKey: sessionStorage.getItem(SESSION_KEY),
    };
  } catch {
    return { visitorKey: null, sessionKey: null };
  }
}

export function ensureFunnelVisitorKeys(): {
  visitorKey: string;
  sessionKey: string;
} | null {
  if (typeof window === "undefined") return null;
  try {
    return {
      visitorKey: ensureId(localStorage, VISITOR_KEY),
      sessionKey: ensureId(sessionStorage, SESSION_KEY),
    };
  } catch {
    return null;
  }
}

/** Stable short hash for search criteria strings (meta.searchHash). */
export function funnelSearchHash(queryString: string): string {
  let h = 2166136261;
  for (let i = 0; i < queryString.length; i++) {
    h ^= queryString.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/**
 * Compact polygon identity for analytics (point count + rounded bbox).
 * No raw coordinates in the event payload — only the resulting hash fragment.
 */
export function funnelPolygonFingerprint(
  polygon: ReadonlyArray<readonly [number, number]> | null | undefined,
): string {
  if (!polygon || polygon.length < 3) return "";
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const point of polygon) {
    const lng = point[0];
    const lat = point[1];
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }
  if (!Number.isFinite(minLng)) return "";
  const material = [
    String(polygon.length),
    minLng.toFixed(5),
    minLat.toFixed(5),
    maxLng.toFixed(5),
    maxLat.toFixed(5),
  ].join(":");
  return funnelSearchHash(material);
}

/**
 * Canonical search_results_viewed identity: criteria key (+ optional polygon fp).
 * Presentation (cards/map/split limit) must not be included in criteriaKey.
 */
export function funnelSearchViewHash(
  criteriaKey: string,
  polygonFingerprint = "",
): string {
  const material = polygonFingerprint
    ? `${criteriaKey}|p:${polygonFingerprint}`
    : criteriaKey;
  return funnelSearchHash(material);
}

export type ReportFunnelEventInput = {
  eventName: FunnelEventName;
  mlsNumber?: string | null;
  meta?: Record<string, string> | null;
};

export function buildFunnelLocalDedupeKey(input: {
  eventName: FunnelEventName;
  sessionKey: string;
  mlsNumber: string | null;
  meta: Record<string, string> | null;
}): string {
  const localCtx =
    input.eventName === "search_results_viewed"
      ? input.meta?.searchHash ?? "-"
      : input.mlsNumber ??
        (input.eventName === "registration_started" ||
        input.eventName === "visitor_session_started" ||
        input.eventName === "registration_engaged"
          ? "once"
          : "-");
  return `${input.eventName}:${input.sessionKey}:${localCtx}`;
}

/** True when API confirms a persisted write or an existing duplicate row. */
export function isFunnelPersistAck(body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const o = body as Record<string, unknown>;
  if (o.skipped === true) return false;
  if (o.ok !== true) return false;
  return o.status === "written" || o.status === "duplicate";
}

/** Feature-flag skip / disabled — do not claim persistence; suppress spam. */
export function isFunnelSkippedResponse(body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const o = body as Record<string, unknown>;
  if (o.skipped === true) return true;
  return o.ok === true && o.status === "disabled";
}

/**
 * Fail-soft public funnel ingest. Fire-and-forget.
 * In-flight coalescing + confirm-only local success; retries after hard failures.
 * Server still canonicalizes dedupe keys.
 */
export function reportFunnelEvent(input: ReportFunnelEventInput): void {
  if (typeof window === "undefined") return;
  if (!clientAllowed.has(input.eventName)) return;

  try {
    const keys = ensureFunnelVisitorKeys();
    if (!keys) return;

    const mls =
      typeof input.mlsNumber === "string" && input.mlsNumber.trim()
        ? input.mlsNumber.trim().toUpperCase()
        : null;
    const meta = input.meta ?? null;
    const localKey = buildFunnelLocalDedupeKey({
      eventName: input.eventName,
      sessionKey: keys.sessionKey,
      mlsNumber: mls,
      meta,
    });

    if (confirmedLocal.has(localKey) || quietLocal.has(localKey)) return;
    if (inflightLocal.has(localKey)) return;

    const run = (async () => {
      try {
        const doFetch = fetchImpl ?? globalThis.fetch.bind(globalThis);
        const res = await doFetch("/api/analytics/funnel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventName: input.eventName,
            visitorKey: keys.visitorKey,
            sessionKey: keys.sessionKey,
            occurredAt: new Date().toISOString(),
            mlsNumber: mls,
            meta,
          }),
          keepalive: true,
        });

        let data: unknown = null;
        try {
          data = await res.json();
        } catch {
          data = null;
        }

        if (!res.ok) {
          // Network reached server but failed — allow later retry.
          return;
        }
        if (isFunnelPersistAck(data)) {
          confirmedLocal.add(localKey);
          return;
        }
        if (isFunnelSkippedResponse(data)) {
          // Flag off / skipped: do not claim write; stop unbounded retries.
          quietLocal.add(localKey);
          return;
        }
        // Unexpected 2xx shape — leave unconfirmed so a later attempt can retry.
      } catch {
        // Abort / network error — leave unconfirmed for retry.
      } finally {
        inflightLocal.delete(localKey);
      }
    })();

    inflightLocal.set(localKey, run);
    void run;
  } catch {
    // Non-blocking analytics.
  }
}

/** User-initiated listing navigation from a property card / listing link. */
export function reportPropertyCardClicked(
  href: string,
  meta?: Record<string, string> | null,
): void {
  const mls = mlsNumberFromListingHref(href);
  reportFunnelEvent({
    eventName: "property_card_clicked",
    mlsNumber: mls,
    meta: meta ?? { source: "listing_link" },
  });
}

/** Clear local dedupe (tests only). */
export function clearFunnelBrowserDedupeForTests(): void {
  confirmedLocal.clear();
  quietLocal.clear();
  inflightLocal.clear();
}

/** Inject fetch for tests; pass null to restore. */
export function setFunnelBrowserFetchForTests(fn: FunnelFetch | null): void {
  fetchImpl = fn;
}

/** Snapshot for tests. */
export function getFunnelBrowserDedupeSnapshotForTests(): {
  confirmed: string[];
  quiet: string[];
  inflight: string[];
} {
  return {
    confirmed: [...confirmedLocal],
    quiet: [...quietLocal],
    inflight: [...inflightLocal.keys()],
  };
}

/** Await in-flight POSTs (tests only). */
export async function flushFunnelBrowserInflightForTests(): Promise<void> {
  const pending = [...inflightLocal.values()];
  await Promise.allSettled(pending);
}
