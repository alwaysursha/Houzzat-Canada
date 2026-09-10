/** Client/server-safe Engagement overview helpers. No Prisma. */

export const V2_ENGAGEMENT_OVERVIEW_RESOURCE_KEY = "engagement-overview";

/** Same 24h window as the current Views (24h) card. */
export const V2_ENGAGEMENT_VIEWS_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Legacy engagement evaluates up to 10 ordered saved searches.
 * Matchboard uses candidates[0] regardless of usability.
 * loadBuyerIntent receives that same bounded set and scans until the first
 * usable query (queryFromSaved). Do not pre-reduce to one row first — a
 * duplicated usability gate can pick a different seed than queryFromSaved.
 */

export const V2_ENGAGEMENT_MATCHBOARD_CANDIDATE_TAKE = 10;

/** Documented 45-day buyer-intent window (matches loadBuyerIntent). */
export const V2_BUYER_INTENT_DAYS = 45;
export const V2_BUYER_INTENT_VISITOR_TAKE = 20;
export const V2_BUYER_INTENT_EVENT_TAKE = 40;
export const V2_BUYER_INTENT_LISTING_TAKE = 12;

export type V2EngagementOverviewStamp = {
  leadId: string;
  epoch: number;
};

export function canApplyV2EngagementOverviewResponse(input: {
  stamp: V2EngagementOverviewStamp;
  current: V2EngagementOverviewStamp;
}): boolean {
  return (
    input.stamp.leadId === input.current.leadId &&
    input.stamp.epoch === input.current.epoch
  );
}

/**
 * Exact loadBuyerIntent saved-search usability gate. Transaction-only queries
 * are not usable. Do not use hasUsableSearchCriteria (that includes txn).
 */
export function v2SavedSearchQueryIsUsable(query: unknown): boolean {
  const parsed = parseSavedSearchQueryForUsability(query);
  return (
    parsed.cities.length > 0 ||
    parsed.communities.length > 0 ||
    parsed.minPrice != null ||
    parsed.maxPrice != null ||
    parsed.minBeds != null ||
    parsed.propertyTypes.length > 0
  );
}

export function selectV2MatchboardSearchSeed<T>(candidates: T[]): T | null {
  return candidates[0] ?? null;
}

/**
 * Same scan loadBuyerIntent uses (first usable via queryFromSaved rules).
 * For assertions only — do not use this to shrink the array passed into
 * loadBuyerIntent.
 */
export function selectV2BuyerIntentSavedSearchSeed<
  T extends { query: unknown },
>(candidates: T[]): T | null {
  for (const row of candidates) {
    if (v2SavedSearchQueryIsUsable(row.query)) return row;
  }
  return null;
}

/** Exact { name, query } slice loadBuyerIntent reads. No usability filter. */
export function toV2BuyerIntentSavedSearchInput<
  T extends { name: string; query: unknown },
>(candidates: T[]): Array<{ name: string; query: unknown }> {
  return candidates.map((row) => ({ name: row.name, query: row.query }));
}

export function deriveV2EngagementSearchSeeds<
  T extends { name: string; query: unknown },
>(candidates: T[]): {
  matchboardSearch: T | null;
  buyerIntentSavedSearch: T | null;
  buyerIntentSavedSearches: Array<{ name: string; query: unknown }>;
} {
  return {
    matchboardSearch: selectV2MatchboardSearchSeed(candidates),
    buyerIntentSavedSearch: selectV2BuyerIntentSavedSearchSeed(candidates),
    buyerIntentSavedSearches: toV2BuyerIntentSavedSearchInput(candidates),
  };
}

function parseMoney(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function parseSavedSearchQueryForUsability(query: unknown): {
  cities: string[];
  communities: string[];
  propertyTypes: string[];
  minBeds: number | null;
  minPrice: number | null;
  maxPrice: number | null;
} {
  const q = (query ?? {}) as Record<string, unknown>;

  const splitList = (raw: unknown): string[] => {
    if (Array.isArray(raw)) {
      return raw
        .filter((v): v is string => typeof v === "string")
        .flatMap((v) => v.split(/[,|]/))
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (typeof raw === "string" && raw.trim()) {
      return raw
        .split(/[,|]/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [];
  };

  const cities = [...splitList(q.cities), ...splitList(q.city)];
  const communities = [
    ...splitList(q.communities),
    ...splitList(q.community),
  ];
  const propertyTypes = [
    ...splitList(q.propertyTypes),
    ...splitList(q.propertyType),
  ];
  const minBeds =
    typeof q.minBeds === "number"
      ? q.minBeds
      : typeof q.minBeds === "string"
        ? Number(q.minBeds)
        : typeof q.bedsMin === "number"
          ? q.bedsMin
          : null;
  const minPrice =
    typeof q.minPrice === "number"
      ? q.minPrice
      : typeof q.minPrice === "string"
        ? parseMoney(q.minPrice)
        : null;
  const maxPrice =
    typeof q.maxPrice === "number"
      ? q.maxPrice
      : typeof q.maxPrice === "string"
        ? parseMoney(q.maxPrice)
        : typeof q.priceMax === "number"
          ? q.priceMax
          : null;

  return {
    cities: [...new Set(cities)],
    communities: [...new Set(communities)],
    propertyTypes: [...new Set(propertyTypes)],
    minBeds:
      Number.isFinite(minBeds) && (minBeds as number) > 0
        ? Number(minBeds)
        : null,
    minPrice,
    maxPrice,
  };
}

