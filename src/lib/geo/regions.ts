import { haversineKm } from "@/lib/geo/distance";

/** Fallback when location is denied / unknown. */
export const DEFAULT_HOMEPAGE_CITIES = [
  "Mississauga",
  "Brampton",
  "Milton",
  "Oakville",
  "Burlington",
  "Kitchener",
  "Cambridge",
] as const;

export type MarketRegionId =
  | "peel"
  | "halton"
  | "kw"
  | "toronto"
  | "york"
  | "durham"
  | "hamilton"
  | "niagara"
  | "london"
  | "default";

export type MarketRegion = {
  id: MarketRegionId;
  label: string;
  cities: string[];
};

/**
 * Browse-from city → regional inventory.
 * Milton → Halton, Kitchener → KW, etc.
 */
export const MARKET_REGIONS: Record<
  Exclude<MarketRegionId, "default">,
  MarketRegion
> = {
  peel: {
    id: "peel",
    label: "Peel",
    cities: ["Mississauga", "Brampton", "Caledon"],
  },
  halton: {
    id: "halton",
    label: "Halton",
    cities: ["Oakville", "Burlington", "Milton", "Halton Hills"],
  },
  kw: {
    id: "kw",
    label: "Kitchener–Waterloo",
    cities: ["Kitchener", "Waterloo", "Cambridge"],
  },
  toronto: {
    id: "toronto",
    label: "Toronto",
    cities: ["Toronto"],
  },
  york: {
    id: "york",
    label: "York Region",
    cities: [
      "Vaughan",
      "Markham",
      "Richmond Hill",
      "Newmarket",
      "Aurora",
      "King",
      "Whitchurch-Stouffville",
      "East Gwillimbury",
      "Georgina",
      "Bradford West Gwillimbury",
    ],
  },
  durham: {
    id: "durham",
    label: "Durham",
    cities: [
      "Ajax",
      "Pickering",
      "Whitby",
      "Oshawa",
      "Clarington",
      "Uxbridge",
      "Scugog",
    ],
  },
  hamilton: {
    id: "hamilton",
    label: "Hamilton",
    cities: ["Hamilton", "Grimsby"],
  },
  niagara: {
    id: "niagara",
    label: "Niagara",
    cities: [
      "Niagara Falls",
      "St. Catharines",
      "St Catharines",
      "Niagara-on-the-Lake",
      "Welland",
      "Thorold",
      "Pelham",
      "Lincoln",
      "Fort Erie",
    ],
  },
  london: {
    id: "london",
    label: "London area",
    cities: ["London", "St. Thomas", "St Thomas", "Strathroy-Caradoc"],
  },
};

const CITY_TO_REGION: Record<string, Exclude<MarketRegionId, "default">> = {
  mississauga: "peel",
  brampton: "peel",
  caledon: "peel",
  oakville: "halton",
  burlington: "halton",
  milton: "halton",
  "halton hills": "halton",
  kitchener: "kw",
  waterloo: "kw",
  cambridge: "kw",
  toronto: "toronto",
  vaughan: "york",
  markham: "york",
  "richmond hill": "york",
  newmarket: "york",
  aurora: "york",
  king: "york",
  "whitchurch-stouffville": "york",
  "east gwillimbury": "york",
  georgina: "york",
  "bradford west gwillimbury": "york",
  ajax: "durham",
  pickering: "durham",
  whitby: "durham",
  oshawa: "durham",
  clarington: "durham",
  uxbridge: "durham",
  scugog: "durham",
  hamilton: "hamilton",
  grimsby: "hamilton",
  "niagara falls": "niagara",
  "st catharines": "niagara",
  "st. catharines": "niagara",
  "niagara-on-the-lake": "niagara",
  "niagara on the lake": "niagara",
  welland: "niagara",
  thorold: "niagara",
  pelham: "niagara",
  lincoln: "niagara",
  "fort erie": "niagara",
  london: "london",
  "st thomas": "london",
  "st. thomas": "london",
  "strathroy-caradoc": "london",
};

/** Approx city centers for reverse “where am I browsing from?” */
const CITY_CENTROIDS: Array<{ city: string; lat: number; lng: number }> = [
  { city: "Mississauga", lat: 43.589, lng: -79.644 },
  { city: "Brampton", lat: 43.7315, lng: -79.7624 },
  { city: "Caledon", lat: 43.8667, lng: -79.8667 },
  { city: "Oakville", lat: 43.4675, lng: -79.6877 },
  { city: "Burlington", lat: 43.3255, lng: -79.799 },
  { city: "Milton", lat: 43.5183, lng: -79.8774 },
  { city: "Halton Hills", lat: 43.65, lng: -79.92 },
  { city: "Kitchener", lat: 43.4516, lng: -80.4925 },
  { city: "Waterloo", lat: 43.4643, lng: -80.5204 },
  { city: "Cambridge", lat: 43.3616, lng: -80.3144 },
  { city: "Toronto", lat: 43.6532, lng: -79.3832 },
  { city: "Vaughan", lat: 43.8361, lng: -79.4983 },
  { city: "Markham", lat: 43.8561, lng: -79.337 },
  { city: "Richmond Hill", lat: 43.8828, lng: -79.4403 },
  { city: "Hamilton", lat: 43.2557, lng: -79.8711 },
  { city: "London", lat: 42.9849, lng: -81.2453 },
  { city: "Ajax", lat: 43.8509, lng: -79.0204 },
  { city: "Oshawa", lat: 43.8971, lng: -78.8658 },
  { city: "Niagara Falls", lat: 43.0896, lng: -79.0849 },
  { city: "St. Catharines", lat: 43.1594, lng: -79.2469 },
];

