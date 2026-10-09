import { statusesQueryValue } from "@/lib/listings/search-page-href";
import type { CommittedSearch } from "@/lib/listings/search-state/types";

/**
 * Serialize committed criteria to a page href.
 * Map area is intentionally omitted (same as searchPageHref).
 *
 * Place encoding:
 * - 0 cities → neither city nor cities
 * - 1 city → `city=` (legacy-friendly; CaptureIntent / searchFiltersFromHref)
 * - 2+ cities → `cities=` pipe
 */
export function serializeSearchUrl(
  committed: CommittedSearch,
  options?: { pathname?: string },
): string {
  const pathname = options?.pathname ?? "/search";
  const params = new URLSearchParams();
  if (committed.segment && committed.segment !== "RESIDENTIAL") {
    params.set("segment", committed.segment);
  }
  params.set("transactionType", committed.transactionType);
  if (committed.dataSource) params.set("dataSource", committed.dataSource);

  if (committed.cities.length > 1) {
    params.set("cities", committed.cities.join("|"));
  } else if (committed.cities.length === 1) {
    params.set("city", committed.cities[0]!);
  }

  if (committed.communities.length > 0) {
    params.set("communities", committed.communities.join("|"));
  } else if (committed.community.trim()) {
    params.set("community", committed.community.trim());
  }

  if (committed.propertyTypes.length) {
    params.set("propertyTypes", committed.propertyTypes.join(","));
  }
  if (committed.minPrice) params.set("minPrice", committed.minPrice);
  if (committed.maxPrice) params.set("maxPrice", committed.maxPrice);
  if (committed.minBeds) params.set("minBeds", committed.minBeds);
  if (committed.minBaths) params.set("minBaths", committed.minBaths);
  if (committed.openHouseOnly) params.set("openHouseOnly", "1");
  const statusQ = statusesQueryValue(committed.statuses);
  if (statusQ) params.set("status", statusQ);
  if (committed.sort !== "newest") params.set("sort", committed.sort);
  if (committed.q.trim()) params.set("q", committed.q.trim());
  // Always emit view (including split) so explicit Split survives URL sync /
  // refresh and the mobile Cards default can distinguish fresh vs chosen.
  params.set("view", committed.view);

  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
