import type { CommittedSearch, SearchState } from "@/lib/listings/search-state/types";

export function defaultCommittedSearch(
  overrides: Partial<CommittedSearch> = {},
): CommittedSearch {
  return {
    segment: "RESIDENTIAL",
    transactionType: "SALE",
    dataSource: "",
    cities: [],
    community: "",
    communities: [],
    q: "",
    minPrice: "",
    maxPrice: "",
    minBeds: "",
    minBaths: "",
    propertyTypes: [],
    openHouseOnly: false,
    statuses: ["ACTIVE"],
    sort: "newest",
    view: "split",
    mapArea: null,
    ...overrides,
  };
}

export function initialSearchState(
  committed: CommittedSearch = defaultCommittedSearch(),
): SearchState {
  return {
    committed,
    draft: null,
    pendingMapBounds: null,
    searchThisAreaVisible: false,
    requestSeq: 0,
    lastIssuedRequestId: null,
  };
}

/** Optional criteria cleared; intentional defaults preserved (SALE / RESIDENTIAL / ACTIVE). */
export function clearOptionalCriteria(committed: CommittedSearch): CommittedSearch {
  return {
    ...committed,
    segment: "RESIDENTIAL",
    transactionType: "SALE",
    cities: [],
    community: "",
    communities: [],
    q: "",
    minPrice: "",
    maxPrice: "",
    minBeds: "",
    minBaths: "",
    propertyTypes: [],
    openHouseOnly: false,
    statuses: ["ACTIVE"],
    sort: "newest",
    mapArea: null,
    // view + dataSource preserved
  };
}
