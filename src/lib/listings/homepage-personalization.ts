import type { PropertyType } from "@prisma/client";
import { propertyTypeLabel } from "@/lib/listings/constants";
import type { ListingSearchParams } from "@/lib/listings/types";

const PROPERTY_TYPES = new Set<string>([
  "DETACHED",
  "SEMI_DETACHED",
  "TOWNHOUSE",
  "CONDO_APT",
  "CONDO_TOWNHOUSE",
  "MULTIPLEX",
  "VACANT_LAND",
  "OFFICE",
  "RETAIL",
  "INDUSTRIAL",
  "MIXED_USE",
  "OTHER",
]);

export type HomepagePersonalizationQuery = {
  minPrice?: string;
  maxPrice?: string;
  propertyTypes?: string[];
  /** @deprecated Prefer `cities` — kept for older saved searches. */
  city?: string;
  cities?: string[];
  communities?: string[];
};

function parseStringList(
  multi: unknown,
  singular?: unknown,
): string[] | undefined {
  const out: string[] = [];
  if (Array.isArray(multi)) {
    for (const item of multi) {
      if (typeof item === "string" && item.trim()) out.push(item.trim());
    }
  } else if (typeof multi === "string" && multi.trim()) {
    out.push(
      ...multi
        .split(/[,|]/)
        .map((s) => s.trim())
        .filter(Boolean),
    );
  }
  if (!out.length && typeof singular === "string" && singular.trim()) {
    out.push(singular.trim());
  }
  const unique = [...new Set(out)];
  return unique.length ? unique : undefined;
}

export function parseHomepagePersonalizationQuery(
  raw: unknown,
): HomepagePersonalizationQuery {
  if (!raw || typeof raw !== "object") return {};
  const q = raw as Record<string, unknown>;

  const propertyTypes = Array.isArray(q.propertyTypes)
    ? q.propertyTypes.filter(
        (t): t is string => typeof t === "string" && PROPERTY_TYPES.has(t),
      )
    : typeof q.propertyTypes === "string"
      ? q.propertyTypes
          .split(",")
          .map((t) => t.trim())
          .filter((t) => PROPERTY_TYPES.has(t))
      : typeof q.propertyType === "string" && PROPERTY_TYPES.has(q.propertyType)
        ? [q.propertyType]
        : undefined;

  const cities = parseStringList(q.cities, q.city);
  const communities = parseStringList(q.communities, q.community);

  return {
    minPrice:
      typeof q.minPrice === "string" && q.minPrice.trim()
        ? q.minPrice.trim()
        : typeof q.minPrice === "number" && Number.isFinite(q.minPrice)
          ? String(Math.round(q.minPrice))
          : undefined,
    maxPrice:
      typeof q.maxPrice === "string" && q.maxPrice.trim()
        ? q.maxPrice.trim()
        : typeof q.maxPrice === "number" && Number.isFinite(q.maxPrice)
          ? String(Math.round(q.maxPrice))
          : undefined,
    propertyTypes: propertyTypes?.length ? propertyTypes : undefined,
    cities,
    city: cities?.length === 1 ? cities[0] : undefined,
    communities,
  };
}

/** Merge personalization onto a rail/search request (AND). */
export function applyPersonalizationToSearchParams(
  base: ListingSearchParams,
  personalization: HomepagePersonalizationQuery | null | undefined,
): ListingSearchParams {
  if (!personalization) return base;

  const minPrice = personalization.minPrice
    ? Number(personalization.minPrice)
    : undefined;
  const maxPrice = personalization.maxPrice
    ? Number(personalization.maxPrice)
    : undefined;

  const cities =
    personalization.cities?.length
      ? personalization.cities
      : personalization.city
        ? [personalization.city]
        : undefined;

  return {
    ...base,
    cities: cities ?? base.cities,
    city: cities?.length === 1 ? cities[0] : cities?.length ? undefined : base.city,
    communities: personalization.communities ?? base.communities,
    community:
      !personalization.communities?.length && !base.communities?.length
        ? base.community
        : undefined,
    propertyTypes: personalization.propertyTypes?.length
      ? (personalization.propertyTypes as PropertyType[])
      : base.propertyTypes,
    propertyType: personalization.propertyTypes?.length
      ? undefined
      : base.propertyType,
    minPrice:
      minPrice != null && Number.isFinite(minPrice) ? minPrice : base.minPrice,
    maxPrice:
      maxPrice != null && Number.isFinite(maxPrice) ? maxPrice : base.maxPrice,
  };
}

