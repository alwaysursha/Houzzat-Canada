import { NextResponse } from "next/server";
import type { ListingStatus, ListingTransactionType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { boundingBox, haversineKm } from "@/lib/geo/distance";
import { resolveRegionFromCoords } from "@/lib/geo/regions";
import {
  applyPersonalizationToSearchParams,
  parseHomepagePersonalizationQuery,
} from "@/lib/listings/homepage-personalization";
import { getListingProvider } from "@/lib/listings/provider";
import type { ListingCard } from "@/lib/listings/types";
import { prisma } from "@/lib/prisma";
import { mlsClientGate } from "@/lib/proptx/mls-gate";
import { hasClientAccess } from "@/lib/vow";

type Ranked = ListingCard & { distanceKm: number; inRadius: boolean };

export async function GET(request: Request) {
  const gated = await mlsClientGate();
  if (gated) return gated;

  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  const radiusKm = Math.min(
    Math.max(Number(searchParams.get("radiusKm") ?? 35), 1),
    80,
  );
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 12), 1), 60);
  const transactionTypeParam = searchParams.get("transactionType");
  const transactionType: ListingTransactionType =
    transactionTypeParam === "LEASE" || transactionTypeParam === "SALE"
      ? transactionTypeParam
      : "SALE";
  const excludeMls = searchParams.get("excludeMls")?.trim() || null;
  const propertyTypesParam = searchParams.get("propertyTypes");
  const communitiesParam = searchParams.get("communities");
  const personalization = parseHomepagePersonalizationQuery({
    city: searchParams.get("city") ?? undefined,
    minPrice: searchParams.get("minPrice") ?? undefined,
    maxPrice: searchParams.get("maxPrice") ?? undefined,
    propertyTypes: propertyTypesParam
      ? propertyTypesParam.split(",").map((t) => t.trim()).filter(Boolean)
      : undefined,
    communities: communitiesParam
      ? communitiesParam.split("|").map((c) => c.trim()).filter(Boolean)
      : undefined,
  });

  const statusParam = searchParams.get("status");
  const status: ListingStatus | "UNLISTED" =
    statusParam === "SOLD" ||
    statusParam === "LEASED" ||
    statusParam === "UNLISTED"
      ? statusParam
      : "ACTIVE";
  const restrictedStatus =
    status === "SOLD" || status === "LEASED" || status === "UNLISTED";

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { error: "lat and lng are required." },
      { status: 400 },
    );
  }

  const session = await auth();
  const user = session?.user?.email
    ? await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
      })
    : null;
  const isClient = hasClientAccess(user);

  if (restrictedStatus && !isClient) {
    return NextResponse.json(
      {
        error: "Sign in required to view sold and unlisted listings.",
        items: [],
        requiresAuth: true,
      },
      { status: 401 },
    );
  }

  const { region, browseCity } = resolveRegionFromCoords(lat, lng);
  const box = boundingBox(lat, lng, radiusKm);
  const provider = getListingProvider();
  const searchTransactionType: ListingTransactionType =
    status === "UNLISTED"
      ? "SALE"
      : status === "SOLD"
        ? "SALE"
        : status === "LEASED"
          ? "LEASE"
          : transactionType;

  const base = {
    status,
    segment: "RESIDENTIAL" as const,
    transactionType: searchTransactionType,
    sort: "newest" as const,
    limit: 100,
  };

  // Region-city search catches homes whose MLS city is right but map pins are wrong
  // (centroids / GTA defaults). Bbox search catches well-pinned homes nearby.
  const [byRegion, byBox] = await Promise.all([
    provider.search(
      applyPersonalizationToSearchParams(
        { ...base, cities: region.cities },
        personalization,
      ),
    ),
    provider.search(
      applyPersonalizationToSearchParams(
        {
          ...base,
          west: box.west,
          south: box.south,
          east: box.east,
          north: box.north,
        },
        personalization,
      ),
    ),
  ]);

  const byMls = new Map<string, ListingCard>();
  for (const item of [...byRegion.items, ...byBox.items]) {
    if (excludeMls && item.mlsNumber === excludeMls) continue;
    byMls.set(item.mlsNumber, item);
  }

  const ranked: Ranked[] = [...byMls.values()].map((item) => {
    const distanceKm = haversineKm(lat, lng, item.lat, item.lng);
    return {
      ...item,
      distanceKm,
      inRadius: Number.isFinite(distanceKm) && distanceKm <= radiusKm,
    };
  });

  ranked.sort((a, b) => {
    if (a.inRadius !== b.inRadius) return a.inRadius ? -1 : 1;
    if (a.inRadius && b.inRadius) return a.distanceKm - b.distanceKm;
    // Same region / bad pins: newest first
    return (
      new Date(b.listedAt).getTime() - new Date(a.listedAt).getTime()
    );
  });

  const sliced = ranked.slice(0, limit).map(({ inRadius, distanceKm, ...item }) => ({
    ...item,
    // Only show a distance chip when the pin is trustworthy enough to be in-radius.
    distanceKm: inRadius ? distanceKm : undefined,
  }));

  const items = isClient
    ? sliced
    : sliced.map((item) => ({ ...item, soldPrice: null }));

  return NextResponse.json({
    items,
    center: { lat, lng },
    radiusKm,
    region: { id: region.id, label: region.label, browseCity },
    total: items.length,
  });
}
