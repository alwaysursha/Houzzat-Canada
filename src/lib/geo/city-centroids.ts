/** Shared GTA / Ontario city centroids used as temporary map-pin fallbacks. */

export type CityCentroid = { lat: number; lng: number };

export const CITY_CENTROIDS: Record<string, CityCentroid> = {
  toronto: { lat: 43.6532, lng: -79.3832 },
  mississauga: { lat: 43.589, lng: -79.6441 },
  brampton: { lat: 43.7315, lng: -79.7624 },
  markham: { lat: 43.8561, lng: -79.337 },
  vaughan: { lat: 43.8361, lng: -79.4983 },
  oakville: { lat: 43.4675, lng: -79.6877 },
  burlington: { lat: 43.3255, lng: -79.799 },
  "richmond hill": { lat: 43.8828, lng: -79.4403 },
  pickering: { lat: 43.8384, lng: -79.0868 },
  ajax: { lat: 43.8509, lng: -79.0204 },
  whitby: { lat: 43.8971, lng: -78.9429 },
  oshawa: { lat: 43.8971, lng: -78.8658 },
  milton: { lat: 43.5183, lng: -79.8774 },
  caledon: { lat: 43.8667, lng: -79.8667 },
  newmarket: { lat: 44.0592, lng: -79.4613 },
  aurora: { lat: 44.0065, lng: -79.4504 },
  "king city": { lat: 43.9289, lng: -79.5281 },
  hamilton: { lat: 43.2557, lng: -79.8711 },
  kitchener: { lat: 43.4516, lng: -80.4925 },
  waterloo: { lat: 43.4643, lng: -80.5204 },
  cambridge: { lat: 43.3616, lng: -80.3144 },
  ottawa: { lat: 45.4215, lng: -75.6972 },
};

/** Last-resort pin when city string can't be matched. */
export const DEFAULT_GTA_CENTROID: CityCentroid = {
  lat: 43.7,
  lng: -79.4,
};

const CENTROID_EPS = 1e-5;

/** True when lat/lng match a known city centroid (or the default GTA pin). */
export function isKnownCityCentroid(lat: number, lng: number): boolean {
  if (
    Math.abs(lat - DEFAULT_GTA_CENTROID.lat) < CENTROID_EPS &&
    Math.abs(lng - DEFAULT_GTA_CENTROID.lng) < CENTROID_EPS
  ) {
    return true;
  }
  for (const c of Object.values(CITY_CENTROIDS)) {
    if (
      Math.abs(lat - c.lat) < CENTROID_EPS &&
      Math.abs(lng - c.lng) < CENTROID_EPS
    ) {
      return true;
    }
  }
  return false;
}

/** PropTx cities look like "Toronto C15" / "Mississauga W20" — match the base name. */
export function lookupCityCentroid(
  cityRaw: string,
): CityCentroid | null {
  const city = cityRaw.toLowerCase().trim();
  if (!city) return null;

  const direct = CITY_CENTROIDS[city];
  if (direct) return direct;

  const withoutAreaCode = city.replace(/\s+[a-z]?\d+[a-z0-9]*$/i, "").trim();
  if (withoutAreaCode && CITY_CENTROIDS[withoutAreaCode]) {
    return CITY_CENTROIDS[withoutAreaCode]!;
  }

  const keys = Object.keys(CITY_CENTROIDS).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (city === key || city.startsWith(`${key} `)) {
      return CITY_CENTROIDS[key]!;
    }
  }
  return null;
}
