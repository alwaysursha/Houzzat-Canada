import { NextResponse } from "next/server";
import type { PropertyType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { getListingProvider } from "@/lib/listings/provider";
import { prisma } from "@/lib/prisma";
import { mlsClientGate } from "@/lib/proptx/mls-gate";
import { typesenseHomeRails } from "@/lib/typesense/search";
import { hasClientAccess } from "@/lib/vow";

export async function GET(request: Request) {
  const gated = await mlsClientGate();
  if (gated) return gated;

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
      where: { email: session.user.email },
      select: { id: true, emailVerified: true, createdAt: true },
    });
  });

  const provider = getListingProvider();

  const railsPromise = typesenseHomeRails({
    cities,
    limit,
    minPrice,
    maxPrice,
    propertyTypes,
    communities,
  }).then(async (fromTypesense) => {
    if (fromTypesense) return fromTypesense;

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
        }),
        provider.openHouses({
          cities,
          communities,
          propertyTypes: propertyTypes?.length ? propertyTypes : undefined,
          minPrice,
          maxPrice,
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
  const sold = isClient
    ? rails.sold
    : rails.sold.map((item) => ({ ...item, soldPrice: null }));

  return NextResponse.json(
    {
      newListings: rails.newListings,
      openHouses: rails.openHouses,
      sold,
      forLease: rails.forLease,
      commercial: rails.commercial,
    },
    {
      headers: {
        "Cache-Control": isClient
          ? "private, no-store"
          : "public, s-maxage=45, stale-while-revalidate=120",
      },
    },
  );
}
