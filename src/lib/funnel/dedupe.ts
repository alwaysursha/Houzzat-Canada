import {
  FUNNEL_MAX_DEDUPE_LEN,
  type FunnelEventName,
} from "@/lib/funnel/constants";

/** Prefix for all client-derived dedupe keys — never overlaps server completion keys. */
export const FUNNEL_CLIENT_DEDUPE_PREFIX = "c:";

/**
 * Server-authoritative registration_completed dedupe (per user, tenant-scoped via
 * unique(workspaceId, dedupeKey)).
 */
export function buildRegistrationCompletedDedupeKey(userId: string): string {
  return `registration_completed:user:${userId.trim()}`;
}

function clientDedupeContext(
  eventName: FunnelEventName,
  mlsNumber: string | null,
  meta: Record<string, string> | null,
): string {
  switch (eventName) {
    case "search_results_viewed":
      return meta?.searchHash?.trim() || "-";
    case "property_card_clicked":
    case "listing_detail_opened":
    case "registration_gate_shown":
    case "post_registration_continued":
      return mlsNumber ?? "-";
    case "registration_started":
    case "visitor_session_started":
    case "registration_engaged":
      return "once";
    case "registration_completed":
      // Client path never reaches here; keep a non-colliding stub.
      return "forbidden";
    default: {
      const _exhaustive: never = eventName;
      return _exhaustive;
    }
  }
}

/**
 * Canonical client-event dedupe key. Built only from validated fields —
 * never from a client-supplied dedupeKey.
 *
 * Format: c:{eventName}:{sessionKey}:{context}
 */
export function buildClientFunnelDedupeKey(input: {
  eventName: FunnelEventName;
  sessionKey: string;
  mlsNumber: string | null;
  meta: Record<string, string> | null;
}): string {
  const sessionKey = input.sessionKey.trim();
  const context = clientDedupeContext(
    input.eventName,
    input.mlsNumber,
    input.meta,
  );
  const key = `${FUNNEL_CLIENT_DEDUPE_PREFIX}${input.eventName}:${sessionKey}:${context}`;
  return key.slice(0, FUNNEL_MAX_DEDUPE_LEN);
}
