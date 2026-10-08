import {
  mapGestureSearchThisAreaState,
} from "@/lib/listings/map-area-search";
import {
  clearOptionalCriteria,
  defaultCommittedSearch,
  initialSearchState,
} from "@/lib/listings/search-state/defaults";
import { parseSearchUrl } from "@/lib/listings/search-state/parse";
import { withPlaceAwareMapArea } from "@/lib/listings/search-state/place";
import { listingsRequestId, withIssuedRequest } from "@/lib/listings/search-state/request";
import type {
  CommittedSearch,
  SearchAction,
  SearchChip,
  SearchState,
} from "@/lib/listings/search-state/types";

function mergeCommitted(
  base: CommittedSearch,
  patch: Partial<CommittedSearch>,
): CommittedSearch {
  return {
    ...base,
    ...patch,
    cities: patch.cities ? [...patch.cities] : [...base.cities],
    communities: patch.communities
      ? [...patch.communities]
      : [...base.communities],
    propertyTypes: patch.propertyTypes
      ? [...patch.propertyTypes]
      : [...base.propertyTypes],
    statuses: patch.statuses ? [...patch.statuses] : [...base.statuses],
    mapArea:
      patch.mapArea === undefined ? base.mapArea : patch.mapArea,
  };
}

function removeChip(
  committed: CommittedSearch,
  chip: SearchChip,
): CommittedSearch {
  switch (chip.key) {
    case "transaction":
      return {
        ...committed,
        transactionType: "SALE",
        statuses: ["ACTIVE"],
        openHouseOnly: false,
      };
    case "price":
      return { ...committed, minPrice: "", maxPrice: "" };
    case "beds":
      return { ...committed, minBeds: "" };
    case "baths":
      return { ...committed, minBaths: "" };
    case "types":
      return { ...committed, propertyTypes: [] };
    case "openHouse":
      return { ...committed, openHouseOnly: false };
    case "segment":
      return { ...committed, segment: "RESIDENTIAL", propertyTypes: [] };
    case "status":
      return { ...committed, statuses: ["ACTIVE"] };
    case "place":
      return {
        ...committed,
        cities: [],
        community: "",
        communities: [],
      };
    case "city":
      return {
        ...committed,
        cities: committed.cities.filter((city) => city !== chip.city),
      };
    case "query":
      return { ...committed, q: "" };
    default: {
      const unexpected: never = chip.key;
      return unexpected;
    }
  }
}

function bumpIfQueryChanged(prev: SearchState, next: SearchState): SearchState {
  const prevId = listingsRequestId(prev.committed);
  const nextId = listingsRequestId(next.committed);
  if (prevId === nextId) return next;
  return withIssuedRequest(next, nextId);
}

/**
 * Pure search-state reducer. No I/O. UI integration is Stage 2.
 */
export function reduceSearch(
  state: SearchState,
  action: SearchAction,
): SearchState {
  switch (action.type) {
    case "HYDRATE_FROM_URL": {
      const committed = parseSearchUrl(action.params);
      const next: SearchState = {
        ...initialSearchState(committed),
        requestSeq: state.requestSeq,
      };
      return bumpIfQueryChanged(state, next);
    }
    case "COMMIT": {
      const merged = mergeCommitted(state.committed, action.patch);
      const committed = withPlaceAwareMapArea(state.committed, merged);
      return bumpIfQueryChanged(state, { ...state, committed, draft: null });
    }
    case "SET_VIEW": {
      if (state.committed.view === action.view) return state;
      const committed = { ...state.committed, view: action.view };
      // Presentation-only for criteria/saved; pin density may change request id.
      return bumpIfQueryChanged(state, { ...state, committed });
    }
    case "BEGIN_DRAFT": {
      return {
        ...state,
        draft: {
          ...state.committed,
          cities: [...state.committed.cities],
          communities: [...state.committed.communities],
          propertyTypes: [...state.committed.propertyTypes],
          statuses: [...state.committed.statuses],
          mapArea: state.committed.mapArea,
        },
      };
    }
    case "PATCH_DRAFT": {
      if (!state.draft) return state;
      return {
        ...state,
        draft: mergeCommitted(state.draft, action.patch),
      };
    }
    case "APPLY_DRAFT": {
      if (!state.draft) return state;
      const committed = withPlaceAwareMapArea(state.committed, {
        ...state.draft,
        // Apply keeps presentation view from committed chrome unless draft set it.
        view: state.draft.view,
      });
      return bumpIfQueryChanged(state, {
        ...state,
        committed,
        draft: null,
      });
    }
    case "DISCARD_DRAFT": {
      if (!state.draft) return state;
      return { ...state, draft: null };
    }
    case "MAP_GESTURE": {
      const gesture = mapGestureSearchThisAreaState({
        appliedBounds: state.committed.mapArea,
        nextBounds: action.bounds,
      });
      return {
        ...state,
        pendingMapBounds: gesture.pendingMapBounds,
        searchThisAreaVisible: gesture.searchThisAreaVisible,
      };
    }
    case "SEARCH_THIS_AREA": {
      if (!state.pendingMapBounds) return state;
      const committed = {
        ...state.committed,
        mapArea: state.pendingMapBounds,
      };
      return bumpIfQueryChanged(state, {
        ...state,
        committed,
        pendingMapBounds: null,
        searchThisAreaVisible: false,
      });
    }
    case "CLEAR_MAP_AREA": {
      if (!state.committed.mapArea && !state.pendingMapBounds) return state;
      const committed = { ...state.committed, mapArea: null };
      return bumpIfQueryChanged(state, {
        ...state,
        committed,
        pendingMapBounds: null,
        searchThisAreaVisible: false,
      });
    }
    case "REMOVE_CHIP": {
      const merged = removeChip(state.committed, action.chip);
      const committed = withPlaceAwareMapArea(state.committed, merged);
      return bumpIfQueryChanged(state, { ...state, committed, draft: null });
    }
    case "CLEAR_OPTIONAL": {
      const committed = clearOptionalCriteria(state.committed);
      return bumpIfQueryChanged(state, {
        ...state,
        committed,
        draft: null,
        pendingMapBounds: null,
        searchThisAreaVisible: false,
      });
    }
    case "ISSUE_REQUEST": {
      return withIssuedRequest(state, action.requestId);
    }
    case "ACK_RESPONSE": {
      // No state mutation on ack — callers use shouldAcceptListingsResponse.
      void action;
      return state;
    }
    default: {
      const unexpected: never = action;
      return unexpected;
    }
  }
}

export function createSearchStateFromUrl(
  input: URLSearchParams | string,
): SearchState {
  return initialSearchState(parseSearchUrl(input));
}

export function emptySearchState(): SearchState {
  return initialSearchState(defaultCommittedSearch());
}
