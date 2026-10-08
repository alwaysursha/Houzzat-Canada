import type { PropertyType } from "@prisma/client";
import type {
  SearchStatusOption,
  SearchViewMode,
} from "@/components/listings/SearchFilterChips";
import type { MapBoundsBox } from "@/lib/listings/map-area-search";
import type { SearchResultChip } from "@/lib/listings/search-results-copy";

/**
 * Canonical committed search criteria (Stage 1).
 * Location is always `cities[]` internally — never dual-encoded.
 *
 * URL legacy:
 * - `cities=` (pipe) wins over `city=` when both present.
 * - Serialize: 0 → neither; 1 → `city=`; 2+ → `cities=`.
 * Map area is session-only (not in page URL), matching SearchExperience.
 */
export type CommittedSearch = {
  segment: "RESIDENTIAL" | "COMMERCIAL" | "ALL";
  transactionType: "SALE" | "LEASE" | "ALL";
  dataSource: "fsbo" | "";
  /** Normalized structured cities (0..n). */
  cities: string[];
  community: string;
  /** Pipe-oriented multi-community list (URL `communities=`). */
  communities: string[];
  /** Free-text query. Never treated as a city. */
  q: string;
  minPrice: string;
  maxPrice: string;
  minBeds: string;
  minBaths: string;
  propertyTypes: PropertyType[];
  openHouseOnly: boolean;
  statuses: SearchStatusOption[];
  sort: "newest" | "price_asc" | "price_desc";
  /** Presentation only — must not alter saved criteria or logical totals. */
  view: SearchViewMode;
  /**
   * Explicitly applied Search This Area / draw bounds.
   * AND'd with place filters. Not serialized into the page URL.
   */
  mapArea: MapBoundsBox | null;
};

/** Controller envelope: committed + disposable draft + map gesture + fetch identity. */
export type SearchState = {
  committed: CommittedSearch;
  /** Non-null while Filters sheet/menu is editing. */
  draft: CommittedSearch | null;
  pendingMapBounds: MapBoundsBox | null;
  searchThisAreaVisible: boolean;
  /** Monotonic id for in-flight listings requests. */
  requestSeq: number;
  /** Last issued listings query string (for stale-response checks). */
  lastIssuedRequestId: string | null;
};

export type SearchChip = SearchResultChip;

export type SearchAction =
  | { type: "HYDRATE_FROM_URL"; params: URLSearchParams | string; pathname?: string }
  | { type: "COMMIT"; patch: Partial<CommittedSearch> }
  | { type: "SET_VIEW"; view: SearchViewMode }
  | { type: "BEGIN_DRAFT" }
  | { type: "PATCH_DRAFT"; patch: Partial<CommittedSearch> }
  | { type: "APPLY_DRAFT" }
  | { type: "DISCARD_DRAFT" }
  | { type: "MAP_GESTURE"; bounds: MapBoundsBox }
  | { type: "SEARCH_THIS_AREA" }
  | { type: "CLEAR_MAP_AREA" }
  | { type: "REMOVE_CHIP"; chip: SearchChip }
  | { type: "CLEAR_OPTIONAL" }
  | { type: "ISSUE_REQUEST"; requestId: string }
  | { type: "ACK_RESPONSE"; seq: number; requestId: string };

export type MapBounds = MapBoundsBox;
