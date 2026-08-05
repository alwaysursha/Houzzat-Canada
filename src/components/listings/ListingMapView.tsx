"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Bath, Bed, MapPinned, Maximize2, X } from "lucide-react";
import {
  formatListPrice,
  formatListingAddress,
  formatListingBedsLabel,
  formatPrice,
  isClosedListingStatus,
  listingStatusLabel,
  propertyTypeLabel,
} from "@/lib/listings/constants";
import { listingPath } from "@/lib/listings/listing-path";
import type { ListingCard } from "@/lib/listings/types";
import { MAP_MAX_ZOOM, MAP_MIN_ZOOM, OSM_STYLE } from "@/lib/maps/osm-style";
import { cn } from "@/lib/utils";
import type { PropertyType } from "@prisma/client";

export type ListingMapSubject = {
  mlsNumber: string;
  lat: number;
  lng: number;
  addressLabel: string;
  city: string;
  listPrice: number;
  transactionType: "SALE" | "LEASE" | string;
  status: string;
  propertyType?: string;
  beds?: number;
  bedsLabel?: string | null;
  baths?: number;
  sqft?: number | null;
  primaryImageUrl?: string | null;
  unitNumber?: string | null;
  addressLine?: string;
  postalCode?: string | null;
  province?: string;
};

type NearbyMapListing = ListingCard & { distanceKm: number };

type HoverState = {
  kind: "subject" | "nearby";
  listing?: NearbyMapListing;
  left: number;
  top: number;
  placement: "below" | "above";
};

const CARD_WIDTH = 280;
const CARD_EST_HEIGHT = 260;

