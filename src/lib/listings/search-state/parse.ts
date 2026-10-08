import {
  parseInitialStatuses,
  parseSearchPropertyTypes,
  parseSearchSort,
  parseSearchView,
} from "@/lib/listings/search-page-href";
import { defaultCommittedSearch } from "@/lib/listings/search-state/defaults";
import type { CommittedSearch } from "@/lib/listings/search-state/types";
import { splitStructuredCities } from "@/lib/listings/structured-cities";

function asParams(input: URLSearchParams | string): URLSearchParams {
  if (typeof input === "string") {
    const raw = input.trim();
    if (!raw) return new URLSearchParams();
    if (raw.includes("://") || raw.startsWith("/")) {
      try {
        const url = new URL(
          raw,
          typeof window !== "undefined"
            ? window.location.origin
            : "https://houzzat.com",
        );
        return url.searchParams;
      } catch {
        const q = raw.indexOf("?");
        return new URLSearchParams(q === -1 ? "" : raw.slice(q + 1));
      }
    }
    return new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
  }
  return input;
}

/**
 * Parse a search URL / querystring into CommittedSearch.
 *
 * Place precedence (mixed inputs):
 * 1. Non-empty `cities=` pipe → use those cities; ignore `city=`.
 * 2. Else non-empty `city=` → single-element cities[].
 * 3. `communities=` wins over `community=` the same way.
 *
 * Unsupported / ignored for criteria: lat, lng, cursor, west/south/east/north
 * on the page URL (map area is session-only in live Experience).
 */
export function parseSearchUrl(
  input: URLSearchParams | string,
  options?: { isMobileDefaultView?: boolean },
): CommittedSearch {
  const params = asParams(input);
  const txnRaw = params.get("transactionType");
  const transactionType =
    txnRaw === "LEASE" || txnRaw === "ALL" || txnRaw === "SALE"
      ? txnRaw
      : params.get("dataSource") === "fsbo"
        ? "ALL"
        : "SALE";
  const segmentRaw = params.get("segment");
  const segment =
    segmentRaw === "COMMERCIAL" ||
    segmentRaw === "ALL" ||
    segmentRaw === "RESIDENTIAL"
      ? segmentRaw
      : "RESIDENTIAL";

  const citiesParam = params.get("cities") ?? "";
  const cityParam = params.get("city") ?? "";
  const listed = splitStructuredCities(citiesParam);
  const cities =
    listed.length > 0 ? listed : cityParam.trim() ? [cityParam.trim()] : [];

  const communitiesParam = params.get("communities") ?? "";
  const communityParam = params.get("community") ?? "";
  const communitiesListed = splitStructuredCities(communitiesParam);
  const communities = communitiesListed;
  const community =
    communitiesListed.length > 0 ? "" : communityParam.trim();

  return defaultCommittedSearch({
    segment,
    transactionType,
    dataSource: params.get("dataSource") === "fsbo" ? "fsbo" : "",
    cities,
    community,
    communities,
    q: params.get("q") ?? "",
    minPrice: params.get("minPrice") ?? "",
    maxPrice: params.get("maxPrice") ?? "",
    minBeds: params.get("minBeds") ?? "",
    minBaths: params.get("minBaths") ?? "",
    propertyTypes: parseSearchPropertyTypes(params.get("propertyTypes")),
    openHouseOnly: params.get("openHouseOnly") === "1",
    statuses: parseInitialStatuses(params.get("status"), transactionType === "LEASE"),
    sort: parseSearchSort(params.get("sort")),
    view: parseSearchView(
      params.get("view"),
      options?.isMobileDefaultView ?? false,
    ),
    mapArea: null,
  });
}
