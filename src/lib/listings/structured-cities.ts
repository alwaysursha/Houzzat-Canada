import { canonicalMarketCity } from "@/lib/geo/regions";

export function splitStructuredCities(raw: string): string[] {
  return raw
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Structured cities already in the URL.
 * `cities` wins over legacy `city`. This does not inspect free text.
 */
export function structuredCitiesFromSearch(
  citiesParam: string,
  city: string,
): string[] {
  const listed = splitStructuredCities(citiesParam);
  if (listed.length > 0) return listed;
  const one = city.trim();
  return one ? [one] : [];
}

function canonicalOrOriginal(city: string): string {
  return canonicalMarketCity(city) ?? city.trim();
}

/**
 * Append one recognized city. The same city with different casing is not added.
 * Existing catalog names are stored with their canonical spelling because this
 * runs on a user search, not on page load.
 * Returns null when the entry is not a whole city name.
 */
export function withStructuredCity(
  current: readonly string[],
  raw: string,
): string[] | null {
  const canonical = canonicalMarketCity(raw);
  if (!canonical) return null;
  const next: string[] = [];
  for (const city of current) {
    const name = canonicalOrOriginal(city);
    if (!name) continue;
    if (next.some((existing) => existing.toLowerCase() === name.toLowerCase())) {
      continue;
    }
    next.push(name);
  }
  if (!next.some((existing) => existing.toLowerCase() === canonical.toLowerCase())) {
    next.push(canonical);
  }
  return next;
}
