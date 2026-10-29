import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveListingDetailAccess } from "@/lib/listings/build-listing-panel";
import { getListingProvider } from "@/lib/listings/provider";
import { buildListingInsights } from "@/lib/market/listing-insights";
import { getMarketPulse } from "@/lib/market/pulse";
import { findNearbyPois } from "@/lib/poi/nearby";
import { prisma } from "@/lib/prisma";
import {
  evaluateWebListingDetailInventoryAccess,
  resolveListingEntitlementContextForRequest,
} from "@/lib/tenancy/listing-entitlement";
import { stagingSnapshotVisibleFromResolution } from "@/lib/tenancy/templates/high-octane-staging-snapshot-request";
import { vowAccountRequiredError } from "@/lib/vow";
import { currentPublicBrandName } from "@/lib/tenancy/resolve-marketing-tenancy";

type Params = { params: Promise<{ mlsNumber: string }> };

/**
 * Listing insights panel.
 *
 * G.10C2: Host entitlement → base listing capability before any listing
 * context is used. Market pulse sold aggregates stay behind client/VOW
 * access (not listing HISTORY). Timeline/history uses the same
 * resolveListingDetailAccess + authorized history helper as listing detail.
 * Unauthorized inventory → 404.
 */
export async function GET(request: Request, { params }: Params) {
  const { mlsNumber: raw } = await params;
  const mlsNumber = decodeURIComponent(raw).trim().toUpperCase();
  if (!mlsNumber) {
    return NextResponse.json({ error: "Missing MLS number" }, { status: 400 });
  }

  const context = await resolveListingEntitlementContextForRequest(request);
  const { entitlement } = context;
  const stagingSnapshotVisible = stagingSnapshotVisibleFromResolution(
    context.resolution,
  );

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
    stagingSnapshotVisible,
  });
  if (!board.allowed) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  const session = await auth();
  const userId = session?.user?.id?.trim() || null;
  const user = userId
    ? await prisma.user
        .findUnique({
          where: { id: userId },
          select: {
            id: true,
            emailVerified: true,
            createdAt: true,
          },
        })
        .catch(() => null)
    : null;

  const brandName = await currentPublicBrandName();
  const panelAccess = resolveListingDetailAccess(user, listing, brandName);
  if (panelAccess.vowBlocked) {
    if (panelAccess.needsEmailVerification) {
      return NextResponse.json(
        {
          error: "Email verification required.",
          vowBlocked: true,
          requiresEmailVerification: true,
        },
        {
          status: 403,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }
    return NextResponse.json(
      {
        error: vowAccountRequiredError(brandName),
        vowBlocked: true,
        requiresAuth: true,
      },
      {
        status: 401,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }

  const signedIn = panelAccess.canSeeRestricted;

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
        brandName,
      }),
    ]);

    const insights = await buildListingInsights({
      listing,
      pulse,
      pois,
      signedIn,
      entitlement,
      includeStagingSnapshot: stagingSnapshotVisible,
    });

    return NextResponse.json(
      { insights },
      {
        headers: {
          // Auth-dependent (VOW / sold). Never reuse a guest payload after sign-in.
          "Cache-Control": "private, no-store",
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
