import { NextResponse } from "next/server";
import { resolveClientAccess } from "@/lib/account-access";
import { auth } from "@/lib/auth";
import { getListingProvider } from "@/lib/listings/provider";
import { buildListingInsights } from "@/lib/market/listing-insights";
import { getMarketPulse } from "@/lib/market/pulse";
import { findNearbyPois } from "@/lib/poi/nearby";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ mlsNumber: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { mlsNumber } = await params;
  const provider = getListingProvider();
  const listing = await provider.getByMls(mlsNumber);
  if (!listing) {
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
