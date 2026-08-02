import type { GooglePlaceSuggestion } from "@/lib/google/places";

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    housenumber?: string;
    street?: string;
    name?: string;
    district?: string;
    city?: string;
    state?: string;
    postcode?: string;
    countrycode?: string;
    type?: string;
    osm_key?: string;
    osm_value?: string;
  };
};

const PROVINCE_SHORT: Record<string, string> = {
  ontario: "ON",
  quebec: "QC",
  "british columbia": "BC",
  alberta: "AB",
  manitoba: "MB",
  saskatchewan: "SK",
  "nova scotia": "NS",
  "new brunswick": "NB",
  "newfoundland and labrador": "NL",
  "prince edward island": "PE",
  "northwest territories": "NT",
  nunavut: "NU",
  yukon: "YT",
};

function provinceShort(state?: string) {
  if (!state) return "ON";
  const trimmed = state.trim();
  if (trimmed.length <= 3) return trimmed.toUpperCase();
  return PROVINCE_SHORT[trimmed.toLowerCase()] ?? trimmed;
}

function streetLabel(props: NonNullable<PhotonFeature["properties"]>) {
  const street = props.street || props.name;
  if (!street) return null;
  return props.housenumber ? `${props.housenumber} ${street}` : street;
}

function isAddressLike(props: NonNullable<PhotonFeature["properties"]>) {
  const type = (props.type ?? "").toLowerCase();
  if (
    type === "house" ||
    type === "street" ||
    type === "highway" ||
    type === "building"
  ) {
    return true;
  }
  if (props.housenumber && props.street) return true;
  if (props.street) return true;
  return false;
}

/**
 * Canada / GTA-biased address suggestions via Photon (OSM).
 * Used when Google Places is unavailable (billing / API permission).
 */
export async function photonAddressAutocomplete(
  input: string,
): Promise<GooglePlaceSuggestion[]> {
  const q = input.trim();
  if (q.length < 2) return [];

  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "12");
  url.searchParams.set("lang", "en");
  url.searchParams.set("countrycode", "ca");
  // Southern Ontario bias (GTA-heavy sell leads).
  url.searchParams.set("bbox", "-80.5,42.8,-78.5,44.5");
  url.searchParams.set("lat", "43.7");
  url.searchParams.set("lon", "-79.4");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "Houzzat/1.0 (houzzat.com; sell address autocomplete)",
      },
      signal: controller.signal,
    });
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) return [];

  const json = (await res.json()) as { features?: PhotonFeature[] };
  const out: GooglePlaceSuggestion[] = [];
  const seen = new Set<string>();

  for (const feature of json.features ?? []) {
    const props = feature.properties;
    const coords = feature.geometry?.coordinates;
    if (!props || !coords || coords.length < 2) continue;
    if (props.countrycode && props.countrycode.toUpperCase() !== "CA") continue;
    if (!isAddressLike(props)) continue;

    const label = streetLabel(props);
    if (!label) continue;

    const city = props.city?.trim() || undefined;
    const province = provinceShort(props.state);
    const community = props.district?.trim() || null;
    const postalCode = props.postcode?.trim() || null;
    const [lng, lat] = coords;
    const key = `${label}|${city ?? ""}|${province}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const subtitle = [city, province, postalCode].filter(Boolean).join(", ");

    out.push({
      type: "place",
      // Empty — client skips Google Place Details and uses these fields.
      placeId: "",
      label,
      subtitle: subtitle || undefined,
      city,
      community,
      province,
      postalCode,
      lat,
      lng,
    });

    if (out.length >= 7) break;
  }

  return out;
}
