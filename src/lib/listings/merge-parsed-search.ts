/**
 * Merge NL parser output into existing committed /search criteria.
 * Explicitly extracted fields replace prior values; omitted fields are kept.
 */

import {
  leftoverQueryForSearchHref,
  type ParsedSearchQuery,
} from "@/lib/listings/parse-search-query";
import type { CommittedSearch } from "@/lib/listings/search-state/types";

/**
 * Apply a free-text parse on top of the current /search committed state.
 * City/beds/price/types/txn that appear in `parsed` replace those slots;
 * unrelated prior filters survive so incremental NL refinement accumulates.
 */
export function mergeParsedSearchIntoCommitted(
  prev: CommittedSearch,
  parsed: ParsedSearchQuery,
): CommittedSearch {
  const next: CommittedSearch = { ...prev };

  if (parsed.transactionType) {
    next.transactionType = parsed.transactionType;
  }

  const cities =
    parsed.cities && parsed.cities.length > 0
      ? parsed.cities
      : parsed.city
        ? [parsed.city]
        : null;
  if (cities) {
    next.cities = cities;
    // Explicit city phrase replaces prior place chips (community scoped to old city).
    next.community = "";
    next.communities = [];
  }

  if (parsed.minBeds != null) next.minBeds = String(parsed.minBeds);
  if (parsed.minBaths != null) next.minBaths = String(parsed.minBaths);
  if (parsed.minPrice != null) next.minPrice = String(parsed.minPrice);
  if (parsed.maxPrice != null) next.maxPrice = String(parsed.maxPrice);

  if (parsed.propertyTypes && parsed.propertyTypes.length > 0) {
    next.propertyTypes = [...parsed.propertyTypes];
  }

  if (parsed.openHouseOnly) {
    next.openHouseOnly = true;
  }

  if (parsed.hasFilters) {
    next.q = leftoverQueryForSearchHref(parsed) ?? "";
  } else {
    const q = parsed.q?.trim();
    if (q) next.q = q;
  }

  return next;
}
