import type { PropertyType } from "@prisma/client";
import type {
  SearchFilters,
  SearchStatusOption,
  SearchViewMode,
} from "@/components/listings/SearchFilterChips";

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

export function parseInitialStatuses(
  statusParam: string | null,
  isLease: boolean,
): SearchStatusOption[] {
  if (!statusParam || statusParam === "ACTIVE") return ["ACTIVE"];
  if (statusParam === "ALL") {
    return isLease
      ? ["ACTIVE", "SOLD_CONDITIONAL", "LEASED", "UNLISTED"]
      : ["ACTIVE", "SOLD_CONDITIONAL", "SOLD", "UNLISTED"];
  }
  const allowed = new Set<SearchStatusOption>(
    isLease
      ? ["ACTIVE", "SOLD_CONDITIONAL", "LEASED", "UNLISTED"]
      : ["ACTIVE", "SOLD_CONDITIONAL", "SOLD", "UNLISTED"],
  );
  const parsed = statusParam
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is SearchStatusOption =>
      allowed.has(s as SearchStatusOption),
    );
  return parsed.length ? parsed : ["ACTIVE"];
}

export function statusesQueryValue(
  statuses: SearchStatusOption[],
): string | null {
  if (statuses.length === 1 && statuses[0] === "ACTIVE") return null;
  return statuses.join(",");
}

export function parseSearchSort(raw: string | null): SearchFilters["sort"] {
  if (raw === "price_asc" || raw === "price") return "price_asc";
  if (raw === "price_desc") return "price_desc";
  return "newest";
}

export function parseSearchView(
  raw: string | null,
  isMobileDefault: boolean,
): SearchViewMode {
  if (raw === "map" || raw === "cards" || raw === "split") return raw;
  return isMobileDefault ? "cards" : "split";
}

export function parseSearchPropertyTypes(raw: string | null): PropertyType[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter((t): t is PropertyType => PROPERTY_TYPES.has(t));
}

/** Page URL for the current search. Map bounds are not part of this URL. */
export function searchPageHref(input: {
  pathname: string;
  filters: SearchFilters;
  view: SearchViewMode;
  cities?: string;
  communities?: string;
  q?: string;
  clearMultiPlace?: boolean;
  clearQuery?: boolean;
}): string {
  const next = input.filters;
  const params = new URLSearchParams();
  if (next.segment && next.segment !== "RESIDENTIAL") {
    params.set("segment", next.segment);
  }
  params.set("transactionType", next.transactionType);
  if (next.dataSource) params.set("dataSource", next.dataSource);
  if (!input.clearMultiPlace && input.cities) {
    params.set("cities", input.cities);
  } else if (next.city) {
    params.set("city", next.city);
  }
  if (!input.clearMultiPlace && input.communities) {
    params.set("communities", input.communities);
  } else if (next.community) {
    params.set("community", next.community);
  }
  if (next.propertyTypes.length) {
    params.set("propertyTypes", next.propertyTypes.join(","));
  }
  if (next.minPrice) params.set("minPrice", next.minPrice);
  if (next.maxPrice) params.set("maxPrice", next.maxPrice);
  if (next.minBeds) params.set("minBeds", next.minBeds);
  if (next.minBaths) params.set("minBaths", next.minBaths);
  if (next.openHouseOnly) params.set("openHouseOnly", "1");
  const statusQ = statusesQueryValue(next.statuses);
  if (statusQ) params.set("status", statusQ);
  if (next.sort !== "newest") params.set("sort", next.sort);
  if (!input.clearQuery && input.q) params.set("q", input.q);
  if (input.view !== "split") params.set("view", input.view);
  const qs = params.toString();
  return qs ? `${input.pathname}?${qs}` : input.pathname;
}

export function searchFiltersFromHref(href: string): SearchFilters | null {
  const path = href.trim();
  const qIndex = path.indexOf("?");
  const pathname = qIndex === -1 ? path : path.slice(0, qIndex);
  if (pathname !== "/search") return null;
  const params = new URLSearchParams(qIndex === -1 ? "" : path.slice(qIndex + 1));
  const txnRaw = params.get("transactionType");
  const transactionType: SearchFilters["transactionType"] =
    txnRaw === "LEASE" || txnRaw === "ALL" || txnRaw === "SALE"
      ? txnRaw
      : params.get("dataSource") === "fsbo"
        ? "ALL"
        : "SALE";
  const segmentRaw = params.get("segment");
  const segment: SearchFilters["segment"] =
    segmentRaw === "COMMERCIAL" || segmentRaw === "ALL" || segmentRaw === "RESIDENTIAL"
      ? segmentRaw
      : "RESIDENTIAL";
  return {
    segment,
    transactionType,
    dataSource: params.get("dataSource") === "fsbo" ? "fsbo" : "",
    city: params.get("city") ?? "",
    community: params.get("community") ?? "",
    minPrice: params.get("minPrice") ?? "",
    maxPrice: params.get("maxPrice") ?? "",
    minBeds: params.get("minBeds") ?? "",
    minBaths: params.get("minBaths") ?? "",
    propertyTypes: parseSearchPropertyTypes(params.get("propertyTypes")),
    openHouseOnly: params.get("openHouseOnly") === "1",
    statuses: parseInitialStatuses(
      params.get("status"),
      transactionType === "LEASE",
    ),
    sort: parseSearchSort(params.get("sort")),
  };
}
