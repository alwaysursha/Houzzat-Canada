"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import {
  ListingGallery,
} from "@/components/listings/ListingGallery";
import { NEON_LISTING_MEDIA_CAP } from "@/lib/listings/gallery-constants";
import {
  fetchListingGalleryClient,
  readListingGallerySession,
  writeListingGallerySession,
} from "@/lib/listings/gallery-client";
import { mergeListingGalleryPhotos } from "@/lib/listings/merge-gallery-photos";

type ListingGalleryProps = ComponentProps<typeof ListingGallery>;

type LivePhoto = {
  id: string;
  url: string;
};

/**
 * Renders Neon gallery immediately, then appends PropTx photos after paint.
 * Prefers a server-started promise (no extra API hop); falls back to client fetch.
 * Does not reset the active slide or replace the first Neon photos.
 *
 * First client render must match SSR (Neon only) — never read sessionStorage
 * during useState init or hydration will mismatch.
 */
export function ListingGalleryLive({
  photos: neonPhotos,
  mlsNumber,
  livePhotosPromise,
  needsEmailVerification = false,
  hiddenPhotoCount: hiddenPhotoCountProp = 0,
  ...rest
}: ListingGalleryProps & {
  /** Started on the server during RSC — resolves in parallel with HTML. */
  livePhotosPromise?: Promise<LivePhoto[]> | null;
}) {
  const [photos, setPhotos] = useState(neonPhotos);
  const neonRef = useRef(neonPhotos);
  neonRef.current = neonPhotos;

  useEffect(() => {
    setPhotos((current) => mergeListingGalleryPhotos(neonPhotos, current));
  }, [neonPhotos]);

  useEffect(() => {
    const mls = mlsNumber.trim().toUpperCase();
    if (!mls) return;

    let cancelled = false;
    const controller = new AbortController();

    function applyLive(live: LivePhoto[]) {
      if (cancelled || live.length === 0) return;
      writeListingGallerySession(mls, live);
      setPhotos((current) => {
        const head = neonRef.current.length > 0 ? neonRef.current : current;
        const next = mergeListingGalleryPhotos(head, live);
        if (
          next.length === current.length &&
          next.every((photo, i) => photo.url === current[i]?.url)
        ) {
          return current;
        }
        return next;
      });
    }

    async function enrich() {
      // Session cache only after mount — keeps hydration HTML identical to SSR.
      const cached = readListingGallerySession(mls);
      if (cached && cached.length > 0) {
        applyLive(cached);
      }

      if (livePhotosPromise) {
        try {
          const live = await livePhotosPromise;
          applyLive(live);
          return;
        } catch {
          // Fall through to client fetch
        }
      }
      const live = await fetchListingGalleryClient(mls, controller.signal);
      applyLive(live);
    }

    void enrich();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [mlsNumber, livePhotosPromise]);

  const verifyLocked = needsEmailVerification;
  const displayPhotos = verifyLocked
    ? photos.slice(0, NEON_LISTING_MEDIA_CAP + 1)
    : photos;
  const hiddenPhotoCount = verifyLocked
    ? Math.max(0, photos.length - NEON_LISTING_MEDIA_CAP)
    : hiddenPhotoCountProp;

  return (
    <ListingGallery
      {...rest}
      mlsNumber={mlsNumber}
      photos={displayPhotos}
      needsEmailVerification={needsEmailVerification}
      hiddenPhotoCount={hiddenPhotoCount}
    />
  );
}
