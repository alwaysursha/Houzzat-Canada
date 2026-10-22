import type {
  ListingStatus,
  ListingTransactionType,
  Prisma,
  PropertyType,
} from "@prisma/client";
import { boundingBox, haversineKm } from "@/lib/geo/distance";
import { formatBedsPlusLabel, parseListingFacts } from "@/lib/listings/facts";
import type { ListingSearchParams } from "@/lib/listings/types";
import { prisma } from "@/lib/prisma";
import { excludeStagingSnapshotWhere } from "@/lib/tenancy/templates/high-octane-staging-snapshot";

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

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/[,|]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/** Map SavedSearch.query / buyer-intent JSON → ListingSearchParams. */
export function savedQueryToListingSearchParams(
  query: unknown,
): ListingSearchParams {
  const q =
    query && typeof query === "object"
      ? (query as Record<string, unknown>)
      : {};

  const cities = asStringList(q.cities);
  const city = asString(q.city);
  const communities = asStringList(q.communities);
  const community = asString(q.community);
  const propertyTypeStrings = asStringList(q.propertyTypes);
  const propertyTypes = propertyTypeStrings.filter((t) =>
    PROPERTY_TYPES.has(t),
  ) as PropertyType[];

  const txnRaw = asString(q.transactionType);
  const transactionType =
    txnRaw === "SALE" || txnRaw === "LEASE" || txnRaw === "ALL"
      ? txnRaw
      : undefined;

  const segmentRaw = asString(q.segment);
  const segment =
    segmentRaw === "RESIDENTIAL" ||
    segmentRaw === "COMMERCIAL" ||
    segmentRaw === "PRE_CONSTRUCTION" ||
    segmentRaw === "ALL"
      ? segmentRaw
      : undefined;

  return {
    status: "ACTIVE",
    sort: "newest",
    city: cities.length ? undefined : city ?? undefined,
    cities: cities.length ? cities : undefined,
    community: communities.length ? undefined : community ?? undefined,
    communities: communities.length ? communities : undefined,
    propertyTypes: propertyTypes.length ? propertyTypes : undefined,
    minPrice: asNumber(q.minPrice) ?? undefined,
    maxPrice: asNumber(q.maxPrice) ?? undefined,
    minBeds: asNumber(q.minBeds) ?? undefined,
    minBaths: asNumber(q.minBaths) ?? undefined,
    transactionType: transactionType as
      | ListingTransactionType
      | "ALL"
      | undefined,
    segment,
    q: asString(q.q) ?? undefined,
  };
}

function inventorySourceFilter(): Prisma.ListingWhereInput {
  return {
    OR: [
      { AND: [{ dataSource: { not: "fsbo" } }, excludeStagingSnapshotWhere()] },
      { dataSource: "fsbo", ownerStatus: "ACTIVE" },
      {
        dataSource: "fsbo",
        status: {
          in: ["SOLD", "LEASED", "SUSPENDED", "TERMINATED", "EXPIRED"],
        },
      },
    ],
  };
}

function buildWhereFromSearchParams(
  params: ListingSearchParams,
): Prisma.ListingWhereInput {
  const and: Prisma.ListingWhereInput[] = [inventorySourceFilter()];

  if (params.status && params.status !== "ALL") {
    and.push({ status: params.status as ListingStatus });
  } else if (!params.status) {
    and.push({ status: "ACTIVE" });
  }

  if (params.cities?.length) {
    and.push({
      OR: params.cities.map((city) => ({
        city: { equals: city, mode: "insensitive" as const },
      })),
    });
  } else if (params.city) {
    and.push({ city: { equals: params.city, mode: "insensitive" } });
  }

  if (params.communities?.length) {
    and.push({
      OR: params.communities.map((community) => ({
        community: { equals: community, mode: "insensitive" as const },
      })),
    });
  } else if (params.community) {
    and.push({
      community: { equals: params.community, mode: "insensitive" },
    });
  }

  if (params.propertyTypes?.length) {
    and.push({ propertyType: { in: params.propertyTypes } });
  }

  if (params.segment && params.segment !== "ALL") {
    and.push({ segment: params.segment });
  } else if (!params.segment) {
    and.push({ segment: { in: ["RESIDENTIAL", "COMMERCIAL"] } });
  }

  if (params.transactionType && params.transactionType !== "ALL") {
    and.push({ transactionType: params.transactionType });
  } else if (!params.transactionType) {
    and.push({ transactionType: "SALE" });
  }

  if (params.minPrice != null || params.maxPrice != null) {
    and.push({
      listPrice: {
        ...(params.minPrice != null ? { gte: params.minPrice } : {}),
        ...(params.maxPrice != null ? { lte: params.maxPrice } : {}),
      },
    });
  }

  if (params.minBeds != null) {
    and.push({ beds: { gte: params.minBeds } });
  }
  if (params.minBaths != null) {
    and.push({ baths: { gte: params.minBaths } });
  }

  return { AND: and };
}

