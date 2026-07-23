import type { PropertyType } from "@prisma/client";
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
  city?: string;
  communities?: string[];
};

export function parseHomepagePersonalizationQuery(
  raw: unknown,
): HomepagePersonalizationQuery {
  if (!raw || typeof raw !== "object") return {};
  const q = raw as Record<string, unknown>;

  const propertyTypes = Array.isArray(q.propertyTypes)
    ? q.propertyTypes.filter(
        (t): t is string => typeof t === "string" && PROPERTY_TYPES.has(t),
      )
    : typeof q.propertyType === "string" && PROPERTY_TYPES.has(q.propertyType)
      ? [q.propertyType]
      : undefined;

  const communities = Array.isArray(q.communities)
    ? q.communities
        .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
        .map((c) => c.trim())
    : typeof q.community === "string" && q.community.trim()
      ? [q.community.trim()]
      : undefined;

  return {
    minPrice:
      typeof q.minPrice === "string" && q.minPrice.trim()
        ? q.minPrice.trim()
        : undefined,
    maxPrice:
      typeof q.maxPrice === "string" && q.maxPrice.trim()
        ? q.maxPrice.trim()
        : undefined,
    propertyTypes: propertyTypes?.length ? propertyTypes : undefined,
    city:
      typeof q.city === "string" && q.city.trim() ? q.city.trim() : undefined,
    communities: communities?.length ? communities : undefined,
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

  return {
    ...base,
    city: personalization.city ?? base.city,
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
      minPrice != null && Number.isFinite(minPrice)
        ? minPrice
        : base.minPrice,
    maxPrice:
      maxPrice != null && Number.isFinite(maxPrice)
        ? maxPrice
        : base.maxPrice,
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

  if (
    personalization.city &&
    listing.city.toLowerCase() !== personalization.city.toLowerCase()
  ) {
    return false;
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
  if (personalization.city) params.set("city", personalization.city);
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

export function summarizePersonalization(
  personalization: HomepagePersonalizationQuery,
) {
  const parts: string[] = [];
  if (personalization.city) parts.push(personalization.city);
  if (personalization.communities?.length) {
    parts.push(
      personalization.communities.length === 1
        ? personalization.communities[0]!
        : `${personalization.communities.length} communities`,
    );
  }
  if (personalization.minPrice || personalization.maxPrice) {
    parts.push(
      [
        personalization.minPrice
          ? `$${Number(personalization.minPrice).toLocaleString("en-CA")}`
          : null,
        personalization.maxPrice
          ? `$${Number(personalization.maxPrice).toLocaleString("en-CA")}`
          : null,
      ]
        .filter(Boolean)
        .join("–"),
    );
  }
  if (personalization.propertyTypes?.length) {
    parts.push(
      personalization.propertyTypes.length === 1
        ? personalization.propertyTypes[0]!
        : `${personalization.propertyTypes.length} types`,
    );
  }
  return parts.slice(0, 3).join(" · ");
}
