import { NextResponse } from "next/server";
import { resolveClientAccess } from "@/lib/account-access";
import { auth } from "@/lib/auth";
import { getListingProvider } from "@/lib/listings/provider";
import { buildListingInsights } from "@/lib/market/listing-insights";
import { getMarketPulse } from "@/lib/market/pulse";
import { findNearbyPois } from "@/lib/poi/nearby";
import { prisma } from "@/lib/prisma";
import {
  evaluateWebListingDetailInventoryAccess,
  resolveListingEntitlementContextForRequest,
} from "@/lib/tenancy/listing-entitlement";

type Params = { params: Promise<{ mlsNumber: string }> };

/**
 * Listing insights panel.
 *
 * G.10C2: Host entitlement → base listing capability before any listing
 * context is used. Market pulse sold aggregates stay behind client/VOW
 * signed-in (not listing HISTORY). Unauthorized → 404.
 */
export async function GET(request: Request, { params }: Params) {
  const { mlsNumber: raw } = await params;
  const mlsNumber = decodeURIComponent(raw).trim().toUpperCase();
  if (!mlsNumber) {
    return NextResponse.json({ error: "Missing MLS number" }, { status: 400 });
  }

  const { entitlement } =
    await resolveListingEntitlementContextForRequest(request);

  const provider = getListingProvider();
  const listing = await provider.getByMls(mlsNumber);
  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  const board = evaluateWebListingDetailInventoryAccess({
    entitlement,
    entitlementFilteringEnabled: true,
    organizationId: listing.organizationId,
    providerKey: listing.providerKey,
    dataSource: listing.dataSource,
    status: listing.status,
  });
  if (!board.allowed) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  const session = await auth();
  const email = session?.user?.email;
  const user = email
    ? await prisma.user
        .findUnique({
          where: { email },
          select: {
            id: true,
            emailVerified: true,
            createdAt: true,
          },
        })
        .catch(() => null)
    : null;

  const access = resolveClientAccess(user);
  const signedIn = access.hasClientAccess;

  try {
    const [pois, pulse] = await Promise.all([
      findNearbyPois({
        lat: listing.lat,
        lng: listing.lng,
        radiusKm: 2,
        limitPerType: 8,
      }),
      getMarketPulse({
        city: listing.city,
        community: listing.community,
        includeSold: signedIn,
      }),
    ]);

    const insights = await buildListingInsights({
      listing,
      pulse,
      pois,
      signedIn,
    });

    return NextResponse.json(
      { insights },
      {
        headers: {
          // Short private cache — page navigations reuse while warm.
          "Cache-Control": "private, max-age=30",
        },
      },
    );
  } catch (error) {
    console.error("[listing-insights]", mlsNumber, error);
    return NextResponse.json(
      { error: "Insights temporarily unavailable" },
      { status: 503 },
    );
  }
}
