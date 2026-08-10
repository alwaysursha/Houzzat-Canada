"use client";

import { useEffect, useState, type ComponentProps } from "react";
import {
  ListingGallery,
  type GalleryPhoto,
} from "@/components/listings/ListingGallery";

type Props = ComponentProps<typeof ListingGallery> & { mlsNumber: string };

/**
 * Show Neon cover immediately (fast page open), then swap in full PropTx
 * gallery. Keeps listing HTML off the PropTx Media path that caused 1102.
 */
export function ListingGalleryLive({
  mlsNumber,
  photos: initialPhotos,
  ...rest
}: Props) {
  const [photos, setPhotos] = useState<GalleryPhoto[]>(initialPhotos);

  useEffect(() => {
    setPhotos(initialPhotos);
  }, [initialPhotos]);

  useEffect(() => {
    const mls = mlsNumber.trim();
    if (!mls) return;
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch(
          `/api/listings/${encodeURIComponent(mls)}/gallery`,
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          photos?: Array<{ id: string; url: string }>;
        };
        if (cancelled || !data.photos?.length) return;
        // Only upgrade when we actually get a richer gallery.
        if (data.photos.length <= initialPhotos.length) return;
        setPhotos(data.photos.map((p) => ({ id: p.id, url: p.url })));
      } catch {
        // Keep cover photos.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mlsNumber, initialPhotos.length]);

  return <ListingGallery mlsNumber={mlsNumber} photos={photos} {...rest} />;
}
