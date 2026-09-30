import type {
  ListingStatus,
  ListingTransactionType,
  PropertyType,
} from "@prisma/client";
import { listingPhotoSrc } from "@/lib/listings/photo-src";
import {
  expandOnMarketStatuses,
  ON_MARKET_LISTING_STATUSES,
  resolveListingAddedAt,
} from "@/lib/listings/constants";
import type {
  ListingCard,
  ListingSearchParams,
  ListingSearchResult,
} from "@/lib/listings/types";
import { typesenseTextMatchSettings } from "@/lib/listings/search-match";
import {
  buildTypesenseCapabilityScopedStatusFilter,
  buildTypesenseListingAuthorityFilter,
  composeTypesenseFilterWithAuthority,
  isListingEntitlementEnforcementEnabled,
  normalizeListingSearchStatuses,
  type TypesenseAuthorityFilterResult,
  type WorkspaceListingEntitlement,
} from "@/lib/tenancy/listing-entitlement";
import {
  getTypesenseCollectionName,
  getTypesenseSearchClient,
} from "@/lib/typesense/client";
import { typesenseFlagEnabled } from "@/lib/typesense/env";
import {
  applyNeonListingStatuses,
  loadNeonListingStatusesByMls,
} from "@/lib/typesense/hydrate-status";

type TypesenseListingDoc = {
  mlsNumber: string;
  addressLine: string;
  unitNumber?: string;
  city: string;
  community?: string;
  postalCode?: string;
  province?: string;
  status: string;
  segment?: string;
  transactionType: string;
  propertyType: string;
  listPrice: number;
  soldPrice?: number;
  beds: number;
  bedsLabel?: string;
  livingAreaRange?: string;
  baths: number;
  sqft?: number;
  parkingSpaces?: number;
  listedAt: number;
  updatedAtMls?: number;
  daysOnMarket?: number;
  brokerageName?: string;
  coverImageUrl?: string;
  location?: [number, number];
  openHouseStartsAt?: number[];
  openHouseEndsAt?: number[];
  nextOpenHouseStartsAt?: number;
};

function expandStatuses(
  params: ListingSearchParams,
): string[] | null {
  if (params.statuses?.length) {
    const out: string[] = [];
    for (const s of params.statuses) {
      if (s === "UNLISTED") {
        out.push("SUSPENDED", "TERMINATED", "EXPIRED");
      } else {
        out.push(s);
      }
    }
    return expandOnMarketStatuses(out);
  }
  if (params.status === "UNLISTED") {
    return ["SUSPENDED", "TERMINATED", "EXPIRED"];
  }
  if (params.status === "ALL") return null;
  if (params.status === "ACTIVE") return [...ON_MARKET_LISTING_STATUSES];
  if (params.status) return [params.status];
  return [...ON_MARKET_LISTING_STATUSES];
}

function quoteFilterValue(value: string): string {
  // Typesense: backtick-wrap values with special chars.
  if (/^[A-Za-z0-9_-]+$/.test(value)) return value;
  return `\`${value.replace(/`/g, "")}\``;
}

/** @internal Exported for G.10B1 selftests — keep in sync with quoteTypesenseFilterValue. */
export { quoteFilterValue as quoteTypesenseSearchFilterValue };

