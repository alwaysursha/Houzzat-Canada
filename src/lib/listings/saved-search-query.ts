import type { SearchFilters } from "@/components/listings/SearchFilterChips";

function statusesQueryValue(statuses: SearchFilters["statuses"]): string | null {
  if (statuses.length === 1 && statuses[0] === "ACTIVE") return null;
  return statuses.join(",");
}

function resolvedCities(
  filters: SearchFilters,
  extras?: { cities?: readonly string[] },
): string[] {
  const fromExtras = (extras?.cities ?? [])
    .map((city) => city.trim())
    .filter(Boolean);
  if (fromExtras.length) return [...new Set(fromExtras)];
  const one = filters.city.trim();
  return one ? [one] : [];
}

/**
 * Serialize UI filters into the JSON shape stored on SavedSearch.query.
 * Place fields match qualification / digest / savedQueryToSearchHref:
 * one city → `city`; multiple → `cities` string[].
 */
export function searchFiltersToSavedQuery(
  filters: SearchFilters,
  extras?: { cities?: readonly string[] },
): Record<string, unknown> {
  const cities = resolvedCities(filters, extras);
  return {
    segment:
      filters.segment !== "RESIDENTIAL" ? filters.segment : undefined,
    transactionType:
      filters.transactionType !== "ALL" ? filters.transactionType : undefined,
    dataSource: filters.dataSource || undefined,
    ...(cities.length === 1
      ? { city: cities[0] }
      : cities.length > 1
        ? { cities }
        : {}),
    community: filters.community || undefined,
    propertyTypes: filters.propertyTypes.length
      ? filters.propertyTypes.join(",")
      : undefined,
    minPrice: filters.minPrice || undefined,
    maxPrice: filters.maxPrice || undefined,
    minBeds: filters.minBeds || undefined,
    minBaths: filters.minBaths || undefined,
    openHouseOnly: filters.openHouseOnly ? "1" : undefined,
    status: statusesQueryValue(filters.statuses) ?? undefined,
    sort: filters.sort !== "newest" ? filters.sort : undefined,
  };
}

export function savedSearchDisplayName(
  filters: SearchFilters,
  extras?: { cities?: readonly string[] },
): string {
  const cities = resolvedCities(filters, extras);
  const place =
    filters.community.trim() ||
    (cities.length === 1 ? cities[0] : "") ||
    (cities.length > 1 ? `${cities.length} cities` : "");
  const txn =
    filters.transactionType === "LEASE"
      ? "rentals"
      : filters.segment === "COMMERCIAL"
        ? "commercial"
        : "homes";
  if (place) return `${place} ${txn}`;
  return `My ${txn} search`;
}

/** Build listing search query string from filters (for draft result counts). */
export function searchFiltersToListingParams(
  filters: SearchFilters,
  extras?: {
    cities?: string;
    communities?: string;
    q?: string;
    west?: number;
    south?: number;
    east?: number;
    north?: number;
    limit?: number;
  },
): string {
  const params = new URLSearchParams();
  if (filters.segment && filters.segment !== "ALL") {
    params.set("segment", filters.segment);
  } else if (filters.segment === "ALL") {
    params.set("segment", "ALL");
  }
  params.set("transactionType", filters.transactionType);
  if (filters.dataSource) params.set("dataSource", filters.dataSource);
  if (extras?.cities) {
    params.set("cities", extras.cities);
  } else if (filters.city) {
    params.set("city", filters.city);
  }
  if (extras?.communities) {
    params.set("communities", extras.communities);
  } else if (filters.community) {
    params.set("community", filters.community);
  }
  if (filters.propertyTypes.length) {
    params.set("propertyTypes", filters.propertyTypes.join(","));
  }
  if (filters.minPrice) params.set("minPrice", filters.minPrice);
  if (filters.maxPrice) params.set("maxPrice", filters.maxPrice);
  if (filters.minBeds) params.set("minBeds", filters.minBeds);
  if (filters.minBaths) params.set("minBaths", filters.minBaths);
  if (filters.openHouseOnly) params.set("openHouseOnly", "1");
  const statusQ = statusesQueryValue(filters.statuses);
  if (statusQ) params.set("status", statusQ);
  params.set("sort", filters.sort);
  if (extras?.q) params.set("q", extras.q);
  if (
    extras?.west != null &&
    extras.south != null &&
    extras.east != null &&
    extras.north != null
  ) {
    params.set("west", String(extras.west));
    params.set("south", String(extras.south));
    params.set("east", String(extras.east));
    params.set("north", String(extras.north));
  }
  params.set("limit", String(extras?.limit ?? 1));
  return params.toString();
}
