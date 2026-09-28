/**
 * Which criteria the daily buyer digest may match on.
 * An existing primary SavedSearch is the customer's stored criteria.
 * Browsing may fill Looking For, but it must not replace that query.
 * A browse-derived row is created only when the customer has no primary yet.
 */

export type StoredPrimarySearch = {
  id: string;
  query: unknown;
  emailAlerts: boolean;
  lastAlertedAt: Date | null;
};

export type BuyerDigestPlan =
  | {
      action: "match_stored";
      query: Record<string, unknown>;
      searchId: string;
      /** Query and name stay untouched. lastAlertedAt may still advance. */
      writeQuery: false;
    }
  | {
      action: "create_from_browse";
      query: Record<string, unknown>;
      name: string;
      writeQuery: true;
    }
  | { action: "skip"; reason: "alerts_off" | "no_criteria" };

export function storedSavedSearchQuery(
  query: unknown,
): Record<string, unknown> | null {
  if (!query || typeof query !== "object" || Array.isArray(query)) return null;
  return { ...(query as Record<string, unknown>) };
}

/** After a successful send, only the alert cursor moves. */
export function savedSearchDigestCursorUpdate(now: Date): {
  lastAlertedAt: Date;
} {
  return { lastAlertedAt: now };
}

export function planBuyerDigest(input: {
  primary: StoredPrimarySearch | null;
  browseQuery: Record<string, unknown> | null;
  browseName: string | null;
  browseUsable: boolean;
}): BuyerDigestPlan {
  if (input.primary) {
    if (!input.primary.emailAlerts) {
      return { action: "skip", reason: "alerts_off" };
    }
    const query = storedSavedSearchQuery(input.primary.query);
    if (!query) return { action: "skip", reason: "no_criteria" };
    return {
      action: "match_stored",
      query,
      searchId: input.primary.id,
      writeQuery: false,
    };
  }

  if (
    !input.browseUsable ||
    !input.browseQuery ||
    !input.browseName
  ) {
    return { action: "skip", reason: "no_criteria" };
  }

  return {
    action: "create_from_browse",
    query: input.browseQuery,
    name: input.browseName,
    writeQuery: true,
  };
}
