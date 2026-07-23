"use client";

import Image from "next/image";
import { useCallback, useEffect, useId, useState } from "react";
import {
  ViewingBookingModal,
  type ViewingContactDefaults,
} from "@/components/listings/ViewingBookingModal";
import {
  ListingMapViewButton,
  type ListingMapSubject,
} from "@/components/listings/ListingMapView";
import { cn } from "@/lib/utils";

export type GalleryPhoto = {
  id: string;
  url: string;
  alt?: string | null;
};

export function ListingGallery({
  photos,
  addressLabel,
  mlsNumber,
  contact,
  coverTag,
  segmentTag,
  mapSubject,
}: {
  photos: GalleryPhoto[];
  addressLabel: string;
  mlsNumber: string;
  contact?: ViewingContactDefaults;
  /** Bottom-left hero badge: For Sale / For Lease / Sold / etc. */
  coverTag?: string;
  /** Bottom-left hero badge: Residential / Commercial / Pre-construction */
  segmentTag?: {
    label: string;
    tone: "residential" | "commercial" | "preconstruction";
  };
  /** When set, shows Map view on the cover (top-left). */
  mapSubject?: ListingMapSubject;
}) {
  const labelId = useId();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [bookingOpen, setBookingOpen] = useState(false);

  const count = photos.length;
  const hero = photos[0];
  const side = photos.slice(1, 5);
  const remaining = Math.max(0, count - 5);

  const openAt = useCallback((i: number) => {
    setIndex(i);
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    if (bookingOpen) return;
    setOpen(false);
  }, [bookingOpen]);

  const step = useCallback(
    (delta: number) => {
      if (count === 0) return;
      setIndex((current) => (current + delta + count) % count);
    },
    [count],
  );

  useEffect(() => {
    if (!open) return;

    function onKey(event: KeyboardEvent) {
      if (bookingOpen) return;
      if (event.key === "Escape") close();
      if (event.key === "ArrowRight") step(1);
      if (event.key === "ArrowLeft") step(-1);
    }

    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, close, step, bookingOpen]);

  if (!hero) {
    return (
      <div className="flex h-[42vh] min-h-[280px] items-center justify-center rounded-2xl bg-mist text-sm text-ink/50">
        Photos coming soon
      </div>
    );
  }

  return (
    <>
      <div className="relative">
        <div
          className={cn(
            "grid gap-2 overflow-hidden rounded-2xl md:gap-2.5",
            side.length >= 4
              ? "md:grid-cols-4 md:grid-rows-2"
              : side.length > 0
                ? "md:grid-cols-[1.6fr_1fr] md:grid-rows-2"
                : "",
          )}
        >
          <button
            type="button"
            onClick={() => openAt(0)}
            className={cn(
              "group relative min-h-[52vh] overflow-hidden bg-mist text-left md:min-h-[560px]",
              side.length >= 4
                ? "md:col-span-2 md:row-span-2"
                : side.length > 0
                  ? "md:row-span-2"
                  : "",
            )}
            aria-label={`View photo 1 of ${count}`}
          >
            <Image
              src={hero.url}
              alt={hero.alt ?? `${addressLabel} photo 1`}
              fill
              priority
              className="object-cover transition duration-500 group-hover:scale-[1.02]"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
            <span className="absolute inset-0 bg-gradient-to-t from-ink/40 via-transparent to-transparent opacity-90" />
            {coverTag || segmentTag ? (
              <div className="absolute bottom-3 left-3 z-10 flex flex-wrap items-center gap-2 sm:bottom-4 sm:left-4">
                {segmentTag ? (
                  <span
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-bold tracking-wide shadow-md sm:text-sm",
                      segmentTag.tone === "commercial" && "bg-ink text-white",
                      segmentTag.tone === "preconstruction" &&
                        "bg-signal text-white",
                      segmentTag.tone === "residential" &&
                        "bg-canopy text-white",
                    )}
                  >
                    {segmentTag.label}
                  </span>
                ) : null}
                {coverTag ? (
                  <span className="rounded-md bg-mist px-3 py-1.5 text-xs font-bold tracking-wide text-ink shadow-md sm:text-sm">
                    {coverTag}
                  </span>
                ) : null}
              </div>
            ) : null}
          </button>

          {side.map((photo, i) => {
            const photoIndex = i + 1;
            const isLastTile = i === side.length - 1 && remaining > 0;
            return (
              <button
                key={photo.id}
                type="button"
                onClick={() => openAt(photoIndex)}
                className={cn(
                  "group relative hidden min-h-[274px] overflow-hidden bg-mist text-left md:block",
                  side.length === 1 ? "md:row-span-2" : "",
                )}
                aria-label={
                  isLastTile
                    ? `View all ${count} photos`
                    : `View photo ${photoIndex + 1} of ${count}`
                }
              >
                <Image
                  src={photo.url}
                  alt={photo.alt ?? `${addressLabel} photo ${photoIndex + 1}`}
                  fill
                  className="object-cover transition duration-500 group-hover:scale-[1.03]"
                  sizes="(max-width: 768px) 100vw, 25vw"
                />
                {isLastTile ? (
                  <span className="absolute inset-0 flex items-end justify-end bg-ink/35 p-4">
                    <span className="rounded-lg bg-white/95 px-3 py-2 text-sm font-semibold text-ink shadow-sm">
                      +{remaining} more
                    </span>
                  </span>
                ) : (
                  <span className="absolute inset-0 bg-ink/0 transition group-hover:bg-ink/10" />
                )}
              </button>
            );
          })}
        </div>

        {mapSubject ? (
          <div className="absolute left-3 top-3 z-10 sm:left-4 sm:top-4">
            <ListingMapViewButton subject={mapSubject} />
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => openAt(0)}
          className="absolute bottom-4 right-4 z-10 rounded-lg bg-white/95 px-4 py-2.5 text-sm font-semibold text-ink shadow-md backdrop-blur-sm transition hover:bg-white"
        >
          Show all {count} photos
        </button>
      </div>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelId}
          className="fixed inset-0 z-[80] flex flex-col bg-ink/95"
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <p id={labelId} className="truncate text-sm font-medium text-white/85">
              {addressLabel}
              <span className="ml-2 text-white/50">
                {index + 1} / {count}
              </span>
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setBookingOpen(true)}
                className="rounded-lg bg-canopy px-3 py-2 text-sm font-semibold text-white hover:bg-canopy-deep sm:px-4"
              >
                Book a viewing
              </button>
              <button
                type="button"
                onClick={close}
                className="rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/15"
              >
                Close
              </button>
            </div>
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-16">
            {count > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => step(-1)}
                  className="absolute left-1 z-10 rounded-full bg-white/10 px-3 py-3 text-lg text-white hover:bg-white/20 sm:left-3"
                  aria-label="Previous photo"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => step(1)}
                  className="absolute right-1 z-10 rounded-full bg-white/10 px-3 py-3 text-lg text-white hover:bg-white/20 sm:right-3"
                  aria-label="Next photo"
                >
                  →
                </button>
              </>
            ) : null}

            <Image
              key={photos[index]!.id}
              src={photos[index]!.url}
              alt={
                photos[index]!.alt ?? `${addressLabel} photo ${index + 1}`
              }
              width={2400}
              height={1600}
              quality={90}
              className="h-auto max-h-[calc(100vh-10.5rem)] w-auto max-w-[calc(100vw-1rem)] rounded-2xl object-contain shadow-2xl sm:max-w-[calc(100vw-8rem)]"
              sizes="100vw"
              priority
            />
          </div>

          <div className="flex shrink-0 flex-col gap-2 px-4 pb-4 sm:px-6">
            <div className="flex justify-center sm:hidden">
              <button
                type="button"
                onClick={() => setBookingOpen(true)}
                className="w-full max-w-sm rounded-lg bg-canopy px-4 py-2.5 text-sm font-semibold text-white hover:bg-canopy-deep"
              >
                Book a viewing
              </button>
            </div>
            {count > 1 ? (
              <div className="flex justify-center gap-2 overflow-x-auto">
                {photos.map((photo, i) => (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => setIndex(i)}
                    className={cn(
                      "relative h-14 w-20 shrink-0 overflow-hidden rounded-xl ring-2 transition sm:h-16 sm:w-24",
                      i === index
                        ? "ring-white"
                        : "ring-transparent opacity-70 hover:opacity-100",
                    )}
                    aria-label={`Go to photo ${i + 1}`}
                    aria-current={i === index}
                  >
                    <Image
                      src={photo.url}
                      alt=""
                      fill
                      className="rounded-xl object-cover"
                      sizes="96px"
                    />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <ViewingBookingModal
        open={bookingOpen}
        onClose={() => setBookingOpen(false)}
        mlsNumber={mlsNumber}
        contact={contact}
      />
    </>
  );
}
