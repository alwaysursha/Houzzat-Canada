import type { SearchFilters } from "@/components/listings/SearchFilterChips";
import type { CommittedSearch } from "@/lib/listings/search-state/types";

/**
 * Bridge to legacy SearchFilters (city string) for existing builders.
 * Multi-city lives only in `cities`; `filters.city` is empty when length ≠ 1
 * for Apply-style commits, or set when length === 1 for city= URL shape.
 */
export function committedToSearchFilters(
  committed: CommittedSearch,
  options?: { singleCityOnFilters?: boolean },
): SearchFilters {
  const singleOnFilters = options?.singleCityOnFilters !== false;
  return {
    segment: committed.segment,
    transactionType: committed.transactionType,
    dataSource: committed.dataSource,
    city:
      singleOnFilters && committed.cities.length === 1
        ? committed.cities[0]!
        : "",
    community: committed.community,
    minPrice: committed.minPrice,
    maxPrice: committed.maxPrice,
    minBeds: committed.minBeds,
    minBaths: committed.minBaths,
    propertyTypes: [...committed.propertyTypes],
    openHouseOnly: committed.openHouseOnly,
    statuses: [...committed.statuses],
    sort: committed.sort,
  };
}

export function committedCitiesPipe(committed: CommittedSearch): string {
  return committed.cities.join("|");
}

export function committedCommunitiesPipe(committed: CommittedSearch): string {
  return committed.communities.join("|");
}
