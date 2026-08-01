import { isKnownCityCentroid } from "@/lib/geo/city-centroids";

export type GeocodePrecision = "street" | "area" | "city";

export type GeocodeResult = {
  lat: number;
  lng: number;
  source: "photon" | "google-places" | "google-geocoding" | "nominatim";
  precision: GeocodePrecision;
};

const cache = new Map<string, GeocodeResult | null>();

/** Places TextText free tier is tiny (~100/day) — skip once we know it's exhausted. */
let googlePlacesExhaustedUntil = 0;
/** Classic Geocoding API often has separate quota from Places SearchText. */
let googleGeocodingExhaustedUntil = 0;
/** Skip Photon after consecutive outages (Komoot is occasionally unreachable). */
let photonSkipUntil = 0;
let photonConsecutiveFailures = 0;

/** Nominatim requires ≤1 req/sec — shared across the process. */
let nominatimNextAllowedAt = 0;
let nominatimChain: Promise<void> = Promise.resolve();

async function fetchJson(
  url: string,
  init?: RequestInit,
  timeoutMs = 6_000,
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function notePhotonFailure() {
  photonConsecutiveFailures += 1;
  if (photonConsecutiveFailures >= 3) {
    photonSkipUntil = Date.now() + 30 * 60 * 1000;
    photonConsecutiveFailures = 0;
  }
}

function notePhotonSuccess() {
  photonConsecutiveFailures = 0;
}

async function withNominatimRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  const run = nominatimChain.then(async () => {
    const waitMs = Math.max(0, nominatimNextAllowedAt - Date.now());
    if (waitMs > 0) {
      await new Promise((r) => setTimeout(r, waitMs));
    }
    nominatimNextAllowedAt = Date.now() + 1100;
    return fn();
  });
  // Keep the chain alive even if one call fails.
  nominatimChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

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

function extractStreetNumber(text: string): string | null {
  const match = text.match(/\b(\d{1,6}[A-Za-z]?)\b/);
  return match?.[1] ?? null;
}

function extractStreetName(query: string): string | null {
  const streetPart = query.split(",")[0]?.trim() ?? query;
  const withoutNum = streetPart
    .replace(/^\d+\S*\s+/, "")
    .replace(/\b(Ave|Avenue|St|Street|Rd|Road|Dr|Drive|Blvd|Cres|Crescent|Way|Lane|Ct|Court|Pl|Place|Ter|Terrace)\.?$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return withoutNum.length >= 4 ? withoutNum : null;
}

/**
 * Street-level: prefer matching civic number. If OSM only has the road (common
 * in Canada), accept a same-named street hit in-city rather than leaving the
 * pin on a Toronto/GTA centroid hundreds of km away.
 */
function isStreetLevelHit(
  query: string,
  lat: number,
  lng: number,
  formattedAddress?: string,
  houseNumber?: string | null,
): boolean {
  if (isKnownCityCentroid(lat, lng)) return false;

  const queryNum = extractStreetNumber(query);
  if (!queryNum) {
    return Boolean(formattedAddress && /\d/.test(formattedAddress));
  }

  if (houseNumber && houseNumber.replace(/^0+/, "") === queryNum.replace(/^0+/, "")) {
    return true;
  }

  if (formattedAddress && new RegExp(`\\b${queryNum}\\b`, "i").test(formattedAddress)) {
    return true;
  }

  // Road-only OSM hit: street name must appear in the result.
  const streetName = extractStreetName(query);
  if (streetName && formattedAddress) {
    const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (compact(formattedAddress).includes(compact(streetName))) {
      return true;
    }
  }

  return false;
}

/**
 * Photon (Komoot) — OSM-derived, best bulk street geocoder without a paid quota.
 * Prefer this over Google Places SearchText (often capped at ~100/day).
 */
async function geocodePhoton(query: string): Promise<GeocodeResult | null> {
  if (Date.now() < photonSkipUntil) return null;

  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "1");
  url.searchParams.set("lang", "en");
  // Bias to southern Ontario / eastern Canada box.
  url.searchParams.set("bbox", "-95,41,-52,57");

  const res = await fetchJson(
    url.toString(),
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "HouzzatMLSSync/1.0 (houzzat.com; listing geocode)",
      },
    },
    4_000,
  );
  if (!res?.ok) {
    notePhotonFailure();
    return null;
  }

  const json = (await res.json()) as {
    features?: Array<{
      geometry?: { coordinates?: [number, number] };
      properties?: {
        housenumber?: string;
        street?: string;
        name?: string;
        city?: string;
        state?: string;
        countrycode?: string;
        type?: string;
        osm_key?: string;
        osm_value?: string;
      };
    }>;
  };
  const feature = json.features?.[0];
  const coords = feature?.geometry?.coordinates;
  const props = feature?.properties;
  if (!coords || coords.length < 2) {
    notePhotonFailure();
    return null;
  }

  const [lng, lat] = coords;
  if (!isValidCoord(lat, lng)) {
    notePhotonFailure();
    return null;
  }
  if (props?.countrycode && props.countrycode.toUpperCase() !== "CA") {
    return null;
  }

  const formatted = [
    props?.housenumber,
    props?.street || props?.name,
    props?.city,
    props?.state,
  ]
    .filter(Boolean)
    .join(" ");

  const precision: GeocodePrecision = isStreetLevelHit(
    query,
    lat,
    lng,
    formatted,
    props?.housenumber ?? null,
  )
    ? "street"
    : "city";

  notePhotonSuccess();
  return { lat, lng, source: "photon", precision };
}

