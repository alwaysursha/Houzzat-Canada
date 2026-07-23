import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { boundingBox, haversineKm } from "@/lib/geo/distance";
import {
  applyPersonalizationToSearchParams,
  parseHomepagePersonalizationQuery,
} from "@/lib/listings/homepage-personalization";
import { getListingProvider } from "@/lib/listings/provider";
import { prisma } from "@/lib/prisma";
import { hasClientAccess } from "@/lib/vow";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  const radiusKm = Math.min(
    Math.max(Number(searchParams.get("radiusKm") ?? 15), 1),
    80,
  );
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 4), 1), 60);
  const transactionTypeParam = searchParams.get("transactionType");
  const transactionType =
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

  const box = boundingBox(lat, lng, radiusKm);
  const provider = getListingProvider();
  const result = await provider.search(
    applyPersonalizationToSearchParams(
      {
        status: "ACTIVE",
        segment: "RESIDENTIAL",
        transactionType,
        west: box.west,
        south: box.south,
        east: box.east,
        north: box.north,
        limit: 80,
      },
      personalization,
    ),
  );

  const ranked = result.items
    .map((item) => ({
      ...item,
      distanceKm: haversineKm(lat, lng, item.lat, item.lng),
    }))
    .filter(
      (item) =>
        item.distanceKm <= radiusKm &&
        (!excludeMls || item.mlsNumber !== excludeMls),
    )
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);

  const items = isClient
    ? ranked
    : ranked.map((item) => ({ ...item, soldPrice: null }));

  return NextResponse.json({
    items,
    center: { lat, lng },
    radiusKm,
    total: items.length,
  });
}
