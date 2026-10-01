import type {
  ListingStatus,
  Prisma,
  PropertyType,
} from "@prisma/client";
import {
  expandOnMarketStatuses,
  ON_MARKET_LISTING_STATUSES,
} from "@/lib/listings/constants";
import { ownerListingTag } from "@/lib/owner/pricing";
import { prisma } from "@/lib/prisma";
import { suggestedCitiesForLocation } from "@/lib/geo/regions";
import { serviceAreaCityWhere } from "@/lib/listings/precise-property-search";
import {
  addressQueryKeepsAllTokens,
  compareStreetHistory,
  filterAndRankListingsByQuery,
  listingQueryCandidateWhere,
  normalizeTypesenseStreetQuery,
} from "@/lib/listings/search-match";
import { listingPhotoSrc } from "@/lib/listings/photo-src";
import { listingPath } from "@/lib/listings/listing-path";
import type {
  AutocompleteSuggestion,
  ListingCard,
  ListingDetail,
  ListingProvider,
  ListingSearchParams,
  ListingSearchResult,
  AutocompleteOptions,
} from "@/lib/listings/types";
import { getPropTxSyncHealth } from "@/lib/proptx/sync-health";
import { isPropTxConfigured } from "@/lib/proptx/config";
import {
  formatListingAddressSearchLine,
  resolveListingAddedAt,
} from "@/lib/listings/constants";
import { formatBedsPlusLabel, parseListingFacts } from "@/lib/listings/facts";
import {
  buildPrismaEntitledInventoryWhere,
  buildPrismaListingAuthorityWhere,
  isListingEntitlementEnforcementEnabled,
  normalizeListingSearchStatuses,
  type WorkspaceListingEntitlement,
} from "@/lib/tenancy/listing-entitlement";
import { typesenseAutocomplete } from "@/lib/typesense/autocomplete";
import {
  typesenseOpenHouses,
  typesenseSearch,
} from "@/lib/typesense/search";

function sortCardsByAddedAtDesc<T extends ListingCard>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aAt = resolveListingAddedAt(a)?.getTime() ?? 0;
    const bAt = resolveListingAddedAt(b)?.getTime() ?? 0;
    if (bAt !== aAt) return bAt - aAt;
    return b.mlsNumber.localeCompare(a.mlsNumber);
  });
}

export function toCard(
  listing: Prisma.ListingGetPayload<{
    include: {
      media: true;
      openHouses: true;
    };
  }>,
): ListingCard {
  const primary =
    listing.media.find((m) => m.isPrimary) ?? listing.media[0] ?? null;
  const imageUrls = (() => {
    const urls: string[] = [];
    const seen = new Set<string>();
    if (primary?.url) {
      const src = listingPhotoSrc(primary.url) ?? primary.url;
      urls.push(src);
      seen.add(src);
    }
    for (const m of listing.media) {
      const src = listingPhotoSrc(m.url) ?? m.url;
      if (!m.url || seen.has(src)) continue;
      urls.push(src);
      seen.add(src);
      if (urls.length >= 12) break;
    }
    return urls;
  })();
  const upcoming = listing.openHouses
    .filter((oh) => oh.endsAt.getTime() >= Date.now())
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .slice(0, 2);

  const isOwner = listing.dataSource === "fsbo";
  const facts = parseListingFacts(listing.facts);
  const bedsLabel = formatBedsPlusLabel(listing.beds, facts);

  return {
    mlsNumber: listing.mlsNumber,
    status: listing.status,
    segment: listing.segment,
    transactionType: listing.transactionType,
    propertyType: listing.propertyType,
    listPrice: listing.listPrice,
    soldPrice: listing.soldPrice,
    beds: listing.beds,
    bedsLabel,
    baths: listing.baths,
    sqft: listing.sqft,
    livingAreaRange: facts?.livingAreaRange ?? null,
    parkingSpaces: listing.parkingSpaces,
    addressLine: listing.addressLine,
    unitNumber: listing.unitNumber,
    city: listing.city,
    community: listing.community,
    postalCode: listing.postalCode,
    province: listing.province,
    brokerageName: listing.brokerageName,
    lat: listing.lat,
    lng: listing.lng,
    primaryImageUrl: primary?.url
      ? listingPhotoSrc(primary.url) ?? primary.url
      : null,
    imageUrls,
    openHouses: upcoming.map((oh) => ({
      startsAt: oh.startsAt.toISOString(),
      endsAt: oh.endsAt.toISOString(),
    })),
    daysOnMarket: listing.daysOnMarket,
    listedAt: listing.listedAt.toISOString(),
    updatedAtMls: listing.updatedAtMls
      ? listing.updatedAtMls.toISOString()
      : null,
    soldAt: (() => {
      if (!listing.soldAt) return null;
      // CloseDate was historically stored as soldAt; ignore future closings.
      if (listing.soldAt.getTime() > Date.now() + 86_400_000) return null;
      return listing.soldAt.toISOString();
    })(),
    isMock: listing.isMock,
    dataSource: listing.dataSource,
    ownerTag: isOwner ? ownerListingTag(listing.transactionType) : null,
  };
}

