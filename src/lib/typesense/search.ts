import type {
  ListingStatus,
  ListingTransactionType,
  PropertyType,
} from "@prisma/client";
import { listingPhotoSrc } from "@/lib/listings/photo-src";
import { resolveListingAddedAt } from "@/lib/listings/constants";
import type {
  ListingCard,
  ListingSearchParams,
  ListingSearchResult,
} from "@/lib/listings/types";
import {
  getTypesenseCollectionName,
  getTypesenseSearchClient,
} from "@/lib/typesense/client";
import { typesenseFlagEnabled } from "@/lib/typesense/env";

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
    return [...new Set(out)];
  }
  if (params.status === "UNLISTED") {
    return ["SUSPENDED", "TERMINATED", "EXPIRED"];
  }
  if (params.status === "ALL") return null;
  if (params.status) return [params.status];
  return ["ACTIVE"];
}

function quoteFilterValue(value: string): string {
  // Typesense: backtick-wrap values with special chars.
  if (/^[A-Za-z0-9_-]+$/.test(value)) return value;
  return `\`${value.replace(/`/g, "")}\``;
}

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
    baths: doc.baths,
    sqft: doc.sqft ?? null,
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
 */
export async function typesenseSearch(
  params: ListingSearchParams,
  providerName: "mock" | "proptx",
): Promise<ListingSearchResult | null> {
  if (!typesenseFlagEnabled("TYPESENSE_SEARCH")) return null;

  // Not indexed yet — keep Neon path.
  if (params.openHouseOnly) return null;
  if (params.dataSource === "fsbo") return null;

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
      !params.cursor;
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
        filter_by: buildFilterBy(params),
        sort_by: buildSortBy(params),
        per_page: perPage,
        page,
        prefix: true,
        num_typos: q === "*" ? 0 : 1,
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

/**
 * One Typesense multi-search for homepage market rails (5 queries, 1 round-trip).
 */
export async function typesenseHomeRails(options: {
  cities?: string[];
  limit?: number;
  minPrice?: number;
  maxPrice?: number;
  propertyTypes?: PropertyType[];
  communities?: string[];
}): Promise<HomeRailsPayload | null> {
  if (!typesenseFlagEnabled("TYPESENSE_SEARCH")) return null;

  const limit = Math.min(options.limit ?? 12, 24);
  const overFetch = Math.min(Math.max(limit * 3, 36), 72);
  const openHouseLimit = 80;
  const collection = getTypesenseCollectionName();
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

  const specs: ListingSearchParams[] = [
    {
      ...shared,
      status: "ACTIVE",
      segment: "RESIDENTIAL",
      transactionType: "SALE",
      limit: overFetch,
    },
    {
      ...shared,
      status: "SOLD",
      segment: "ALL",
      transactionType: "SALE",
      limit,
    },
    {
      ...shared,
      status: "ACTIVE",
      segment: "ALL",
      transactionType: "LEASE",
      limit: overFetch,
    },
    {
      ...shared,
      status: "ACTIVE",
      segment: "COMMERCIAL",
      transactionType: "SALE",
      limit: overFetch,
    },
  ];

  try {
    const client = getTypesenseSearchClient();
    const result = await client.multiSearch.perform(
      {
        searches: [
          ...specs.map((params) => ({
            collection,
            q: "*",
            query_by: "mlsNumber,addressLine,city",
            filter_by: buildFilterBy(params),
            sort_by: buildSortBy(params),
            per_page: params.limit ?? limit,
            page: 1,
            num_typos: 0,
          })),
          {
            collection,
            q: "*",
            query_by: "mlsNumber,addressLine,city",
            filter_by: openHouseFilterBy(shared),
            sort_by: "nextOpenHouseStartsAt:asc",
            per_page: openHouseLimit,
            page: 1,
            num_typos: 0,
          },
        ],
      },
      {},
    );

    const results = (result.results ?? []) as Array<{
      hits?: Array<{ document: TypesenseListingDoc }>;
    }>;

    const toItems = (index: number, rankNewest: boolean, take = limit) => {
      const hits = results[index]?.hits ?? [];
      const cards = hits.map((h) => docToCard(h.document));
      return rankNewest
        ? rankCardsByAddedAt(cards, take)
        : cards.slice(0, take);
    };

    return {
      newListings: toItems(0, true),
      sold: toItems(1, false),
      forLease: toItems(2, true),
      commercial: toItems(3, true),
      openHouses: toItems(4, false, openHouseLimit),
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

    const result = await client
      .collections(collection)
      .documents()
      .search({
        q: "*",
        query_by: "mlsNumber,addressLine,city",
        filter_by: openHouseFilterBy({
          cities,
          communities,
          propertyTypes: options.propertyTypes,
          minPrice: options.minPrice,
          maxPrice: options.maxPrice,
        }),
        sort_by: "nextOpenHouseStartsAt:asc",
        per_page: limit,
        page: 1,
        num_typos: 0,
      });

    const hits = (result.hits ?? []) as Array<{ document: TypesenseListingDoc }>;
    return hits.map((h) => docToCard(h.document));
  } catch (error) {
    console.error("[typesense/open-houses]", error);
    return null;
  }
}