function buildFilterBy(params: ListingSearchParams): string | undefined {
  const parts: string[] = [];

  const statuses = expandStatuses(params);
  if (statuses?.length === 1) {
    parts.push(`status:=${statuses[0]}`);
  } else if (statuses && statuses.length > 1) {
    parts.push(`status:=[${statuses.join(",")}]`);
  }

  if (params.segment && params.segment !== "ALL") {
    parts.push(`segment:=${params.segment}`);
  } else if (!params.segment) {
    parts.push("segment:=[RESIDENTIAL,COMMERCIAL]");
  }

  if (params.transactionType && params.transactionType !== "ALL") {
    parts.push(`transactionType:=${params.transactionType}`);
  } else if (!params.transactionType && params.dataSource !== "fsbo") {
    parts.push("transactionType:=SALE");
  }

  if (params.cities?.length) {
    parts.push(
      `city:=[${params.cities.map(quoteFilterValue).join(",")}]`,
    );
  } else if (params.city) {
    parts.push(`city:=${quoteFilterValue(params.city)}`);
  }

  if (params.communities?.length) {
    parts.push(
      `community:=[${params.communities.map(quoteFilterValue).join(",")}]`,
    );
  } else if (params.community) {
    parts.push(`community:=${quoteFilterValue(params.community)}`);
  }

  if (params.propertyTypes?.length) {
    parts.push(`propertyType:=[${params.propertyTypes.join(",")}]`);
  } else if (params.propertyType) {
    parts.push(`propertyType:=${params.propertyType}`);
  }

  if (params.minPrice != null) parts.push(`listPrice:>=${params.minPrice}`);
  if (params.maxPrice != null) parts.push(`listPrice:<=${params.maxPrice}`);
  if (params.minBeds != null) parts.push(`beds:>=${params.minBeds}`);
  if (params.minBaths != null) parts.push(`baths:>=${params.minBaths}`);

  if (
    params.west != null &&
    params.south != null &&
    params.east != null &&
    params.north != null
  ) {
    parts.push(
      `location:[${params.south}, ${params.west}, ${params.north}, ${params.east}]`,
    );
  }

  return parts.length ? parts.join(" && ") : undefined;
}

/**
 * G.10B1 — compose product filters with capability-scoped authority when
 * enforcement is enabled. When OFF, returns base filters unchanged.
 */
export function buildEntitledTypesenseFilterBy(
  params: ListingSearchParams,
): TypesenseAuthorityFilterResult | { kind: "passthrough"; filterBy: string | undefined } {
  const base = buildFilterBy(params);
  const enforce = isListingEntitlementEnforcementEnabled(
    params.entitlementFilteringEnabled,
  );
  if (!enforce) {
    return { kind: "passthrough", filterBy: base };
  }
  // FSBO is not Typesense-indexed; caller already short-circuits.
  const statuses = normalizeListingSearchStatuses(params);
  const authority = buildTypesenseCapabilityScopedStatusFilter(
    params.entitlement ?? { workspaceId: "", authorities: [] },
    statuses,
  );
  // Missing entitlement → empty authorities → empty filter (fail closed).
  return composeTypesenseFilterWithAuthority(base, authority);
}

function emptyTypesenseSearchResult(
  providerName: "mock" | "proptx",
): ListingSearchResult {
  return {
    items: [],
    nextCursor: null,
    total: 0,
    provider: providerName,
  };
}

function isSoldNewestSort(params: ListingSearchParams): boolean {
  return (
    params.sort === "newest" &&
    (params.status === "SOLD" || Boolean(params.statuses?.includes("SOLD")))
  );
}

function buildSortBy(params: ListingSearchParams): string {
  const hasText = Boolean(params.q?.trim());

  if (params.sort === "price_desc") {
    return hasText ? "_text_match:desc,listPrice:desc" : "listPrice:desc";
  }
  if (params.sort === "newest") {
    if (isSoldNewestSort(params)) {
      return hasText
        ? "_text_match:desc,updatedAtMls:desc,listedAt:desc"
        : "updatedAtMls:desc,listedAt:desc";
    }
    // Match Neon: listedAt first, then MLS mod time (date-only listedAt ties).
    return hasText
      ? "_text_match:desc,listedAt:desc,updatedAtMls:desc"
      : "listedAt:desc,updatedAtMls:desc";
  }
  // price / price_asc / default
  return hasText ? "_text_match:desc,listPrice:asc" : "listPrice:asc";
}

function parsePageCursor(cursor: string | undefined): number {
  if (!cursor) return 1;
  if (cursor.startsWith("ts:")) {
    const n = Number(cursor.slice(3));
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  }
  // Legacy Neon mlsNumber cursors are not portable — start page 1.
  return 1;
}

