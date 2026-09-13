import {
  GALLERY_SESSION_KEY_PREFIX,
  NEON_LISTING_MEDIA_CAP,
} from "@/lib/listings/gallery-constants";
import { galleryIsRicherThanNeon } from "@/lib/listings/merge-gallery-photos";

export type ClientGalleryPhoto = {
  id: string;
  url: string;
  alt?: string | null;
};

export type ClientGalleryFetchResult = {
  photos: ClientGalleryPhoto[];
  totalPhotoCount: number | null;
  galleryCapped: boolean;
};

type InflightGallery = {
  promise: Promise<ClientGalleryFetchResult>;
  controller: AbortController;
};

function parseGalleryPhotos(data: unknown): ClientGalleryPhoto[] {
  if (!data || typeof data !== "object" || !("photos" in data)) return [];
  const photos = (data as { photos?: unknown }).photos;
  if (!Array.isArray(photos)) return [];
  return photos.filter(
    (photo): photo is ClientGalleryPhoto =>
      Boolean(
        photo &&
          typeof photo === "object" &&
          typeof (photo as ClientGalleryPhoto).id === "string" &&
          typeof (photo as ClientGalleryPhoto).url === "string" &&
          (photo as ClientGalleryPhoto).url.length > 0,
      ),
  );
}

export function parseGalleryTotalPhotoCount(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  const raw = (data as { totalPhotoCount?: unknown }).totalPhotoCount;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  const n = Math.floor(raw);
  if (n < 0 || n > 500) return null;
  return n;
}

export function parseGalleryCapped(data: unknown): boolean {
  return Boolean(
    data &&
      typeof data === "object" &&
      (data as { galleryCapped?: unknown }).galleryCapped === true,
  );
}

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

export async function fetchListingGalleryPayload(
  mlsNumber: string,
  signal?: AbortSignal,
  options?: { ignoreSessionCache?: boolean },
): Promise<ClientGalleryFetchResult> {
  const empty: ClientGalleryFetchResult = {
    photos: [],
    totalPhotoCount: null,
    galleryCapped: false,
  };
  const key = mlsNumber.trim().toUpperCase();
  if (!key) return empty;
  if (signal?.aborted) return empty;

  if (!options?.ignoreSessionCache) {
    const cached = readListingGallerySession(key);
    // Neon-cap (≤5) is the SSR set — do not treat it as a completed full gallery.
    if (galleryIsRicherThanNeon(cached)) {
      return {
        photos: cached,
        totalPhotoCount: cached.length,
        galleryCapped: false,
      };
    }
  }

  if (!options?.ignoreSessionCache) {
    const existing = inflightGallery.get(key);
    if (existing) {
      if (signal) {
        const onAbort = () => existing.controller.abort();
        signal.addEventListener("abort", onAbort, { once: true });
      }
      return existing.promise;
    }
  }

  const controller = new AbortController();
  if (signal) {
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  const request = (async (): Promise<ClientGalleryFetchResult> => {
    try {
      const res = await fetch(
        `/api/listings/${encodeURIComponent(key)}/gallery`,
        {
          method: "GET",
          credentials: "same-origin",
          signal: controller.signal,
        },
      );
      if (!res.ok) return empty;
      const data: unknown = await res.json();
      const galleryCapped = parseGalleryCapped(data);
      let photos = parseGalleryPhotos(data);
      if (galleryCapped) {
        photos = photos.slice(0, NEON_LISTING_MEDIA_CAP);
      }
      const totalPhotoCount = parseGalleryTotalPhotoCount(data);
      if (
        !options?.ignoreSessionCache &&
        !galleryCapped &&
        galleryIsRicherThanNeon(photos)
      ) {
        writeListingGallerySession(key, photos);
      }
      return { photos, totalPhotoCount, galleryCapped };
    } catch {
      return empty;
    } finally {
      if (!options?.ignoreSessionCache) {
        inflightGallery.delete(key);
      }
    }
  })();

  if (!options?.ignoreSessionCache) {
    inflightGallery.set(key, { promise: request, controller });
  }
  return request;
}

export async function fetchListingGalleryClient(
  mlsNumber: string,
  signal?: AbortSignal,
): Promise<ClientGalleryPhoto[]> {
  const result = await fetchListingGalleryPayload(mlsNumber, signal);
  return result.photos;
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
  const cached = readListingGallerySession(key);
  if (galleryIsRicherThanNeon(cached)) return;
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