function CompactMapCard({
  listing,
  subject,
}: {
  listing?: NearbyMapListing;
  subject?: ListingMapSubject;
}) {
  if (subject) {
    return (
      <div className="w-[17.5rem] overflow-hidden rounded-md border border-line bg-surface shadow-xl">
        {subject.primaryImageUrl ? (
          <div className="relative h-36 bg-mist">
            <Image
              src={subject.primaryImageUrl}
              alt={subject.addressLabel}
              fill
              className="object-cover"
              sizes="280px"
            />
          </div>
        ) : null}
        <div className="space-y-1 px-3 py-2.5">
          <p className="text-sm font-bold text-canopy">
            {formatListPrice(subject.listPrice, subject.transactionType)}
          </p>
          <p className="text-sm font-semibold leading-snug text-ink">
            {subject.addressLabel}
          </p>
          <p className="text-xs text-ink/55">
            {subject.city}
            {subject.propertyType
              ? ` · ${propertyTypeLabel(subject.propertyType as PropertyType)}`
              : ""}
          </p>
          {(subject.beds != null || subject.baths != null || subject.sqft) && (
            <p className="flex items-center gap-2 text-xs text-ink/60">
              {subject.beds != null ? (
                <span className="inline-flex items-center gap-1">
                  <Bed className="size-3" aria-hidden />
                  {formatListingBedsLabel({
                    beds: subject.beds,
                    bedsLabel: subject.bedsLabel,
                  })}
                </span>
              ) : null}
              {subject.baths != null ? (
                <span className="inline-flex items-center gap-1">
                  <Bath className="size-3" aria-hidden />
                  {subject.baths}
                </span>
              ) : null}
              {subject.sqft ? (
                <span className="inline-flex items-center gap-1">
                  <Maximize2 className="size-3" aria-hidden />
                  {subject.sqft.toLocaleString()}
                </span>
              ) : null}
            </p>
          )}
          <p className="pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-canopy">
            This listing
          </p>
        </div>
      </div>
    );
  }

  if (!listing) return null;
  const [street, cityLine] = formatListingAddress(listing);
  const isClosed = isClosedListingStatus(listing.status);
  const statusLabel = listingStatusLabel(
    listing.status,
    listing.transactionType,
  );
  const isUnavailable =
    listing.status === "SUSPENDED" ||
    listing.status === "TERMINATED" ||
    listing.status === "EXPIRED";

  return (
    <Link
      href={listingPath(listing)}
      className="block w-[17.5rem] overflow-hidden rounded-md border border-line bg-surface shadow-xl transition hover:border-canopy/40"
    >
      <div className="relative h-36 bg-mist">
        {listing.primaryImageUrl ? (
          <Image
            src={listing.primaryImageUrl}
            alt={listing.addressLine}
            fill
            className="object-cover"
            sizes="280px"
          />
        ) : null}
        {(isClosed || isUnavailable) ? (
          <span
            className={cn(
              "absolute left-2.5 top-2.5 rounded-md px-2.5 py-1 text-[11px] font-bold tracking-wide text-white shadow-md",
              isUnavailable ||
                listing.status === "SOLD" ||
                listing.status === "LEASED"
                ? "bg-danger"
                : "bg-ink",
            )}
          >
            {statusLabel}
          </span>
        ) : null}
      </div>
      <div className="space-y-1 px-3 py-2.5">
        <p className="text-sm font-bold text-canopy">
          {formatListPrice(listing.listPrice, listing.transactionType)}
        </p>
        <p className="text-sm font-semibold leading-snug text-ink">{street}</p>
        <p className="text-xs text-ink/55">
          {cityLine}
          {` · ${propertyTypeLabel(listing.propertyType)}`}
        </p>
        <p className="flex items-center gap-2 text-xs text-ink/60">
          <span className="inline-flex items-center gap-1">
            <Bed className="size-3" aria-hidden />
            {formatListingBedsLabel(listing)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Bath className="size-3" aria-hidden />
            {listing.baths}
          </span>
          {listing.sqft ? (
            <span className="inline-flex items-center gap-1">
              <Maximize2 className="size-3" aria-hidden />
              {listing.sqft.toLocaleString()}
            </span>
          ) : null}
          <span className="ml-auto text-canopy">
            {listing.distanceKm < 1
              ? `${Math.round(listing.distanceKm * 1000)} m`
              : `${listing.distanceKm.toFixed(1)} km`}
          </span>
        </p>
      </div>
    </Link>
  );
}

function formatMapPrice(
  amount: number,
  transactionType: ListingMapSubject["transactionType"] | string,
) {
  const abs = Math.abs(amount);
  let label: string;
  if (abs >= 1_000_000) {
    const millions = amount / 1_000_000;
    label = `$${Number(millions.toFixed(2))}M`;
  } else if (abs >= 10_000) {
    label = `$${Math.round(amount / 1000)}K`;
  } else {
    label = formatPrice(amount);
  }
  return transactionType === "LEASE" ? `${label}/mo` : label;
}

function cardPositionForMarker(
  el: HTMLElement,
): Pick<HoverState, "left" | "top" | "placement"> {
  const rect = el.getBoundingClientRect();
  const bridge = 14;
  const left = Math.max(
    12,
    Math.min(
      rect.left + rect.width / 2 - CARD_WIDTH / 2,
      window.innerWidth - CARD_WIDTH - 12,
    ),
  );
  const below = rect.bottom + 2;
  if (below + bridge + CARD_EST_HEIGHT <= window.innerHeight - 12) {
    return { left, top: below, placement: "below" };
  }
  return {
    left,
    top: Math.max(12, rect.top - bridge - CARD_EST_HEIGHT),
    placement: "above",
  };
}

export function ListingMapViewModal({
  open,
  onClose,
  subject,
}: {
  open: boolean;
  onClose: () => void;
  subject: ListingMapSubject;
}) {
  const titleId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fittedRef = useRef(false);
  const [mounted, setMounted] = useState(false);
  const [nearby, setNearby] = useState<NearbyMapListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [hover, setHover] = useState<HoverState | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  /** Only used when leaving the card itself — pins stay sticky so the cursor can reach the card. */
  const scheduleHideFromCard = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => setHover(null), 300);
  }, [clearHideTimer]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      clearHideTimer();
    };
  }, [open, onClose, clearHideTimer]);

  useEffect(() => {
    if (!open) {
      setNearby([]);
      setHover(null);
      fittedRef.current = false;
      return;
    }
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({
      lat: String(subject.lat),
      lng: String(subject.lng),
      radiusKm: "20",
      limit: "40",
      transactionType:
        subject.transactionType === "LEASE" ? "LEASE" : "SALE",
      excludeMls: subject.mlsNumber,
    });
    void (async () => {
      try {
        const res = await fetch(`/api/listings/nearby?${params}`);
        const data = (await res.json()) as { items?: NearbyMapListing[] };
        if (!cancelled) setNearby(data.items ?? []);
      } catch {
        if (!cancelled) setNearby([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, subject.lat, subject.lng, subject.mlsNumber, subject.transactionType]);

  useEffect(() => {
    if (!open || !containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: [subject.lng, subject.lat],
      zoom: 13,
      minZoom: MAP_MIN_ZOOM,
      maxZoom: MAP_MAX_ZOOM,
    });
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    map.on("click", () => setHover(null));
    map.on("dragstart", () => setHover(null));
    mapRef.current = map;
    fittedRef.current = false;

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
      setHover(null);
    };
  }, [open, subject.lat, subject.lng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!open || !map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const showHover = (
      el: HTMLElement,
      payload: { kind: "subject" | "nearby"; listing?: NearbyMapListing },
    ) => {
      clearHideTimer();
      setHover({ ...payload, ...cardPositionForMarker(el) });
    };

    const subjectWrap = document.createElement("button");
    subjectWrap.type = "button";
    subjectWrap.setAttribute("aria-label", subject.addressLabel);
    subjectWrap.className =
      "flex h-12 w-12 items-center justify-center border-0 bg-transparent p-0";
    subjectWrap.innerHTML =
      '<span class="flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-white bg-[#1F6B4A] text-white shadow-lg ring-4 ring-[#1F6B4A]/40"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg></span>';
    // Sticky card: leaving the pin must not dismiss, or the cursor can never reach the card.
    subjectWrap.addEventListener("mouseenter", () =>
      showHover(subjectWrap, { kind: "subject" }),
    );
    subjectWrap.addEventListener("focus", () =>
      showHover(subjectWrap, { kind: "subject" }),
    );

    markersRef.current.push(
      new maplibregl.Marker({ element: subjectWrap, anchor: "bottom" })
        .setLngLat([subject.lng, subject.lat])
        .addTo(map),
    );

    for (const listing of nearby) {
      const priceLabel = formatMapPrice(
        listing.listPrice,
        listing.transactionType,
      );
      const wrap = document.createElement("button");
      wrap.type = "button";
      wrap.setAttribute(
        "aria-label",
        `${priceLabel} — ${listing.addressLine}, ${listing.city}`,
      );
      // Do not set transform on this root — MapLibre uses it for positioning.
      wrap.className = "cursor-pointer border-0 bg-transparent p-0";
      const pill = document.createElement("span");
      pill.textContent = priceLabel;
      pill.style.cssText = [
        "display:inline-flex",
        "align-items:center",
        "justify-content:center",
        "white-space:nowrap",
        "border-radius:999px",
        "border:2px solid #fff",
        "background:#14201A",
        "color:#fff",
        "padding:5px 10px",
        "font-size:12px",
        "font-weight:700",
        "letter-spacing:0.01em",
        "line-height:1",
        "box-shadow:0 4px 14px rgba(20,32,26,0.35)",
        "transition:transform 150ms ease, background-color 150ms ease",
        "transform-origin:center bottom",
      ].join(";");
      wrap.appendChild(pill);
      wrap.addEventListener("mouseenter", () => {
        pill.style.transform = "scale(1.08)";
        pill.style.background = "#1F6B4A";
        showHover(wrap, { kind: "nearby", listing });
      });
      wrap.addEventListener("mouseleave", () => {
        pill.style.transform = "";
        pill.style.background = "#14201A";
      });
      wrap.addEventListener("focus", () =>
        showHover(wrap, { kind: "nearby", listing }),
      );
      wrap.addEventListener("click", () => {
        window.location.href = listingPath(listing);
      });
      markersRef.current.push(
        new maplibregl.Marker({ element: wrap, anchor: "bottom" })
          .setLngLat([listing.lng, listing.lat])
          .addTo(map),
      );
    }

    if (!fittedRef.current) {
      fittedRef.current = true;
      if (nearby.length > 0) {
        const bounds = new maplibregl.LngLatBounds(
          [subject.lng, subject.lat],
          [subject.lng, subject.lat],
        );
        for (const listing of nearby) {
          bounds.extend([listing.lng, listing.lat]);
        }
        map.fitBounds(bounds, { padding: 80, maxZoom: 14, duration: 600 });
      } else if (!loading) {
        map.easeTo({
          center: [subject.lng, subject.lat],
          zoom: 14,
          duration: 400,
        });
      } else {
        fittedRef.current = false;
      }
    }
  }, [
    open,
    nearby,
    loading,
    clearHideTimer,
    subject.addressLabel,
    subject.lat,
    subject.lng,
    subject.mlsNumber,
  ]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[100] flex flex-col bg-mist"
    >
      <header className="relative z-20 flex shrink-0 items-start justify-between gap-3 border-b border-line/70 bg-surface/95 px-4 py-3 shadow-sm backdrop-blur-md sm:px-5 sm:py-4">
        <div className="min-w-0 max-w-2xl">
          <p
            id={titleId}
            className="font-display text-lg leading-snug text-ink sm:text-xl"
          >
            {subject.addressLabel}
          </p>
          <p className="mt-0.5 text-sm text-ink/60">
            {subject.city}
            {subject.postalCode ? `, ${subject.postalCode}` : ""}
            {" · "}
            {formatListPrice(subject.listPrice, subject.transactionType)}
          </p>
          <p className="mt-1 text-xs text-ink/45">
            {loading
              ? "Loading nearby listings…"
              : `${nearby.length} other active listing${nearby.length === 1 ? "" : "s"} nearby`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-sm transition hover:bg-mist"
          aria-label="Close map"
        >
          <X className="size-5" aria-hidden />
        </button>
      </header>

      <div ref={containerRef} className="relative min-h-0 flex-1 bg-mist" />

      {hover ? (
        <div
          className="fixed z-[110]"
          style={{ left: hover.left, top: hover.top }}
          onMouseEnter={clearHideTimer}
          onMouseLeave={scheduleHideFromCard}
        >
          {hover.placement === "below" ? (
            <div className="h-3.5 w-full" aria-hidden />
          ) : null}
          {hover.kind === "subject" ? (
            <CompactMapCard subject={subject} />
          ) : (
            <CompactMapCard listing={hover.listing} />
          )}
          {hover.placement === "above" ? (
            <div className="h-3.5 w-full" aria-hidden />
          ) : null}
        </div>
      ) : null}
    </div>,
    document.body,
  );
}

export function ListingMapViewButton({
  subject,
  className,
}: {
  subject: ListingMapSubject;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        data-houzzat-listing-coach="map"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        className={cn(
          "group inline-flex items-center gap-1.5 rounded-md border border-white/50 bg-white/55 px-2.5 py-1.5 text-xs font-semibold text-ink shadow-md backdrop-blur-md transition hover:-translate-y-0.5 hover:bg-white/75 hover:shadow-lg",
          className,
        )}
      >
        <span className="flex size-5 items-center justify-center rounded-full bg-canopy text-white shadow-sm transition group-hover:scale-105">
          <MapPinned className="size-3" aria-hidden />
        </span>
        Map view
      </button>
      <ListingMapViewModal
        open={open}
        onClose={() => setOpen(false)}
        subject={subject}
      />
    </>
  );
}
