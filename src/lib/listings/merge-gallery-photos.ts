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

/** Show the 6th lock tile only for expired-grace clients when more photos exist. */
export function shouldShowGalleryVerifyLock(input: {
  needsEmailVerification: boolean;
  detailsLocked: boolean;
  visiblePhotoCount: number;
  totalPhotoCount?: number | null;
}): boolean {
  if (!input.needsEmailVerification || input.detailsLocked) return false;
  if (input.visiblePhotoCount <= 0) return false;
  if (input.totalPhotoCount != null) {
    return input.totalPhotoCount > NEON_LISTING_MEDIA_CAP;
  }
  return input.visiblePhotoCount >= NEON_LISTING_MEDIA_CAP;
}

/** Cover CTA: guests/verified keep “Show all N”; locked uses View All + optional total. */
export function galleryShowAllPhotosLabel(input: {
  visiblePhotoCount: number;
  totalPhotoCount?: number | null;
  locked: boolean;
}): string {
  if (!input.locked) {
    return `Show all ${input.visiblePhotoCount} photos`;
  }
  if (input.totalPhotoCount != null && input.totalPhotoCount > 0) {
    return `View All ${input.totalPhotoCount} Photos`;
  }
  return "View All Photos";
}