function docToCard(doc: TypesenseListingDoc): ListingCard {
  const [lat, lng] = doc.location ?? [0, 0];
  const cover = doc.coverImageUrl
    ? listingPhotoSrc(doc.coverImageUrl) ?? doc.coverImageUrl
    : null;
  const listedAt = new Date(doc.listedAt * 1000).toISOString();
  const updatedAtMls =
    doc.updatedAtMls != null
      ? new Date(doc.updatedAtMls * 1000).toISOString()
      : null;

  const starts = doc.openHouseStartsAt ?? [];
  const ends = doc.openHouseEndsAt ?? [];
  const openHouses = starts.map((start, i) => ({
    startsAt: new Date(start * 1000).toISOString(),
    endsAt: new Date((ends[i] ?? start) * 1000).toISOString(),
  }));

  return {
    mlsNumber: doc.mlsNumber,
    status: doc.status as ListingStatus,
    segment: doc.segment,
    transactionType: doc.transactionType as ListingTransactionType,
    propertyType: doc.propertyType as PropertyType,
    listPrice: doc.listPrice,
    soldPrice: doc.soldPrice ?? null,
    beds: doc.beds,
    bedsLabel: doc.bedsLabel ?? null,
    baths: doc.baths,
    sqft: doc.sqft ?? null,
    livingAreaRange: doc.livingAreaRange ?? null,
    parkingSpaces: doc.parkingSpaces ?? 0,
    addressLine: doc.addressLine,
    unitNumber: doc.unitNumber ?? null,
    city: doc.city,
    community: doc.community ?? null,
    postalCode: doc.postalCode ?? null,
    province: doc.province || "ON",
    brokerageName: doc.brokerageName ?? "",
    lat,
    lng,
    primaryImageUrl: cover,
    imageUrls: cover ? [cover] : [],
    openHouses,
    daysOnMarket: doc.daysOnMarket ?? 0,
    listedAt,
    updatedAtMls,
    soldAt: null,
    isMock: false,
    dataSource: "mls",
    ownerTag: null,
  };
}

/**
 * Typesense-backed listing search.
 * Returns null when disabled, unsupported filters, or on hard failure
 * so the caller can fall back to Neon.
 * When entitlement enforcement is ON and MLS authority is empty, returns a
 * zero-result object (not null) so Neon cannot restore global MLS inventory.
 */
export async function typesenseSearch(
  params: ListingSearchParams,
  providerName: "mock" | "proptx",
): Promise<ListingSearchResult | null> {
  if (!typesenseFlagEnabled("TYPESENSE_SEARCH")) return null;

  // Not indexed yet — keep Neon path.
  if (params.openHouseOnly) return null;
  if (params.dataSource === "fsbo") return null;

  const entitled = buildEntitledTypesenseFilterBy(params);
  if (entitled.kind === "empty") {
    return emptyTypesenseSearchResult(providerName);
  }
  const filterBy =
    entitled.kind === "passthrough" ? entitled.filterBy : entitled.filterBy;

  try {
    const client = getTypesenseSearchClient();
    const collection = getTypesenseCollectionName();
    const limit = Math.min(params.limit ?? 40, 500);
    const page = parsePageCursor(params.cursor);
    const q = params.q?.trim() || "*";
    // Date-only listedAt ties hide same-day "Added 7h ago" behind "1 day ago"
    // unless we over-fetch and rank by resolveListingAddedAt.
    const rankByAddedAt =
      params.sort === "newest" &&
      !isSoldNewestSort(params) &&
      !params.cursor &&
      !params.q?.trim();
    const perPage = rankByAddedAt
      ? Math.min(Math.max(limit * 3, 36), 120)
      : limit;

    const result = await client
      .collections(collection)
      .documents()
      .search({
        q,
        query_by:
          "mlsNumber,addressLine,unitNumber,city,community,postalCode",
        query_by_weights: "4,3,2,2,2,1",
        filter_by: filterBy,
        sort_by: buildSortBy(params),
        per_page: perPage,
        page,
        prefix: true,
        ...typesenseTextMatchSettings(q),
        exhaustive_search: false,
      });

    const hits = (result.hits ?? []) as Array<{ document: TypesenseListingDoc }>;
    let items = hits.map((h) => docToCard(h.document));

    if (rankByAddedAt) {
      items = [...items]
        .sort((a, b) => {
          const aAt = resolveListingAddedAt(a)?.getTime() ?? 0;
          const bAt = resolveListingAddedAt(b)?.getTime() ?? 0;
          if (bAt !== aAt) return bAt - aAt;
          return b.mlsNumber.localeCompare(a.mlsNumber);
        })
        .slice(0, limit);
    }

    if (rankByAddedAt && !params.q?.trim() && isTypesenseNewestStale(items)) {
      console.warn(
        "[typesense/search] newest listedAt is stale; falling back to Neon",
      );
      return null;
    }

    const neonByMls = await loadNeonListingStatusesByMls(
      items.map((item) => item.mlsNumber),
    );
    items = applyNeonListingStatuses(items, neonByMls);

    const found = result.found ?? items.length;
    const hasMore = page * limit < found;

    return {
      items,
      nextCursor: hasMore ? `ts:${page + 1}` : null,
      total: found,
      provider: providerName,
    };
  } catch (error) {
    console.error("[typesense/search]", error);
    return null;
  }
}

