/**
 * Search Experience V2 — Stage 1 canonical search state.
 * Pure parse / serialize / query / chips / reducer. Not wired to UI yet.
 */

export type {
  CommittedSearch,
  MapBounds,
  SearchAction,
  SearchChip,
  SearchState,
} from "@/lib/listings/search-state/types";

export {
  clearOptionalCriteria,
  defaultCommittedSearch,
  initialSearchState,
} from "@/lib/listings/search-state/defaults";

export { parseSearchUrl } from "@/lib/listings/search-state/parse";
export { serializeSearchUrl } from "@/lib/listings/search-state/serialize";
export {
  buildCriteriaKey,
  buildListingsQuery,
  buildSavedSearchQuery,
} from "@/lib/listings/search-state/query";
export { buildActiveChips } from "@/lib/listings/search-state/chips";
export {
  createSearchStateFromUrl,
  emptySearchState,
  reduceSearch,
} from "@/lib/listings/search-state/reduce";
export {
  listingsRequestId,
  shouldAcceptListingsResponse,
} from "@/lib/listings/search-state/request";
export {
  committedToSearchFilters,
  committedCitiesPipe,
} from "@/lib/listings/search-state/adapters";
