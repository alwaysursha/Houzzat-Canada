import { listingPhotoSrc } from "@/lib/listings/photo-src";
import { fetchListingPhotosFromPropTx } from "@/lib/proptx/listing-photos";

export type GalleryMedia = {
  id: string;
  url: string;
  sortOrder?: number;
  isPrimary?: boolean;
};

/**
 * Prefer live PropTx gallery; fall back to Neon media (usually cover only).
 * DB intentionally stores one primary image for search/cards.
 */
export async function resolveListingGalleryPhotos(listing: {
  dataSource?: string | null;
  listingKey?: string | null;
  media: Array<{ id: string; url: string; sortOrder?: number; isPrimary?: boolean }>;
}): Promise<GalleryMedia[]> {
  const livePhotos =
    listing.dataSource === "mls" && listing.listingKey
      ? await fetchListingPhotosFromPropTx(listing.listingKey)
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