function normalizeCityKey(city: string): string {
  return city
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ");
}

export function resolveRegionFromCity(city: string | null | undefined): {
  region: MarketRegion;
  browseCity: string | null;
} {
  if (!city?.trim()) {
    return {
      region: {
        id: "default",
        label: "Your area",
        cities: [...DEFAULT_HOMEPAGE_CITIES],
      },
      browseCity: null,
    };
  }

  const key = normalizeCityKey(city);
  const regionId =
    CITY_TO_REGION[key] ??
    CITY_TO_REGION[key.split(" ")[0] ?? ""] ??
    null;

  if (regionId) {
    return {
      region: MARKET_REGIONS[regionId],
      browseCity: city.trim(),
    };
  }

  // Unknown city — still bias to that city alone rather than the wide default.
  return {
    region: {
      id: "default",
      label: city.trim(),
      cities: [city.trim()],
    },
    browseCity: city.trim(),
  };
}

export function resolveRegionFromCoords(
  lat: number,
  lng: number,
): { region: MarketRegion; browseCity: string } {
  let best = CITY_CENTROIDS[0]!;
  let bestKm = Number.POSITIVE_INFINITY;
  for (const row of CITY_CENTROIDS) {
    const km = haversineKm(lat, lng, row.lat, row.lng);
    if (km < bestKm) {
      bestKm = km;
      best = row;
    }
  }
  const resolved = resolveRegionFromCity(best.city);
  return {
    region: resolved.region,
    browseCity: best.city,
  };
}

export function citiesQueryParam(cities: string[]): string {
  return cities.join("|");
}

/** Prefer dotted spellings when both "St Catharines" and "St. Catharines" exist. */
function dedupeCityNames(cities: string[]): string[] {
  const byKey = new Map<string, string>();
  for (const city of cities) {
    const trimmed = city.trim();
    if (!trimmed) continue;
    const key = normalizeCityKey(trimmed);
    const existing = byKey.get(key);
    if (!existing || trimmed.length > existing.length) {
      byKey.set(key, trimmed);
    }
  }
  return [...byKey.values()];
}

/**
 * Static city chips for autocomplete / footer / personalize when no MLS
 * popularity ranking is used. Prefer region around known city or coords.
 */
export function suggestedCitiesForLocation(input?: {
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
  limit?: number;
}): string[] {
  const limit = input?.limit ?? 8;
  const lat = input?.lat;
  const lng = input?.lng;
  if (
    lat != null &&
    lng != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  ) {
    return dedupeCityNames(
      resolveRegionFromCoords(lat, lng).region.cities,
    ).slice(0, limit);
  }
  if (input?.city?.trim()) {
    return dedupeCityNames(
      resolveRegionFromCity(input.city).region.cities,
    ).slice(0, limit);
  }
  return dedupeCityNames([...DEFAULT_HOMEPAGE_CITIES]).slice(0, limit);
}

/**
 * Static Ontario market hubs for /areas and SEO indexes — no Neon inventory
 * ranking.
 */
export function staticOntarioHubCities(): string[] {
  const cities: string[] = [...DEFAULT_HOMEPAGE_CITIES];
  for (const region of Object.values(MARKET_REGIONS)) {
    cities.push(...region.cities);
  }
  return dedupeCityNames(cities).sort((a, b) => a.localeCompare(b));
}

/**
 * Greater Toronto Area for HouzzatPRO's empty-profile property feed.
 * Toronto, Peel, York, Durham, and Halton from MARKET_REGIONS.
 * London, Niagara, Hamilton, and Kitchener–Waterloo stay out of this fallback.
 */
export const GTA_MARKET_REGION_IDS = [
  "toronto",
  "peel",
  "york",
  "durham",
  "halton",
] as const satisfies ReadonlyArray<Exclude<MarketRegionId, "default">>;

export function gtaServiceCities(): string[] {
  return dedupeCityNames(
    GTA_MARKET_REGION_IDS.flatMap((id) => MARKET_REGIONS[id].cities),
  );
}

/** Map fly-to target for a city name (case-insensitive). */
export function cityMapCenter(
  city: string | null | undefined,
): { lat: number; lng: number } | null {
  if (!city?.trim()) return null;
  const key = normalizeCityKey(city);
  const hit = CITY_CENTROIDS.find((row) => normalizeCityKey(row.city) === key);
  return hit ? { lat: hit.lat, lng: hit.lng } : null;
}
