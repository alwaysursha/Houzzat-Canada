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
import { mlsClientGate } from "@/lib/proptx/mls-gate";
import { hasClientAccess } from "@/lib/vow";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dataSourceParam = searchParams.get("dataSource");
  const gated = await mlsClientGate({
    allowAnonymousFsbo: true,
    dataSource: dataSourceParam,
  });
  if (gated) return gated;

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

  const statusParam = searchParams.get("status");
  const statusParts = statusParam
    ? statusParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const validStatusToken = (
    s: string,
  ): s is ListingStatus | "UNLISTED" | "ALL" =>
    s === "ACTIVE" ||
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

  const result = await provider.search({
    q: searchParams.get("q") ?? undefined,
    status: useAll ? "ALL" : statuses ? undefined : "ACTIVE",
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
      if (s === "newest" || s === "price_asc" || s === "price_desc" || s === "price") {
        return s === "price" ? "price_asc" : s;
      }
      return undefined;
    })(),
  });

  if (!isClient) {
    result.items = result.items.map((item) => ({ ...item, soldPrice: null }));
  }

  return NextResponse.json({ ...result, requiresAuth: false });
}
