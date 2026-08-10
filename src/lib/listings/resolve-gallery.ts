import { listingPhotoSrc } from "@/lib/listings/photo-src";
import { fetchListingPhotosFromPropTx } from "@/lib/proptx/listing-photos";

export type GalleryMedia = {
  id: string;
  url: string;
  sortOrder?: number;
  isPrimary?: boolean;
};

/**
 * Prefer live PropTx gallery on listing load; fall back to Neon media.
 */
export async function resolveListingGalleryPhotos(listing: {
  dataSource?: string | null;
  listingKey?: string | null;
  media: Array<{
    id: string;
    url: string;
    sortOrder?: number;
    isPrimary?: boolean;
  }>;
}): Promise<GalleryMedia[]> {
  const livePhotos =
    listing.dataSource === "mls" && listing.listingKey
      ? await fetchListingPhotosFromPropTx(listing.listingKey, {
          // Bound wait so a slow PropTx call cannot 1102 the whole page.
          timeoutMs: 5_000,
          max: 60,
        })
      : [];

  if (livePhotos.length > 0) {
    return livePhotos.map((photo) => ({
      id: photo.id,
      url: listingPhotoSrc(photo.url) ?? photo.url,
      sortOrder: photo.sortOrder,
      isPrimary: photo.isPrimary,
    }));
  }

  return listing.media.map((media) => ({
    id: media.id,
    url: listingPhotoSrc(media.url) ?? media.url,
    sortOrder: media.sortOrder,
    isPrimary: media.isPrimary,
  }));
}
