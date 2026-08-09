"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ViewingBookingModal,
  type ViewingContactDefaults,
} from "@/components/listings/ViewingBookingModal";
import {
  ListingMapViewButton,
  type ListingMapSubject,
} from "@/components/listings/ListingMapView";
import { ListingGalleryMapSlide } from "@/components/listings/ListingGalleryMapSlide";
import { EmailVerificationRequired } from "@/components/auth/EmailVerificationRequired";
import { ListingLockedGateOverlay } from "@/components/listings/ListingLockedGateOverlay";
import { ListingPhoto } from "@/components/listings/ListingPhoto";
import { cn } from "@/lib/utils";
import { Images, Lock, MapPinned, Video } from "lucide-react";

export type GalleryPhoto = {
  id: string;
  url: string;
  alt?: string | null;
};

function useIsMobileGallery() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return isMobile;
}

/** Compact glass controls on listing cover (Map view / Virtual tour). */
const COVER_CONTROL_CLASS =
  "group inline-flex items-center gap-1.5 rounded-md border border-white/50 bg-white/55 px-2.5 py-1.5 text-xs font-semibold text-ink shadow-md backdrop-blur-md transition hover:-translate-y-0.5 hover:bg-white/75 hover:shadow-lg";

const COVER_CONTROL_ICON_WRAP =
  "flex size-5 items-center justify-center rounded-full bg-canopy text-white shadow-sm transition group-hover:scale-105";

const COVER_STATUS_TAG_CLASS =
  "rounded-lg px-3 py-1.5 text-xs font-bold tracking-wide shadow-md sm:px-3.5 sm:py-2 sm:text-sm";

function VirtualTourCoverButton({
  href,
  className,
}: {
  href: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => event.stopPropagation()}
      className={cn(COVER_CONTROL_CLASS, className)}
    >
      <span className={COVER_CONTROL_ICON_WRAP}>
        <Video className="size-3" aria-hidden />
      </span>
      Virtual tour
    </a>
  );
}

function CoverSegmentTag({
  segmentTag,
}: {
  segmentTag: {
    label: string;
    tone: "residential" | "commercial" | "preconstruction";
  };
}) {
  return (
    <span
      className={cn(
        COVER_STATUS_TAG_CLASS,
        segmentTag.tone === "commercial" && "bg-ink text-white",
        segmentTag.tone === "preconstruction" && "bg-signal text-white",
        segmentTag.tone === "residential" &&
          "bg-mist text-ink ring-1 ring-line",
      )}
    >
      {segmentTag.label}
    </span>
  );
}

