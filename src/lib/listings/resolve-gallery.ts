import { listingPhotoSrc } from "@/lib/listings/photo-src";
import { NEON_LISTING_MEDIA_CAP } from "@/lib/listings/gallery-constants";

export type GalleryMedia = {
  id: string;
  url: string;
  sortOrder?: number;
  isPrimary?: boolean;
};

/**
 * Listing SSR gallery — Neon media only (never awaits PropTx).
 * Sync keeps up to {@link NEON_LISTING_MEDIA_CAP} photos for an immediate grid.
 */
export function resolveListingGalleryPhotos(listing: {
  media: Array<{
    id: string;
    url: string;
    sortOrder?: number;
    isPrimary?: boolean;
  }>;
}): GalleryMedia[] {
  return listing.media
    .slice()
    .sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    })
    .slice(0, NEON_LISTING_MEDIA_CAP)
    .map((media) => ({
      id: media.id,
      url: listingPhotoSrc(media.url) ?? media.url,
      sortOrder: media.sortOrder,
      isPrimary: media.isPrimary,
    }));
}
