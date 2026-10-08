import type { SearchFilters } from "@/components/listings/SearchFilterChips";
import type { CommittedSearch } from "@/lib/listings/search-state/types";

export type CommitFromFiltersOptions = {
  /** Explicit structured cities (Apply / city field). */
  cities?: string[];
  /** Drop cities, community, and communities. */
  clearPlace?: boolean;
  /** Drop free-text q. */
  clearQuery?: boolean;
};

/**
 * Map legacy SearchFilters (+ optional cities) onto a CommittedSearch patch.
 * When `cities` is omitted and `filters.city` is empty, prior cities are kept
 * so multi-city searches survive live beds/price edits.
 */
export function commitPatchFromFilters(
  prev: CommittedSearch,
  filters: SearchFilters,
  options?: CommitFromFiltersOptions,
): Partial<CommittedSearch> {
  let cities = prev.cities;
  if (options?.clearPlace) {
    cities = [];
  } else if (options?.cities !== undefined) {
    cities = options.cities.map((c) => c.trim()).filter(Boolean);
  } else if (filters.city.trim()) {
    cities = [filters.city.trim()];
  }

  return {
    segment: filters.segment,
    transactionType: filters.transactionType,
    dataSource: filters.dataSource,
    cities,
    community: options?.clearPlace ? "" : filters.community,
    communities: options?.clearPlace ? [] : prev.communities,
    q: options?.clearQuery ? "" : prev.q,
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice,
    minBeds: filters.minBeds,
    minBaths: filters.minBaths,
    propertyTypes: filters.propertyTypes,
    openHouseOnly: filters.openHouseOnly,
    statuses: filters.statuses,
    sort: filters.sort,
  };
}