function structuredCityNames(params: Pick<ListingSearchParams, "city" | "cities">): string[] {
  const listed = (params.cities ?? []).map((city) => city.trim()).filter(Boolean);
  if (listed.length > 0) return listed;
  const one = params.city?.trim();
  return one ? [one] : [];
}

/**
 * A Typesense text result, including a deliberate zero, is the answer.
 * Neon still covers a first-page structured city miss and an explicit
 * off-market status miss. A later Typesense page (`ts:`) is the end of
 * that index.
 */
const OFF_MARKET_STATUS = new Set([
  "SOLD",
  "LEASED",
  "TERMINATED",
  "SUSPENDED",
  "EXPIRED",
  "UNLISTED",
  "CANCELLED",
]);

function requestsOffMarketListings(
  params: Pick<ListingSearchParams, "status" | "statuses">,
): boolean {
  const tokens =
    params.statuses && params.statuses.length > 0
      ? params.statuses
      : params.status && params.status !== "ALL"
        ? [params.status]
        : [];
  return tokens.some((status) => OFF_MARKET_STATUS.has(status));
}

export function typesenseResultNeedsNeonFallback(
  params: Pick<
    ListingSearchParams,
    "q" | "city" | "cities" | "cursor" | "status" | "statuses"
  >,
  typesenseItemCount: number,
): boolean {
  if (typesenseItemCount !== 0) return false;
  // A later Typesense page is the end of that index, not a Neon page.
  if (params.cursor?.startsWith("ts:")) return false;
  if (structuredCityNames(params).length > 0) return true;
  // Text queries stay on the Typesense result, including zero. The Neon
  // substring matcher is not a substitute for that result.
  if (params.q?.trim()) return false;
  // Sold, terminated, and cancelled searches are explicit. An empty
  // Typesense page is a miss; Neon still applies entitlement and VOW rules.
  return requestsOffMarketListings(params);
}

function orderStreetHistory(
  params: ListingSearchParams,
  result: ListingSearchResult,
): ListingSearchResult {
  const q = normalizeTypesenseStreetQuery(params.q ?? "");
  if (!q.trim() || !addressQueryKeepsAllTokens(q)) return result;
  return {
    ...result,
    items: [...result.items].sort(compareStreetHistory),
  };
}

export class DbListingProvider implements ListingProvider {
  constructor(readonly name: "mock" | "proptx") {}

  /**
   * PropTx mode must not surface seeded mock inventory.
   * Mock mode keeps demo rows + FSBO.
   */
  private inventorySourceFilter(
    dataSource?: ListingSearchParams["dataSource"],
    entitlementCtx?: Pick<
      ListingSearchParams,
      "entitlement" | "entitlementFilteringEnabled" | "status" | "statuses"
    >,
  ): Prisma.ListingWhereInput {
    const enforce = isListingEntitlementEnforcementEnabled(
      entitlementCtx?.entitlementFilteringEnabled,
    );
    if (enforce) {
      const entitled = buildPrismaEntitledInventoryWhere({
        entitlement: entitlementCtx?.entitlement,
        dataSource,
        statuses: normalizeListingSearchStatuses({
          status: entitlementCtx?.status,
          statuses: entitlementCtx?.statuses,
        }),
      });
      if (entitled.kind === "empty") {
        // Impossible match — fail closed for MLS (no OR: []).
        return { id: "__entitlement_deny__" };
      }
      return entitled.where;
    }

    if (dataSource === "fsbo") {
      return { dataSource: "fsbo", ownerStatus: "ACTIVE" };
    }

    if (this.name === "proptx") {
      if (dataSource === "mls") {
        return { dataSource: "mls", isMock: false };
      }
      return {
        OR: [
          { dataSource: "mls", isMock: false },
          { dataSource: "fsbo", ownerStatus: "ACTIVE" },
        ],
      };
    }

    if (dataSource === "mls") {
      return { dataSource: { not: "fsbo" } };
    }
    return {
      OR: [
        { dataSource: { not: "fsbo" } },
        { dataSource: "fsbo", ownerStatus: "ACTIVE" },
      ],
    };
  }

