/**
 * Canonical Agent service areas.
 * Stored on AgentProfile.markets. Geography comes from MARKET_REGIONS.
 * These areas are a Properties default, not an MLS authorization boundary.
 */

import {
  gtaServiceCities,
  MARKET_REGIONS,
  type MarketRegionId,
} from "@/lib/geo/regions";

export const MAX_AGENT_SERVICE_AREAS = 12;

export type ServiceAreaKind = "city" | "region";

export type ServiceAreaChoice = {
  label: string;
  kind: ServiceAreaKind;
  cities: string[];
};

type RegionChoice = ServiceAreaChoice & { kind: "region"; keys: string[] };

const REGION_CHOICES: RegionChoice[] = [
  choice("peel", "Peel Region", ["peel", "peel region"]),
  choice("halton", "Halton Region", ["halton", "halton region"]),
  choice("york", "York Region", ["york", "york region"]),
  choice("durham", "Durham Region", ["durham", "durham region"]),
  choice("niagara", "Niagara", ["niagara", "niagara region"]),
  choice("kw", "Kitchener–Waterloo", ["kitchener-waterloo", "kitchener waterloo", "kw"]),
  choice("hamilton", "Hamilton area", ["hamilton area"]),
  choice("london", "London area", ["london area"]),
];

function choice(
  id: Exclude<MarketRegionId, "default">,
  label: string,
  keys: string[],
): RegionChoice {
  return {
    label,
    kind: "region",
    cities: [...MARKET_REGIONS[id].cities],
    keys,
  };
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
}

function uniqueCities(): string[] {
  const seen = new Set<string>();
  const cities: string[] = [];
  for (const region of Object.values(MARKET_REGIONS)) {
    for (const city of region.cities) {
      const key = normalizeKey(city);
      if (seen.has(key)) continue;
      seen.add(key);
      cities.push(city);
    }
  }
  return cities.sort((a, b) => a.localeCompare(b));
}

const CITY_BY_KEY = new Map(uniqueCities().map((city) => [normalizeKey(city), city]));
const REGION_BY_KEY = new Map<string, ServiceAreaChoice>();
for (const region of REGION_CHOICES) {
  REGION_BY_KEY.set(normalizeKey(region.label), region);
  for (const key of region.keys) REGION_BY_KEY.set(normalizeKey(key), region);
}

export function serviceAreaCatalog(): ServiceAreaChoice[] {
  const cities = uniqueCities().map((label) => ({
    label,
    kind: "city" as const,
    cities: [label],
  }));
  return [
    ...REGION_CHOICES.map(({ label, kind, cities: regionCities }) => ({
      label,
      kind,
      cities: regionCities,
    })),
    ...cities,
  ];
}

/** Map free text onto a canonical city or region label. Unknown text is dropped. */
export function canonicalServiceArea(raw: string): string | null {
  const key = normalizeKey(raw);
  if (!key) return null;
  const region = REGION_BY_KEY.get(key);
  if (region) return region.label;
  return CITY_BY_KEY.get(key) ?? null;
}

export function normalizeServiceAreas(values: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const label = canonicalServiceArea(value);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
    if (out.length >= MAX_AGENT_SERVICE_AREAS) break;
  }
  return out;
}

/** Book-a-Demo stores one region/city string. Split it into canonical areas. */
export function parseProspectRegionToServiceAreas(
  raw: string | null | undefined,
): string[] {
  if (!raw?.trim()) return [];
  return normalizeServiceAreas(raw.split(/[,;\n|/]+/));
}

export function expandServiceAreasToCities(areas: readonly string[]): string[] {
  const catalog = new Map(serviceAreaCatalog().map((item) => [item.label, item]));
  const seen = new Set<string>();
  const cities: string[] = [];
  for (const area of areas) {
    const choice = catalog.get(area) ?? catalog.get(canonicalServiceArea(area) ?? "");
    const names = choice?.cities ?? [];
    for (const city of names) {
      const key = normalizeKey(city);
      if (seen.has(key)) continue;
      seen.add(key);
      cities.push(city);
    }
  }
  return cities;
}

export function feedCitiesForMarkets(markets: readonly string[]): {
  cities: string[];
  source: "agent" | "gta";
} {
  const cities = expandServiceAreasToCities(markets);
  if (cities.length === 0) {
    return { cities: gtaServiceCities(), source: "gta" };
  }
  return { cities, source: "agent" };
}

/**
 * Copy demo geography only when the agent has never saved service areas
 * and the profile is still empty.
 */
export function nextMarketsAfterProspectSeed(input: {
  markets: readonly string[];
  customized: boolean;
  prospectRegion: string | null | undefined;
}): { markets: string[]; seeded: boolean } {
  if (input.customized || input.markets.length > 0) {
    return { markets: [...input.markets], seeded: false };
  }
  const seeded = parseProspectRegionToServiceAreas(input.prospectRegion);
  if (seeded.length === 0) return { markets: [], seeded: false };
  return { markets: seeded, seeded: true };
}
