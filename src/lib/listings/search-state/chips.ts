import { searchResultsCopy } from "@/lib/listings/search-results-copy";
import type { CommittedSearch, SearchChip } from "@/lib/listings/search-state/types";

/**
 * Active filter tags derived solely from committed criteria.
 * Labels match searchResultsCopy (no independent tag state).
 */
export function buildActiveChips(
  committed: CommittedSearch,
  options?: { total?: number; pending?: boolean },
): SearchChip[] {
  return searchResultsCopy({
    transactionType: committed.transactionType,
    segment: committed.segment,
    city: "",
    community: committed.community,
    cities: committed.cities.join("|"),
    communities: committed.communities.join("|"),
    q: committed.q,
    minPrice: committed.minPrice,
    maxPrice: committed.maxPrice,
    minBeds: committed.minBeds,
    minBaths: committed.minBaths,
    propertyTypes: committed.propertyTypes,
    openHouseOnly: committed.openHouseOnly,
    statuses: committed.statuses,
    total: options?.total ?? 0,
    pending: options?.pending ?? false,
  }).chips;
}