  async search(params: ListingSearchParams): Promise<ListingSearchResult> {
    const fromTypesense = await typesenseSearch(params, this.name);
    // Structured city and explicit off-market misses continue to Neon.
    // A text result, including zero, stays the result.
    if (
      fromTypesense &&
      !typesenseResultNeedsNeonFallback(params, fromTypesense.items.length)
    ) {
      if (
        params.sort === "newest" &&
        params.status !== "SOLD" &&
        !params.q?.trim()
      ) {
        return {
          ...fromTypesense,
          items: sortCardsByAddedAtDesc(fromTypesense.items),
        };
      }
      return orderStreetHistory(params, fromTypesense);
    }

    // Map search needs a denser pin set; list pages stay lighter.
    const limit = Math.min(params.limit ?? 40, 500);

    const where: Prisma.ListingWhereInput = {
      AND: [],
    };

    const enforce = isListingEntitlementEnforcementEnabled(
      params.entitlementFilteringEnabled,
    );
    // When entitlement enforces capability-scoped status branches, status is
    // already inside inventorySourceFilter — do not apply a second global
    // status IN that would cross-product capabilities.
    if (!enforce) {
      if (params.statuses?.length) {
        const prismaStatuses: ListingStatus[] = [];
        for (const s of params.statuses) {
          if (s === "UNLISTED") {
            prismaStatuses.push("SUSPENDED", "TERMINATED", "EXPIRED");
          } else {
            prismaStatuses.push(s);
          }
        }
        where.status = {
          in: expandOnMarketStatuses(prismaStatuses),
        };
      } else if (params.status === "UNLISTED") {
        where.status = { in: ["SUSPENDED", "TERMINATED", "EXPIRED"] };
      } else if (params.status === "ALL") {
        // No status filter — active + sold/leased/unlisted.
      } else if (params.status === "ACTIVE") {
        where.status = { in: [...ON_MARKET_LISTING_STATUSES] };
      } else if (params.status) {
        where.status = params.status;
      } else {
        where.status = { in: [...ON_MARKET_LISTING_STATUSES] };
      }
    }

    (where.AND as Prisma.ListingWhereInput[]).push(
      this.inventorySourceFilter(params.dataSource, params),
    );

    const cityNames = structuredCityNames(params);
    if (cityNames.length) {
      (where.AND as Prisma.ListingWhereInput[]).push(
        serviceAreaCityWhere(cityNames),
      );
    }
    if (params.propertyTypes?.length) {
      where.propertyType = { in: params.propertyTypes };
    } else if (params.propertyType) {
      where.propertyType = params.propertyType;
    }
    if (params.segment && params.segment !== "ALL") {
      where.segment = params.segment;
    } else if (!params.segment) {
      // Default public search excludes pre-construction (has its own hub)
      where.segment = { in: ["RESIDENTIAL", "COMMERCIAL"] };
    }
    if (params.transactionType && params.transactionType !== "ALL") {
      where.transactionType = params.transactionType;
    } else if (!params.transactionType && params.dataSource !== "fsbo") {
      // Default to sale so existing buy/search links stay correct
      where.transactionType = "SALE";
    }
    if (params.minPrice != null || params.maxPrice != null) {
      where.listPrice = {
        gte: params.minPrice,
        lte: params.maxPrice,
      };
    }
    if (params.minBeds != null) {
      where.beds = { gte: params.minBeds };
    }
    if (params.minBaths != null) {
      where.baths = { gte: params.minBaths };
    }
    const andFilters = Array.isArray(where.AND)
      ? [...where.AND]
      : where.AND
        ? [where.AND]
        : [];
    if (params.communities?.length) {
      andFilters.push({
        OR: params.communities.map((community) => ({
          community: { equals: community, mode: "insensitive" as const },
        })),
      });
    } else if (params.community) {
      where.community = { equals: params.community, mode: "insensitive" };
    }
    if (
      params.west != null &&
      params.south != null &&
      params.east != null &&
      params.north != null
    ) {
      andFilters.push(
        { lng: { gte: params.west, lte: params.east } },
        { lat: { gte: params.south, lte: params.north } },
      );
    }
    if (params.openHouseOnly) {
      where.openHouses = {
        some: { endsAt: { gte: new Date() } },
      };
    }
    if (params.q?.trim()) {
      andFilters.push(listingQueryCandidateWhere(params.q));
    }
    where.AND = andFilters;

    const orderBy =
      params.sort === "newest"
        ? params.status === "SOLD" || params.statuses?.includes("SOLD")
          ? ([
              { soldAt: { sort: "desc", nulls: "last" } },
              { updatedAtMls: "desc" },
              { listedAt: "desc" },
              { mlsNumber: "desc" },
            ] as const)
          : ([{ listedAt: "desc" }, { updatedAtMls: "desc" }, { mlsNumber: "desc" }] as const)
        : params.sort === "price_desc"
          ? ([{ listPrice: "desc" }, { mlsNumber: "desc" }] as const)
          : ([{ listPrice: "asc" }, { mlsNumber: "asc" }] as const);

    const rankByAddedAt =
      params.sort === "newest" &&
      params.status !== "SOLD" &&
      !params.statuses?.includes("SOLD") &&
      !params.cursor;
    const fetchTake = rankByAddedAt
      ? Math.min(Math.max(limit * 3, 36), 120)
      : limit + 1;

    const [total, rows] = await Promise.all([
      prisma.listing.count({ where }),
      prisma.listing.findMany({
        where,
        include: {
          media: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], take: 1 },
          openHouses: { orderBy: { startsAt: "asc" } },
        },
        orderBy: [...orderBy],
        take: fetchTake,
        ...(params.cursor
          ? {
              skip: 1,
              cursor: { mlsNumber: params.cursor },
            }
          : {}),
      }),
    ]);

    let items = rows.map(toCard);
    if (rankByAddedAt) {
      items = sortCardsByAddedAtDesc(items).slice(0, limit);
    } else if (items.length > limit) {
      items = items.slice(0, limit);
    }
    const hasMore = rankByAddedAt
      ? total > limit
      : rows.length > limit;

    return orderStreetHistory(params, {
      items,
      nextCursor: hasMore
        ? items[items.length - 1]?.mlsNumber ?? null
        : null,
      total,
      provider: this.name,
    });
  }

  async getByMls(mlsNumber: string): Promise<ListingDetail | null> {
    const listing = await prisma.listing.findUnique({
      where: { mlsNumber },
      include: {
        media: { orderBy: { sortOrder: "asc" } },
        openHouses: { orderBy: { startsAt: "asc" } },
        history: { orderBy: { contractDate: "desc" } },
        rooms: { orderBy: { sortOrder: "asc" } },
      },
    });
    if (!listing) return null;
    if (
      listing.dataSource === "fsbo" &&
      listing.ownerStatus !== "ACTIVE"
    ) {
      return null;
    }
    if (
      this.name === "proptx" &&
      listing.isMock &&
      listing.dataSource !== "fsbo"
    ) {
      return null;
    }
    return listing;
  }

  /**
   * Lean listing detail for page SSR / metadata first paint.
   * Media capped at 5; history only recent Price Change rows (price chip).
   * Rooms + open houses load after paint via deferred API.
   */
  async getByMlsForDetailPage(mlsNumber: string): Promise<ListingDetail | null> {
    const listing = await prisma.listing.findUnique({
      where: { mlsNumber },
      include: {
        media: {
          orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
          take: 5,
        },
        history: {
          where: { event: { contains: "Price Change", mode: "insensitive" } },
          orderBy: [{ lastUpdatedAt: "desc" }, { contractDate: "desc" }],
          take: 5,
        },
      },
    });
    if (!listing) return null;
    if (
      listing.dataSource === "fsbo" &&
      listing.ownerStatus !== "ACTIVE"
    ) {
      return null;
    }
    if (
      this.name === "proptx" &&
      listing.isMock &&
      listing.dataSource !== "fsbo"
    ) {
      return null;
    }
    return {
      ...listing,
      openHouses: [],
      rooms: [],
    };
  }

  async autocomplete(
    query: string,
    options?: AutocompleteOptions,
  ): Promise<AutocompleteSuggestion[]> {
    const txn = options?.transactionType;
    const enforce = isListingEntitlementEnforcementEnabled(
      options?.entitlementFilteringEnabled,
    );
    const inventory = this.inventorySourceFilter(undefined, {
      entitlement: options?.entitlement,
      entitlementFilteringEnabled: options?.entitlementFilteringEnabled,
      // Typed lookup may discover any authorized status. Empty browse stays
      // on-market in emptyAutocomplete.
      status: "ALL",
    });
    const publishedWhere: Prisma.ListingWhereInput = {
      AND: [
        inventory,
        ...(txn ? [{ transactionType: txn }] : []),
      ],
    };
    const publicWhere: Prisma.ListingWhereInput = enforce
      ? publishedWhere
      : { AND: [publishedWhere, { status: "ACTIVE" }] };

    if (options?.empty) {
      return this.emptyAutocomplete(txn, {
        city: options.city,
        lat: options.lat,
        lng: options.lng,
      });
    }

    const q = query.trim();
    if (q.length < 1) return [];

    const fromTypesense = await typesenseAutocomplete(q, options);
    if (fromTypesense) return fromTypesense;

    const looksLikeMls = /^[A-Za-z]?\d[\w-]{2,}$/.test(q) || /^[A-Za-z]\d/i.test(q);
    const addressLike = /^\d+\s+\S+/.test(q) || /\d/.test(q);

    const candidates = await prisma.listing.findMany({
      where: {
        AND: [publishedWhere, listingQueryCandidateWhere(q)],
      },
      // Address queries: larger pool + newest first so progressive typing isn't
      // drowned by cheap unrelated matches ordered by listPrice.
      take: addressLike || !looksLikeMls ? 120 : 80,
      orderBy: looksLikeMls
        ? { mlsNumber: "asc" }
        : addressLike
          ? { updatedAt: "desc" }
          : { listedAt: "desc" },
      select: {
        mlsNumber: true,
        addressLine: true,
        unitNumber: true,
        city: true,
        community: true,
        province: true,
        postalCode: true,
        lat: true,
        lng: true,
        transactionType: true,
        listPrice: true,
        beds: true,
        baths: true,
        parkingSpaces: true,
        status: true,
        propertyType: true,
        brokerageName: true,
        listedAt: true,
        updatedAtMls: true,
        daysOnMarket: true,
        facts: true,
        media: {
          orderBy: { sortOrder: "asc" },
          take: 1,
          select: { url: true, isPrimary: true },
        },
      },
    });

    const matched = filterAndRankListingsByQuery(candidates, q);
    // Active first, keep fuzzy rank within each bucket.
    const ranked = [
      ...matched.filter((l) => l.status === "ACTIVE"),
      ...matched.filter((l) => l.status !== "ACTIVE"),
    ].slice(0, 16);

    const mlsHits: AutocompleteSuggestion[] = [];
    const listingHits: AutocompleteSuggestion[] = [];

    for (const l of ranked) {
      const primary =
        l.media.find((m) => m.isPrimary) ?? l.media[0] ?? null;
      const street = formatListingAddressSearchLine({
        addressLine: l.addressLine,
        unitNumber: l.unitNumber,
        city: l.city,
        community: l.community,
        province: l.province || "ON",
        postalCode: l.postalCode,
      });
      const mlsMatch = l.mlsNumber.toLowerCase().includes(q.toLowerCase());
      const row: AutocompleteSuggestion = {
        type: mlsMatch && looksLikeMls ? "mls" : "listing",
        group: mlsMatch && looksLikeMls ? "mls" : "listings",
        label: street,
        subtitle: `MLS® ${l.mlsNumber}`,
        mlsNumber: l.mlsNumber,
        city: l.city,
        community: l.community,
        province: l.province || "ON",
        unitNumber: l.unitNumber,
        lat: l.lat,
        lng: l.lng,
        href: listingPath({
          mlsNumber: l.mlsNumber,
          addressLine: l.addressLine,
          unitNumber: l.unitNumber,
          city: l.city,
        }),
        listPrice: l.listPrice,
        beds: l.beds,
        bedsLabel: formatBedsPlusLabel(l.beds, parseListingFacts(l.facts)),
        baths: l.baths,
        parkingSpaces: l.parkingSpaces,
        status: l.status,
        propertyType: l.propertyType,
        imageUrl: primary?.url ?? null,
        transactionType: l.transactionType,
        brokerageName: l.brokerageName,
        listedAt: l.listedAt ? l.listedAt.toISOString() : null,
        updatedAtMls: l.updatedAtMls ? l.updatedAtMls.toISOString() : null,
        daysOnMarket: l.daysOnMarket,
      };
      if (mlsMatch && looksLikeMls) mlsHits.push(row);
      else listingHits.push(row);
    }

    const qLower = q.toLowerCase();
    const citySet = new Map<string, { lat: number; lng: number }>();
    const communitySet = new Map<
      string,
      { city: string; lat: number; lng: number }
    >();

    for (const l of ranked) {
      if (l.city.toLowerCase().includes(qLower) && !citySet.has(l.city)) {
        citySet.set(l.city, { lat: l.lat, lng: l.lng });
      }
      if (
        l.community &&
        l.community.toLowerCase().includes(qLower) &&
        !communitySet.has(l.community)
      ) {
        communitySet.set(l.community, {
          city: l.city,
          lat: l.lat,
          lng: l.lng,
        });
      }
    }

    for (const p of MOCK_PLACES) {
      if (
        (p.label.toLowerCase().includes(qLower) ||
          p.city.toLowerCase().includes(qLower)) &&
        !citySet.has(p.city) &&
        p.label === p.city
      ) {
        citySet.set(p.city, { lat: p.lat, lng: p.lng });
      }
      if (
        p.label.toLowerCase().includes(qLower) &&
        p.label !== p.city &&
        !communitySet.has(p.label)
      ) {
        communitySet.set(p.label, {
          city: p.city,
          lat: p.lat,
          lng: p.lng,
        });
      }
    }

    // Distinct cities / communities from DB when query is short place-like
    if (citySet.size < 4) {
      const cities = await prisma.listing.findMany({
        where: {
          AND: [publicWhere, { city: { contains: q, mode: "insensitive" } }],
        },
        distinct: ["city"],
        take: 6,
        select: { city: true, lat: true, lng: true },
      });
      for (const row of cities) {
        if (!citySet.has(row.city)) {
          citySet.set(row.city, { lat: row.lat, lng: row.lng });
        }
      }
    }

    if (communitySet.size < 4) {
      const communities = await prisma.listing.findMany({
        where: {
          AND: [
            publicWhere,
            { community: { contains: q, mode: "insensitive" } },
            { NOT: { community: null } },
          ],
        },
        distinct: ["community"],
        take: 6,
        select: { community: true, city: true, lat: true, lng: true },
      });
      for (const row of communities) {
        if (row.community && !communitySet.has(row.community)) {
          communitySet.set(row.community, {
            city: row.city,
            lat: row.lat,
            lng: row.lng,
          });
        }
      }
    }

    const searchParamsBase = () => {
      const params = new URLSearchParams();
      if (txn) params.set("transactionType", txn);
      return params;
    };

    const citySuggestions: AutocompleteSuggestion[] = [...citySet.entries()]
      .slice(0, 4)
      .map(([city, coords]) => {
        const params = searchParamsBase();
        params.set("city", city);
        params.set("lat", String(coords.lat));
        params.set("lng", String(coords.lng));
        return {
          type: "city" as const,
          group: "cities" as const,
          label: city,
          subtitle: "City · ON",
          city,
          province: "ON",
          lat: coords.lat,
          lng: coords.lng,
          href: `/search?${params.toString()}`,
        };
      });

    const communitySuggestions: AutocompleteSuggestion[] = [
      ...communitySet.entries(),
    ]
      .slice(0, 4)
      .map(([community, meta]) => {
        const params = searchParamsBase();
        params.set("city", meta.city);
        params.set("community", community);
        params.set("lat", String(meta.lat));
        params.set("lng", String(meta.lng));
        return {
          type: "community" as const,
          group: "communities" as const,
          label: community,
          subtitle: `${meta.city}, ON`,
          city: meta.city,
          community,
          province: "ON",
          lat: meta.lat,
          lng: meta.lng,
          href: `/search?${params.toString()}`,
        };
      });

    const out: AutocompleteSuggestion[] = [
      ...mlsHits.slice(0, 3),
      ...listingHits.slice(0, 4),
      ...citySuggestions,
      ...communitySuggestions,
    ];

    return out.slice(0, 14);
  }

  private async emptyAutocomplete(
    txn?: "SALE" | "LEASE",
    location?: { city?: string | null; lat?: number | null; lng?: number | null },
  ): Promise<AutocompleteSuggestion[]> {
    const suggested = suggestedCitiesForLocation({
      city: location?.city,
      lat: location?.lat,
      lng: location?.lng,
      limit: 6,
    });
    const paramsBase = () => {
      const params = new URLSearchParams();
      if (txn) params.set("transactionType", txn);
      return params;
    };

    const cityRows: AutocompleteSuggestion[] = suggested.map((city) => {
      const params = paramsBase();
      params.set("city", city);
      return {
        type: "city" as const,
        group: "popular" as const,
        label: city,
        subtitle: "Homes in this area",
        city,
        province: "ON",
        href: `/search?${params.toString()}`,
      };
    });

    const ohParams = paramsBase();
    ohParams.set("openHouseOnly", "1");

    const actions: AutocompleteSuggestion[] = [
      {
        type: "action",
        group: "actions",
        action: "near_me",
        label: "Near me",
        subtitle: "Use your current location",
      },
      {
        type: "action",
        group: "actions",
        action: "open_houses",
        label: "Open houses this weekend",
        subtitle: "Homes you can tour soon",
        href: `/search?${ohParams.toString()}`,
      },
    ];

    return [...actions, ...cityRows];
  }

  async openHouses(params: {
    city?: string;
    cities?: string[];
    community?: string;
    communities?: string[];
    propertyTypes?: PropertyType[];
    minPrice?: number;
    maxPrice?: number;
    from?: Date;
    to?: Date;
    entitlement?: WorkspaceListingEntitlement;
    entitlementFilteringEnabled?: boolean;
  }): Promise<ListingCard[]> {
    // Default window (now → +90d) is what Typesense indexes — use it when possible.
    if (!params.from && !params.to) {
      const fromTypesense = await typesenseOpenHouses({
        city: params.city,
        cities: params.cities,
        community: params.community,
        communities: params.communities,
        propertyTypes: params.propertyTypes,
        minPrice: params.minPrice,
        maxPrice: params.maxPrice,
        limit: 80,
        entitlement: params.entitlement,
        entitlementFilteringEnabled: params.entitlementFilteringEnabled,
      });
      if (fromTypesense) return fromTypesense;
    }

    const from = params.from ?? new Date();
    const to =
      params.to ?? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

    const andFilters: Prisma.ListingWhereInput[] = [];
    if (params.cities?.length) {
      andFilters.push({
        OR: params.cities.map((city) => ({
          city: { equals: city, mode: "insensitive" as const },
        })),
      });
    } else if (params.city) {
      andFilters.push({
        city: { equals: params.city, mode: "insensitive" },
      });
    }
    if (params.communities?.length) {
      andFilters.push({
        OR: params.communities.map((community) => ({
          community: { equals: community, mode: "insensitive" as const },
        })),
      });
    } else if (params.community) {
      andFilters.push({
        community: { equals: params.community, mode: "insensitive" },
      });
    }

    const enforce = isListingEntitlementEnforcementEnabled(
      params.entitlementFilteringEnabled,
    );
    let inventory: Prisma.ListingWhereInput;
    if (enforce) {
      const ohAuth = buildPrismaListingAuthorityWhere(
        params.entitlement ?? { workspaceId: "", authorities: [] },
        "OPEN_HOUSES",
      );
      if (ohAuth.kind === "empty") {
        return [];
      }
      inventory = ohAuth.where;
    } else {
      inventory = this.inventorySourceFilter();
    }

    const rows = await prisma.listing.findMany({
      where: {
        AND: [
          inventory,
          { status: "ACTIVE" },
          { transactionType: "SALE" },
          ...(params.propertyTypes?.length
            ? [{ propertyType: { in: params.propertyTypes } }]
            : []),
          ...(params.minPrice != null || params.maxPrice != null
            ? [
                {
                  listPrice: {
                    gte: params.minPrice,
                    lte: params.maxPrice,
                  },
                },
              ]
            : []),
          ...andFilters,
          {
            openHouses: {
              some: {
                startsAt: { lte: to },
                endsAt: { gte: from },
              },
            },
          },
        ],
      },
      include: {
        media: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], take: 1 },
        openHouses: {
          where: {
            startsAt: { lte: to },
            endsAt: { gte: from },
          },
          orderBy: { startsAt: "asc" },
        },
      },
      orderBy: [{ listedAt: "desc" }, { listPrice: "asc" }],
      take: 80,
    });

    return rows.map(toCard);
  }

  async syncStatus() {
    if (this.name === "proptx") {
      const health = await getPropTxSyncHealth();
      return {
        provider: "proptx" as const,
        healthy: health.configured && health.mlsCount > 0,
        message: !isPropTxConfigured()
          ? "PropTx credentials not configured."
          : health.mlsCount > 0
            ? `Serving ${health.mlsCount.toLocaleString("en-CA")} MLS listings from PropTx sync.`
            : health.lastRun?.status === "error"
              ? `PropTx sync error: ${health.lastRun.message ?? "unknown"}`
              : "PropTx configured. MLS sync runs on the Sync Mac.",
        listingCount: health.mlsCount,
        lastSyncedAt:
          health.lastRun?.finishedAt ?? health.lastRun?.startedAt ?? null,
      };
    }

    const listingCount = await prisma.listing.count();
    const latest = await prisma.listing.findFirst({
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    });

    return {
      provider: "mock" as const,
      healthy: listingCount > 0,
      message:
        listingCount > 0
          ? "Using mock GTA listings. Swap LISTING_PROVIDER=proptx when PropTx sync is healthy."
          : "No listings seeded. Run pnpm db:seed.",
      listingCount,
      lastSyncedAt: latest?.updatedAt.toISOString() ?? null,
    };
  }
}

