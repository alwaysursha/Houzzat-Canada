import {
  GALLERY_SESSION_KEY_PREFIX,
  NEON_LISTING_MEDIA_CAP,
} from "@/lib/listings/gallery-constants";

export type ClientGalleryPhoto = {
  id: string;
  url: string;
  alt?: string | null;
};

type InflightGallery = {
  promise: Promise<ClientGalleryPhoto[]>;
  controller: AbortController;
};

/** In-flight dedupe for full-gallery fetches (same tab / same-origin iframe). */
const inflightGallery = new Map<string, InflightGallery>();

export function listingGallerySessionKey(mlsNumber: string): string {
  return `${GALLERY_SESSION_KEY_PREFIX}${mlsNumber.trim().toUpperCase()}`;
}

export function readListingGallerySession(
  mlsNumber: string,
): ClientGalleryPhoto[] | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(listingGallerySessionKey(mlsNumber));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { photos?: ClientGalleryPhoto[] };
    if (!Array.isArray(parsed.photos) || parsed.photos.length === 0) {
      return null;
    }
    return parsed.photos.filter(
      (photo) =>
        photo &&
        typeof photo.id === "string" &&
        typeof photo.url === "string" &&
        photo.url.length > 0,
    );
  } catch {
    return null;
  }
}

export function writeListingGallerySession(
  mlsNumber: string,
  photos: ClientGalleryPhoto[],
): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(
      listingGallerySessionKey(mlsNumber),
      JSON.stringify({ photos }),
    );
  } catch {
    // Quota / private mode — ignore
  }
}

export async function fetchListingGalleryClient(
  mlsNumber: string,
  signal?: AbortSignal,
): Promise<ClientGalleryPhoto[]> {
  const key = mlsNumber.trim().toUpperCase();
  if (!key) return [];
  if (signal?.aborted) return [];

  const cached = readListingGallerySession(key);
  if (cached) return cached;

  const existing = inflightGallery.get(key);
  if (existing) {
    if (signal) {
      const onAbort = () => existing.controller.abort();
      signal.addEventListener("abort", onAbort, { once: true });
    }
    return existing.promise;
  }

  const controller = new AbortController();
  if (signal) {
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  const request = (async () => {
    try {
      const res = await fetch(
        `/api/listings/${encodeURIComponent(key)}/gallery`,
        {
          method: "GET",
          credentials: "same-origin",
          signal: controller.signal,
        },
      );
      if (!res.ok) return [];
      const data = (await res.json()) as { photos?: ClientGalleryPhoto[] };
      const photos = Array.isArray(data.photos)
        ? data.photos.filter(
            (photo) =>
              photo &&
              typeof photo.id === "string" &&
              typeof photo.url === "string" &&
              photo.url.length > 0,
          )
        : [];
      if (photos.length > 0) writeListingGallerySession(key, photos);
      return photos;
    } catch {
      return [];
    } finally {
      inflightGallery.delete(key);
    }
  })();

  inflightGallery.set(key, { promise: request, controller });
  return request;
}

/** Drop in-flight gallery fetches except the active listing (sheet switch/close). */
export function abortListingGalleryFetches(exceptMls?: string | null): void {
  const keep = exceptMls?.trim().toUpperCase() || null;
  for (const [key, entry] of inflightGallery) {
    if (keep && key === keep) continue;
    entry.controller.abort();
    inflightGallery.delete(key);
  }
}

/** Warm session cache before the listing sheet opens (hover / focus). */
export function prefetchListingGallery(mlsNumber: string): void {
  const key = mlsNumber.trim().toUpperCase();
  if (!key) return;
  if (readListingGallerySession(key)) return;
  void fetchListingGalleryClient(key);
}

export function mlsNumberFromListingHref(href: string): string | null {
  try {
    const path = href.startsWith("http")
      ? new URL(href).pathname
      : (href.split("?")[0] ?? "");
    const parts = path.split("/").filter(Boolean);
    if (parts[0] !== "listing" || parts.length < 2) return null;
    const mls = parts[parts.length - 1]?.trim().toUpperCase();
    return mls || null;
  } catch {
    return null;
  }
}

export { NEON_LISTING_MEDIA_CAP };