function rankCardsByAddedAt(items: ListingCard[], limit: number): ListingCard[] {
  return [...items]
    .sort((a, b) => {
      const aAt = resolveListingAddedAt(a)?.getTime() ?? 0;
      const bAt = resolveListingAddedAt(b)?.getTime() ?? 0;
      if (bAt !== aAt) return bAt - aAt;
      return b.mlsNumber.localeCompare(a.mlsNumber);
    })
    .slice(0, limit);
}

/** If Typesense "newest" is older than this, the index is behind Neon. */
export const TYPESENSE_NEWEST_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/** True when the newest returned card's listedAt is older than the stale window. */
export function isTypesenseNewestStale(
  items: ReadonlyArray<Pick<ListingCard, "listedAt">>,
  nowMs = Date.now(),
): boolean {
  if (items.length === 0) return false;
  let newest = 0;
  for (const item of items) {
    const t = Date.parse(item.listedAt);
    if (Number.isFinite(t) && t > newest) newest = t;
  }
  if (newest <= 0) return false;
  return nowMs - newest > TYPESENSE_NEWEST_STALE_AFTER_MS;
}

export type HomeRailsPayload = {
  newListings: ListingCard[];
  openHouses: ListingCard[];
  sold: ListingCard[];
  forLease: ListingCard[];
  commercial: ListingCard[];
};

function openHouseFilterBy(
  params: Pick<
    ListingSearchParams,
    "cities" | "minPrice" | "maxPrice" | "propertyTypes" | "communities"
  >,
): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const toSec = nowSec + 90 * 24 * 60 * 60;
  const base = buildFilterBy({
    ...params,
    status: "ACTIVE",
    segment: "RESIDENTIAL",
    transactionType: "SALE",
  });
  const oh = `nextOpenHouseStartsAt:>=${nowSec} && nextOpenHouseStartsAt:<=${toSec}`;
  return base ? `${base} && ${oh}` : oh;
}

function openHouseFilterByEntitled(
  params: Pick<
    ListingSearchParams,
    | "cities"
    | "minPrice"
    | "maxPrice"
    | "propertyTypes"
    | "communities"
    | "entitlement"
    | "entitlementFilteringEnabled"
  >,
):
  | TypesenseAuthorityFilterResult
  | { kind: "passthrough"; filterBy: string } {
  const withOh = openHouseFilterBy(params);
  const enforce = isListingEntitlementEnforcementEnabled(
    params.entitlementFilteringEnabled,
  );
  if (!enforce) {
    return { kind: "passthrough", filterBy: withOh };
  }
  const authority = buildTypesenseListingAuthorityFilter(
    params.entitlement ?? { workspaceId: "", authorities: [] },
    "OPEN_HOUSES",
  );
  return composeTypesenseFilterWithAuthority(withOh, authority);
}

