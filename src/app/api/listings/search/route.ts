import { NextResponse } from "next/server";
import type {
  ListingSegment,
  ListingStatus,
  ListingTransactionType,
  PropertyType,
} from "@prisma/client";
import { auth } from "@/lib/auth";
import { unspecifiedSearchStatus } from "@/lib/listings/parse-search-query-params";
import { getListingProvider } from "@/lib/listings/provider";
import type { ListingSearchResult } from "@/lib/listings/types";
import { prisma } from "@/lib/prisma";
import {
  clientIpFromRequest,
  lookupPropTxOnDemand,
} from "@/lib/proptx/on-demand-lookup";
import { mlsClientGate } from "@/lib/proptx/mls-gate";
import { resolveListingEntitlementContextForRequest } from "@/lib/tenancy/listing-entitlement";
import { isHighOctaneStagingSnapshotVisible } from "@/lib/tenancy/templates/high-octane-staging-snapshot";
import { loadHighOctaneDevelopmentListingAccessForRequest } from "@/lib/tenancy/templates/high-octane-development-listing-access";
import { searchHighOctaneDevelopmentListings } from "@/lib/tenancy/templates/high-octane-development-listings";
import { HIGH_OCTANE_STAGING_WORKSPACE_SLUG } from "@/lib/tenancy/templates/high-octane-staging-slug";
import { hasClientAccess } from "@/lib/vow";

/** True when a NextAuth / Auth.js session cookie may be present. */
function mayHaveSessionCookie(request: Request): boolean {
  const cookie = request.headers.get("cookie");
  if (!cookie) return false;
  return /(?:__Secure-|__Host-)?(?:authjs|next-auth)\.session-token/i.test(
    cookie,
  );
}

