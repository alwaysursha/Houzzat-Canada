import type { BuyerIntentCriteria } from "@/lib/agent/buyer-intent";

/** Flatten buyer-intent criteria into SavedSearch.query JSON. */
export function buyerIntentToSavedQuery(
  criteria: BuyerIntentCriteria,
): Record<string, unknown> {
  const query: Record<string, unknown> = {};

  if (criteria.transactionType) {
    query.transactionType = criteria.transactionType;
  }
  if (criteria.cities.length === 1) {
    query.city = criteria.cities[0];
  } else if (criteria.cities.length > 1) {
    query.cities = criteria.cities;
  }
  if (criteria.communities.length === 1) {
    query.community = criteria.communities[0];
  } else if (criteria.communities.length > 1) {
    query.communities = criteria.communities;
  }
  if (criteria.propertyTypes.length) {
    query.propertyTypes = criteria.propertyTypes.join(",");
  }
  if (criteria.minBeds != null) query.minBeds = String(criteria.minBeds);
  if (criteria.maxBeds != null) query.maxBeds = String(criteria.maxBeds);
  if (criteria.minPrice != null) query.minPrice = String(criteria.minPrice);
  if (criteria.maxPrice != null) query.maxPrice = String(criteria.maxPrice);

  return query;
}

export function buyerIntentSearchName(criteria: BuyerIntentCriteria): string {
  const place =
    criteria.communities[0] ||
    criteria.cities[0] ||
    (criteria.cities.length > 1 ? `${criteria.cities.length} cities` : null);
  const txn = criteria.transactionType === "LEASE" ? "rentals" : "homes";
  if (place) return `${place} ${txn}`;
  return "Looking for search";
}

/** Build /search URL from saved-search JSON or buyer-intent criteria. */
export function savedQueryToSearchHref(query: unknown): string {
  if (!query || typeof query !== "object") return "/search";
  const q = query as Record<string, unknown>;
  const params = new URLSearchParams();

  const setIf = (key: string, value: unknown) => {
    if (value == null || value === "") return;
    if (Array.isArray(value)) {
      if (!value.length) return;
      if (key === "cities" || key === "communities") {
        params.set(key, value.map(String).join("|"));
      } else if (key === "propertyTypes") {
        params.set(key, value.map(String).join(","));
      } else {
        params.set(key, String(value[0] ?? ""));
      }
      return;
    }
    params.set(key, String(value));
  };

  // Prefer multi-value keys used by /api/listings/search
  if (Array.isArray(q.cities) && q.cities.length) {
    setIf("cities", q.cities);
  } else if (typeof q.city === "string" && q.city.trim()) {
    params.set("city", q.city.trim());
  }

  if (Array.isArray(q.communities) && q.communities.length) {
    setIf("communities", q.communities);
  } else if (typeof q.community === "string" && q.community.trim()) {
    params.set("community", q.community.trim());
  }

  if (typeof q.propertyTypes === "string" && q.propertyTypes.trim()) {
    params.set("propertyTypes", q.propertyTypes.trim());
  } else if (Array.isArray(q.propertyTypes)) {
    setIf("propertyTypes", q.propertyTypes);
  }

  for (const key of [
    "transactionType",
    "minPrice",
    "maxPrice",
    "minBeds",
    "maxBeds",
    "minBaths",
    "segment",
    "status",
    "sort",
    "q",
  ] as const) {
    setIf(key, q[key]);
  }

  if (!params.has("status")) params.set("status", "ACTIVE");
  if (!params.has("sort")) params.set("sort", "newest");

  const qs = params.toString();
  return qs ? `/search?${qs}` : "/search";
}

export function buyerIntentToSearchHref(criteria: BuyerIntentCriteria): string {
  return savedQueryToSearchHref(buyerIntentToSavedQuery(criteria));
}

export function hasUsableSearchCriteria(criteria: BuyerIntentCriteria): boolean {
  return Boolean(
    criteria.cities.length ||
      criteria.communities.length ||
      criteria.propertyTypes.length ||
      criteria.minBeds != null ||
      criteria.minPrice != null ||
      criteria.maxPrice != null ||
      criteria.transactionType,
  );
}
