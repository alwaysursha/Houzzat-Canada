/** Haversine distance in kilometres. */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Rough degree pad for a radius in km (GTA latitudes). */
export function boundingBox(
  lat: number,
  lng: number,
  radiusKm: number,
): { west: number; south: number; east: number; north: number } {
  const latPad = radiusKm / 111;
  const lngPad = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
  return {
    west: lng - lngPad,
    south: lat - latPad,
    east: lng + lngPad,
    north: lat + latPad,
  };
}

export function slugifyPlace(city: string, community?: string | null): string {
  const base = community ? `${city}-${community}` : city;
  return base
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