export type HomeRailsRailKey =
  | "newListings"
  | "sold"
  | "forLease"
  | "commercial"
  | "openHouses";

export type HomeRailsSearchPlan = {
  rail: HomeRailsRailKey;
  /** empty → do not issue Typesense query for this rail (fail closed). */
  kind: "empty" | "query";
  filterBy?: string;
  sortBy: string;
  perPage: number;
  rankNewest: boolean;
  take: number;
  /** Required capability for MLS authority on this rail (selftests / audits). */
  requiredCapability: "ACTIVE_LISTINGS" | "SOLD" | "OPEN_HOUSES";
};

export type HomeRailsTypesenseOptions = {
  cities?: string[];
  limit?: number;
  minPrice?: number;
  maxPrice?: number;
  propertyTypes?: PropertyType[];
  communities?: string[];
  /** Server-resolved G.10A entitlement (G.10B2H). Never from the client. */
  entitlement?: WorkspaceListingEntitlement;
  /**
   * Server-only force-enable for tests. Production route must omit this.
   * Never force-enable from public request params.
   */
  entitlementFilteringEnabled?: boolean;
};

function emptyHomeRailsPayload(): HomeRailsPayload {
  return {
    newListings: [],
    sold: [],
    forLease: [],
    commercial: [],
    openHouses: [],
  };
}

/**
 * Pure planner for homepage multi-search rails.
 * Each rail independently applies capability-scoped authority when enforcement ON.
 * Flag OFF → identical product filters to pre-G.10B2H (no sourceAuthorityKey).
 */
export function planTypesenseHomeRailsSearches(
  options: HomeRailsTypesenseOptions,
): HomeRailsSearchPlan[] {
  const limit = Math.min(options.limit ?? 12, 24);
  const overFetch = Math.min(Math.max(limit * 3, 36), 72);
  const openHouseLimit = 80;
  const entitlementCtx = {
    entitlement: options.entitlement,
    entitlementFilteringEnabled: options.entitlementFilteringEnabled,
  };
  const shared: Pick<
    ListingSearchParams,
    "cities" | "minPrice" | "maxPrice" | "propertyTypes" | "communities" | "sort"
  > = {
    cities: options.cities,
    minPrice: options.minPrice,
    maxPrice: options.maxPrice,
    propertyTypes: options.propertyTypes,
    communities: options.communities,
    sort: "newest",
  };

  const listingRails: Array<{
    rail: Exclude<HomeRailsRailKey, "openHouses">;
    params: ListingSearchParams;
    rankNewest: boolean;
    take: number;
    requiredCapability: "ACTIVE_LISTINGS" | "SOLD";
  }> = [
    {
      rail: "newListings",
      params: {
        ...shared,
        ...entitlementCtx,
        status: "ACTIVE",
        segment: "RESIDENTIAL",
        transactionType: "SALE",
        limit: overFetch,
      },
      rankNewest: true,
      take: limit,
      requiredCapability: "ACTIVE_LISTINGS",
    },
    {
      rail: "sold",
      params: {
        ...shared,
        ...entitlementCtx,
        status: "SOLD",
        segment: "ALL",
        transactionType: "SALE",
        limit,
      },
      rankNewest: false,
      take: limit,
      requiredCapability: "SOLD",
    },
    {
      rail: "forLease",
      params: {
        ...shared,
        ...entitlementCtx,
        status: "ACTIVE",
        segment: "ALL",
        transactionType: "LEASE",
        limit: overFetch,
      },
      rankNewest: true,
      take: limit,
      requiredCapability: "ACTIVE_LISTINGS",
    },
    {
      rail: "commercial",
      params: {
        ...shared,
        ...entitlementCtx,
        status: "ACTIVE",
        segment: "COMMERCIAL",
        transactionType: "SALE",
        limit: overFetch,
      },
      rankNewest: true,
      take: limit,
      requiredCapability: "ACTIVE_LISTINGS",
    },
  ];

  const plans: HomeRailsSearchPlan[] = [];

  for (const rail of listingRails) {
    const entitled = buildEntitledTypesenseFilterBy(rail.params);
    if (entitled.kind === "empty") {
      plans.push({
        rail: rail.rail,
        kind: "empty",
        sortBy: buildSortBy(rail.params),
        perPage: rail.params.limit ?? limit,
        rankNewest: rail.rankNewest,
        take: rail.take,
        requiredCapability: rail.requiredCapability,
      });
      continue;
    }
    plans.push({
      rail: rail.rail,
      kind: "query",
      filterBy: entitled.filterBy,
      sortBy: buildSortBy(rail.params),
      perPage: rail.params.limit ?? limit,
      rankNewest: rail.rankNewest,
      take: rail.take,
      requiredCapability: rail.requiredCapability,
    });
  }

  const ohEntitled = openHouseFilterByEntitled({
    ...shared,
    ...entitlementCtx,
  });
  if (ohEntitled.kind === "empty") {
    plans.push({
      rail: "openHouses",
      kind: "empty",
      sortBy: "nextOpenHouseStartsAt:asc",
      perPage: openHouseLimit,
      rankNewest: false,
      take: openHouseLimit,
      requiredCapability: "OPEN_HOUSES",
    });
  } else {
    plans.push({
      rail: "openHouses",
      kind: "query",
      filterBy: ohEntitled.filterBy,
      sortBy: "nextOpenHouseStartsAt:asc",
      perPage: openHouseLimit,
      rankNewest: false,
      take: openHouseLimit,
      requiredCapability: "OPEN_HOUSES",
    });
  }

  return plans;
}