async function resolveIsClient(): Promise<boolean> {
  const session = await auth();
  const user = session?.user?.email
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, emailVerified: true, createdAt: true },
      })
    : null;
  return hasClientAccess(user);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dataSourceParam = searchParams.get("dataSource");
  const gated = await mlsClientGate({
    allowAnonymousFsbo: true,
    dataSource: dataSourceParam,
  });
  if (gated) return gated;

  const context = await resolveListingEntitlementContextForRequest(request);
  const { entitlement } = context;
  const stagingSnapshotVisible = isHighOctaneStagingSnapshotVisible({
    workspaceSlug: context.resolution.ok
      ? context.resolution.host.workspaceSlug
      : null,
  });

  const provider = getListingProvider();
  const segmentParam = searchParams.get("segment");
  const transactionParam = searchParams.get("transactionType");

  const propertyTypesParam = searchParams.get("propertyTypes");
  const communitiesParam = searchParams.get("communities");
  const propertyTypes = propertyTypesParam
    ? (propertyTypesParam
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean) as PropertyType[])
    : undefined;
  const communities = communitiesParam
    ? communitiesParam
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean)
    : undefined;

  const statusParam = searchParams.get("status");
  const statusParts = statusParam
    ? statusParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => (s === "CANCELLED" ? "TERMINATED" : s))
    : [];
  const validStatusToken = (
    s: string,
  ): s is ListingStatus | "UNLISTED" | "ALL" =>
    s === "ACTIVE" ||
    s === "SOLD_CONDITIONAL" ||
    s === "SOLD" ||
    s === "LEASED" ||
    s === "UNLISTED" ||
    s === "ALL" ||
    s === "SUSPENDED" ||
    s === "TERMINATED" ||
    s === "EXPIRED";
  const tokens = statusParts.filter(validStatusToken);
  const useAll = tokens.length === 1 && tokens[0] === "ALL";
  const statuses =
    !useAll && tokens.length > 0
      ? (tokens.filter((t) => t !== "ALL") as Array<ListingStatus | "UNLISTED">)
      : undefined;

  const q = searchParams.get("q") ?? undefined;
  const searchParamsBody = {
    q,
    status: useAll
      ? ("ALL" as const)
      : statuses
        ? undefined
        : unspecifiedSearchStatus(q),
    statuses,
    segment: (segmentParam as ListingSegment | "ALL" | null) ?? undefined,
    transactionType:
      (transactionParam as ListingTransactionType | "ALL" | null) ?? undefined,
    dataSource:
      (searchParams.get("dataSource") as "fsbo" | "mls" | "ALL" | null) ??
      undefined,
    city: searchParams.get("city") ?? undefined,
    cities: (() => {
      const raw = searchParams.get("cities");
      if (!raw?.trim()) return undefined;
      const list = raw
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean);
      return list.length ? list : undefined;
    })(),
    community: searchParams.get("community") ?? undefined,
    communities,
    propertyType:
      (searchParams.get("propertyType") as PropertyType | null) ?? undefined,
    propertyTypes: propertyTypes?.length ? propertyTypes : undefined,
    minPrice: searchParams.get("minPrice")
      ? Number(searchParams.get("minPrice"))
      : undefined,
    maxPrice: searchParams.get("maxPrice")
      ? Number(searchParams.get("maxPrice"))
      : undefined,
    minBeds: searchParams.get("minBeds")
      ? Number(searchParams.get("minBeds"))
      : undefined,
    minBaths: searchParams.get("minBaths")
      ? Number(searchParams.get("minBaths"))
      : undefined,
    openHouseOnly: searchParams.get("openHouseOnly") === "1",
    west: searchParams.get("west")
      ? Number(searchParams.get("west"))
      : undefined,
    south: searchParams.get("south")
      ? Number(searchParams.get("south"))
      : undefined,
    east: searchParams.get("east")
      ? Number(searchParams.get("east"))
      : undefined,
    north: searchParams.get("north")
      ? Number(searchParams.get("north"))
      : undefined,
    cursor: searchParams.get("cursor") ?? undefined,
    limit: searchParams.get("limit")
      ? Number(searchParams.get("limit"))
      : 40,
    sort: (() => {
      const s = searchParams.get("sort");
      if (s === "newest" || s === "price_asc" || s === "price_desc") return s;
      if (s === "price") return "price_asc" as const;
      return undefined;
    })() as "newest" | "price_asc" | "price_desc" | undefined,
    // G.10B3B: hostname entitlement + web-only force-enable (global G5 stays OFF).
    // Never read entitlementFilteringEnabled from the request.
    entitlement,
    entitlementFilteringEnabled: true,
    stagingSnapshotVisible,
  };

  const developmentAccess = await loadHighOctaneDevelopmentListingAccessForRequest(
    request,
    context.resolution.ok ? context.resolution.host.workspaceSlug : null,
  );
  if (developmentAccess.serveFixtures) {
    const items = searchHighOctaneDevelopmentListings(searchParamsBody);
    return NextResponse.json(
      {
        items,
        nextCursor: null,
        total: items.length,
        provider: "mock",
        requiresAuth: false,
      },
      { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } },
    );
  }

  // IDX: start search immediately. Guests skip auth; signed-in access runs in parallel.
  const searchPromise = provider.search(searchParamsBody);
  const accessPromise = mayHaveSessionCookie(request)
    ? resolveIsClient()
    : Promise.resolve(false);

  let result: ListingSearchResult;
  const [searchResult, isClient] = await Promise.all([
    searchPromise,
    accessPromise,
  ]);
  result = searchResult;

  // Neon miss + MLS/address/street query → PropTx on-demand (skip when map/filters dominate)
  const lightFilters =
    !searchParamsBody.city &&
    !searchParamsBody.cities?.length &&
    !searchParamsBody.community &&
    !searchParamsBody.communities?.length &&
    !searchParamsBody.propertyType &&
    !searchParamsBody.propertyTypes?.length &&
    searchParamsBody.minPrice == null &&
    searchParamsBody.maxPrice == null &&
    searchParamsBody.minBeds == null &&
    searchParamsBody.minBaths == null &&
    !searchParamsBody.openHouseOnly &&
    searchParamsBody.west == null &&
    !searchParamsBody.cursor;

  const highOctaneWithoutOwnEntitlement =
    context.resolution.ok &&
    context.resolution.host.workspaceSlug === HIGH_OCTANE_STAGING_WORKSPACE_SLUG &&
    entitlement.authorities.length === 0;

  if (
    !highOctaneWithoutOwnEntitlement &&
    result.items.length === 0 &&
    q?.trim() &&
    lightFilters
  ) {
    const pulled = await lookupPropTxOnDemand(q, {
      clientIp: clientIpFromRequest(request),
    });
    if (pulled.cards.length > 0) {
      result = {
        ...result,
        items: pulled.cards,
        total: pulled.cards.length,
        provider: "proptx",
      };
    }
  }

  if (!isClient) {
    result.items = result.items.map((item) => ({ ...item, soldPrice: null }));
  }

  return NextResponse.json({ ...result, requiresAuth: false });
}
