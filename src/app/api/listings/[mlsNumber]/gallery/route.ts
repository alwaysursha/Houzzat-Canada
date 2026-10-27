import { NextResponse } from "next/server";
import { NEON_LISTING_MEDIA_CAP } from "@/lib/listings/gallery-constants";
import { loadListingDetailApiAccess } from "@/lib/listings/listing-detail-api-access";
import { mayInvokePropTxOnDemandForDetail } from "@/lib/listings/load-listing-for-detail";
import { listingPhotoSrc } from "@/lib/listings/photo-src";
import { fetchListingPhotosFromPropTx } from "@/lib/proptx/listing-photos";
import { prisma } from "@/lib/prisma";
import { classifyListingInventoryChannel, resolveListingEntitlementContextForRequest } from "@/lib/tenancy/listing-entitlement";
import { loadHighOctaneDevelopmentListingAccessForRequest } from "@/lib/tenancy/templates/high-octane-development-listing-access";
import {
  highOctaneDevelopmentListingDetail,
  isHighOctaneDevelopmentListingMls,
} from "@/lib/tenancy/templates/high-octane-development-listings";
import { decideHighOctanePublicShowcase } from "@/lib/tenancy/templates/high-octane-public-showcase";
import { isHighOctaneStagingSnapshotDataSource } from "@/lib/tenancy/templates/high-octane-staging-snapshot";

type Params = { params: Promise<{ mlsNumber: string }> };

/**
 * Full PropTx gallery for a listing (client enrich / prefetch).
 * Live photos, including those beyond the Neon cap, are returned for display.
 * This route does not write ListingMedia. Capped photos are Sync-Mac-owned.
 *
 * G.10C2: Host entitlement → base provenance + MEDIA → VOW → PropTx only
 * after exact-feed pre-auth. Unauthorized MEDIA → 404 (no PropTx).
 */
export async function GET(request: Request, { params }: Params) {
  const { mlsNumber: raw } = await params;
  if (isHighOctaneDevelopmentListingMls(raw)) {
    const context = await resolveListingEntitlementContextForRequest(request);
    const workspaceSlug = context.resolution.ok
      ? context.resolution.host.workspaceSlug
      : null;
    const development = await loadHighOctaneDevelopmentListingAccessForRequest(
      request,
      workspaceSlug,
    );
    const showcase = decideHighOctanePublicShowcase({
      workspaceSlug,
      authorities: context.entitlement.authorities,
    });
    const detail =
      development.serveFixtures || showcase.serve
        ? highOctaneDevelopmentListingDetail(raw)
        : null;
    if (!detail) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({
      photos: detail.media.map((photo) => ({
        id: photo.id,
        url: photo.url,
        sortOrder: photo.sortOrder,
        isPrimary: photo.isPrimary,
      })),
      neonMediaCount: detail.media.length,
      galleryCapped: false,
      totalPhotoCount: detail.media.length,
    });
  }

  const gated = await loadListingDetailApiAccess(raw, request, {
    additionalCapabilities: ["MEDIA"],
    entitlementFilteringEnabled: true,
  });
  if (!gated.ok) return gated.response;

  const { listing, access, entitlement } = gated;

  const neonRows = await prisma.listingMedia.findMany({
    where: { listingId: listing.id },
    orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
    take: NEON_LISTING_MEDIA_CAP,
    select: { id: true, url: true, sortOrder: true, isPrimary: true },
  });
  const neonPhotos = neonRows.map((photo, index) => ({
    id: photo.id,
    url: listingPhotoSrc(photo.url) ?? photo.url,
    sortOrder: photo.sortOrder ?? index,
    isPrimary: photo.isPrimary ?? index === 0,
  }));

  const channel = classifyListingInventoryChannel(listing.dataSource);
  const orgId = listing.organizationId?.trim() ?? "";
  const mayPropTx =
    !isHighOctaneStagingSnapshotDataSource(listing.dataSource) &&
    Boolean(listing.listingKey) &&
    (channel !== "mls" ||
      (Boolean(orgId) &&
        mayInvokePropTxOnDemandForDetail({
          entitlementFilteringEnabled: true,
          entitlement,
          requiredCapability: "MEDIA",
          propTxOrganizationId: orgId,
        })));

  // Locked / verify-gated callers never receive extra photo URLs.
  if (access.detailsLocked) {
    return NextResponse.json(
      {
        photos: neonPhotos,
        neonMediaCount: neonPhotos.length,
        galleryCapped: true,
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  }

  if (access.needsEmailVerification) {
    let totalPhotoCount: number | undefined;
    if (mayPropTx && listing.listingKey) {
      const live = await fetchListingPhotosFromPropTx(listing.listingKey, {
        timeoutMs: 10_000,
      });
      if (live.length > 0) {
        totalPhotoCount = live.length;
      }
    }
    return NextResponse.json(
      {
        photos: neonPhotos,
        neonMediaCount: neonPhotos.length,
        galleryCapped: true,
        ...(totalPhotoCount != null ? { totalPhotoCount } : {}),
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  }

  if (!listing.listingKey) {
    if (isHighOctaneStagingSnapshotDataSource(listing.dataSource)) {
      return NextResponse.json({
        photos: neonPhotos,
        neonMediaCount: neonPhotos.length,
        galleryCapped: true,
      });
    }
    return NextResponse.json({ photos: [] as const });
  }

  if (!mayPropTx) {
    return NextResponse.json(
      {
        photos: neonPhotos,
        neonMediaCount: neonPhotos.length,
        galleryCapped: true,
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  }

  const photos = await fetchListingPhotosFromPropTx(listing.listingKey, {
    timeoutMs: 10_000,
  });

  const neonMediaCount = await prisma.listingMedia.count({
    where: { listingId: listing.id },
  });

  return NextResponse.json(
    {
      photos: photos.map((photo) => ({
        id: photo.id,
        url: photo.url,
        sortOrder: photo.sortOrder,
        isPrimary: photo.isPrimary,
      })),
      neonMediaCount,
    },
    {
      headers: {
        "Cache-Control": "private, max-age=60",
      },
    },
  );
}
