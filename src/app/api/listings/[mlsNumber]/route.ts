import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { findSiblingListingsAtAddress } from "@/lib/listings/address-history";
import {
  buildAuthorizedAddressListingHistoryRows,
  redactListingVowRestrictedFields,
  resolveListingDetailAccess,
} from "@/lib/listings/build-listing-panel";
import { getListingProvider } from "@/lib/listings/provider";
import { resolveListingGalleryPhotos } from "@/lib/listings/resolve-gallery";
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
 * Raw listing JSON for MLS detail consumers.
 *
 * G.10C2: Host → G.7C/G.10A → Neon → board provenance/capability → response.
 * HISTORY / MEDIA slices are stripped when those capabilities are missing.
 * VOW: same hasClientAccess / resolveListingDetailAccess rule as panel + by-mls.
 * Restricted sold/history is redacted before JSON serialization.
 * No PropTx on this path. Unauthorized inventory → 404 (no existence oracle).
 */
export async function GET(request: Request, { params }: Params) {
  const { mlsNumber: raw } = await params;
  const mlsNumber = decodeURIComponent(raw).trim().toUpperCase();
  if (!mlsNumber) {
    return NextResponse.json({ error: "Missing MLS number" }, { status: 400 });
  }

  // Never trust client workspaceId / org / provider / SAK.
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

  const mediaAllowed = evaluateWebListingDetailInventoryAccess({
    entitlement,
    entitlementFilteringEnabled: true,
    organizationId: listing.organizationId,
    providerKey: listing.providerKey,
    dataSource: listing.dataSource,
    status: listing.status,
    stagingSnapshotVisible,
    additionalCapabilities: ["MEDIA"],
  }).allowed;

  const historyAllowed = evaluateWebListingDetailInventoryAccess({
    entitlement,
    entitlementFilteringEnabled: true,
    organizationId: listing.organizationId,
    providerKey: listing.providerKey,
    dataSource: listing.dataSource,
    status: listing.status,
    stagingSnapshotVisible,
    additionalCapabilities: ["HISTORY"],
  }).allowed;

  const gallery = mediaAllowed ? resolveListingGalleryPhotos(listing) : [];
  const media = mediaAllowed
    ? gallery.length > 0
      ? gallery.map((photo, index) => ({
          id: photo.id,
          url: photo.url,
          sortOrder: photo.sortOrder ?? index,
          isPrimary: photo.isPrimary ?? index === 0,
          listingId: listing.id,
        }))
      : listing.media
    : [];

  const session = await auth();
  const user = session?.user?.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, emailVerified: true, createdAt: true },
      })
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

  const { canSeeRestricted } = panelAccess;
  const redactedListing = redactListingVowRestrictedFields(
    listing,
    canSeeRestricted,
  );

  const addressSiblings = historyAllowed
    ? await findSiblingListingsAtAddress(listing)
    : [];
  const historyRows = historyAllowed
    ? buildAuthorizedAddressListingHistoryRows({
        mlsNumber: listing.mlsNumber,
        listPrice: listing.listPrice,
        listedAt: listing.listedAt,
        updatedAtMls: listing.updatedAtMls,
        soldAt: listing.soldAt,
        soldPrice: listing.soldPrice,
        status: listing.status,
        transactionType: listing.transactionType,
        history: listing.history,
        siblings: addressSiblings,
        canSeeRestricted,
      })
    : [];

  return NextResponse.json({
    listing: { ...redactedListing, media },
    historyRows,
    provider: provider.name,
  });
}
