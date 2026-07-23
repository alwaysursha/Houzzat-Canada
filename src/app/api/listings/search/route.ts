import { NextResponse } from "next/server";
import type {
  ListingSegment,
  ListingStatus,
  ListingTransactionType,
  PropertyType,
} from "@prisma/client";
import { auth } from "@/lib/auth";
import { getListingProvider } from "@/lib/listings/provider";
import { prisma } from "@/lib/prisma";
import { hasClientAccess } from "@/lib/vow";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const provider = getListingProvider();
  const segmentParam = searchParams.get("segment");
  const transactionParam = searchParams.get("transactionType");

  const session = await auth();
  const user = session?.user?.email
    ? await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
      })
    : null;
  const isClient = hasClientAccess(user);

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

  const result = await provider.search({
    q: searchParams.get("q") ?? undefined,
    status:
      (searchParams.get("status") as ListingStatus | "ALL" | null) ?? "ACTIVE",
    segment: (segmentParam as ListingSegment | "ALL" | null) ?? undefined,
    transactionType:
      (transactionParam as ListingTransactionType | "ALL" | null) ?? undefined,
    dataSource:
      (searchParams.get("dataSource") as "fsbo" | "mls" | "ALL" | null) ??
      undefined,
    city: searchParams.get("city") ?? undefined,
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
  });

  if (!isClient) {
    result.items = result.items.map((item) => ({ ...item, soldPrice: null }));
  }

  return NextResponse.json(result);
}
