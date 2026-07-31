import {
  GTA_BBOX,
  inBbox,
  POI_USER_AGENT,
  TORONTO_BBOX,
  type SyncPoi,
} from "@/lib/poi/sync/types";

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

const OVERPASS_ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

type BBox = { south: number; west: number; north: number; east: number };

function bboxClause(box: BBox) {
  return `${box.south},${box.west},${box.north},${box.east}`;
}

/** Split GTA into tiles so Overpass stays under timeout. */
function gtaTiles(): BBox[] {
  const { south, west, north, east } = GTA_BBOX;
  const midLat = (south + north) / 2;
  const midLng = (west + east) / 2;
  return [
    { south, west, north: midLat, east: midLng },
    { south, west: midLng, north: midLat, east },
    { south: midLat, west, north, east: midLng },
    { south: midLat, west: midLng, north, east },
  ];
}

async function overpassQuery(query: string): Promise<OverpassElement[]> {
  let lastError: unknown;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "User-Agent": POI_USER_AGENT,
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: new URLSearchParams({ data: query }).toString(),
      });
      if (!res.ok) {
        throw new Error(`Overpass ${res.status} from ${endpoint}`);
      }
      const data = (await res.json()) as { elements?: OverpassElement[] };
      return data.elements ?? [];
    } catch (error) {
      lastError = error;
      console.warn(`[poi:osm] Overpass endpoint failed: ${endpoint}`);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("All Overpass endpoints failed");
}

function elementPoint(el: OverpassElement): { lat: number; lng: number } | null {
  if (typeof el.lat === "number" && typeof el.lon === "number") {
    return { lat: el.lat, lng: el.lon };
  }
  if (el.center) {
    return { lat: el.center.lat, lng: el.center.lon };
  }
  return null;
}

function addressFromTags(tags: Record<string, string>): string | null {
  const num = tags["addr:housenumber"];
  const street = tags["addr:street"];
  if (num && street) return `${num} ${street}`;
  return street ?? null;
}

type OsmKind = "grocery" | "school" | "park";

function queryForKind(kind: OsmKind, box: BBox): string {
  const b = bboxClause(box);
  if (kind === "grocery") {
    return `
[out:json][timeout:60];
(
  node["shop"~"supermarket|grocery|greengrocer"](${b});
  way["shop"~"supermarket|grocery|greengrocer"](${b});
  node["amenity"="marketplace"](${b});
  way["amenity"="marketplace"](${b});
);
out center tags;
`;
  }
  if (kind === "school") {
    return `
[out:json][timeout:60];
(
  node["amenity"~"school|college"](${b});
  way["amenity"~"school|college"](${b});
);
out center tags;
`;
  }
  return `
[out:json][timeout:60];
(
  node["leisure"="park"](${b});
  way["leisure"="park"](${b});
);
out center tags;
`;
}

function mapElement(el: OverpassElement, kind: OsmKind): SyncPoi | null {
  const tags = el.tags ?? {};
  const name = tags.name?.trim();
  if (!name) return null;
  const point = elementPoint(el);
  if (!point || !inBbox(point.lat, point.lng, GTA_BBOX)) return null;

  let type: SyncPoi["type"];
  if (kind === "grocery") {
    type = "GROCERY";
  } else if (kind === "school") {
    if (inBbox(point.lat, point.lng, TORONTO_BBOX)) return null;
    type = "SCHOOL";
  } else {
    if (inBbox(point.lat, point.lng, TORONTO_BBOX)) return null;
    type = "PARK";
  }

  return {
    source: "osm",
    sourceId: `${el.type}/${el.id}`,
    type,
    name,
    address: addressFromTags(tags),
    city: tags["addr:city"] ?? null,
    lat: point.lat,
    lng: point.lng,
    meta: {
      osmType: el.type,
      shop: tags.shop ?? null,
      amenity: tags.amenity ?? null,
      leisure: tags.leisure ?? null,
      operator: tags.operator ?? null,
      kind,
    },
  };
}

async function fetchKind(kind: OsmKind): Promise<SyncPoi[]> {
  const out: SyncPoi[] = [];
  const seen = new Set<string>();
  for (const tile of gtaTiles()) {
    try {
      const elements = await overpassQuery(queryForKind(kind, tile));
      for (const el of elements) {
        const poi = mapElement(el, kind);
        if (!poi || seen.has(poi.sourceId)) continue;
        seen.add(poi.sourceId);
        out.push(poi);
      }
    } catch (error) {
      console.warn(`[poi:osm] ${kind} tile failed:`, error);
    }
  }
  console.info(`[poi:osm] ${kind}: ${out.length}`);
  return out;
}

/**
 * OpenStreetMap via Overpass — grocery GTA-wide; schools/parks outside Toronto
 * (Toronto uses municipal open data).
 */
export async function fetchOsmAmenities(): Promise<SyncPoi[]> {
  const grocery = await fetchKind("grocery");
  const schools = await fetchKind("school");
  const parks = await fetchKind("park");
  const all = [...grocery, ...schools, ...parks];
  console.info(`[poi:osm] Parsed ${all.length} amenities`);
  return all;
}
