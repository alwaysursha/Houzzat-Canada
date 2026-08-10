import { listingPhotoSrc } from "@/lib/listings/photo-src";
import { fetchListingPhotosFromPropTx } from "@/lib/proptx/listing-photos";

export type GalleryMedia = {
  id: string;
  url: string;
  sortOrder?: number;
  isPrimary?: boolean;
};

function fromDb(
  media: Array<{
    id: string;
    url: string;
    sortOrder?: number;
    isPrimary?: boolean;
  }>,
): GalleryMedia[] {
  return media.map((row) => ({
    id: row.id,
    url: listingPhotoSrc(row.url) ?? row.url,
    sortOrder: row.sortOrder,
    isPrimary: row.isPrimary,
  }));
}

/**
 * Listing SSR must stay Worker-light (Cloudflare 1102).
 * Default: Neon cover/media only. Opt in to PropTx with preferLive (API/client).
 */
export async function resolveListingGalleryPhotos(
  listing: {
    dataSource?: string | null;
    listingKey?: string | null;
    media: Array<{
      id: string;
      url: string;
      sortOrder?: number;
      isPrimary?: boolean;
    }>;
  },
  options?: { preferLive?: boolean; timeoutMs?: number; max?: number },
): Promise<GalleryMedia[]> {
  const db = fromDb(listing.media);
  if (!options?.preferLive) return db;

  const live =
    listing.dataSource === "mls" && listing.listingKey
      ? await fetchListingPhotosFromPropTx(listing.listingKey, {
          timeoutMs: options.timeoutMs ?? 5_000,
          max: options.max ?? 60,
        })
      : [];

  if (live.length === 0) return db;

  return live.map((photo) => ({
    id: photo.id,
    url: listingPhotoSrc(photo.url) ?? photo.url,
    sortOrder: photo.sortOrder,
    isPrimary: photo.isPrimary,
  }));
}
