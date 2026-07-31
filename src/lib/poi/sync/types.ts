import type { PoiType, Prisma } from "@prisma/client";

export type SyncPoi = {
  source: string;
  sourceId: string;
  type: PoiType;
  name: string;
  address?: string | null;
  city?: string | null;
  lat: number;
  lng: number;
  meta?: Prisma.InputJsonValue;
};

/** Rough GTA + nearby 905 coverage. */
export const GTA_BBOX = {
  south: 43.35,
  west: -80.05,
  north: 44.05,
  east: -78.85,
} as const;

/** Toronto core — used to prefer municipal open data over OSM duplicates. */
export const TORONTO_BBOX = {
  south: 43.58,
  west: -79.64,
  north: 43.86,
  east: -79.11,
} as const;

export function inBbox(
  lat: number,
  lng: number,
  box: { south: number; west: number; north: number; east: number },
) {
  return (
    lat >= box.south &&
    lat <= box.north &&
    lng >= box.west &&
    lng <= box.east
  );
}

export const POI_USER_AGENT =
  "HouzzatPOI/1.0 (+https://houzzat.com; amenities sync; contact via site)";