export function ListingGallery({
  photos,
  addressLabel,
  mlsNumber,
  callbackPath,
  contact,
  coverTag,
  coverTagClassName,
  segmentTag,
  virtualTourUrl,
  mapSubject,
  allowBooking = true,
  detailsLocked = false,
  needsEmailVerification = false,
  hiddenPhotoCount = 0,
}: {
  photos: GalleryPhoto[];
  addressLabel: string;
  mlsNumber: string;
  /** Canonical SEO path for auth redirects (`/listing/slug/MLS`). */
  callbackPath?: string;
  contact?: ViewingContactDefaults;
  /** Bottom-left hero badge: For Sale / For Lease / Sold / etc. */
  coverTag?: string;
  /** Optional override for cover status pill (e.g. sold = danger red). */
  coverTagClassName?: string;
  /** Bottom-left hero badge: Residential / Commercial / Pre-construction */
  segmentTag?: {
    label: string;
    tone: "residential" | "commercial" | "preconstruction";
  };
  /** PropTx virtual tour URL — cover CTA when present. */
  virtualTourUrl?: string | null;
  /** When set, shows Map view on the cover (top-left). */
  mapSubject?: ListingMapSubject;
  /** Hide book-a-viewing on inactive (sold/leased) listings. */
  allowBooking?: boolean;
  /** Guest lock: blur photos + login overlay (status badge stays visible). */
  detailsLocked?: boolean;
  /** Signed-in locked account — verify CTA instead of login. */
  needsEmailVerification?: boolean;
  /** Extra photos withheld until email verification. */
  hiddenPhotoCount?: number;
}) {
  const tourUrl = virtualTourUrl?.trim() || null;
  const lockCallback = callbackPath ?? `/listing/${mlsNumber}`;
  const labelId = useId();
  const isMobile = useIsMobileGallery();
  const [stackOpen, setStackOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [thumbsVisible, setThumbsVisible] = useState(false);
  const dragRef = useRef<{
    id: number;
    startX: number;
    startY: number;
    dragging: boolean;
  } | null>(null);
  const [dragX, setDragX] = useState(0);

  const count = photos.length;
  const hero = photos[0];
  const side = photos.slice(1, 5);
  /** 6th photo (0-based index 5) is the verify lock slide when gated. */
  const verifyGateIndex =
    needsEmailVerification && !detailsLocked && count > 5 ? 5 : null;
  // Cover "+N more" = photos beyond the 5 grid tiles (or withheld until verify).
  const remaining =
    hiddenPhotoCount > 0
      ? hiddenPhotoCount
      : Math.max(0, count - 5);
  const mobileScrollerRef = useRef<HTMLDivElement>(null);
  const mobileScrollAnimatingRef = useRef(false);
  const mobileScrollFinishTimerRef = useRef<number | null>(null);
  const [mobileSlide, setMobileSlide] = useState(0);
  const hasMapSlide = Boolean(
    mapSubject &&
      Number.isFinite(mapSubject.lat) &&
      Number.isFinite(mapSubject.lng),
  );
  const mobileSlideCount = count + (hasMapSlide ? 1 : 0);
  const mapSlideIndex = hasMapSlide ? count : -1;
  const onMapSlide = mobileSlide === mapSlideIndex;

  const openStack = useCallback(() => {
    setStackOpen(true);
  }, []);

  const openViewerAt = useCallback(
    (i: number) => {
      let next = Math.min(count - 1, Math.max(0, i));
      if (verifyGateIndex != null && next > verifyGateIndex) {
        next = verifyGateIndex;
      }
      setIndex(next);
      setViewerOpen(true);
      setDragX(0);
      setThumbsVisible(false);
    },
    [count, verifyGateIndex],
  );

  const openFromCover = useCallback(
    (i: number) => {
      if (isMobile) {
        openStack();
        return;
      }
      openViewerAt(i);
    },
    [isMobile, openStack, openViewerAt],
  );

  const syncMobileSlide = useCallback(() => {
    if (mobileScrollAnimatingRef.current) return;
    const el = mobileScrollerRef.current;
    if (!el || el.clientWidth <= 0) return;
    let next = Math.round(el.scrollLeft / el.clientWidth);
    // Allow the map slide past the gate; block other photos beyond it.
    if (
      verifyGateIndex != null &&
      next > verifyGateIndex &&
      next !== mapSlideIndex
    ) {
      next = verifyGateIndex;
      el.scrollLeft = next * el.clientWidth;
    }
    setMobileSlide(Math.min(mobileSlideCount - 1, Math.max(0, next)));
  }, [mapSlideIndex, mobileSlideCount, verifyGateIndex]);

  const goToMobileSlide = useCallback(
    (slideIndex: number) => {
      const el = mobileScrollerRef.current;
      if (!el || el.clientWidth <= 0) return;

      let clamped = Math.min(
        mobileSlideCount - 1,
        Math.max(0, slideIndex),
      );
      if (
        verifyGateIndex != null &&
        clamped > verifyGateIndex &&
        clamped !== mapSlideIndex
      ) {
        clamped = verifyGateIndex;
      }
      const width = el.clientWidth;
      const targetLeft = clamped * width;

      // Ignore repeat taps / mid-animation taps — prevents scroll thrash.
      if (mobileScrollAnimatingRef.current) return;
      if (Math.abs(el.scrollLeft - targetLeft) < 2) {
        setMobileSlide(clamped);
        return;
      }

      mobileScrollAnimatingRef.current = true;
      setMobileSlide(clamped);
      // Ensure map gesture lock is cleared so scroll can run.
      el.style.overflowX = "";

      el.scrollTo({ left: targetLeft, behavior: "smooth" });

      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (mobileScrollFinishTimerRef.current != null) {
          window.clearTimeout(mobileScrollFinishTimerRef.current);
          mobileScrollFinishTimerRef.current = null;
        }
        el.removeEventListener("scrollend", onScrollEnd);
        // Settle exactly on the slide (smooth scroll can stop slightly off).
        el.scrollLeft = targetLeft;
        setMobileSlide(clamped);
        mobileScrollAnimatingRef.current = false;
      };

      function onScrollEnd() {
        finish();
      }

      el.addEventListener("scrollend", onScrollEnd, { once: true });
      // Safari / older WebKit may not fire scrollend.
      mobileScrollFinishTimerRef.current = window.setTimeout(finish, 480);
    },
    [mapSlideIndex, mobileSlideCount, verifyGateIndex],
  );

  const lockMobileCarousel = useCallback(() => {
    if (mobileScrollAnimatingRef.current) return;
    const el = mobileScrollerRef.current;
    if (!el) return;
    el.style.overflowX = "hidden";
  }, []);

  const unlockMobileCarousel = useCallback(() => {
    const el = mobileScrollerRef.current;
    if (!el) return;
    el.style.overflowX = "";
  }, []);

  useEffect(() => {
    const el = mobileScrollerRef.current;
    if (!el) return;
    syncMobileSlide();
    el.addEventListener("scroll", syncMobileSlide, { passive: true });
    const ro = new ResizeObserver(syncMobileSlide);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", syncMobileSlide);
      ro.disconnect();
      if (mobileScrollFinishTimerRef.current != null) {
        window.clearTimeout(mobileScrollFinishTimerRef.current);
      }
    };
  }, [syncMobileSlide, photos.length]);

  const closeViewer = useCallback(() => {
    if (bookingOpen) return;
    setViewerOpen(false);
    setDragX(0);
  }, [bookingOpen]);

  const closeStack = useCallback(() => {
    if (bookingOpen || viewerOpen) return;
    setStackOpen(false);
  }, [bookingOpen, viewerOpen]);

  const step = useCallback(
    (delta: number) => {
      if (count === 0) return;
      setIndex((current) => {
        if (verifyGateIndex == null) {
          return (current + delta + count) % count;
        }
        const next = current + delta;
        if (next > verifyGateIndex) return current;
        if (next < 0) return 0;
        return next;
      });
      setDragX(0);
    },
    [count, verifyGateIndex],
  );

  useEffect(() => {
    if (!stackOpen && !viewerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [stackOpen, viewerOpen]);

  useEffect(() => {
    if (!viewerOpen && !stackOpen) return;

    function onKey(event: KeyboardEvent) {
      if (bookingOpen) return;
      if (event.key === "Escape") {
        if (viewerOpen) closeViewer();
        else closeStack();
      }
      if (viewerOpen) {
        if (event.key === "ArrowRight") step(1);
        if (event.key === "ArrowLeft") step(-1);
      }
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [
    viewerOpen,
    stackOpen,
    bookingOpen,
    closeViewer,
    closeStack,
    step,
  ]);

  function onViewerPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dragRef.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onViewerPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const state = dragRef.current;
    if (!state || state.id !== event.pointerId) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (!state.dragging && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      state.dragging = true;
    }
    if (state.dragging) {
      setDragX(dx);
    }
  }

  function onViewerPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const state = dragRef.current;
    if (!state || state.id !== event.pointerId) return;
    dragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // already released
    }
    if (!state.dragging) {
      setDragX(0);
      return;
    }
    const dx = event.clientX - state.startX;
    if (dx <= -56) step(1);
    else if (dx >= 56) step(-1);
    else setDragX(0);
  }

  if (!hero) {
    return (
      <div className="-mx-4 flex h-[42vh] min-h-[280px] items-center justify-center bg-mist text-sm text-ink/50 sm:-mx-6 md:mx-0 md:rounded-2xl">
        Photos coming soon
      </div>
    );
  }

  return (
    <>
      {/* ——— Mobile cover: full-bleed swipe carousel (desktop unchanged below) ——— */}
      <div className="relative -mx-4 sm:-mx-6 md:hidden">
        <div
          ref={mobileScrollerRef}
          className={cn(
            "flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            detailsLocked && "blur-[6px] saturate-75",
          )}
          style={{ WebkitOverflowScrolling: "touch" }}
          aria-label={`${addressLabel} photos`}
        >
          {photos.map((photo, i) => {
            const isVerifySlide = verifyGateIndex != null && i === verifyGateIndex;
            const slideClassName =
              "relative min-h-[52vh] w-full min-w-full shrink-0 snap-center snap-always overflow-hidden bg-mist text-left";
            const photoEl = (
              <ListingPhoto
                src={photo.url}
                alt={photo.alt ?? `${addressLabel} photo ${i + 1}`}
                fill
                priority={i === 0}
                className={cn(
                  "object-cover",
                  isVerifySlide && "blur-[6px] saturate-75",
                )}
                sizes="100vw"
              />
            );
            // Verify slide hosts EmailVerificationRequired (buttons) — cannot nest in <button>.
            if (isVerifySlide) {
              return (
                <div
                  key={photo.id}
                  className={slideClassName}
                  aria-label="Email verification required to see more photos"
                >
                  {photoEl}
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-ink/50 px-4 backdrop-blur-[2px]">
                    <div className="w-full max-w-[22rem] rounded-3xl border border-white/60 bg-white p-7 shadow-[0_28px_60px_-24px_rgba(0,0,0,0.55)] sm:max-w-md sm:p-9">
                      <EmailVerificationRequired
                        variant="featured"
                        icon="lock"
                        eyebrow="Restricted photos"
                        callbackUrl={lockCallback}
                        title="Email verification required"
                        body="Verify your email to unlock the rest of this gallery."
                      />
                    </div>
                  </div>
                </div>
              );
            }
            return (
              <button
                key={photo.id}
                type="button"
                onClick={() => {
                  if (detailsLocked) return;
                  openStack();
                }}
                className={slideClassName}
                aria-label={`Photo ${i + 1} of ${count}. Open gallery.`}
              >
                {photoEl}
              </button>
            );
          })}

          {hasMapSlide && mapSubject ? (
            <ListingGalleryMapSlide
              lat={mapSubject.lat}
              lng={mapSubject.lng}
              addressLabel={mapSubject.addressLabel}
              mlsNumber={mapSubject.mlsNumber}
              city={mapSubject.city}
              transactionType={mapSubject.transactionType}
              active={mobileSlide === mapSlideIndex}
              onMapGestureStart={lockMobileCarousel}
              onMapGestureEnd={unlockMobileCarousel}
            />
          ) : null}
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-3">
          {mapSubject && hasMapSlide ? (
            <div className="pointer-events-auto">
              {onMapSlide ? (
                <button
                  type="button"
                  onClick={() => goToMobileSlide(Math.max(0, count - 1))}
                  className={COVER_CONTROL_CLASS}
                >
                  <span className={COVER_CONTROL_ICON_WRAP}>
                    <Images className="size-3" aria-hidden />
                  </span>
                  Back to photos
                </button>
              ) : (
                <button
                  type="button"
                  data-houzzat-listing-coach="map"
                  onClick={() => goToMobileSlide(mapSlideIndex)}
                  className={COVER_CONTROL_CLASS}
                >
                  <span className={COVER_CONTROL_ICON_WRAP}>
                    <MapPinned className="size-3" aria-hidden />
                  </span>
                  Map view
                </button>
              )}
            </div>
          ) : (
            <span />
          )}
          <span className="rounded-md bg-ink/70 px-2.5 py-1 text-xs font-semibold tabular-nums text-white shadow-sm backdrop-blur-sm">
            {mobileSlide + 1} / {mobileSlideCount}
          </span>
        </div>
        {detailsLocked ? (
          <ListingLockedGateOverlay
            callbackUrl={lockCallback}
            needsEmailVerification={needsEmailVerification}
          />
        ) : null}
        {/* Hide cover tags on the map slide so Expand / Sold / Unlisted stay tappable. */}
        {!onMapSlide &&
        (coverTag || segmentTag || (tourUrl && !detailsLocked)) ? (
          <div className="pointer-events-none absolute bottom-3 left-3 z-30 flex flex-wrap items-center gap-1.5">
            {coverTag ? (
              <span
                className={cn(
                  COVER_STATUS_TAG_CLASS,
                  "text-white",
                  coverTagClassName ?? "bg-canopy",
                )}
              >
                {coverTag}
              </span>
            ) : null}
            {segmentTag ? <CoverSegmentTag segmentTag={segmentTag} /> : null}
            {tourUrl && !detailsLocked ? (
              <div className="pointer-events-auto">
                <VirtualTourCoverButton href={tourUrl} />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ——— Desktop cover grid (untouched layout) ——— */}
      <div className="relative hidden md:block">
        <div
          className={cn(
            "grid gap-2 overflow-hidden rounded-2xl md:gap-2.5",
            detailsLocked && "blur-[6px] saturate-75",
            side.length >= 4
              ? "md:grid-cols-4 md:grid-rows-2"
              : side.length > 0
                ? "md:grid-cols-[1.6fr_1fr] md:grid-rows-2"
                : "",
          )}
        >
          <button
            type="button"
            onClick={() => {
              if (detailsLocked) return;
              openFromCover(0);
            }}
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
            <ListingPhoto
              src={hero.url}
              alt={hero.alt ?? `${addressLabel} photo 1`}
              fill
              priority
              className="object-cover transition duration-500 group-hover:scale-[1.02]"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
            <span className="absolute inset-0 bg-gradient-to-t from-ink/40 via-transparent to-transparent opacity-90" />
          </button>

          {side.map((photo, i) => {
            const photoIndex = i + 1;
            const isLastTile = i === side.length - 1 && remaining > 0;
            return (
              <button
                key={photo.id}
                type="button"
                onClick={() => {
                  if (detailsLocked) return;
                  openFromCover(photoIndex);
                }}
                className={cn(
                  "group relative hidden min-h-[274px] overflow-hidden bg-mist text-left md:block",
                  side.length === 1 ? "md:row-span-2" : "",
                )}
                aria-label={
                  isLastTile
                    ? `View all ${count + Math.max(0, hiddenPhotoCount - Math.max(0, count - 5))} photos`
                    : `View photo ${photoIndex + 1} of ${count}`
                }
              >
                <ListingPhoto
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

        {mapSubject && !detailsLocked ? (
          <div className="absolute left-3 top-3 z-10 sm:left-4 sm:top-4">
            <ListingMapViewButton subject={mapSubject} />
          </div>
        ) : null}

        {!detailsLocked ? (
          <button
            type="button"
            onClick={() => openViewerAt(0)}
            className="absolute bottom-4 right-4 z-10 rounded-lg bg-white/95 px-4 py-2.5 text-sm font-semibold text-ink shadow-md backdrop-blur-sm transition hover:bg-white"
          >
            {verifyGateIndex != null
              ? "Show all photos"
              : `Show all ${count} photos`}
          </button>
        ) : null}

        {detailsLocked ? (
          <ListingLockedGateOverlay
            callbackUrl={lockCallback}
            needsEmailVerification={needsEmailVerification}
          />
        ) : null}

        {(coverTag || segmentTag || (tourUrl && !detailsLocked)) ? (
          <div className="absolute bottom-3 left-3 z-20 flex flex-wrap items-center gap-1.5 sm:bottom-4 sm:left-4">
            {coverTag ? (
              <span
                className={cn(
                  COVER_STATUS_TAG_CLASS,
                  "pointer-events-none text-white",
                  coverTagClassName ?? "bg-canopy",
                )}
              >
                {coverTag}
              </span>
            ) : null}
            {segmentTag ? <CoverSegmentTag segmentTag={segmentTag} /> : null}
            {tourUrl && !detailsLocked ? (
              <VirtualTourCoverButton href={tourUrl} />
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Step 1 — mobile stacked gallery */}
      {stackOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelId}
          className="fixed inset-0 z-[80] flex flex-col bg-mist md:hidden"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3">
            <p
              id={labelId}
              className="min-w-0 truncate text-sm font-semibold text-ink"
            >
              {addressLabel}
              <span className="ml-2 font-medium text-ink/45">
                {count} photos
              </span>
            </p>
            <button
              type="button"
              onClick={closeStack}
              className="shrink-0 rounded-lg bg-mist px-3 py-2 text-sm font-semibold text-ink hover:bg-line/60"
            >
              Close
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <ul className="divide-y divide-line/40">
              {photos.map((photo, i) => {
                const isVerifySlide =
                  verifyGateIndex != null && i === verifyGateIndex;
                return (
                <li key={photo.id}>
                  <button
                    type="button"
                    onClick={() => openViewerAt(i)}
                    className="relative block w-full bg-ink text-left"
                    aria-label={
                      isVerifySlide
                        ? "Verify email to see more photos"
                        : `Open photo ${i + 1} of ${count} full screen`
                    }
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- full-bleed natural height stack */}
                    <img
                      src={photo.url}
                      alt={photo.alt ?? `${addressLabel} photo ${i + 1}`}
                      className={cn(
                        "block h-auto w-full",
                        isVerifySlide && "blur-[6px] saturate-75",
                      )}
                      loading={i < 2 ? "eager" : "lazy"}
                    />
                    {isVerifySlide ? (
                      <span className="absolute inset-0 flex items-center justify-center bg-ink/40 px-6">
                        <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink shadow-md">
                          <Lock className="size-4 text-canopy" aria-hidden />
                          Verify email first
                        </span>
                      </span>
                    ) : null}
                  </button>
                </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}

      {/* Step 2 — fullscreen viewer (mobile swipe + desktop arrows) */}
      {viewerOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${addressLabel} photo ${index + 1} of ${count}`}
          className="fixed inset-0 z-[90] flex flex-col bg-ink"
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <p className="truncate text-sm font-medium text-white/85">
              {addressLabel}
              <span className="ml-2 text-white/50">
                {index + 1} / {count}
              </span>
            </p>
            <div className="flex shrink-0 items-center gap-2">
              {allowBooking ? (
                <button
                  type="button"
                  onClick={() => setBookingOpen(true)}
                  className="hidden rounded-lg bg-canopy px-3 py-2 text-sm font-semibold text-white hover:bg-canopy-deep sm:inline-flex sm:px-4"
                >
                  Book a viewing
                </button>
              ) : null}
              <button
                type="button"
                onClick={closeViewer}
                className="rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/15"
              >
                {isMobile && stackOpen ? "Back" : "Close"}
              </button>
            </div>
          </div>

          <div
            className="relative flex min-h-0 flex-1 touch-pan-y items-center justify-center overflow-hidden"
            onPointerDown={onViewerPointerDown}
            onPointerMove={onViewerPointerMove}
            onPointerUp={onViewerPointerUp}
            onPointerCancel={onViewerPointerUp}
          >
            {count > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => step(-1)}
                  disabled={verifyGateIndex != null && index <= 0}
                  className="absolute left-3 z-10 hidden rounded-full bg-white/10 px-3 py-3 text-lg text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30 md:block"
                  aria-label="Previous photo"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => step(1)}
                  disabled={
                    verifyGateIndex != null && index >= verifyGateIndex
                  }
                  className="absolute right-3 z-10 hidden rounded-full bg-white/10 px-3 py-3 text-lg text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30 md:block"
                  aria-label="Next photo"
                >
                  →
                </button>
              </>
            ) : null}

            <div
              className={cn(
                "relative flex h-full w-full items-center justify-center",
                dragX === 0 && "transition-transform duration-200 ease-out",
              )}
              style={{ transform: `translate3d(${dragX}px, 0, 0)` }}
            >
              <ListingPhoto
                key={photos[index]!.id}
                src={photos[index]!.url}
                alt={
                  photos[index]!.alt ?? `${addressLabel} photo ${index + 1}`
                }
                width={2400}
                height={1600}
                quality={90}
                className={cn(
                  "h-full max-h-full w-full max-w-full object-contain",
                  verifyGateIndex != null &&
                    index === verifyGateIndex &&
                    "blur-[6px] saturate-75",
                )}
                sizes="100vw"
                priority
                draggable={false}
              />
              {verifyGateIndex != null && index === verifyGateIndex ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-ink/55 px-4 backdrop-blur-[2px] sm:px-8">
                  <div className="w-full max-w-md rounded-3xl border border-white/50 bg-white p-8 shadow-[0_32px_70px_-28px_rgba(0,0,0,0.65)] sm:max-w-lg sm:p-10">
                    <EmailVerificationRequired
                      variant="featured"
                      icon="lock"
                      eyebrow="Restricted photos"
                      callbackUrl={lockCallback}
                      title="Verify email first"
                      body={
                        hiddenPhotoCount > 0
                          ? `Confirm your email to unlock ${hiddenPhotoCount} more photo${hiddenPhotoCount === 1 ? "" : "s"} of this home.`
                          : "Confirm your email to unlock the rest of this gallery."
                      }
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 md:relative md:px-0 md:pb-0">
            {allowBooking ? (
              <div className="flex justify-center md:hidden">
                <button
                  type="button"
                  onClick={() => setBookingOpen(true)}
                  className="w-full max-w-sm rounded-lg bg-canopy px-4 py-2.5 text-sm font-semibold text-white hover:bg-canopy-deep"
                >
                  Book a viewing
                </button>
              </div>
            ) : null}

            {count > 1 ? (
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 z-20 hidden md:block"
                onMouseEnter={() => setThumbsVisible(true)}
                onMouseLeave={() => setThumbsVisible(false)}
              >
                {/* Hover hit area when strip is hidden */}
                <div className="pointer-events-auto h-14" />

                {/* Hidden-state cue */}
                <div
                  className={cn(
                    "pointer-events-none absolute inset-x-0 bottom-3 flex justify-center transition duration-300",
                    thumbsVisible
                      ? "translate-y-2 opacity-0"
                      : "translate-y-0 opacity-100",
                  )}
                >
                  <div className="flex items-center gap-2 rounded-full bg-white/12 px-3.5 py-1.5 text-xs font-semibold text-white/85 shadow-sm backdrop-blur-sm ring-1 ring-white/15">
                    <span className="inline-block size-1.5 rounded-full bg-white/80" />
                    {index + 1} / {count} · Hover for photos
                    <span aria-hidden className="text-white/60">
                      ˄
                    </span>
                  </div>
                </div>

                {/* Thumbnail strip */}
                <div
                  className={cn(
                    "pointer-events-auto border-t border-white/10 bg-ink/95 px-6 pb-4 pt-3 backdrop-blur-md transition duration-300",
                    thumbsVisible
                      ? "translate-y-0 opacity-100"
                      : "pointer-events-none translate-y-full opacity-0",
                  )}
                >
                  <div className="flex justify-center gap-2 overflow-x-auto">
                    {photos.map((photo, i) => {
                      const isVerifySlide =
                        verifyGateIndex != null && i === verifyGateIndex;
                      return (
                      <button
                        key={photo.id}
                        type="button"
                        onClick={() => {
                          setIndex(i);
                          setDragX(0);
                        }}
                        className={cn(
                          "relative h-16 w-24 shrink-0 overflow-hidden rounded-xl ring-2 transition",
                          i === index
                            ? "ring-white"
                            : "ring-transparent opacity-70 hover:opacity-100",
                        )}
                        aria-label={
                          isVerifySlide
                            ? "Verify email to unlock more photos"
                            : `Go to photo ${i + 1}`
                        }
                        aria-current={i === index}
                      >
                        <ListingPhoto
                          src={photo.url}
                          alt=""
                          fill
                          className={cn(
                            "rounded-xl object-cover",
                            isVerifySlide && "blur-[3px]",
                          )}
                          sizes="96px"
                        />
                        {isVerifySlide ? (
                          <span className="absolute inset-0 flex items-center justify-center bg-ink/45">
                            <Lock className="size-4 text-white" aria-hidden />
                          </span>
                        ) : null}
                      </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {allowBooking ? (
        <ViewingBookingModal
          open={bookingOpen}
          onClose={() => setBookingOpen(false)}
          mlsNumber={mlsNumber}
          contact={contact}
        />
      ) : null}
    </>
  );
}