const MOCK_PLACES = [
  { label: "Toronto", city: "Toronto", lat: 43.6532, lng: -79.3832 },
  { label: "Downtown Toronto", city: "Toronto", lat: 43.6548, lng: -79.388 },
  { label: "North York", city: "Toronto", lat: 43.7615, lng: -79.4111 },
  { label: "Scarborough", city: "Toronto", lat: 43.7764, lng: -79.2318 },
  { label: "Etobicoke", city: "Toronto", lat: 43.6205, lng: -79.5132 },
  { label: "Mississauga", city: "Mississauga", lat: 43.589, lng: -79.6441 },
  { label: "Brampton", city: "Brampton", lat: 43.7315, lng: -79.7624 },
  { label: "Markham", city: "Markham", lat: 43.8561, lng: -79.337 },
  { label: "Vaughan", city: "Vaughan", lat: 43.8361, lng: -79.4983 },
  { label: "Oakville", city: "Oakville", lat: 43.4675, lng: -79.6877 },
  { label: "Richmond Hill", city: "Richmond Hill", lat: 43.8828, lng: -79.4403 },
  { label: "Burlington", city: "Burlington", lat: 43.3255, lng: -79.799 },
];

/** PropTx mode: same Postgres reads as mock; data filled by VOW sync job. */
export class PropTxListingProvider extends DbListingProvider {
  constructor() {
    super("proptx");
  }
}

/** @deprecated Alias — prefer DbListingProvider("mock"). */
export class MockListingProvider extends DbListingProvider {
  constructor() {
    super("mock");
  }
}

export function getListingProvider(): ListingProvider {
  if (process.env.LISTING_PROVIDER === "proptx") {
    return new PropTxListingProvider();
  }
  return new MockListingProvider();
}
