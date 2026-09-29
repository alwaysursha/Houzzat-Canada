import { cityMapCenter } from "@/lib/geo/regions";

/** City-level fly-to. Wide enough that a whole city is in frame. */
const CITY_ZOOM = 11;
/** Result fit must not zoom into a single rooftop. */
const RESULT_MAX_ZOOM = 13;

export type MapCenterFrame = {
  kind: "center";
  lat: number;
  lng: number;
  zoom: number;
};

export type MapBoundsFrame = {
  kind: "bounds";
  west: number;
  south: number;
  east: number;
  north: number;
  maxZoom: number;
};

export type MapFrame = MapCenterFrame | MapBoundsFrame;

export type SearchMapGeography = {
  city: string;
  community: string;
  cities: string;
  communities: string;
  q: string;
};

function cityList(raw: string): string[] {
  return raw
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Stable identity of an intentional place change. Filters like price are excluded. */
export function searchMapGeographyKey(input: SearchMapGeography): string {
  const parts = [
    input.cities,
    input.communities,
    input.city,
    input.community,
    input.q,
  ].map((part) => part.trim());
  if (parts.every((part) => !part)) return "";
  return parts.join("\u0001");
}

function frameFromCenters(
  centers: Array<{ lat: number; lng: number }>,
  maxZoom: number,
): MapFrame | null {
  if (centers.length === 0) return null;
  if (centers.length === 1) {
    const only = centers[0]!;
    return { kind: "center", lat: only.lat, lng: only.lng, zoom: maxZoom };
  }
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const center of centers) {
    west = Math.min(west, center.lng);
    south = Math.min(south, center.lat);
    east = Math.max(east, center.lng);
    north = Math.max(north, center.lat);
  }
  if (Math.abs(east - west) < 1e-5 && Math.abs(north - south) < 1e-5) {
    return { kind: "center", lat: centers[0]!.lat, lng: centers[0]!.lng, zoom: maxZoom };
  }
  return { kind: "bounds", west, south, east, north, maxZoom };
}

/**
 * Known place centers from the existing city table.
 * `q` is used only when the entire query is a known city name.
 */
export function searchMapCentroidFrame(input: SearchMapGeography): MapFrame | null {
  const named = cityList(input.cities);
  if (!named.length && input.city.trim()) named.push(input.city.trim());
  if (named.length) {
    const found = named
      .map((city) => cityMapCenter(city))
      .filter((center): center is { lat: number; lng: number } => center != null);
    if (found.length === named.length) return frameFromCenters(found, CITY_ZOOM);
    return null;
  }
  const q = input.q.trim();
  if (
    q &&
    !input.community.trim() &&
    !input.communities.trim()
  ) {
    const center = cityMapCenter(q);
    if (center) return { kind: "center", ...center, zoom: CITY_ZOOM };
  }
  return null;
}

/**
 * Listing coordinates should frame the map when the place is finer than a
 * known city centroid (neighbourhood, street, unknown free text).
 */
export function searchMapNeedsResultFit(input: SearchMapGeography): boolean {
  if (!searchMapGeographyKey(input)) return false;
  if (input.community.trim() || input.communities.trim()) return true;
  const named = cityList(input.cities);
  if (!named.length && input.city.trim()) named.push(input.city.trim());
  if (named.length) {
    const allKnown = named.every((city) => cityMapCenter(city));
    if (!allKnown) return true;
    const q = input.q.trim();
    return Boolean(q) && !cityMapCenter(q);
  }
  const q = input.q.trim();
  if (!q) return false;
  return !cityMapCenter(q);
}

export function listingResultFrame(
  points: Array<{ lat: number; lng: number }>,
): MapFrame | null {
  const valid = points.filter(
    (point) =>
      Number.isFinite(point.lat) &&
      Number.isFinite(point.lng) &&
      !(point.lat === 0 && point.lng === 0),
  );
  if (valid.length === 0) return null;
  return frameFromCenters(valid, RESULT_MAX_ZOOM);
}
