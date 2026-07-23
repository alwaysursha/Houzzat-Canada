import type { PoiType } from "@prisma/client";
import { boundingBox, haversineKm } from "@/lib/geo/distance";
import { prisma } from "@/lib/prisma";

export type NearbyPoi = {
  id: string;
  type: PoiType;
  name: string;
  address: string | null;
  city: string | null;
  lat: number;
  lng: number;
  distanceKm: number;
  meta: unknown;
};

const DEFAULT_TYPES: PoiType[] = ["SCHOOL", "PARK", "TRANSIT", "GROCERY"];

export async function findNearbyPois(opts: {
  lat: number;
  lng: number;
  radiusKm?: number;
  types?: PoiType[];
  limitPerType?: number;
}): Promise<NearbyPoi[]> {
  const radiusKm = opts.radiusKm ?? 2;
  const types = opts.types?.length ? opts.types : DEFAULT_TYPES;
  const limitPerType = opts.limitPerType ?? 8;
  const box = boundingBox(opts.lat, opts.lng, radiusKm);

  const rows = await prisma.poi.findMany({
    where: {
      type: { in: types },
      lat: { gte: box.south, lte: box.north },
      lng: { gte: box.west, lte: box.east },
    },
  });

  const withDistance = rows
    .map((poi) => ({
      id: poi.id,
      type: poi.type,
      name: poi.name,
      address: poi.address,
      city: poi.city,
      lat: poi.lat,
      lng: poi.lng,
      distanceKm: haversineKm(opts.lat, opts.lng, poi.lat, poi.lng),
      meta: poi.meta,
    }))
    .filter((poi) => poi.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  const capped: NearbyPoi[] = [];
  const counts: Partial<Record<PoiType, number>> = {};
  for (const poi of withDistance) {
    const n = counts[poi.type] ?? 0;
    if (n >= limitPerType) continue;
    counts[poi.type] = n + 1;
    capped.push(poi);
  }
  return capped;
}

export function summarizePoiCounts(pois: NearbyPoi[]) {
  const counts: Record<string, number> = {};
  for (const poi of pois) {
    counts[poi.type] = (counts[poi.type] ?? 0) + 1;
  }
  return counts;
}
