import { canonicalMarketCity } from "@/lib/geo/regions";
import type { AutocompleteSuggestion } from "@/lib/listings/types";
import type { CommittedSearch } from "@/lib/listings/search-state/types";

export type PlaceCommitResult = {
  /** Criteria patch merged onto committed (other filters preserved). */
  patch: Partial<CommittedSearch>;
  /** Optional map camera center (never an implicit Search This Area). */
  mapCenter?: { lat: number; lng: number; label: string };
  /** True when the patch replaces structured place (city/community). */
  replacesPlace: boolean;
};

function normalizeCity(raw: string | undefined | null): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  return canonicalMarketCity(trimmed) ?? trimmed;
}

function isCitySuggestion(suggestion: AutocompleteSuggestion): boolean {
  if (suggestion.action === "city_search") return true;
  if (suggestion.type === "city") return true;
  if (suggestion.group === "cities" && !suggestion.action) return true;
  return false;
}

function isCommunitySuggestion(suggestion: AutocompleteSuggestion): boolean {
  if (suggestion.action === "area_listings") return true;
  if (suggestion.type === "community") return true;
  if (suggestion.group === "communities" && !suggestion.action) return true;
  return false;
}

/**
 * Map an autocomplete location selection onto a committed place patch.
 *
 * City / community / around-area rows commit through the controller so
 * beds/price/type and other criteria survive. Minimal `/search?city=…`
 * suggestion hrefs must not wipe filters via router.push.
 *
 * Returns null for listings, MLS, near_me, free-text, and recent hrefs that
 * should keep their existing navigation behavior.
 */
export function placeCommitFromSuggestion(
  suggestion: AutocompleteSuggestion,
): PlaceCommitResult | null {
  if (suggestion.action === "near_me") return null;
  if (suggestion.action === "search_for") return null;
  if (suggestion.action === "listings_empty") return null;
  if (suggestion.mlsNumber) return null;
  if (suggestion.type === "listing" || suggestion.type === "mls") return null;
  // Recent rows restore a full saved href — not a place patch.
  if (suggestion.group === "recent") return null;

  const mapCenter =
    suggestion.lat != null && suggestion.lng != null
      ? {
          lat: suggestion.lat,
          lng: suggestion.lng,
          label: suggestion.label ?? "",
        }
      : undefined;

  if (isCommunitySuggestion(suggestion)) {
    const city =
      normalizeCity(suggestion.city) ??
      normalizeCity(suggestion.subtitle?.split(",")[0]);
    const community = (
      suggestion.community ??
      suggestion.label ??
      ""
    ).trim();
    if (!community) return null;
    return {
      patch: {
        cities: city ? [city] : [],
        community,
        communities: [],
        q: "",
      },
      mapCenter,
      replacesPlace: true,
    };
  }

  if (isCitySuggestion(suggestion)) {
    const city =
      normalizeCity(suggestion.city) ??
      normalizeCity(suggestion.label) ??
      normalizeCity(suggestion.subtitle?.split(",")[0]);
    if (!city) return null;
    return {
      patch: {
        cities: [city],
        community: "",
        communities: [],
        q: "",
      },
      mapCenter,
      replacesPlace: true,
    };
  }

  // Explicit “Search near {address}” — constrain city when known; camera only.
  if (suggestion.action === "near_address") {
    const city = normalizeCity(suggestion.city);
    return {
      patch: {
        ...(city
          ? { cities: [city], community: "", communities: [], q: "" }
          : { q: "" }),
      },
      mapCenter,
      replacesPlace: Boolean(city),
    };
  }

  // Bare place/address rows are handled inside AddressAutocomplete (around
  // options). Do not silently treat street text as a city commit.
  return null;
}

/**
 * Whether clearing the last city must also drop community / communities so
 * no hidden place constraint survives an empty city list.
 */
export function clearPlaceWhenCitiesEmpty(
  prev: CommittedSearch,
  nextCities: string[],
): Partial<CommittedSearch> {
  if (nextCities.length > 0) {
    return { cities: nextCities };
  }
  return {
    cities: [],
    community: "",
    communities: [],
  };
}
