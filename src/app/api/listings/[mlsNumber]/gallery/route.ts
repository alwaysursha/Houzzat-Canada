import { NextResponse } from "next/server";
import { NEON_LISTING_MEDIA_CAP } from "@/lib/listings/gallery-constants";
import { persistNeonListingMediaCap } from "@/lib/listings/persist-neon-media";
import { fetchListingPhotosFromPropTx } from "@/lib/proptx/listing-photos";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ mlsNumber: string }> };

/**
 * Full PropTx gallery for a listing (client enrich / prefetch).
 * Writes at most the first 5 photos back to Neon; never persists 6+.
 */
export async function GET(_request: Request, { params }: Params) {
  const { mlsNumber: raw } = await params;
  const mlsNumber = decodeURIComponent(raw).trim().toUpperCase();
  if (!mlsNumber) {
    return NextResponse.json({ error: "Missing MLS number" }, { status: 400 });
  }

  const listing = await prisma.listing.findUnique({
    where: { mlsNumber },
    select: {
      id: true,
      listingKey: true,
      _count: { select: { media: true } },
    },
  });
  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
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

  return NextResponse.json(
    {
      photos: photos.map((photo) => ({
        id: photo.id,
        url: photo.url,
        sortOrder: photo.sortOrder,
        isPrimary: photo.isPrimary,
      })),
      neonMediaCount: listing._count.media,
    },
    {
      headers: {
        "Cache-Control": "private, max-age=60",
      },
    },
  );
}
