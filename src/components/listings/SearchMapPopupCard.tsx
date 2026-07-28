"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bath, Bed, ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";
import type { ListingCard as ListingCardData } from "@/lib/listings/types";
import {
  formatListPrice,
  formatListingTiming,
  isClosedListingStatus,
  listingStatusBadgeClass,
  listingStatusLabel,
  propertyTypeLabel,
} from "@/lib/listings/constants";
import { SoldForPrice } from "@/components/listings/SoldForPrice";
import { cn } from "@/lib/utils";

function listingImageUrls(listing: ListingCardData): string[] {
  if (listing.imageUrls?.length) return listing.imageUrls;
  return listing.primaryImageUrl ? [listing.primaryImageUrl] : [];
}

function CardImageSlider({
  urls,
  alt,
  statusBadge,
  onActivate,
}: {
  urls: string[];
  alt: string;
  statusBadge: ReactNode;
  onActivate?: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [dragX, setDragX] = useState(0);
  const dragRef = useRef<{
    id: number;
    startX: number;
    startY: number;
    dragging: boolean;
  } | null>(null);
  const count = urls.length;
  const urlKey = urls.join("|");

  useEffect(() => {
    setIndex(0);
    setDragX(0);
  }, [urlKey]);

  const step = useCallback(
    (dir: -1 | 1) => {
      if (count <= 1) return;
      setIndex((i) => (i + dir + count) % count);
      setDragX(0);
    },
    [count],
  );

  useEffect(() => {
    if (count <= 1) return;
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        step(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        step(1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count, step]);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (count <= 1) return;
    dragRef.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const state = dragRef.current;
    if (!state || state.id !== event.pointerId) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (!state.dragging && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      state.dragging = true;
    }
    if (state.dragging) setDragX(dx);
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
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
      onActivate?.();
      return;
    }
    const dx = event.clientX - state.startX;
    if (dx <= -48) step(1);
    else if (dx >= 48) step(-1);
    else setDragX(0);
  }

  const current = urls[index] ?? null;

  return (
    <div
      className="relative h-36 touch-pan-y bg-mist select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        dragRef.current = null;
        setDragX(0);
      }}
      role="group"
      aria-roledescription="carousel"
      aria-label={`${alt} photos`}
    >
      {current ? (
        <div
          className="absolute inset-0 transition-transform duration-200 ease-out"
          style={{
            transform: dragX ? `translateX(${dragX}px)` : undefined,
          }}
        >
          <Image
            src={current}
            alt={alt}
            fill
            className="pointer-events-none object-cover"
            sizes="320px"
            draggable={false}
          />
        </div>
      ) : null}

      {statusBadge}

      {count > 1 ? (
        <>
          <button
            type="button"
            aria-label="Previous photo"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              step(-1);
            }}
            onPointerDown={(event) => event.stopPropagation()}
            className="absolute left-1.5 top-1/2 z-[1] inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-ink/55 text-white backdrop-blur-sm transition hover:bg-ink/75"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Next photo"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              step(1);
            }}
            onPointerDown={(event) => event.stopPropagation()}
            className="absolute right-1.5 top-1/2 z-[1] inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-ink/55 text-white backdrop-blur-sm transition hover:bg-ink/75"
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
          <div className="pointer-events-none absolute inset-x-0 bottom-2 z-[1] flex justify-center gap-1">
            {urls.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "size-1.5 rounded-full transition",
                  i === index ? "bg-white" : "bg-white/45",
                )}
              />
            ))}
          </div>
          <span className="sr-only">
            Photo {index + 1} of {count}
          </span>
        </>
      ) : null}
    </div>
  );
}

/** Compact floating card shown when a map price pin is selected. */
export function SearchMapPopupCard({
  listing,
  onClose,
  onOpen,
  className,
}: {
  listing: ListingCardData;
  onClose?: () => void;
  /** When set, card opens this instead of navigating to the listing page. */
  onOpen?: () => void;
  className?: string;
}) {
  const street = listing.unitNumber
    ? `${listing.unitNumber} – ${listing.addressLine}`
    : listing.addressLine;
  const place = listing.community
    ? `${listing.community}, ${listing.city}`
    : listing.city;
  const isClosed = isClosedListingStatus(listing.status);
  const isCommercial = listing.segment === "COMMERCIAL";
  const urls = listingImageUrls(listing);
  const href = `/listing/${listing.mlsNumber}`;
  const router = useRouter();

  const statusBadge = (
    <span
      className={cn(
        "absolute left-2.5 top-2.5 z-[1] rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow",
        listingStatusBadgeClass(listing.status),
      )}
    >
      {listingStatusLabel(listing.status, listing.transactionType)}
    </span>
  );

  const details = (
    <div className="space-y-1 px-3 py-2.5">
      <p className="text-base font-bold text-canopy">
        {isClosed && listing.soldPrice != null ? (
          <SoldForPrice
            soldPrice={listing.soldPrice}
            listPrice={listing.listPrice}
            status={listing.status}
            transactionType={listing.transactionType}
            size="sm"
          />
        ) : (
          formatListPrice(listing.listPrice, listing.transactionType)
        )}
      </p>
      <p className="text-sm font-semibold leading-snug text-ink">{street}</p>
      <p className="text-xs text-ink/55">{place}</p>
      <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-ink/60">
        <span>{propertyTypeLabel(listing.propertyType)}</span>
        {!isCommercial ? (
          <>
            <span className="inline-flex items-center gap-1">
              <Bed className="size-3" aria-hidden />
              {listing.beds}
            </span>
            <span className="inline-flex items-center gap-1">
              <Bath className="size-3" aria-hidden />
              {listing.baths}
            </span>
          </>
        ) : null}
        {listing.sqft != null ? (
          <span className="inline-flex items-center gap-1">
            <Maximize2 className="size-3" aria-hidden />
            {listing.sqft.toLocaleString()}
          </span>
        ) : null}
      </p>
      <p className="pt-0.5 text-[11px] text-ink/45">
        {formatListingTiming(listing)}
      </p>
    </div>
  );

  return (
    <div
      className={cn(
        "relative w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-line bg-surface shadow-xl",
        className,
      )}
    >
      {onClose ? (
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-2 top-2 z-10 inline-flex size-8 items-center justify-center rounded-full bg-ink/55 text-white backdrop-blur-sm transition hover:bg-ink/75"
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : null}

      <CardImageSlider
        urls={urls}
        alt={street}
        statusBadge={statusBadge}
        onActivate={
          onOpen
            ? onOpen
            : () => {
                router.push(href);
              }
        }
      />

      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className="block w-full text-left transition hover:bg-mist/40"
        >
          {details}
        </button>
      ) : (
        <Link href={href} className="block transition hover:bg-mist/40">
          {details}
        </Link>
      )}
    </div>
  );
}
