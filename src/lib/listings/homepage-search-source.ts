/**
 * Homepage personalization source resolution.
 * Primary Home Search (SavedSearch isHomepageActive) > meaningful Active Search.
 * Never promotes browsing into Primary without an explicit Save & Apply.
 */

import type { HomepagePersonalizationQuery } from "@/lib/listings/homepage-personalization";
import { buildActiveChips } from "@/lib/listings/search-state/chips";
import { defaultCommittedSearch } from "@/lib/listings/search-state/defaults";
import { parseSearchUrl } from "@/lib/listings/search-state/parse";
import { serializeSearchUrl } from "@/lib/listings/search-state/serialize";
import {
  urlHasExplicitSearchCriteria,
} from "@/lib/listings/search-state/active-search-memory";
import type { CommittedSearch } from "@/lib/listings/search-state/types";

export type HomepageSearchSourceKind = "primary" | "active";

export type HomepageSearchSource = {
  kind: HomepageSearchSourceKind;
  /** Present only for Primary Saved Search. */
  searchId?: string;
  name: string;
  committed: CommittedSearch;
  query: HomepagePersonalizationQuery;
  href: string;
};

/** Active Search counts for homepage personalization only when criteria are set. */
export function isMeaningfulActiveSearchHref(href: string | null | undefined): boolean {
  if (!href?.trim()) return false;
  try {
    const u = new URL(href, "https://houzzat.local");
    if (u.pathname !== "/search") return false;
    return urlHasExplicitSearchCriteria(u.searchParams);
  } catch {
    return urlHasExplicitSearchCriteria(href);
  }
}

export function committedFromHomepagePersonalizationQuery(
  query: HomepagePersonalizationQuery,
): CommittedSearch {
  const base = defaultCommittedSearch();
  const cities =
    query.cities?.length
      ? query.cities.map((c) => c.trim()).filter(Boolean)
      : query.city?.trim()
        ? [query.city.trim()]
        : [];
  return {
    ...base,
    cities,
    communities: query.communities?.map((c) => c.trim()).filter(Boolean) ?? [],
    minPrice: query.minPrice?.trim() ?? "",
    maxPrice: query.maxPrice?.trim() ?? "",
    minBeds: query.minBeds?.trim() ?? "",
    minBaths: query.minBaths?.trim() ?? "",
    propertyTypes: (query.propertyTypes ?? []) as CommittedSearch["propertyTypes"],
    transactionType: query.transactionType ?? "SALE",
  };
}

export function homepagePersonalizationQueryFromCommitted(
  committed: CommittedSearch,
): HomepagePersonalizationQuery {
  const cities = committed.cities.map((c) => c.trim()).filter(Boolean);
  return {
    minPrice: committed.minPrice.trim() || undefined,
    maxPrice: committed.maxPrice.trim() || undefined,
    minBeds: committed.minBeds.trim() || undefined,
    minBaths: committed.minBaths.trim() || undefined,
    propertyTypes: committed.propertyTypes.length
      ? [...committed.propertyTypes]
      : undefined,
    cities: cities.length ? cities : undefined,
    city: cities.length === 1 ? cities[0] : undefined,
    communities: committed.communities.length
      ? [...committed.communities]
      : undefined,
    transactionType: committed.transactionType,
  };
}

export function committedFromActiveSearchHref(href: string): CommittedSearch | null {
  if (!isMeaningfulActiveSearchHref(href)) return null;
  try {
    return parseSearchUrl(href);
  } catch {
    return null;
  }
}

export function homepageSearchHrefFromCommitted(committed: CommittedSearch): string {
  return serializeSearchUrl(committed, { pathname: "/search" });
}

/**
 * Compact criteria tags for homepage / qualification (non-default only).
 * Multi-city → one chip "Toronto, Mississauga".
 */
export function buildHomepageCriteriaChipLabels(
  committed: CommittedSearch,
): string[] {
  const chips = buildActiveChips(committed).filter((chip) => {
    if (chip.key === "transaction" && !chip.clearable) return false;
    if (chip.key === "segment" && chip.label === "Residential") return false;
    if (chip.key === "status" && !chip.clearable) return false;
    return true;
  });

  const labels: string[] = [];
  const cityLabels: string[] = [];
  for (const chip of chips) {
    if (chip.key === "city") {
      cityLabels.push(chip.label);
      continue;
    }
    labels.push(chip.label);
  }
  if (cityLabels.length) {
    labels.unshift(cityLabels.join(", "));
  }
  return labels;
}

/** Saved-search JSON body for Save & Apply (Primary Home Search). */
export function savedSearchQueryFromCommitted(
  committed: CommittedSearch,
): Record<string, unknown> {
  const q: Record<string, unknown> = {};
  if (committed.cities.length === 1) q.city = committed.cities[0];
  if (committed.cities.length > 1) q.cities = committed.cities;
  if (committed.communities.length) q.communities = committed.communities;
  if (committed.minPrice.trim()) q.minPrice = committed.minPrice.trim();
  if (committed.maxPrice.trim()) q.maxPrice = committed.maxPrice.trim();
  if (committed.minBeds.trim()) q.minBeds = committed.minBeds.trim();
  if (committed.minBaths.trim()) q.minBaths = committed.minBaths.trim();
  if (committed.propertyTypes.length) {
    q.propertyTypes = committed.propertyTypes;
  }
  if (committed.transactionType !== "SALE") {
    q.transactionType = committed.transactionType;
  }
  return q;
}
