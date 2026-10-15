import { appendPlaceAndBoundsParams } from "@/lib/listings/map-area-search";
import { statusesQueryValue } from "@/lib/listings/search-page-href";
import { searchFiltersToSavedQuery } from "@/lib/listings/saved-search-query";
import {
  committedToSearchFilters,
} from "@/lib/listings/search-state/adapters";
import type { CommittedSearch } from "@/lib/listings/search-state/types";

/**
 * When the UI committed ACTIVE-only criteria plus buyer filters (beds/baths/
 * price/types) and a leftover `q`, pin status=ACTIVE on the API request.
 * Otherwise omitting status lets the API treat `q` as ALL and pull sold stock
 * without a Sold chip. Street-only / intentional historical `q` is unchanged.
 */
export function shouldPinActiveStatusForBuyerQuery(
  committed: CommittedSearch,
): boolean {
  if (!(committed.statuses.length === 1 && committed.statuses[0] === "ACTIVE")) {
    return false;
  }
  if (!committed.q.trim()) return false;
  return (
    Boolean(committed.minBeds.trim()) ||
    Boolean(committed.minBaths.trim()) ||
    Boolean(committed.minPrice.trim()) ||
    Boolean(committed.maxPrice.trim()) ||
    committed.propertyTypes.length > 0
  );
}

/**
 * Build `/api/listings/search` query string.
 * Matches SearchExperience queryString + appendPlaceAndBoundsParams contracts:
 * - cities pipe when cities.length > 0 (including single city as cities= for API)
 * - segment ALL vs omitted RESIDENTIAL handling aligned with Experience fetch
 * - mapArea → west/south/east/north
 * - limit 500 for map/split, 60 for cards
 */
export function buildListingsQuery(committed: CommittedSearch): string {
  const params = new URLSearchParams();
  if (committed.segment && committed.segment !== "ALL") {
    params.set("segment", committed.segment);
  } else if (committed.segment === "ALL") {
    params.set("segment", "ALL");
  }
  params.set("transactionType", committed.transactionType);
  if (committed.dataSource) params.set("dataSource", committed.dataSource);
  if (committed.propertyTypes.length) {
    params.set("propertyTypes", committed.propertyTypes.join(","));
  }
  if (committed.minPrice) params.set("minPrice", committed.minPrice);
  if (committed.maxPrice) params.set("maxPrice", committed.maxPrice);
  if (committed.minBeds) params.set("minBeds", committed.minBeds);
  if (committed.minBaths) params.set("minBaths", committed.minBaths);
  if (committed.openHouseOnly) params.set("openHouseOnly", "1");
  const statusQ = statusesQueryValue(committed.statuses);
  if (statusQ) {
    params.set("status", statusQ);
  } else if (shouldPinActiveStatusForBuyerQuery(committed)) {
    params.set("status", "ACTIVE");
  }
  params.set("sort", committed.sort);
  if (committed.q.trim()) params.set("q", committed.q.trim());

  const citiesPipe = committed.cities.join("|");
  const communitiesPipe = committed.communities.join("|");
  appendPlaceAndBoundsParams(params, {
    citiesPipe,
    city: "",
    communitiesPipe,
    community: committed.community,
    bounds: committed.mapArea,
  });

  const densePins = committed.view === "map" || committed.view === "split";
  params.set("limit", densePins ? "500" : "60");
  return params.toString();
}

/**
 * Criteria identity excluding presentation (`view` / pin density limit).
 * View switches must not change this key or Saved Search payload.
 */
export function buildCriteriaKey(committed: CommittedSearch): string {
  return buildListingsQuery({ ...committed, view: "cards" });
}

/**
 * SavedSearch.query JSON — delegates to existing searchFiltersToSavedQuery
 * so digest / CaptureIntent / CRM contracts stay byte-compatible.
 */
export function buildSavedSearchQuery(
  committed: CommittedSearch,
): Record<string, unknown> {
  const filters = committedToSearchFilters(committed, {
    singleCityOnFilters: false,
  });
  return searchFiltersToSavedQuery(filters, { cities: committed.cities });
}
