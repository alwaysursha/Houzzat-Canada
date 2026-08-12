import { NextResponse } from "next/server";
import { NEON_LISTING_MEDIA_CAP } from "@/lib/listings/gallery-constants";
import { loadListingDetailApiAccess } from "@/lib/listings/listing-detail-api-access";
import { persistNeonListingMediaCap } from "@/lib/listings/persist-neon-media";
import { listingPhotoSrc } from "@/lib/listings/photo-src";
import { fetchListingPhotosFromPropTx } from "@/lib/proptx/listing-photos";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ mlsNumber: string }> };

/**
 * Full PropTx gallery for a listing (client enrich / prefetch).
 * Writes at most the first 5 photos back to Neon; never persists 6+.
 * VOW / verify / inactive locks match GET /api/listings/[mls]/panel.
 */
export async function GET(_request: Request, { params }: Params) {
  const { mlsNumber: raw } = await params;
  const gated = await loadListingDetailApiAccess(raw);
  if (!gated.ok) return gated.response;

  const { listing, access } = gated;

  // Locked / verify-gated callers get Neon cap only — no PropTx full gallery.
  if (access.detailsLocked || access.needsEmailVerification) {
    const neon = await prisma.listingMedia.findMany({
      where: { listingId: listing.id },
      orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
      take: NEON_LISTING_MEDIA_CAP,
      select: { id: true, url: true, sortOrder: true, isPrimary: true },
    });
    return NextResponse.json(
      {
        photos: neon.map((photo, index) => ({
          id: photo.id,
          url: listingPhotoSrc(photo.url) ?? photo.url,
          sortOrder: photo.sortOrder ?? index,
          isPrimary: photo.isPrimary ?? index === 0,
        })),
        neonMediaCount: neon.length,
        galleryCapped: true,
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  }

  if (!listing.listingKey) {
    return NextResponse.json({ photos: [] as const });
  }

  const photos = await fetchListingPhotosFromPropTx(listing.listingKey, {
    timeoutMs: 10_000,
  });

  if (photos.length > 0) {
    // Warm Neon for the next SSR paint (cap only). Do not block the response
    // on slow DB — best-effort.
    void persistNeonListingMediaCap(
      listing.id,
      photos.slice(0, NEON_LISTING_MEDIA_CAP).map((photo) => ({
        url: photo.mediaUrl,
        sortOrder: photo.sortOrder,
        isPrimary: photo.isPrimary,
      })),
    ).catch(() => {
      // Non-blocking
    });
  }

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
