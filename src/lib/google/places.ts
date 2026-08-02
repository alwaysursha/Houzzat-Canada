import { assertGoogleMapsBillingEnabled } from "@/lib/google/billing-guard";

export type GooglePlaceSuggestion = {
  type: "place";
  placeId: string;
  label: string;
  subtitle?: string;
  city?: string;
  /** Neighbourhood / sublocality when Google provides it. */
  community?: string | null;
  province?: string;
  postalCode?: string | null;
  lat?: number;
  lng?: number;
};

type AutocompletePrediction = {
  placePrediction?: {
    placeId?: string;
    text?: { text?: string };
    structuredFormat?: {
      mainText?: { text?: string };
      secondaryText?: { text?: string };
    };
  };
};

type PlaceDetailsResponse = {
  id?: string;
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  addressComponents?: Array<{
    longText?: string;
    shortText?: string;
    types?: string[];
  }>;
};

function getApiKey() {
  assertGoogleMapsBillingEnabled("Places");
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!key) {
    throw new Error("GOOGLE_MAPS_API_KEY is not configured");
  }
  return key;
}

function component(
  components: PlaceDetailsResponse["addressComponents"],
  type: string,
  preferShort = false,
) {
  const match = components?.find((c) => c.types?.includes(type));
  if (!match) return undefined;
  return preferShort
    ? (match.shortText ?? match.longText)
    : (match.longText ?? match.shortText);
}

/** Autocomplete (New) — Canada / GTA-biased address suggestions. */
export async function googlePlacesAutocomplete(
  input: string,
  options?: { sessionToken?: string },
): Promise<GooglePlaceSuggestion[]> {
  const q = input.trim();
  if (q.length < 2) return [];

  const res = await fetch(
    "https://places.googleapis.com/v1/places:autocomplete",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": getApiKey(),
        "X-Goog-FieldMask":
          "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat",
      },
      body: JSON.stringify({
        input: q,
        includedRegionCodes: ["ca"],
        languageCode: "en-CA",
        regionCode: "ca",
        includedPrimaryTypes: [
          "street_address",
          "premise",
          "subpremise",
          "route",
        ],
        locationBias: {
          circle: {
            center: { latitude: 43.7, longitude: -79.4 },
            radius: 50000.0,
          },
        },
        ...(options?.sessionToken
          ? { sessionToken: options.sessionToken }
          : {}),
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Places autocomplete failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { suggestions?: AutocompletePrediction[] };
  const out: GooglePlaceSuggestion[] = [];

  for (const suggestion of data.suggestions ?? []) {
    const pred = suggestion.placePrediction;
    if (!pred?.placeId) continue;
    const label =
      pred.structuredFormat?.mainText?.text ?? pred.text?.text ?? "";
    if (!label) continue;
    out.push({
      type: "place",
      placeId: pred.placeId,
      label,
      subtitle: pred.structuredFormat?.secondaryText?.text,
    });
  }

  return out;
}

/** Place Details (New) — resolve city / coords after the user picks a suggestion. */
export async function googlePlaceDetails(
  placeId: string,
  options?: { sessionToken?: string },
): Promise<GooglePlaceSuggestion | null> {
  const id = placeId.trim();
  if (!id) return null;

  const url = new URL(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`,
  );
  if (options?.sessionToken) {
    url.searchParams.set("sessionToken", options.sessionToken);
  }

  const res = await fetch(url, {
    headers: {
      "X-Goog-Api-Key": getApiKey(),
      "X-Goog-FieldMask":
        "id,formattedAddress,addressComponents,location,displayName",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Place details failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as PlaceDetailsResponse;
  const streetNumber = component(data.addressComponents, "street_number");
  const route = component(data.addressComponents, "route");
  const subpremise = component(data.addressComponents, "subpremise");
  const street = [streetNumber, route].filter(Boolean).join(" ");
  const label = subpremise
    ? `${street} Unit ${subpremise}`
    : street || data.formattedAddress || "Address";

  const city =
    component(data.addressComponents, "locality") ??
    component(data.addressComponents, "postal_town") ??
    component(data.addressComponents, "administrative_area_level_3");

  const community =
    component(data.addressComponents, "neighborhood") ??
    component(data.addressComponents, "sublocality") ??
    component(data.addressComponents, "sublocality_level_1") ??
    null;

  const province = component(
    data.addressComponents,
    "administrative_area_level_1",
    true,
  );
  const postalCode = component(data.addressComponents, "postal_code") ?? null;

  return {
    type: "place",
    placeId: id,
    label,
    subtitle: data.formattedAddress,
    city,
    community,
    province: province ?? "ON",
    postalCode,
    lat: data.location?.latitude,
    lng: data.location?.longitude,
  };
}
