import type { PropertyType } from "@prisma/client";
import type { SearchFilters } from "@/components/listings/SearchFilterChips";
import {
  formatPriceCompact,
  propertyTypeLabel,
} from "@/lib/listings/constants";

/** Server SavedSearch.name zod max — keep auto names within this. */
export const SAVED_SEARCH_NAME_MAX_LENGTH = 120;

const CONDO_TYPES = new Set<PropertyType>(["CONDO_APT", "CONDO_TOWNHOUSE"]);

function statusesQueryValue(statuses: SearchFilters["statuses"]): string | null {
  if (statuses.length === 1 && statuses[0] === "ACTIVE") return null;
  return statuses.join(",");
}

function resolvedCities(
  filters: SearchFilters,
  extras?: { cities?: readonly string[] },
): string[] {
  const fromExtras = (extras?.cities ?? [])
    .map((city) => city.trim())
    .filter(Boolean);
  if (fromExtras.length) return [...new Set(fromExtras)];
  const one = filters.city.trim();
  return one ? [one] : [];
}

function moneyPhrase(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const amount = Number(trimmed);
  if (!Number.isFinite(amount)) return null;
  return formatPriceCompact(amount);
}

function priceDetail(
  minPrice: string,
  maxPrice: string,
  lease: boolean,
): string | null {
  const min = moneyPhrase(minPrice);
  const max = moneyPhrase(maxPrice);
  const suffix = lease ? "/mo" : "";
  if (min && max) return `${min}–${max}${suffix}`;
  if (max) return `Under ${max}${suffix}`;
  if (min) return `From ${min}${suffix}`;
  return null;
}

function joinPlaces(cities: string[]): string {
  if (cities.length === 1) return cities[0]!;
  if (cities.length === 2) return `${cities[0]} & ${cities[1]}`;
  if (cities.length === 3) {
    return `${cities[0]}, ${cities[1]} & ${cities[2]}`;
  }
  return `${cities.length} cities`;
}

function propertyNoun(filters: SearchFilters): string {
  if (filters.segment === "COMMERCIAL") {
    return filters.transactionType === "LEASE"
      ? "Commercial for Lease"
      : "Commercial";
  }
  const types = filters.propertyTypes;
  const condoOnly =
    types.length > 0 && types.every((t) => CONDO_TYPES.has(t));
  if (filters.transactionType === "LEASE") {
    if (condoOnly) return "Condos for Lease";
    return "Homes for Lease";
  }
  if (condoOnly) return "Condos";
  if (types.length === 1) {
    const label = propertyTypeLabel(types[0]!);
    if (label === "Detached") return "Homes";
    if (label.endsWith("s") || label.endsWith("h")) return `${label} Listings`;
    return `${label} Listings`;
  }
  return "Listings";
}

/**
 * True when the name looks like a stock auto-label (safe to regenerate).
 * Custom / user-entered names return false.
 */
export function isGenericSavedSearchName(name: string | null | undefined): boolean {
  const n = (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!n) return true;
  if (/^my (homes|rentals|commercial) search(\s+\d+)?$/.test(n)) return true;
  if (/^my home search(\s+\d+)?$/.test(n)) return true;
  if (/^home search(\s+\d+)?$/.test(n)) return true;
  return false;
}

export function clampSavedSearchName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed.length <= SAVED_SEARCH_NAME_MAX_LENGTH) return trimmed;
  return trimmed.slice(0, SAVED_SEARCH_NAME_MAX_LENGTH - 1).trimEnd() + "…";
}

/**
 * Serialize UI filters into the JSON shape stored on SavedSearch.query.
 * Place fields match qualification / digest / savedQueryToSearchHref:
 * one city → `city`; multiple → `cities` string[].
 */
export function searchFiltersToSavedQuery(
  filters: SearchFilters,
  extras?: { cities?: readonly string[] },
): Record<string, unknown> {
  const cities = resolvedCities(filters, extras);
  return {
    segment:
      filters.segment !== "RESIDENTIAL" ? filters.segment : undefined,
    transactionType:
      filters.transactionType !== "ALL" ? filters.transactionType : undefined,
    dataSource: filters.dataSource || undefined,
    ...(cities.length === 1
      ? { city: cities[0] }
      : cities.length > 1
        ? { cities }
        : {}),
    community: filters.community || undefined,
    propertyTypes: filters.propertyTypes.length
      ? filters.propertyTypes.join(",")
      : undefined,
    minPrice: filters.minPrice || undefined,
    maxPrice: filters.maxPrice || undefined,
    minBeds: filters.minBeds || undefined,
    minBaths: filters.minBaths || undefined,
    openHouseOnly: filters.openHouseOnly ? "1" : undefined,
    status: statusesQueryValue(filters.statuses) ?? undefined,
    sort: filters.sort !== "newest" ? filters.sort : undefined,
  };
}

/**
 * Criteria-derived Saved Search name.
 * Examples: "Markham & Pickering Listings · $750K–$1.2M",
 * "Mississauga Condos · 2+ Beds", "Oakville Homes for Lease · Under $3K/mo".
 */