async function geocodeGoogleGeocoding(
  query: string,
): Promise<GeocodeResult | null> {
  if (Date.now() < googleGeocodingExhaustedUntil) return null;

  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!key) return null;

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", query);
  url.searchParams.set("key", key);
  url.searchParams.set("region", "ca");
  url.searchParams.set("components", "country:CA");
  url.searchParams.set("language", "en");

  const res = await fetchJson(url.toString());
  if (!res) return null;
  if (res.status === 429) {
    googleGeocodingExhaustedUntil = Date.now() + 6 * 60 * 60 * 1000;
    return null;
  }
  if (!res.ok) return null;

  const json = (await res.json()) as {
    status?: string;
    results?: Array<{
      formatted_address?: string;
      geometry?: {
        location?: { lat?: number; lng?: number };
        location_type?: string;
      };
      address_components?: Array<{ long_name?: string; types?: string[] }>;
    }>;
  };

  if (json.status === "OVER_QUERY_LIMIT" || json.status === "REQUEST_DENIED") {
    googleGeocodingExhaustedUntil = Date.now() + 6 * 60 * 60 * 1000;
    return null;
  }
  if (json.status !== "OK" || !json.results?.[0]) return null;

  const row = json.results[0];
  const lat = row.geometry?.location?.lat;
  const lng = row.geometry?.location?.lng;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!isValidCoord(lat, lng)) return null;

  const houseNumber =
    row.address_components?.find((c) => c.types?.includes("street_number"))
      ?.long_name ?? null;
  const locationType = row.geometry?.location_type ?? "";
  const rooftopish =
    locationType === "ROOFTOP" || locationType === "RANGE_INTERPOLATED";

  const precision: GeocodePrecision =
    rooftopish ||
    isStreetLevelHit(query, lat, lng, row.formatted_address, houseNumber)
      ? "street"
      : "city";

  return { lat, lng, source: "google-geocoding", precision };
}

async function geocodeGooglePlaces(
  query: string,
): Promise<GeocodeResult | null> {
  if (Date.now() < googlePlacesExhaustedUntil) return null;

  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!key) return null;

  const res = await fetchJson(
    "https://places.googleapis.com/v1/places:searchText",
    {
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
    },
  );

  if (!res) return null;
  if (res.status === 429) {
    // Skip Google for the rest of this process (daily free tier is tiny).
    googlePlacesExhaustedUntil = Date.now() + 6 * 60 * 60 * 1000;
    return null;
  }
  if (!res.ok) return null;

  const json = (await res.json()) as {
    places?: Array<{
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
    }>;
  };
  const place = json.places?.[0];
  const loc = place?.location;
  if (
    typeof loc?.latitude !== "number" ||
    typeof loc?.longitude !== "number"
  ) {
    return null;
  }
  if (!isValidCoord(loc.latitude, loc.longitude)) return null;

  const precision: GeocodePrecision = isStreetLevelHit(
    query,
    loc.latitude,
    loc.longitude,
    place?.formattedAddress,
  )
    ? "street"
    : "city";

  return {
    lat: loc.latitude,
    lng: loc.longitude,
    source: "google-places",
    precision,
  };
}

