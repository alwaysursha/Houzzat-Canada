export type GeocodeResult = {
  lat: number;
  lng: number;
  source: "google-places" | "nominatim";
};

const cache = new Map<string, GeocodeResult | null>();

function normalizeQuery(query: string): string {
  return query.replace(/\s+/g, " ").trim().toLowerCase();
}

function isValidCoord(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) > 0.01 &&
    Math.abs(lng) > 0.01 &&
    lat >= 41 &&
    lat <= 57 &&
    lng >= -95 &&
    lng <= -52
  );
}

/**
 * Prefer Places Text Text (same key as autocomplete). Classic Geocoding API
 * is often disabled on restricted Maps keys.
 */
async function geocodeGooglePlaces(
  query: string,
): Promise<GeocodeResult | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!key) return null;

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "places.location,places.formattedAddress",
    },
    body: JSON.stringify({
      textQuery: query,
      regionCode: "ca",
      languageCode: "en-CA",
      maxResultCount: 1,
    }),
  });
  if (!res.ok) return null;

  const json = (await res.json()) as {
    places?: Array<{
      location?: { latitude?: number; longitude?: number };
    }>;
  };
  const loc = json.places?.[0]?.location;
  if (
    typeof loc?.latitude !== "number" ||
    typeof loc?.longitude !== "number"
  ) {
    return null;
  }
  if (!isValidCoord(loc.latitude, loc.longitude)) return null;
  return {
    lat: loc.latitude,
    lng: loc.longitude,
    source: "google-places",
  };
}

async function geocodeNominatim(query: string): Promise<GeocodeResult | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "ca");

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "HouzzatMLSSync/1.0 (houzzat.ca; listing geocode)",
    },
  });
  if (!res.ok) return null;
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) return null;

  const json = (await res.json()) as Array<{ lat?: string; lon?: string }>;
  const row = json[0];
  if (!row?.lat || !row?.lon) return null;
  const lat = Number(row.lat);
  const lng = Number(row.lon);
  if (!isValidCoord(lat, lng)) return null;
  return { lat, lng, source: "nominatim" };
}

/**
 * Resolve a Canadian address to lat/lng.
 * Uses Google Places TextText when GOOGLE_MAPS_API_KEY is set; Nominatim fallback.
 * Tries a few address variants when the first query misses (bad postal / messy city).
 */
export async function geocodeAddress(
  query: string,
): Promise<GeocodeResult | null> {
  const trimmed = query.replace(/\s+/g, " ").trim();
  if (trimmed.length < 8) return null;

  const cacheKey = normalizeQuery(trimmed);
  if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;

  const variants = buildQueryVariants(trimmed);
  let result: GeocodeResult | null = null;

  for (const variant of variants) {
    try {
      result = await geocodeGooglePlaces(variant);
    } catch {
      result = null;
    }
    if (result) break;
  }

  if (!result) {
    for (const variant of variants.slice(0, 2)) {
      try {
        result = await geocodeNominatim(variant);
      } catch {
        result = null;
      }
      if (result) break;
    }
  }

  cache.set(cacheKey, result);
  return result;
}

function buildQueryVariants(query: string): string[] {
  const out: string[] = [query];
  const postalMatch = query.match(/\b([A-Z]\d[A-Z]\s?\d[A-Z]\d)\b/i);
  const postal = postalMatch?.[1]?.toUpperCase().replace(/\s+/, " ");
  const street = query.split(",")[0]?.trim();
  const withoutPostal = query
    .replace(/\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/gi, "")
    .replace(/,\s*,/g, ",")
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*$/g, "")
    .trim();

  // Prefer dropping a bad postal while keeping city before any bare street query.
  if (withoutPostal && withoutPostal !== query) out.push(withoutPostal);
  if (street && postal) {
    out.push(`${street}, ON ${postal}`);
  }
  return [...new Set(out.map((q) => q.replace(/\s+/g, " ").trim()).filter(Boolean))];
}

export function buildListingGeocodeQuery(input: {
  addressLine: string;
  unitNumber?: string | null;
  city: string;
  province?: string | null;
  postalCode?: string | null;
}): string {
  let street = input.addressLine.trim();
  // Drop unit / floor suffixes that confuse geocoders.
  street = street
    .replace(/\s+#\w+\b/g, "")
    .replace(/\b(Main|Upper|Lower|Basement|N\/A)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  const postal = input.postalCode?.trim() || null;
  const province = (input.province ?? "ON").trim() || "ON";

  // Prefer street + postal when city looks like a long community label.
  const city = input.city.trim();
  const cityLooksMessy =
    city.length > 40 || city.includes(" - ") || /\/|,/.test(city);

  if (postal) {
    // Extract street portion before first comma when UnparsedAddress is full.
    const streetOnly = street.includes(",")
      ? street.split(",")[0]!.trim()
      : street;
    if (cityLooksMessy) {
      return `${streetOnly}, ${province} ${postal}`;
    }
  }

  const alreadyFull =
    /,/.test(street) &&
    (/\bON\b/i.test(street) ||
      /\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/i.test(street) ||
      street.toLowerCase().includes(city.toLowerCase()));

  if (alreadyFull && !cityLooksMessy) return street;

  const parts = [
    input.unitNumber && !street.toLowerCase().includes("unit")
      ? `Unit ${input.unitNumber}`
      : null,
    street.includes(",") ? street.split(",")[0]!.trim() : street,
    cityLooksMessy ? null : city,
    province,
    postal,
  ].filter(Boolean);
  return parts.join(", ");
}