/**
 * Map Typesense multi-search result slots onto rails using stable plan metadata.
 * Empty (unauthorized) rails consume no result index — prevents index-shift when
 * a middle rail is omitted from the multi-search request.
 */
export function reassembleTypesenseHomeRailsResults<T>(
  plans: readonly HomeRailsSearchPlan[],
  results: ReadonlyArray<{ hits?: ReadonlyArray<T> }>,
): {
  byRail: Record<HomeRailsRailKey, T[]>;
  consumedResultCount: number;
} {
  const byRail: Record<HomeRailsRailKey, T[]> = {
    newListings: [],
    sold: [],
    forLease: [],
    commercial: [],
    openHouses: [],
  };
  let resultIndex = 0;
  for (const plan of plans) {
    if (plan.kind === "empty") {
      byRail[plan.rail] = [];
      continue;
    }
    const hits = results[resultIndex]?.hits ?? [];
    resultIndex += 1;
    byRail[plan.rail] = [...hits];
  }
  return { byRail, consumedResultCount: resultIndex };
}

/**
 * One Typesense multi-search for homepage market rails (up to 5 queries).
 * G.10B2H: each rail is independently capability-scoped when enforcement ON.
 * Production flag remains OFF → identical filters to pre-wiring.
 */
export async function typesenseHomeRails(
  options: HomeRailsTypesenseOptions,
): Promise<HomeRailsPayload | null> {
  if (!typesenseFlagEnabled("TYPESENSE_SEARCH")) return null;

  const plans = planTypesenseHomeRailsSearches(options);
  const collection = getTypesenseCollectionName();
  const queryPlans = plans.filter(
    (p): p is HomeRailsSearchPlan & { kind: "query"; filterBy: string } =>
      p.kind === "query" && typeof p.filterBy === "string",
  );

  // All rails denied under enforcement → empty payload (never unfiltered query).
  if (queryPlans.length === 0) {
    return emptyHomeRailsPayload();
  }

  try {
    const client = getTypesenseSearchClient();
    const result = await client.multiSearch.perform(
      {
        searches: queryPlans.map((plan) => ({
          collection,
          q: "*",
          query_by: "mlsNumber,addressLine,city",
          filter_by: plan.filterBy,
          sort_by: plan.sortBy,
          per_page: plan.perPage,
          page: 1,
          num_typos: 0,
        })),
      },
      {},
    );

    const results = (result.results ?? []) as Array<{
      hits?: Array<{ document: TypesenseListingDoc }>;
    }>;

    const { byRail } = reassembleTypesenseHomeRailsResults(plans, results);

    const payload = emptyHomeRailsPayload();
    for (const plan of plans) {
      if (plan.kind === "empty") {
        payload[plan.rail] = [];
        continue;
      }
      const cards = byRail[plan.rail].map((h) => docToCard(h.document));
      payload[plan.rail] = plan.rankNewest
        ? rankCardsByAddedAt(cards, plan.take)
        : cards.slice(0, plan.take);
    }

    if (isTypesenseNewestStale(payload.newListings)) {
      console.warn(
        "[typesense/home-rails] newest listedAt is stale; falling back to Neon",
      );
      return null;
    }

    const neonByMls = await loadNeonListingStatusesByMls(
      [
        ...payload.newListings,
        ...payload.sold,
        ...payload.forLease,
        ...payload.commercial,
        ...payload.openHouses,
      ].map((item) => item.mlsNumber),
    );

    return {
      newListings: applyNeonListingStatuses(payload.newListings, neonByMls),
      sold: applyNeonListingStatuses(payload.sold, neonByMls),
      forLease: applyNeonListingStatuses(payload.forLease, neonByMls),
      commercial: applyNeonListingStatuses(payload.commercial, neonByMls),
      openHouses: applyNeonListingStatuses(payload.openHouses, neonByMls),
    };
  } catch (error) {
    console.error("[typesense/home-rails]", error);
    return null;
  }
}

