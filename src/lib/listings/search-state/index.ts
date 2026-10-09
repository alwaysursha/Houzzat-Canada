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
  rebaseDraftPreservingEdits,
  rebaseFilterDraftPreservingEdits,
} from "@/lib/listings/search-state/draft-rebase";
export {
  applyCommitPatch,
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
export {
  commitPatchFromFilters,
  type CommitFromFiltersOptions,
} from "@/lib/listings/search-state/from-filters";
export {
  committedPlaceKey,
  withPlaceAwareMapArea,
} from "@/lib/listings/search-state/place";
export {
  clearPlaceWhenCitiesEmpty,
  placeCommitFromSuggestion,
  type PlaceCommitResult,
} from "@/lib/listings/search-state/place-commit";
export { useCommittedSearch } from "@/lib/listings/search-state/use-committed-search";
export {
  decideUrlHydrate,
  type UrlSyncDecision,
} from "@/lib/listings/search-state/url-sync";
export {
  ACTIVE_SEARCH_CHANGED_EVENT,
  ACTIVE_SEARCH_MEMORY_KEY_PREFIX,
  ACTIVE_SEARCH_MEMORY_VERSION,
  activeSearchMemoryKey,
  activeSearchMemoryScope,
  clearActiveSearchMemory,
  isConsumerSearchPath,
  loadActiveSearchMemory,
  resolveActiveSearchRestoreHref,
  saveActiveSearchMemory,
  urlHasExplicitSearchCriteria,
  urlHasExplicitView,
} from "@/lib/listings/search-state/active-search-memory";