async function geocodeNominatim(query: string): Promise<GeocodeResult | null> {
  return withNominatimRateLimit(async () => {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "ca");
    url.searchParams.set("addressdetails", "1");

    const res = await fetchJson(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "HouzzatMLSSync/1.0 (houzzat.com; listing geocode)",
      },
    });
    if (!res?.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("json")) return null;

    const json = (await res.json()) as Array<{
      lat?: string;
      lon?: string;
      display_name?: string;
      class?: string;
      type?: string;
      address?: { house_number?: string };
    }>;
    const row = json[0];
    if (!row?.lat || !row?.lon) return null;
    const lat = Number(row.lat);
    const lng = Number(row.lon);
    if (!isValidCoord(lat, lng)) return null;

    const precision: GeocodePrecision = isStreetLevelHit(
      query,
      lat,
      lng,
      row.display_name,
      row.address?.house_number ?? null,
    )
      ? "street"
      : "city";

    return { lat, lng, source: "nominatim", precision };
  });
}

/**
 * Resolve a Canadian address to lat/lng (street-accurate by default).
 * Order: Photon → Google Geocoding → Google Places → Nominatim (rate-limited).
 */
export async function geocodeAddress(
  query: string,
  opts?: { streetOnly?: boolean },
): Promise<GeocodeResult | null> {
  const streetOnly = opts?.streetOnly !== false;
  const trimmed = query.replace(/\s+/g, " ").trim();
  if (trimmed.length < 8) return null;

  const cacheKey = `${streetOnly ? "s:" : "a:"}${normalizeQuery(trimmed)}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;

  const variants = buildQueryVariants(trimmed);
  let result: GeocodeResult | null = null;

  const accept = (hit: GeocodeResult | null) => {
    if (!hit) return null;
    if (streetOnly && hit.precision !== "street") return null;
    return hit;
  };

  // Photon first when healthy (fast + bulk-friendly).
  if (Date.now() >= photonSkipUntil) {
    for (const variant of variants.slice(0, 2)) {
      try {
        result = accept(await geocodePhoton(variant));
      } catch {
        result = null;
        notePhotonFailure();
      }
      if (result) break;
    }
  }

  if (!result && process.env.GEOCODE_SKIP_GOOGLE !== "1") {
    try {
      result = accept(await geocodeGoogleGeocoding(variants[0]!));
    } catch {
      result = null;
    }
  }

  if (!result && process.env.GEOCODE_SKIP_GOOGLE !== "1") {
    try {
      result = accept(await geocodeGooglePlaces(variants[0]!));
    } catch {
      result = null;
    }
  }

  if (!result && process.env.GEOCODE_SKIP_NOMINATIM !== "1") {
    try {
      result = accept(await geocodeNominatim(variants[0]!));
    } catch {
      result = null;
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

  if (withoutPostal && withoutPostal !== query) out.push(withoutPostal);
  if (street && postal) {
    out.push(`${street}, ON ${postal}`);
  }
  const cleanedStreet = street
    ?.replace(/\b\d{1,4}(\s*,\s*\d{1,4})+\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (cleanedStreet && cleanedStreet !== street) {
    out.push(
      [
        cleanedStreet,
        query.includes(",") ? query.split(",").slice(1).join(",").trim() : null,
      ]
        .filter(Boolean)
        .join(", "),
    );
  }
  return [
    ...new Set(out.map((q) => q.replace(/\s+/g, " ").trim()).filter(Boolean)),
  ];
}

/** Spelled street names Photon often misses ("Forty-First" → "41st"). */
function normalizeSpelledOrdinals(street: string): string {
  const ones: Record<string, number> = {
    first: 1,
    second: 2,
    third: 3,
    fourth: 4,
    fifth: 5,
    sixth: 6,
    seventh: 7,
    eighth: 8,
    ninth: 9,
    tenth: 10,
    eleventh: 11,
    twelfth: 12,
    thirteenth: 13,
    fourteenth: 14,
    fifteenth: 15,
    sixteenth: 16,
    seventeenth: 17,
    eighteenth: 18,
    nineteenth: 19,
    twentieth: 20,
    thirtieth: 30,
    fortieth: 40,
    fiftieth: 50,
  };
  const tens: Record<string, number> = {
    twenty: 20,
    thirty: 30,
    forty: 40,
    fifty: 50,
    sixty: 60,
    seventy: 70,
    eighty: 80,
    ninety: 90,
  };

  function toOrdinal(n: number): string {
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
    switch (n % 10) {
      case 1:
        return `${n}st`;
      case 2:
        return `${n}nd`;
      case 3:
        return `${n}rd`;
      default:
        return `${n}th`;
    }
  }

  return street.replace(
    /\b(?:(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[-\s])?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|thirtieth|fortieth|fiftieth)\b/gi,
    (full, tenWord: string | undefined, oneWord: string) => {
      const oneKey = oneWord.toLowerCase();
      const tenKey = tenWord?.toLowerCase();
      let n = ones[oneKey];
      if (n == null) return full;
      if (tenKey && tens[tenKey] != null && n < 10) {
        n = tens[tenKey]! + n;
      }
      return toOrdinal(n);
    },
  );
}

/** Strip condo/apt tokens that confuse street geocoders. */
function cleanStreetLine(addressLine: string): string {
  let street = addressLine.trim();
  street = street
    .replace(/\s+#\w+\b/g, "")
    .replace(/\b(Unit|Apt|Apartment|Suite|Ste\.?)\s*[\w-]+\b/gi, "")
    .replace(/\b(Main|Upper|Lower|Basement|N\/A|Laneway House|Studio|Floor)\b/gi, "")
    .replace(/\bN\/A\b/gi, "")
    .replace(/\b\d+(st|nd|rd|th)\s+Floor\b/gi, "")
    .replace(/\bOPT\s*[A-Z0-9]+\b/gi, "")
    // "2 Sonic Way 2805" / "55 East Liberty Street 1804" → drop trailing unit
    .replace(/^(\d+\S*\s+.+?)\s+\d{2,5}[A-Za-z]?$/i, "$1")
    // "1B - 769 Southdale Road E" → "769 Southdale Road E"
    .replace(/^[A-Z0-9]{1,4}\s*[-–]\s*(?=\d)/i, "")
    // "210, 211, 212 & 213, Mississauga…" unit lists on commercial
    .replace(/\b\d{1,4}(\s*,\s*\d{1,4})+(\s*&\s*\d{1,4})?\b/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,.-]+|[\s,.-]+$/g, "")
    .trim();
  return normalizeSpelledOrdinals(street);
}

export function buildListingGeocodeQuery(input: {
  addressLine: string;
  unitNumber?: string | null;
  city: string;
  province?: string | null;
  postalCode?: string | null;
}): string {
  let street = cleanStreetLine(input.addressLine);

  const postal = input.postalCode?.trim() || null;
  const province = (input.province ?? "ON").trim() || "ON";

  const city = input.city.trim();
  const cityLooksMessy =
    city.length > 40 ||
    city.includes(" - ") ||
    /\/|,/.test(city) ||
    /\s+[A-Z]?\d+[A-Z0-9]*$/i.test(city);

  const cityForQuery = (
    cityLooksMessy
      ? city.replace(/\s+[A-Z]?\d+[A-Z0-9]*$/i, "").trim() || city
      : city
  ).replace(/\s+(North|South|East|West|Central)$/i, "").trim() || city;

  if (postal) {
    const streetOnly = street.includes(",")
      ? street.split(",")[0]!.trim()
      : street;
    if (cityLooksMessy) {
      return `${streetOnly}, ${cityForQuery}, ${province} ${postal}`;
    }
  }

  const alreadyFull =
    /,/.test(street) &&
    (/\bON\b/i.test(street) ||
      /\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/i.test(street) ||
      street.toLowerCase().includes(cityForQuery.toLowerCase()));

  if (alreadyFull && !cityLooksMessy) return street;

  const parts = [
    street.includes(",") ? street.split(",")[0]!.trim() : street,
    cityForQuery,
    province,
    postal,
  ].filter(Boolean);
  return parts.join(", ");
}

/**
 * Street-accurate geocode only. City/neighbourhood centroids are not accepted —
 * callers should keep the approximate pin until a street hit succeeds.
 */
export async function geocodeListing(input: {
  addressLine: string;
  unitNumber?: string | null;
  city: string;
  community?: string | null;
  province?: string | null;
  postalCode?: string | null;
}): Promise<GeocodeResult | null> {
  const primary = buildListingGeocodeQuery(input);
  const streetHit = await geocodeAddress(primary, { streetOnly: true });
  if (streetHit) return streetHit;

  const streetOnly = cleanStreetLine(
    input.addressLine.split(",")[0]?.trim() ?? input.addressLine,
  );
  if (streetOnly && streetOnly !== primary.split(",")[0]?.trim()) {
    const alt = buildListingGeocodeQuery({
      ...input,
      addressLine: streetOnly,
      unitNumber: null,
    });
    if (alt !== primary) {
      const altHit = await geocodeAddress(alt, { streetOnly: true });
      if (altHit) return altHit;
    }
  }

  return null;
}
