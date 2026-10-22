import { NextResponse } from "next/server";
import type { PropertyType } from "@prisma/client";
import { auth } from "@/lib/auth";
import {
  homeRailsCacheHeaders,
  redactHomeRailsSoldForAccess,
} from "@/lib/listings/home-rails-access";
import { getListingProvider } from "@/lib/listings/provider";
import { prisma } from "@/lib/prisma";
import { mlsClientGate } from "@/lib/proptx/mls-gate";
import { resolveListingEntitlementContextForRequest } from "@/lib/tenancy/listing-entitlement";
import { isHighOctaneStagingSnapshotVisible } from "@/lib/tenancy/templates/high-octane-staging-snapshot";
import { typesenseHomeRails } from "@/lib/typesense/search";
import { hasClientAccess } from "@/lib/vow";

export async function GET(request: Request) {
  const gated = await mlsClientGate();
  if (gated) return gated;

  // G.10B2H/B3B: resolve trusted host → entitlement once for Typesense + Neon fallback.
  // Web-only force-enable; global G5 stays OFF (mobile unaffected).
  const context = await resolveListingEntitlementContextForRequest(request);
  const { entitlement } = context;
  const stagingSnapshotVisible = isHighOctaneStagingSnapshotVisible({
    workspaceSlug: context.resolution.ok
      ? context.resolution.host.workspaceSlug
      : null,
  });
  const entitlementFilteringEnabled = true;

  const { searchParams } = new URL(request.url);
  const citiesParam = searchParams.get("cities");
  const cities = citiesParam
    ? citiesParam
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean)
    : undefined;
  const propertyTypesParam = searchParams.get("propertyTypes");
  const propertyTypes = propertyTypesParam
    ? (propertyTypesParam
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean) as PropertyType[])
    : undefined;
  const communitiesParam = searchParams.get("communities");
  const communities = communitiesParam
    ? communitiesParam
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean)
    : undefined;
  const minPrice = searchParams.get("minPrice")
    ? Number(searchParams.get("minPrice"))
    : undefined;
  const maxPrice = searchParams.get("maxPrice")
    ? Number(searchParams.get("maxPrice"))
    : undefined;
  const limit = searchParams.get("limit")
    ? Number(searchParams.get("limit"))
    : 12;

  const sessionPromise = auth().then(async (session) => {
    if (!session?.user?.email) return null;
    return prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, emailVerified: true, createdAt: true },
    });
  });

  const provider = getListingProvider();

  const railsPromise = (
    stagingSnapshotVisible
      ? Promise.resolve(null)
      : typesenseHomeRails({
          cities,
          limit,
          minPrice,
          maxPrice,
          propertyTypes,
          communities,
          entitlement,
          entitlementFilteringEnabled,
        })
  ).then(async (fromTypesense) => {
    if (fromTypesense) return fromTypesense;

    // Typesense miss/error → same entitlement + force-enable on provider/Neon fallback.
    const [newListings, sold, forLease, commercial, openHouses] =
      await Promise.all([
        provider.search({
          status: "ACTIVE",
          segment: "RESIDENTIAL",
          transactionType: "SALE",
          sort: "newest",
          limit,
          cities,
          minPrice,
          maxPrice,
          propertyTypes,
          communities,
          entitlement,
          entitlementFilteringEnabled,
          stagingSnapshotVisible,
        }),
        provider.search({
          status: "SOLD",
          segment: "ALL",
          transactionType: "SALE",
          sort: "newest",
          limit,
          cities,
          minPrice,
          maxPrice,
          propertyTypes,
          communities,
          entitlement,
          entitlementFilteringEnabled,
          stagingSnapshotVisible,
        }),
        provider.search({
          status: "ACTIVE",
          segment: "ALL",
          transactionType: "LEASE",
          sort: "newest",
          limit,
          cities,
          minPrice,
          maxPrice,
          propertyTypes,
          communities,
          entitlement,
          entitlementFilteringEnabled,
          stagingSnapshotVisible,
        }),
        provider.search({
          status: "ACTIVE",
          segment: "COMMERCIAL",
          transactionType: "SALE",
          sort: "newest",
          limit,
          cities,
          minPrice,
          maxPrice,
          propertyTypes,
          communities,
          entitlement,
          entitlementFilteringEnabled,
          stagingSnapshotVisible,
        }),
        provider.openHouses({
          cities,
          communities,
          propertyTypes: propertyTypes?.length ? propertyTypes : undefined,
          minPrice,
          maxPrice,
          entitlement,
          entitlementFilteringEnabled,
        }),
      ]);

    return {
      newListings: newListings.items,
      sold: sold.items,
      forLease: forLease.items,
      commercial: commercial.items,
      openHouses,
    };
  });

  const [user, rails] = await Promise.all([
    sessionPromise.catch(() => null),
    railsPromise,
  ]);

  const isClient = hasClientAccess(user);
  const sold = redactHomeRailsSoldForAccess(rails.sold, isClient);

  return NextResponse.json(
    {
      newListings: rails.newListings,
      openHouses: rails.openHouses,
      sold,
      forLease: rails.forLease,
      commercial: rails.commercial,
    },
    {
      headers: homeRailsCacheHeaders(isClient),
    },
  );
}