/** Standalone open-house search (Typesense). Null → Neon fallback. */
export async function typesenseOpenHouses(options: {
  cities?: string[];
  city?: string;
  communities?: string[];
  community?: string;
  propertyTypes?: PropertyType[];
  minPrice?: number;
  maxPrice?: number;
  limit?: number;
  entitlement?: WorkspaceListingEntitlement;
  entitlementFilteringEnabled?: boolean;
}): Promise<ListingCard[] | null> {
  if (!typesenseFlagEnabled("TYPESENSE_SEARCH")) return null;

  try {
    const client = getTypesenseSearchClient();
    const collection = getTypesenseCollectionName();
    const limit = Math.min(options.limit ?? 80, 80);
    const cities =
      options.cities ?? (options.city ? [options.city] : undefined);
    const communities =
      options.communities ??
      (options.community ? [options.community] : undefined);

    const entitled = openHouseFilterByEntitled({
      cities,
      communities,
      propertyTypes: options.propertyTypes,
      minPrice: options.minPrice,
      maxPrice: options.maxPrice,
      entitlement: options.entitlement,
      entitlementFilteringEnabled: options.entitlementFilteringEnabled,
    });
    if (entitled.kind === "empty") {
      return [];
    }

    const result = await client
      .collections(collection)
      .documents()
      .search({
        q: "*",
        query_by: "mlsNumber,addressLine,city",
        filter_by: entitled.filterBy,
        sort_by: "nextOpenHouseStartsAt:asc",
        per_page: limit,
        page: 1,
        num_typos: 0,
      });

    const hits = (result.hits ?? []) as Array<{ document: TypesenseListingDoc }>;
    const cards = hits.map((h) => docToCard(h.document));
    const neonByMls = await loadNeonListingStatusesByMls(
      cards.map((item) => item.mlsNumber),
    );
    return applyNeonListingStatuses(cards, neonByMls);
  } catch (error) {
    console.error("[typesense/open-houses]", error);
    return null;
  }
}
