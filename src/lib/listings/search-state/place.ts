import {
  searchPlaceKey,
  shouldResetMapAreaForPlaceChange,
} from "@/lib/listings/map-area-search";
import type { CommittedSearch } from "@/lib/listings/search-state/types";

export function committedPlaceKey(committed: CommittedSearch): string {
  return searchPlaceKey({
    city: "",
    community: committed.community,
    cities: committed.cities.join("|"),
    communities: committed.communities.join("|"),
  });
}

/**
 * When structured place changes to a new non-empty place, drop map area so
 * Search This Area is not AND'd with the new city (live Experience rule).
 */
export function withPlaceAwareMapArea(
  prev: CommittedSearch,
  next: CommittedSearch,
): CommittedSearch {
  if (
    shouldResetMapAreaForPlaceChange(
      committedPlaceKey(prev),
      committedPlaceKey(next),
    )
  ) {
    return { ...next, mapArea: null };
  }
  return next;
}
