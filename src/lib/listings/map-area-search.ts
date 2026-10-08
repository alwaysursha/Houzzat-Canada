/**
 * Explicit map-area search helpers.
 * Pan/zoom never clear place filters; bounds apply only via Search This Area
 * or draw-polygon.
 */

export type MapBoundsBox = {
  west: number;
  south: number;
  east: number;
  north: number;
};

const BOUNDS_EPS = 0.0008;

export function mapBoundsNearlyEqual(
  a: MapBoundsBox | null | undefined,
  b: MapBoundsBox,
  epsilon = BOUNDS_EPS,
): boolean {
  if (!a) return false;
  return (
    Math.abs(a.west - b.west) < epsilon &&
    Math.abs(a.south - b.south) < epsilon &&
    Math.abs(a.east - b.east) < epsilon &&
    Math.abs(a.north - b.north) < epsilon
  );
}

/**
 * After a user map gesture: show Search This Area unless the viewport still
 * matches the bounds already applied to the search request.
 * Does not mutate city / community / cities.
 */
export function mapGestureSearchThisAreaState(input: {
  appliedBounds: MapBoundsBox | null;
  nextBounds: MapBoundsBox;
}): {
  pendingMapBounds: MapBoundsBox | null;
  searchThisAreaVisible: boolean;
} {
  if (mapBoundsNearlyEqual(input.appliedBounds, input.nextBounds)) {
    return { pendingMapBounds: null, searchThisAreaVisible: false };
  }
  return {
    pendingMapBounds: input.nextBounds,
    searchThisAreaVisible: true,
  };
}

/** Bounds included in the listings request (polygon wins over Search This Area). */
export function listingSearchBoundsBox(input: {
  polygonBox: MapBoundsBox | null;
  appliedBounds: MapBoundsBox | null;
}): MapBoundsBox | null {
  return input.polygonBox ?? input.appliedBounds;
}

/** Stable key for structured place criteria (not free-text q). */
export function searchPlaceKey(input: {
  city: string;
  community: string;
  cities: string;
  communities: string;
}): string {
  return [input.cities, input.city, input.communities, input.community]
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\u0001");
}

/**
 * When the user changes an active place filter, drop viewport bounds so a
 * prior Search This Area is not AND'd with the new city.
 */
export function shouldResetMapAreaForPlaceChange(
  prevPlaceKey: string,
  nextPlaceKey: string,
): boolean {
  if (!nextPlaceKey) return false;
  return prevPlaceKey !== nextPlaceKey;
}

/** Write place + optional bounds onto listing search params (shared contract). */
export function appendPlaceAndBoundsParams(
  params: URLSearchParams,
  input: {
    citiesPipe: string;
    city: string;
    communitiesPipe: string;
    community: string;
    bounds: MapBoundsBox | null;
  },
): void {
  if (input.citiesPipe.trim()) {
    params.set("cities", input.citiesPipe.trim());
  } else if (input.city.trim()) {
    params.set("city", input.city.trim());
  }
  if (input.communitiesPipe.trim()) {
    params.set("communities", input.communitiesPipe.trim());
  } else if (input.community.trim()) {
    params.set("community", input.community.trim());
  }
  if (input.bounds) {
    params.set("west", String(input.bounds.west));
    params.set("south", String(input.bounds.south));
    params.set("east", String(input.bounds.east));
    params.set("north", String(input.bounds.north));
  }
}