export function savedSearchDisplayName(
  filters: SearchFilters,
  extras?: { cities?: readonly string[] },
): string {
  const cities = resolvedCities(filters, extras);
  const community = filters.community.trim();
  const place = community || (cities.length ? joinPlaces(cities) : "");
  const noun = propertyNoun(filters);
  const lease = filters.transactionType === "LEASE";
  const details: string[] = [];
  if (filters.minBeds.trim()) details.push(`${filters.minBeds.trim()}+ Beds`);
  if (filters.minBaths.trim()) details.push(`${filters.minBaths.trim()}+ Baths`);
  // Single non-condo type already folded into the noun when alone; still show
  // multi-type count when the noun stayed generic "Listings".
  if (
    filters.propertyTypes.length > 1 &&
    !filters.propertyTypes.every((t) => CONDO_TYPES.has(t))
  ) {
    details.push(`${filters.propertyTypes.length} types`);
  }
  const price = priceDetail(filters.minPrice, filters.maxPrice, lease);
  if (price) details.push(price);

  let head = place ? `${place} ${noun}` : noun;
  if (!place && details.length === 0) {
    head =
      filters.transactionType === "LEASE"
        ? "My rentals search"
        : filters.segment === "COMMERCIAL"
          ? "My commercial search"
          : "My homes search";
  }
  const full = details.length ? `${head} · ${details.join(" · ")}` : head;
  return clampSavedSearchName(full);
}

/** Build a display name from a SavedSearch.query-shaped record. */
export function savedSearchDisplayNameFromQuery(
  query: Record<string, unknown>,
): string {
  const cities = Array.isArray(query.cities)
    ? query.cities.map((c) => String(c).trim()).filter(Boolean)
    : [];
  const city =
    typeof query.city === "string" && query.city.trim() ? query.city.trim() : "";
  const propertyTypesRaw = query.propertyTypes;
  let propertyTypes: PropertyType[] = [];
  if (typeof propertyTypesRaw === "string" && propertyTypesRaw.trim()) {
    propertyTypes = propertyTypesRaw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean) as PropertyType[];
  } else if (Array.isArray(propertyTypesRaw)) {
    propertyTypes = propertyTypesRaw
      .map((t) => String(t).trim())
      .filter(Boolean) as PropertyType[];
  }
  const filters = {
    segment:
      query.segment === "COMMERCIAL" || query.segment === "ALL"
        ? query.segment
        : "RESIDENTIAL",
    transactionType:
      query.transactionType === "LEASE" || query.transactionType === "ALL"
        ? query.transactionType
        : "SALE",
    dataSource: "",
    city,
    community:
      typeof query.community === "string" ? query.community.trim() : "",
    propertyTypes,
    minPrice: typeof query.minPrice === "string" ? query.minPrice : "",
    maxPrice: typeof query.maxPrice === "string" ? query.maxPrice : "",
    minBeds: typeof query.minBeds === "string" ? query.minBeds : "",
    minBaths: typeof query.minBaths === "string" ? query.minBaths : "",
    openHouseOnly: query.openHouseOnly === "1" || query.openHouseOnly === true,
    statuses: ["ACTIVE"] as SearchFilters["statuses"],
    sort: "newest" as const,
  } satisfies SearchFilters;
  return savedSearchDisplayName(filters, {
    cities: cities.length ? cities : city ? [city] : [],
  });
}

/**
 * Prefer a custom name; regenerate only when missing or generic.
 * Never invent a bulk rename for already-customized records.
 */
export function resolveSavedSearchName(input: {
  existingName?: string | null;
  filters: SearchFilters;
  cities?: readonly string[];
}): string {
  const existing = input.existingName?.trim() ?? "";
  if (existing && !isGenericSavedSearchName(existing)) {
    return clampSavedSearchName(existing);
  }
  return savedSearchDisplayName(input.filters, { cities: input.cities });
}

/** Build listing search query string from filters (for draft result counts). */
export function searchFiltersToListingParams(
  filters: SearchFilters,
  extras?: {
    cities?: string;
    communities?: string;
    q?: string;
    west?: number;
    south?: number;
    east?: number;
    north?: number;
    limit?: number;
  },
): string {
  const params = new URLSearchParams();
  if (filters.segment && filters.segment !== "ALL") {
    params.set("segment", filters.segment);
  } else if (filters.segment === "ALL") {
    params.set("segment", "ALL");
  }
  params.set("transactionType", filters.transactionType);
  if (filters.dataSource) params.set("dataSource", filters.dataSource);
  if (extras?.cities) {
    params.set("cities", extras.cities);
  } else if (filters.city) {
    params.set("city", filters.city);
  }
  if (extras?.communities) {
    params.set("communities", extras.communities);
  } else if (filters.community) {
    params.set("community", filters.community);
  }
  if (filters.propertyTypes.length) {
    params.set("propertyTypes", filters.propertyTypes.join(","));
  }
  if (filters.minPrice) params.set("minPrice", filters.minPrice);
  if (filters.maxPrice) params.set("maxPrice", filters.maxPrice);
  if (filters.minBeds) params.set("minBeds", filters.minBeds);
  if (filters.minBaths) params.set("minBaths", filters.minBaths);
  if (filters.openHouseOnly) params.set("openHouseOnly", "1");
  const statusQ = statusesQueryValue(filters.statuses);
  if (statusQ) params.set("status", statusQ);
  params.set("sort", filters.sort);
  if (extras?.q) params.set("q", extras.q);
  if (
    extras?.west != null &&
    extras.south != null &&
    extras.east != null &&
    extras.north != null
  ) {
    params.set("west", String(extras.west));
    params.set("south", String(extras.south));
    params.set("east", String(extras.east));
    params.set("north", String(extras.north));
  }
  params.set("limit", String(extras?.limit ?? 1));
  return params.toString();
}
