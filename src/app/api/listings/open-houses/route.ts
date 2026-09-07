import { NextResponse } from "next/server";
import type { PropertyType } from "@prisma/client";
import { getListingProvider } from "@/lib/listings/provider";
import { mlsClientGate } from "@/lib/proptx/mls-gate";
import { resolveListingEntitlementContextForRequest } from "@/lib/tenancy/listing-entitlement";

export async function GET(request: Request) {
  const gated = await mlsClientGate();
  if (gated) return gated;

  const { searchParams } = new URL(request.url);
  const provider = getListingProvider();
  const { entitlement } =
    await resolveListingEntitlementContextForRequest(request);
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

  const items = await provider.openHouses({
    city: searchParams.get("city") ?? undefined,
    cities,
    community: searchParams.get("community") ?? undefined,
    communities,
    propertyTypes: propertyTypes?.length ? propertyTypes : undefined,
    minPrice: searchParams.get("minPrice")
      ? Number(searchParams.get("minPrice"))
      : undefined,
    maxPrice: searchParams.get("maxPrice")
      ? Number(searchParams.get("maxPrice"))
      : undefined,
    entitlement,
    // G.10B3B: web-only force-enable (global G5 stays OFF).
    entitlementFilteringEnabled: true,
  });
  return NextResponse.json({ items, provider: provider.name });
}
