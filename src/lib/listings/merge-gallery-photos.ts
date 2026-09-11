import { NEON_LISTING_MEDIA_CAP } from "@/lib/listings/gallery-constants";

export type MergeableGalleryPhoto = {
  id: string;
  url: string;
  alt?: string | null;
};

/** True when live/session photos include extras beyond the Neon SSR cap. */
export function galleryIsRicherThanNeon<T extends { length: number }>(
  photos: T | null | undefined,
): photos is T {
  return Boolean(photos && photos.length > NEON_LISTING_MEDIA_CAP);
}

/**
 * Keep Neon head photos stable; append PropTx extras by URL.
 * Never reorders or replaces the first {@link NEON_LISTING_MEDIA_CAP} slots.
 */
export function mergeListingGalleryPhotos<T extends MergeableGalleryPhoto>(
  neonPhotos: T[],
  livePhotos: T[],
): T[] {
  if (livePhotos.length === 0) return neonPhotos;

  const head = neonPhotos.slice(0, NEON_LISTING_MEDIA_CAP);
  if (head.length === 0) return livePhotos;

  const headUrls = new Set(head.map((photo) => photo.url));
  const extras = livePhotos.filter((photo) => !headUrls.has(photo.url));
  if (extras.length === 0) return neonPhotos;

  return [...head, ...extras];
}
