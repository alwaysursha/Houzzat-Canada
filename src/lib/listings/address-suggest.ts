import type { AutocompleteSuggestion } from "@/lib/listings/types";

/** Number + street words — e.g. "79 Grand Flats Trail Kitchener". */
export function looksLikeStreetAddress(query: string): boolean {
  const q = query.trim();
  if (q.length < 5) return false;
  // Starts with a civic number, or contains number + street suffix.
  if (/^\d{1,6}\s+\S+/.test(q)) return true;
  return (
    /\d/.test(q) &&
    /\b(st|street|ave|avenue|rd|road|dr|drive|trail|blvd|boulevard|cres|crescent|crt|court|way|lane|ln|terr|terrace|pl|place|blvd|pkwy|parkway|circle|cir|gate|mews)\b/i.test(
      q,
    )
  );
}

function txnParams(transactionType?: "SALE" | "LEASE") {
  const params = new URLSearchParams();
  if (transactionType) params.set("transactionType", transactionType);
  return params;
}

/** Map-search URL around a resolved place (used by “Search near {address}”). */
export function nearAddressHref(
  place: {
    city?: string;
    lat?: number;
    lng?: number;
  },
  transactionType?: "SALE" | "LEASE",
): string | null {
  if (place.lat == null || place.lng == null) return null;
  const params = txnParams(transactionType);
  params.set("lat", String(place.lat));
  params.set("lng", String(place.lng));
  if (place.city?.trim()) params.set("city", place.city.trim());
  return `/search?${params.toString()}`;
}

/**
 * Area / city rows from a resolved Google place.
 * Near-map search is the footer “Search near {address}” (not duplicated here).
 */
export function suggestionsAroundPlace(
  place: {
    label: string;
    city?: string;
    community?: string | null;
    province?: string;
    lat?: number;
    lng?: number;
  },
  transactionType?: "SALE" | "LEASE",
): AutocompleteSuggestion[] {
  const out: AutocompleteSuggestion[] = [];
  const area = place.community?.trim() || null;
  const city = place.city?.trim() || null;

  if (area && city) {
    const params = txnParams(transactionType);
    params.set("city", city);
    params.set("community", area);
    if (place.lat != null && place.lng != null) {
      params.set("lat", String(place.lat));
      params.set("lng", String(place.lng));
    }
    out.push({
      type: "action",
      group: "around",
      action: "area_listings",
      label: `Listings in ${area}`,
      subtitle: `${city}, ${place.province ?? "ON"}`,
      city,
      community: area,
      province: place.province,
      lat: place.lat,
      lng: place.lng,
      href: `/search?${params.toString()}`,
    });
  }

  if (city) {
    const params = txnParams(transactionType);
    params.set("city", city);
    out.push({
      type: "action",
      group: "around",
      action: "city_search",
      label: `Homes in ${city}`,
      subtitle: `${city}, ${place.province ?? "ON"}`,
      city,
      province: place.province,
      href: `/search?${params.toString()}`,
    });
  }

  return out;
}

export function placeToAddressSuggestion(
  place: AutocompleteSuggestion,
): AutocompleteSuggestion {
  return {
    ...place,
    type: "place",
    group: "addresses",
    subtitle: place.subtitle ?? [place.city, place.province].filter(Boolean).join(", "),
  };
}