/** Whether a listing card/row matches active homepage personalization (AND). */
export function listingMatchesHomepagePersonalization(
  listing: {
    city: string;
    community: string | null;
    propertyType: string;
    listPrice: number;
  },
  personalization: HomepagePersonalizationQuery | null | undefined,
): boolean {
  if (!personalization) return true;

  const cities =
    personalization.cities?.length
      ? personalization.cities
      : personalization.city
        ? [personalization.city]
        : [];

  if (cities.length) {
    const listingCity = listing.city.toLowerCase();
    if (!cities.some((c) => c.toLowerCase() === listingCity)) {
      return false;
    }
  }

  if (personalization.communities?.length) {
    const community = listing.community?.toLowerCase();
    if (
      !community ||
      !personalization.communities.some((c) => c.toLowerCase() === community)
    ) {
      return false;
    }
  }

  if (
    personalization.propertyTypes?.length &&
    !personalization.propertyTypes.includes(listing.propertyType)
  ) {
    return false;
  }

  const minPrice = personalization.minPrice
    ? Number(personalization.minPrice)
    : undefined;
  const maxPrice = personalization.maxPrice
    ? Number(personalization.maxPrice)
    : undefined;
  if (
    minPrice != null &&
    Number.isFinite(minPrice) &&
    listing.listPrice < minPrice
  ) {
    return false;
  }
  if (
    maxPrice != null &&
    Number.isFinite(maxPrice) &&
    listing.listPrice > maxPrice
  ) {
    return false;
  }

  return true;
}

/** Append personalization filters onto URLSearchParams (e.g. nearby API). */
export function appendPersonalizationToUrlSearchParams(
  params: URLSearchParams,
  personalization: HomepagePersonalizationQuery | null | undefined,
) {
  if (!personalization) return params;
  const cities =
    personalization.cities?.length
      ? personalization.cities
      : personalization.city
        ? [personalization.city]
        : [];
  if (cities.length === 1) params.set("city", cities[0]!);
  if (cities.length > 1) params.set("cities", cities.join("|"));
  if (personalization.minPrice) params.set("minPrice", personalization.minPrice);
  if (personalization.maxPrice) params.set("maxPrice", personalization.maxPrice);
  if (personalization.propertyTypes?.length) {
    params.set("propertyTypes", personalization.propertyTypes.join(","));
  }
  if (personalization.communities?.length) {
    params.set("communities", personalization.communities.join("|"));
  }
  return params;
}

/** Build /search query string from personalization (+ optional rail overrides). */
export function personalizationToSearchHref(
  personalization: HomepagePersonalizationQuery,
  extra?: Record<string, string | undefined>,
) {
  const params = new URLSearchParams();
  appendPersonalizationToUrlSearchParams(params, personalization);
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value) params.set(key, value);
    }
  }
  const qs = params.toString();
  return qs ? `/search?${qs}` : "/search";
}

export function formatPersonalizationPriceRange(
  personalization: HomepagePersonalizationQuery,
) {
  if (!personalization.minPrice && !personalization.maxPrice) return null;
  const lo = personalization.minPrice
    ? `$${Number(personalization.minPrice).toLocaleString("en-CA")}`
    : "$0";
  const hi = personalization.maxPrice
    ? `$${Number(personalization.maxPrice).toLocaleString("en-CA")}`
    : "Any";
  return `${lo} - ${hi}`;
}

export function summarizePersonalization(
  personalization: HomepagePersonalizationQuery,
) {
  const parts: string[] = [];
  const cities =
    personalization.cities?.length
      ? personalization.cities
      : personalization.city
        ? [personalization.city]
        : [];
  if (cities.length === 1) parts.push(cities[0]!);
  else if (cities.length > 1) parts.push(`${cities.length} cities`);
  if (personalization.communities?.length) {
    parts.push(
      personalization.communities.length === 1
        ? personalization.communities[0]!
        : `${personalization.communities.length} communities`,
    );
  }
  const price = formatPersonalizationPriceRange(personalization);
  if (price) parts.push(price.replace(" - ", "–"));
  if (personalization.propertyTypes?.length) {
    parts.push(
      personalization.propertyTypes.length === 1
        ? propertyTypeLabel(personalization.propertyTypes[0] as PropertyType)
        : `${personalization.propertyTypes.length} types`,
    );
  }
  return parts.slice(0, 3).join(" · ");
}

export const HOMEPAGE_SEARCH_DEFAULT_NAME = "Home Search 1";
export const HOMEPAGE_PRICE_SLIDER_MAX = 6_000_000;
export const HOMEPAGE_PRICE_SLIDER_STEP = 25_000;
