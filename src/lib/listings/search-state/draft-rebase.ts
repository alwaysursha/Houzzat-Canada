import type { SearchFilters } from "@/components/listings/SearchFilterChips";
import type { MapBoundsBox } from "@/lib/listings/map-area-search";
import type { CommittedSearch } from "@/lib/listings/search-state/types";

function sameStringArray(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function sameMapArea(
  a: MapBoundsBox | null,
  b: MapBoundsBox | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.west === b.west &&
    a.south === b.south &&
    a.east === b.east &&
    a.north === b.north
  );
}

/**
 * Three-way merge for an open filter draft when committed criteria change
 * underneath (live desktop control, chip removal, map area, etc.).
 *
 * Policy (deterministic):
 * - Field unchanged in draft vs draft-open base → take the newer committed value
 *   (protects live edits / chip removals the user made outside the panel).
 * - Field edited in draft vs base → keep the draft value (explicit panel edits win).
 * - `view` is presentation chrome → always take newer committed.
 */
export function rebaseDraftPreservingEdits(
  base: CommittedSearch,
  draft: CommittedSearch,
  nextCommitted: CommittedSearch,
): CommittedSearch {
  return {
    segment:
      draft.segment === base.segment ? nextCommitted.segment : draft.segment,
    transactionType:
      draft.transactionType === base.transactionType
        ? nextCommitted.transactionType
        : draft.transactionType,
    dataSource:
      draft.dataSource === base.dataSource
        ? nextCommitted.dataSource
        : draft.dataSource,
    cities: sameStringArray(draft.cities, base.cities)
      ? [...nextCommitted.cities]
      : [...draft.cities],
    community:
      draft.community === base.community
        ? nextCommitted.community
        : draft.community,
    communities: sameStringArray(draft.communities, base.communities)
      ? [...nextCommitted.communities]
      : [...draft.communities],
    q: draft.q === base.q ? nextCommitted.q : draft.q,
    minPrice:
      draft.minPrice === base.minPrice
        ? nextCommitted.minPrice
        : draft.minPrice,
    maxPrice:
      draft.maxPrice === base.maxPrice
        ? nextCommitted.maxPrice
        : draft.maxPrice,
    minBeds:
      draft.minBeds === base.minBeds ? nextCommitted.minBeds : draft.minBeds,
    minBaths:
      draft.minBaths === base.minBaths
        ? nextCommitted.minBaths
        : draft.minBaths,
    propertyTypes: sameStringArray(draft.propertyTypes, base.propertyTypes)
      ? [...nextCommitted.propertyTypes]
      : [...draft.propertyTypes],
    openHouseOnly:
      draft.openHouseOnly === base.openHouseOnly
        ? nextCommitted.openHouseOnly
        : draft.openHouseOnly,
    statuses: sameStringArray(draft.statuses, base.statuses)
      ? [...nextCommitted.statuses]
      : [...draft.statuses],
    sort: draft.sort === base.sort ? nextCommitted.sort : draft.sort,
    view: nextCommitted.view,
    mapArea: sameMapArea(draft.mapArea, base.mapArea)
      ? nextCommitted.mapArea
      : draft.mapArea,
  };
}

/**
 * Same conflict policy for legacy SearchFilters + cities[] UI drafts
 * (Menu/Sheet local state). Compatibility adapter — remove when those
 * surfaces read `SearchState.draft` directly.
 */
export function rebaseFilterDraftPreservingEdits(
  base: { filters: SearchFilters; cities: string[] },
  draft: { filters: SearchFilters; cities: string[] },
  next: { filters: SearchFilters; cities: string[] },
): { filters: SearchFilters; cities: string[] } {
  const bf = base.filters;
  const df = draft.filters;
  const nf = next.filters;
  return {
    cities: sameStringArray(draft.cities, base.cities)
      ? [...next.cities]
      : [...draft.cities],
    filters: {
      segment: df.segment === bf.segment ? nf.segment : df.segment,
      transactionType:
        df.transactionType === bf.transactionType
          ? nf.transactionType
          : df.transactionType,
      dataSource:
        df.dataSource === bf.dataSource ? nf.dataSource : df.dataSource,
      city: df.city === bf.city ? nf.city : df.city,
      community:
        df.community === bf.community ? nf.community : df.community,
      minPrice: df.minPrice === bf.minPrice ? nf.minPrice : df.minPrice,
      maxPrice: df.maxPrice === bf.maxPrice ? nf.maxPrice : df.maxPrice,
      minBeds: df.minBeds === bf.minBeds ? nf.minBeds : df.minBeds,
      minBaths: df.minBaths === bf.minBaths ? nf.minBaths : df.minBaths,
      propertyTypes: sameStringArray(df.propertyTypes, bf.propertyTypes)
        ? [...nf.propertyTypes]
        : [...df.propertyTypes],
      openHouseOnly:
        df.openHouseOnly === bf.openHouseOnly
          ? nf.openHouseOnly
          : df.openHouseOnly,
      statuses: sameStringArray(df.statuses, bf.statuses)
        ? [...nf.statuses]
        : [...df.statuses],
      sort: df.sort === bf.sort ? nf.sort : df.sort,
    },
  };
}
