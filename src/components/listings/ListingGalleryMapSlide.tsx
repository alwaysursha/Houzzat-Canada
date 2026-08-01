"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { useSession } from "next-auth/react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Bath, Bed, Maximize2, X } from "lucide-react";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import {
  formatListPrice,
  formatListingAddress,
  formatPrice,
  isClosedListingStatus,
  listingStatusLabel,
  propertyTypeLabel,
} from "@/lib/listings/constants";
import type { ListingCard } from "@/lib/listings/types";
import { MAP_MAX_ZOOM, MAP_MIN_ZOOM, OSM_STYLE } from "@/lib/maps/osm-style";
import { cn } from "@/lib/utils";
import { SoldForPrice } from "@/components/listings/SoldForPrice";

type MapFilter = "sold" | "unlisted";
type NearbyPin = ListingCard & { distanceKm: number; filter: MapFilter };

type HoverState = {
  listing: NearbyPin;
  left: number;
  top: number;
  placement: "below" | "above";
};

const CARD_WIDTH = 280;
const CARD_EST_HEIGHT = 260;
const SOLD_RED = "#b42318";
const UNLISTED_RED = "#b42318";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatMapPrice(
  amount: number,
  transactionType: ListingCard["transactionType"] | string,
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

function pinPriceLabel(listing: NearbyPin) {
  const amount =
    listing.filter === "sold"
      ? (listing.soldPrice ?? listing.listPrice)
      : listing.listPrice;
  return formatMapPrice(amount, listing.transactionType);
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

function CompactNearbyCard({ listing }: { listing: NearbyPin }) {
  const [street, cityLine] = formatListingAddress(listing);
  const isClosedSold = isClosedListingStatus(listing.status);
  const statusLabel = listingStatusLabel(
    listing.status,
    listing.transactionType,
  );
  const statusTone =
    listing.filter === "unlisted" ||
    listing.status === "SUSPENDED" ||
    listing.status === "TERMINATED" ||
    listing.status === "EXPIRED" ||
    listing.status === "SOLD" ||
    listing.status === "LEASED" ||
    isClosedSold
      ? "danger"
      : "canopy";

  return (
    <Link
      href={`/listing/${listing.mlsNumber}`}
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
        <span
          className={cn(
            "absolute left-2.5 top-2.5 rounded-md px-2.5 py-1 text-[11px] font-bold tracking-wide text-white shadow-md",
            statusTone === "danger" && "bg-danger",
            statusTone === "canopy" && "bg-canopy",
          )}
        >
          {statusLabel}
        </span>
      </div>
      <div className="space-y-1 px-3 py-2.5">
        {isClosedSold ? (
          <SoldForPrice
            listPrice={listing.listPrice}
            soldPrice={listing.soldPrice}
            status={listing.status}
            transactionType={listing.transactionType}
            tone="light"
            size="sm"
          />
        ) : (
          <p className="text-sm font-bold text-canopy">
            {formatListPrice(listing.listPrice, listing.transactionType)}
          </p>
        )}
        <p className="text-sm font-semibold leading-snug text-ink">{street}</p>
        <p className="text-xs text-ink/55">
          {cityLine}
          {` · ${propertyTypeLabel(listing.propertyType)}`}
        </p>
        <p className="flex items-center gap-2 text-xs text-ink/60">
          <span className="inline-flex items-center gap-1">
            <Bed className="size-3" aria-hidden />
            {listing.beds}
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
        </p>
      </div>
    </Link>
  );
}

/** MapLibre marker: address callout + house pin. No transform on the root. */
function createAddressPinElement(addressLabel: string) {
  const wrap = document.createElement("div");
  wrap.setAttribute("aria-label", addressLabel);
  wrap.style.cssText = [
    "display:flex",
    "flex-direction:column",
    "align-items:center",
    "gap:6px",
    "pointer-events:none",
  ].join(";");

  const safe = escapeHtml(addressLabel);

  wrap.innerHTML = `
    <div style="
      position:relative;
      max-width:min(220px,70vw);
      border-radius:12px;
      border:1px solid rgba(213,224,218,0.95);
      background:rgba(255,255,255,0.97);
      padding:8px 12px;
      box-shadow:0 8px 24px -10px rgba(20,32,28,0.45), 0 1px 0 rgba(20,32,28,0.06);
      backdrop-filter:blur(8px);
    ">
      <p style="
        margin:0;
        color:#14201c;
        font-size:12px;
        font-weight:650;
        line-height:1.35;
        letter-spacing:-0.01em;
        text-align:center;
        overflow:hidden;
        display:-webkit-box;
        -webkit-box-orient:vertical;
        -webkit-line-clamp:2;
        word-break:break-word;
      ">${safe}</p>
      <span style="
        position:absolute;
        left:50%;
        bottom:-6px;
        width:12px;
        height:12px;
        transform:translateX(-50%) rotate(45deg);
        border-right:1px solid rgba(213,224,218,0.95);
        border-bottom:1px solid rgba(213,224,218,0.95);
        background:rgba(255,255,255,0.97);
      "></span>
    </div>
    <span style="
      display:flex;
      width:36px;
      height:36px;
      align-items:center;
      justify-content:center;
      border-radius:999px;
      border:2.5px solid #fff;
      background:${SOLD_RED};
      color:#fff;
      box-shadow:0 6px 16px -4px rgba(15,107,76,0.55), 0 0 0 4px rgba(15,107,76,0.22);
    ">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>
    </span>
  `;

  return wrap;
}

function createFilterPinElement(
  listing: NearbyPin,
  onShow: (el: HTMLElement, listing: NearbyPin) => void,
) {
  const wrap = document.createElement("button");
  wrap.type = "button";
  const label = pinPriceLabel(listing);
  wrap.setAttribute(
    "aria-label",
    `${label} — ${listing.addressLine}, ${listing.city}`,
  );
  // Do not set transform on this root — MapLibre uses it for positioning.
  wrap.style.cssText = [
    "cursor:pointer",
    "border:0",
    "background:transparent",
    "padding:0",
    "pointer-events:auto",
  ].join(";");

  const bg = listing.filter === "sold" ? SOLD_RED : UNLISTED_RED;
  const pill = document.createElement("span");
  pill.textContent = label;
  pill.style.cssText = [
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    "white-space:nowrap",
    "border-radius:999px",
    "border:2px solid #fff",
    `background:${bg}`,
    "color:#fff",
    "padding:5px 10px",
    "font-size:11px",
    "font-weight:700",
    "letter-spacing:0.01em",
    "line-height:1",
    "box-shadow:0 4px 14px rgba(20,32,26,0.35)",
  ].join(";");
  wrap.appendChild(pill);

  wrap.addEventListener("mouseenter", () => onShow(wrap, listing));
  wrap.addEventListener("focus", () => onShow(wrap, listing));
  wrap.addEventListener("click", (event) => {
    event.stopPropagation();
    onShow(wrap, listing);
  });
  return wrap;
}

/**
 * Mobile gallery map slide — live MapLibre map with pin, pan inside the
 * cover frame, fullscreen expand, and client-only sold/unlisted filter pins.
 */
export function ListingGalleryMapSlide({
  lat,
  lng,
  addressLabel,
  mlsNumber,
  transactionType = "SALE",
  active,
  onMapGestureStart,
  onMapGestureEnd,
}: {
  lat: number;
  lng: number;
  addressLabel: string;
  mlsNumber?: string;
  city?: string;
  transactionType?: "SALE" | "LEASE" | string;
  active: boolean;
  onMapGestureStart?: () => void;
  onMapGestureEnd?: () => void;
}) {
  const { status: sessionStatus } = useSession();
  const { openAuth } = useAuthModal();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const filterMarkersRef = useRef<maplibregl.Marker[]>([]);
  const gestureStartRef = useRef(onMapGestureStart);
  const gestureEndRef = useRef(onMapGestureEnd);
  const showHoverRef = useRef<(el: HTMLElement, listing: NearbyPin) => void>(
    () => undefined,
  );
  const [fullscreen, setFullscreen] = useState(false);
  const [ready, setReady] = useState(false);
  const [showSold, setShowSold] = useState(false);
  const [showUnlisted, setShowUnlisted] = useState(false);
  const [pins, setPins] = useState<NearbyPin[]>([]);
  const [loadingSold, setLoadingSold] = useState(false);
  const [loadingUnlisted, setLoadingUnlisted] = useState(false);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [portalReady, setPortalReady] = useState(false);
  const titleId = useId();
  const isLease = transactionType === "LEASE";
  const closedStatus = isLease ? "LEASED" : "SOLD";
  const closedTxn: "SALE" | "LEASE" = isLease ? "LEASE" : "SALE";
  const closedLabel = isLease ? "Nearby leased" : "Nearby sold";
  const signedIn = sessionStatus === "authenticated";
  const loading = loadingSold || loadingUnlisted;

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (signedIn) return;
    setShowSold(false);
    setShowUnlisted(false);
    setPins([]);
    setHover(null);
  }, [signedIn]);

  const clearFilterMarkers = useCallback(() => {
    filterMarkersRef.current.forEach((marker) => marker.remove());
    filterMarkersRef.current = [];
  }, []);

  const showHover = useCallback((el: HTMLElement, listing: NearbyPin) => {
    setHover({ listing, ...cardPositionForMarker(el) });
  }, []);

  useEffect(() => {
    showHoverRef.current = showHover;
  }, [showHover]);

  function requireClientOrToggle(
    filter: MapFilter,
    currentlyOn: boolean,
    setOn: (next: boolean) => void,
  ) {
    if (!signedIn) {
      openAuth({
        mode: "sign-up",
        callbackUrl:
          typeof window !== "undefined" ? window.location.pathname : null,
      });
      return;
    }
    setOn(!currentlyOn);
    setHover(null);
    if (currentlyOn && filter === "sold") {
      setPins((prev) => prev.filter((pin) => pin.filter !== "sold"));
    }
    if (currentlyOn && filter === "unlisted") {
      setPins((prev) => prev.filter((pin) => pin.filter !== "unlisted"));
    }
  }

  useEffect(() => {
    gestureStartRef.current = onMapGestureStart;
    gestureEndRef.current = onMapGestureEnd;
  }, [onMapGestureStart, onMapGestureEnd]);

  // Create map once the slide is mounted.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const map = new maplibregl.Map({
      container: el,
      style: OSM_STYLE,
      center: [lng, lat],
      zoom: 16.5,
      minZoom: MAP_MIN_ZOOM,
      maxZoom: MAP_MAX_ZOOM,
      attributionControl: { compact: true },
    });
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "bottom-right",
    );
    new maplibregl.Marker({
      element: createAddressPinElement(addressLabel),
      anchor: "bottom",
    })
      .setLngLat([lng, lat])
      .addTo(map);

    mapRef.current = map;

    const onDragStart = () => {
      setHover(null);
      gestureStartRef.current?.();
    };
    const onDragEnd = () => gestureEndRef.current?.();
    const onMapClick = () => setHover(null);
    map.on("dragstart", onDragStart);
    map.on("dragend", onDragEnd);
    map.on("click", onMapClick);

    const onLoad = () => {
      map.resize();
      setReady(true);
    };
    map.on("load", onLoad);

    const t1 = window.setTimeout(() => map.resize(), 50);
    const t2 = window.setTimeout(() => map.resize(), 250);
    const t3 = window.setTimeout(() => map.resize(), 600);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      clearFilterMarkers();
      map.off("dragstart", onDragStart);
      map.off("dragend", onDragEnd);
      map.off("click", onMapClick);
      map.off("load", onLoad);
      map.remove();
      mapRef.current = null;
      setReady(false);
      setHover(null);
    };
  }, [lat, lng, addressLabel, clearFilterMarkers]);

  // Fetch sold / leased nearby when toggled on.
  useEffect(() => {
    if (!signedIn || !showSold) {
      if (!showSold) setLoadingSold(false);
      return;
    }
    let cancelled = false;
    setLoadingSold(true);
    const params = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      radiusKm: "3",
      limit: "40",
      status: closedStatus,
      transactionType: closedTxn,
    });
    if (mlsNumber) params.set("excludeMls", mlsNumber);

    void (async () => {
      try {
        const res = await fetch(`/api/listings/nearby?${params}`);
        const data = (await res.json()) as {
          items?: ListingCard[];
          requiresAuth?: boolean;
        };
        if (cancelled) return;
        if (res.status === 401 || data.requiresAuth) {
          setShowSold(false);
          openAuth({
            mode: "sign-up",
            callbackUrl:
              typeof window !== "undefined" ? window.location.pathname : null,
          });
          return;
        }
        const next = (data.items ?? []).map((item) => ({
          ...item,
          distanceKm: 0,
          filter: "sold" as const,
        }));
        setPins((prev) => [
          ...prev.filter((pin) => pin.filter !== "sold"),
          ...next,
        ]);
      } catch {
        if (!cancelled) {
          setPins((prev) => prev.filter((pin) => pin.filter !== "sold"));
        }
      } finally {
        if (!cancelled) setLoadingSold(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    signedIn,
    showSold,
    lat,
    lng,
    closedStatus,
    closedTxn,
    mlsNumber,
    openAuth,
  ]);

  // Unlisted = previously for-sale, now unavailable (SALE + Sus/Ter/Exp).
  useEffect(() => {
    if (!signedIn || !showUnlisted) {
      if (!showUnlisted) setLoadingUnlisted(false);
      return;
    }
    let cancelled = false;
    setLoadingUnlisted(true);
    const params = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      radiusKm: "3",
      limit: "40",
      status: "UNLISTED",
      transactionType: "SALE",
    });
    if (mlsNumber) params.set("excludeMls", mlsNumber);

    void (async () => {
      try {
        const res = await fetch(`/api/listings/nearby?${params}`);
        const data = (await res.json()) as {
          items?: ListingCard[];
          requiresAuth?: boolean;
        };
        if (cancelled) return;
        if (res.status === 401 || data.requiresAuth) {
          setShowUnlisted(false);
          openAuth({
            mode: "sign-up",
            callbackUrl:
              typeof window !== "undefined" ? window.location.pathname : null,
          });
          return;
        }
        const next = (data.items ?? []).map((item) => ({
          ...item,
          distanceKm: 0,
          filter: "unlisted" as const,
        }));
        setPins((prev) => [
          ...prev.filter((pin) => pin.filter !== "unlisted"),
          ...next,
        ]);
      } catch {
        if (!cancelled) {
          setPins((prev) => prev.filter((pin) => pin.filter !== "unlisted"));
        }
      } finally {
        if (!cancelled) setLoadingUnlisted(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [signedIn, showUnlisted, lat, lng, mlsNumber, openAuth]);

  // Sync filter markers + fit bounds.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    clearFilterMarkers();
    setHover(null);

    const byMls = new Map<string, NearbyPin>();
    for (const pin of pins) {
      const existing = byMls.get(pin.mlsNumber);
      if (!existing || pin.filter === "sold") {
        byMls.set(pin.mlsNumber, pin);
      }
    }
    const visible = [...byMls.values()].filter(
      (pin) =>
        Number.isFinite(pin.lat) &&
        Number.isFinite(pin.lng) &&
        (pin.filter === "sold" ? showSold : showUnlisted),
    );

    for (const listing of visible) {
      filterMarkersRef.current.push(
        new maplibregl.Marker({
          element: createFilterPinElement(listing, (el, item) =>
            showHoverRef.current(el, item),
          ),
          anchor: "bottom",
        })
          .setLngLat([listing.lng, listing.lat])
          .addTo(map),
      );
    }

    if (visible.length > 0) {
      const bounds = new maplibregl.LngLatBounds([lng, lat], [lng, lat]);
      for (const listing of visible) {
        bounds.extend([listing.lng, listing.lat]);
      }
      map.fitBounds(bounds, {
        padding: 56,
        maxZoom: 16,
        duration: 500,
      });
    } else if (!showSold && !showUnlisted && !loading) {
      map.easeTo({
        center: [lng, lat],
        zoom: 16.5,
        duration: 400,
      });
    }
  }, [
    pins,
    ready,
    showSold,
    showUnlisted,
    loading,
    lat,
    lng,
    clearFilterMarkers,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !active) return;
    const resize = () => map.resize();
    resize();
    const frame = window.requestAnimationFrame(resize);
    const t = window.setTimeout(resize, 100);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(t);
    };
  }, [active, fullscreen]);

  useEffect(() => {
    const el = containerRef.current;
    const map = mapRef.current;
    if (!el || !map || !active) return;
    const ro = new ResizeObserver(() => {
      map.resize();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [active, ready]);

  useEffect(() => {
    if (!fullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [fullscreen]);

  const filterBar = (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-wrap justify-start gap-2 px-3 pb-3 pt-10",
        fullscreen
          ? "bg-gradient-to-t from-ink/55 to-transparent"
          : "bg-gradient-to-t from-ink/45 to-transparent",
      )}
    >
      {!fullscreen ? (
        <button
          type="button"
          onClick={() => setFullscreen(true)}
          className="pointer-events-auto inline-flex shrink-0 items-center gap-1.5 rounded-md bg-white/95 px-3 py-2 text-xs font-semibold text-ink shadow-md backdrop-blur-sm"
        >
          <Maximize2 className="size-3.5" aria-hidden />
          Expand map
        </button>
      ) : null}
      <button
        type="button"
        aria-pressed={showSold}
        onClick={() => requireClientOrToggle("sold", showSold, setShowSold)}
        className={cn(
          "pointer-events-auto inline-flex shrink-0 items-center rounded-md px-3 py-2 text-xs font-semibold shadow-md backdrop-blur-sm transition",
          showSold
            ? "bg-danger text-white"
            : "bg-white/95 text-danger ring-1 ring-danger/35",
        )}
      >
        {loadingSold ? "Loading…" : closedLabel}
      </button>
      <button
        type="button"
        aria-pressed={showUnlisted}
        onClick={() =>
          requireClientOrToggle("unlisted", showUnlisted, setShowUnlisted)
        }
        className={cn(
          "pointer-events-auto inline-flex shrink-0 items-center rounded-md px-3 py-2 text-xs font-semibold shadow-md backdrop-blur-sm transition",
          showUnlisted
            ? "bg-danger text-white"
            : "bg-white/95 text-danger ring-1 ring-danger/35",
        )}
      >
        {loadingUnlisted ? "Loading…" : "Unlisted"}
      </button>
    </div>
  );

  let hoverCard: ReactNode = null;
  if (portalReady && hover) {
    hoverCard = createPortal(
      <div
        className="fixed z-[120]"
        style={{ left: hover.left, top: hover.top }}
        onMouseLeave={() => setHover(null)}
      >
        <CompactNearbyCard listing={hover.listing} />
      </div>,
      document.body,
    );
  }

  return (
    <div
      className="relative h-[52vh] min-h-[320px] w-full min-w-full shrink-0 snap-center snap-always bg-mist"
      aria-label={`Map of ${addressLabel}`}
    >
      <div
        className={cn(
          "overflow-hidden bg-mist",
          fullscreen
            ? "fixed inset-0 z-[95] flex flex-col"
            : "absolute inset-0",
        )}
      >
        {fullscreen ? (
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-ink px-3 py-3 text-white">
            <button
              type="button"
              onClick={() => setFullscreen(false)}
              className="rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/15"
            >
              Back
            </button>
            <p
              id={titleId}
              className="min-w-0 flex-1 truncate text-center text-sm font-semibold"
            >
              {addressLabel}
            </p>
            <button
              type="button"
              onClick={() => setFullscreen(false)}
              className="rounded-lg bg-white/10 p-2 hover:bg-white/15"
              aria-label="Close map"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ) : null}

        <div
          className={cn(
            "relative min-h-0",
            fullscreen ? "flex-1" : "h-full w-full",
          )}
        >
          <div
            ref={containerRef}
            className="absolute inset-0 h-full w-full [&_.maplibregl-canvas]:!h-full [&_.maplibregl-canvas]:!w-full [&_.maplibregl-ctrl-bottom-right]:mb-3 [&_.maplibregl-ctrl-bottom-right]:mr-3"
            onTouchStart={(event) => {
              event.stopPropagation();
              gestureStartRef.current?.();
            }}
            onTouchMove={(event) => event.stopPropagation()}
            onTouchEnd={() => gestureEndRef.current?.()}
            onPointerDown={(event) => {
              event.stopPropagation();
              gestureStartRef.current?.();
            }}
            onPointerUp={() => gestureEndRef.current?.()}
          />

          {!ready ? (
            <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center bg-mist text-sm text-ink/50">
              Loading map…
            </div>
          ) : null}

          {filterBar}
        </div>
      </div>
      {hoverCard}
    </div>
  );
}