export type DigestListingCard = {
  mlsNumber: string;
  addressLine: string;
  unitNumber: string | null;
  city: string;
  community: string | null;
  listPrice: number;
  soldPrice: number | null;
  beds: number;
  bedsLabel: string | null;
  baths: number;
  sqft: number | null;
  imageUrl: string | null;
  status: ListingStatus;
  listedAt: Date;
  soldAt: Date | null;
};

const digestSelect = {
  mlsNumber: true,
  addressLine: true,
  unitNumber: true,
  city: true,
  community: true,
  listPrice: true,
  soldPrice: true,
  beds: true,
  baths: true,
  sqft: true,
  status: true,
  listedAt: true,
  soldAt: true,
  facts: true,
  media: {
    orderBy: [{ isPrimary: "desc" as const }, { sortOrder: "asc" as const }],
    take: 1,
    select: { url: true },
  },
} satisfies Prisma.ListingSelect;

function toDigestCard(
  row: Prisma.ListingGetPayload<{ select: typeof digestSelect }>,
): DigestListingCard {
  const facts = parseListingFacts(row.facts);
  return {
    mlsNumber: row.mlsNumber,
    addressLine: row.addressLine,
    unitNumber: row.unitNumber,
    city: row.city,
    community: row.community,
    listPrice: row.listPrice,
    soldPrice: row.soldPrice,
    beds: row.beds,
    bedsLabel: formatBedsPlusLabel(row.beds, facts),
    baths: row.baths,
    sqft: row.sqft,
    imageUrl: row.media[0]?.url ?? null,
    status: row.status,
    listedAt: row.listedAt,
    soldAt: row.soldAt,
  };
}

/**
 * New ACTIVE listings matching a saved-search query since `since`.
 * Uses Prisma so `listedAt` filtering is exact (digest-critical).
 */
export async function findNewListingsForSavedQuery(
  query: unknown,
  opts: { since: Date; limit?: number },
): Promise<DigestListingCard[]> {
  const params = savedQueryToListingSearchParams(query);
  const where = buildWhereFromSearchParams(params);
  const limit = Math.min(Math.max(opts.limit ?? 12, 1), 24);

  const rows = await prisma.listing.findMany({
    where: {
      AND: [
        where,
        { status: "ACTIVE" },
        { listedAt: { gt: opts.since } },
      ],
    },
    orderBy: [{ listedAt: "desc" }, { mlsNumber: "desc" }],
    take: limit,
    select: digestSelect,
  });

  return rows.map(toDigestCard);
}

export type NeighborhoodActivity = {
  newListings: DigestListingCard[];
  soldListings: DigestListingCard[];
  newCount: number;
  soldCount: number;
  medianSoldPrice: number | null;
  radiusKm: number;
};

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2);
  }
  return sorted[mid] ?? null;
}

/**
 * Nearby new + sold activity for a seller home pin (default 2 km).
 */
export async function findNeighborhoodActivity(opts: {
  lat: number;
  lng: number;
  since: Date;
  radiusKm?: number;
  limit?: number;
}): Promise<NeighborhoodActivity> {
  const radiusKm = opts.radiusKm ?? 2;
  const limit = Math.min(Math.max(opts.limit ?? 8, 1), 16);
  const box = boundingBox(opts.lat, opts.lng, radiusKm);

  const candidates = await prisma.listing.findMany({
    where: {
      AND: [
        inventorySourceFilter(),
        { lat: { gte: box.south, lte: box.north } },
        { lng: { gte: box.west, lte: box.east } },
        {
          OR: [
            { status: "ACTIVE", listedAt: { gt: opts.since } },
            {
              status: { in: ["SOLD", "LEASED"] },
              soldAt: { gt: opts.since },
            },
          ],
        },
      ],
    },
    select: {
      ...digestSelect,
      lat: true,
      lng: true,
    },
    take: 200,
    orderBy: { updatedAt: "desc" },
  });

  const nearby = candidates
    .map((row) => ({
      row,
      distanceKm: haversineKm(opts.lat, opts.lng, row.lat, row.lng),
    }))
    .filter((x) => x.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  const newListings = nearby
    .filter((x) => x.row.status === "ACTIVE")
    .slice(0, limit)
    .map((x) => toDigestCard(x.row));

  const soldNearby = nearby.filter(
    (x) => x.row.status === "SOLD" || x.row.status === "LEASED",
  );
  const soldListings = soldNearby.slice(0, limit).map((x) => toDigestCard(x.row));
  const soldPrices = soldNearby
    .map((x) => x.row.soldPrice ?? x.row.listPrice)
    .filter((n) => n > 0);

  return {
    newListings,
    soldListings,
    newCount: nearby.filter((x) => x.row.status === "ACTIVE").length,
    soldCount: soldNearby.length,
    medianSoldPrice: median(soldPrices),
    radiusKm,
  };
}
