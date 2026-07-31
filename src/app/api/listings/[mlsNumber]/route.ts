import { NextResponse } from "next/server";
import { getListingProvider } from "@/lib/listings/provider";
import { resolveListingGalleryPhotos } from "@/lib/listings/resolve-gallery";

type Params = { params: Promise<{ mlsNumber: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { mlsNumber } = await params;
  const provider = getListingProvider();
  const listing = await provider.getByMls(mlsNumber);

  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  const gallery = await resolveListingGalleryPhotos(listing);
  const media =
    gallery.length > 0
      ? gallery.map((photo, index) => ({
          id: photo.id,
          url: photo.url,
          sortOrder: photo.sortOrder ?? index,
          isPrimary: photo.isPrimary ?? index === 0,
          listingId: listing.id,
        }))
      : listing.media;

  return NextResponse.json({
    listing: { ...listing, media },
    provider: provider.name,
  });
}
