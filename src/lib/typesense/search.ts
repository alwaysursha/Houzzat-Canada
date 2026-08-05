import type {
  ListingStatus,
  ListingTransactionType,
  PropertyType,
} from "@prisma/client";
import { listingPhotoSrc } from "@/lib/listings/photo-src";
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

function buildSortBy(params: ListingSearchParams): string {
  const hasText = Boolean(params.q?.trim());
  const soldNewest =
    params.sort === "newest" &&
    (params.status === "SOLD" || params.statuses?.includes("SOLD"));

  if (params.sort === "price_desc") {
    return hasText ? "_text_match:desc,listPrice:desc" : "listPrice:desc";
  }
  if (params.sort === "newest") {
    if (soldNewest) {
      return hasText
        ? "_text_match:desc,updatedAtMls:desc"
        : "updatedAtMls:desc";
    }
    return hasText ? "_text_match:desc,listedAt:desc" : "listedAt:desc";
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
    openHouses: [],
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
        per_page: limit,
        page,
        prefix: true,
        num_typos: q === "*" ? 0 : 1,
        exhaustive_search: false,
      });

    const hits = (result.hits ?? []) as Array<{ document: TypesenseListingDoc }>;
    const items = hits.map((h) => docToCard(h.document));
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
