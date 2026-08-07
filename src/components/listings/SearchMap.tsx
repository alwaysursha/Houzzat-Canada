"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Check, ListFilter, Pencil, Trash2, X } from "lucide-react";
import type { ListingCard } from "@/lib/listings/types";
import { formatListPrice } from "@/lib/listings/constants";
import { MAP_MAX_ZOOM, MAP_MIN_ZOOM, OSM_STYLE } from "@/lib/maps/osm-style";
import { SearchMapPopupCard } from "@/components/listings/SearchMapPopupCard";
import { cn } from "@/lib/utils";

type Bounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

type LngLat = [number, number];

const DRAW_SOURCE = "houzzat-draw-poly";
const DRAW_FILL = "houzzat-draw-fill";
const DRAW_LINE = "houzzat-draw-line";
const DRAW_POINTS = "houzzat-draw-points";

type MapStatus = "ACTIVE" | "SOLD_CONDITIONAL" | "SOLD" | "LEASED" | "UNLISTED";

function pillToneFromListingStatus(
  listingStatus: string,
): "canopy" | "amber" | "danger" | "muted" {
  if (listingStatus === "SOLD_CONDITIONAL") return "amber";
  if (listingStatus === "SOLD" || listingStatus === "LEASED") return "danger";
  if (
    listingStatus === "SUSPENDED" ||
    listingStatus === "TERMINATED" ||
    listingStatus === "EXPIRED"
  ) {
    return "muted";
  }
  return "canopy";
}

function pricePillClass(
  active: boolean,
  tone: "canopy" | "amber" | "danger" | "muted",
) {
  const base =
    "rounded-full border-2 border-white px-2.5 py-1 text-[11px] font-semibold shadow-md transition-colors ";
  if (tone === "danger") {
    return (
      base +
      (active
        ? "bg-danger text-white ring-2 ring-danger/45"
        : "bg-danger/90 text-white hover:bg-danger")
    );
  }
  if (tone === "amber") {
    return (
      base +
      (active
        ? "bg-amber text-white ring-2 ring-amber/45"
        : "bg-amber/90 text-white hover:bg-amber")
    );
  }
  if (tone === "muted") {
    return (
      base +
      (active
        ? "bg-ink/75 text-white ring-2 ring-ink/35"
        : "bg-ink/55 text-white hover:bg-ink/70")
    );
  }
  return (
    base +
    (active
      ? "bg-canopy-deep text-white ring-2 ring-canopy/40"
      : "bg-canopy text-white hover:bg-canopy-deep")
  );
}

type DrawFeature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry:
    | { type: "Polygon"; coordinates: LngLat[][] }
    | { type: "LineString"; coordinates: LngLat[] }
    | { type: "Point"; coordinates: LngLat };
};

function ringToFeature(ring: LngLat[]): DrawFeature {
  const closed =
    ring.length >= 3 &&
    (ring[0]![0] !== ring[ring.length - 1]![0] ||
      ring[0]![1] !== ring[ring.length - 1]![1])
      ? [...ring, ring[0]!]
      : ring;
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [closed],
    },
  };
}

export function SearchMap({
  listings,
  activeMls,
  activeListing = null,
  onSelect,
  onClearSelection,
  onBoundsChange,
  focus,
  polygon,
  onPolygonChange,
  status = ["ACTIVE"],
  onStatusToggle,
  isLease = false,
  expandCardOnClick = false,
  onOpenListing,
  onOpenFilters,
  activeFilterCount = 0,
  className,
}: {
  listings: ListingCard[];
  activeMls?: string | null;
  activeListing?: ListingCard | null;
  onSelect?: (mlsNumber: string) => void;
  onClearSelection?: () => void;
  onBoundsChange?: (bounds: Bounds) => void;
  focus?: { lat: number; lng: number; zoom?: number } | null;
  polygon: LngLat[] | null;
  onPolygonChange: (ring: LngLat[] | null) => void;
  status?: MapStatus[];
  onStatusToggle?: (status: MapStatus) => void;
  isLease?: boolean;
  /** Pin card opens listing detail overlay instead of navigating away. */
  expandCardOnClick?: boolean;
  onOpenListing?: (mlsNumber: string) => void;
  /** Mobile: open full filter sheet from the map. */
  onOpenFilters?: () => void;
  activeFilterCount?: number;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const popupRef = useRef<HTMLDivElement>(null);
  const onBoundsChangeRef = useRef(onBoundsChange);
  onBoundsChangeRef.current = onBoundsChange;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onPinSelectRef = useRef<(mls: string) => void>(() => {});
  const skipBoundsNotify = useRef(false);
  const [drawing, setDrawing] = useState(false);
  const draftRef = useRef<LngLat[]>([]);
  const [draftCount, setDraftCount] = useState(0);
  const activeMlsRef = useRef(activeMls);
  activeMlsRef.current = activeMls;
  /** Only set when the user clicks a pin — not when a list card is hovered. */
  const [popupMls, setPopupMls] = useState<string | null>(null);
  const [popupPos, setPopupPos] = useState<{
    left: number;
    top: number;
    placement: "above" | "below";
  } | null>(null);

  onPinSelectRef.current = (mls) => {
    onSelectRef.current?.(mls);
    setPopupMls(mls);
  };

  const popupListing =
    listings.find((l) => l.mlsNumber === popupMls) ?? null;

  useEffect(() => {
    if (popupMls && !listings.some((l) => l.mlsNumber === popupMls)) {
      setPopupMls(null);
    }
  }, [listings, popupMls]);

  function clearPopup() {
    setPopupMls(null);
    onClearSelection?.();
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: [-79.4, 43.7],
      zoom: 9.4,
      minZoom: MAP_MIN_ZOOM,
      maxZoom: MAP_MAX_ZOOM,
    });

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );

    map.on("load", () => {
      map.addSource(DRAW_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: DRAW_FILL,
        type: "fill",
        source: DRAW_SOURCE,
        paint: {
          "fill-color": "#0f6b4c",
          "fill-opacity": 0.12,
        },
      });
      map.addLayer({
        id: DRAW_LINE,
        type: "line",
        source: DRAW_SOURCE,
        paint: {
          "line-color": "#0f6b4c",
          "line-width": 2.5,
        },
      });
      map.addLayer({
        id: DRAW_POINTS,
        type: "circle",
        source: DRAW_SOURCE,
        filter: ["==", "$type", "Point"],
        paint: {
          "circle-radius": 5,
          "circle-color": "#0f6b4c",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
    });

    map.on("moveend", () => {
      if (skipBoundsNotify.current) {
        skipBoundsNotify.current = false;
        return;
      }
      const b = map.getBounds();
      onBoundsChangeRef.current?.({
        west: b.getWest(),
        south: b.getSouth(),
        east: b.getEast(),
        north: b.getNorth(),
      });
    });

    mapRef.current = map;

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const activeMap = map;

    function syncDrawSource() {
      const source = activeMap.getSource(DRAW_SOURCE) as
        | maplibregl.GeoJSONSource
        | undefined;
      if (!source) return;

      const features: DrawFeature[] = [];
      const ring = drawing ? draftRef.current : (polygon ?? []);
      if (ring.length >= 3 && !drawing) {
        features.push(ringToFeature(ring));
      } else if (drawing && ring.length >= 2) {
        features.push({
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: ring,
          },
        });
      }
      for (const pt of ring) {
        features.push({
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: pt },
        });
      }
      source.setData({ type: "FeatureCollection", features });
    }

    if (activeMap.isStyleLoaded()) {
      syncDrawSource();
    } else {
      activeMap.once("load", syncDrawSource);
    }
  }, [polygon, drawing, draftCount]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function onClick(e: maplibregl.MapMouseEvent) {
      if (!drawing) return;
      const pt: LngLat = [e.lngLat.lng, e.lngLat.lat];
      draftRef.current = [...draftRef.current, pt];
      setDraftCount(draftRef.current.length);
    }

    map.on("click", onClick);
    map.getCanvas().style.cursor = drawing ? "crosshair" : "";
    return () => {
      map.off("click", onClick);
      map.getCanvas().style.cursor = "";
    };
  }, [drawing]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const id = window.requestAnimationFrame(() => {
      map.resize();
    });
    return () => window.cancelAnimationFrame(id);
  }, [className, drawing, polygon]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !containerRef.current) return;
    const ro = new ResizeObserver(() => {
      map.resize();
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    for (const listing of listings) {
      // Outer node is owned by MapLibre (gets `.maplibregl-marker` + transform).
      // Never replace its className — that strips positioning and scatters pins.
      const root = document.createElement("div");
      root.dataset.mls = listing.mlsNumber;
      root.dataset.listingStatus = listing.status;

      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = pricePillClass(
        false,
        pillToneFromListingStatus(listing.status),
      );
      pill.textContent = formatListPrice(
        listing.listPrice,
        listing.transactionType,
      ).replace("CA$", "$");
      pill.addEventListener("click", (event) => {
        event.stopPropagation();
        event.preventDefault();
        onPinSelectRef.current(listing.mlsNumber);
      });
      root.appendChild(pill);

      const marker = new maplibregl.Marker({ element: root, anchor: "center" })
        .setLngLat([listing.lng, listing.lat])
        .addTo(map);
      markersRef.current.push(marker);
    }

    // Apply current selection without rewriting MapLibre's root classes.
    for (const marker of markersRef.current) {
      const root = marker.getElement();
      const pill = root.querySelector("button");
      if (!pill || !root.dataset.mls) continue;
      const isActive = root.dataset.mls === activeMlsRef.current;
      const tone = pillToneFromListingStatus(
        root.dataset.listingStatus ?? "ACTIVE",
      );
      pill.className = pricePillClass(isActive, tone);
      root.style.zIndex = isActive ? "2" : "1";
    }
  }, [listings]);

  useEffect(() => {
    for (const marker of markersRef.current) {
      const root = marker.getElement();
      const mls = root.dataset.mls;
      const pill = root.querySelector("button");
      if (!mls || !pill) continue;
      const isActive = mls === activeMls;
      const tone = pillToneFromListingStatus(
        root.dataset.listingStatus ?? "ACTIVE",
      );
      pill.className = pricePillClass(isActive, tone);
      root.style.zIndex = isActive ? "2" : "1";
    }
  }, [activeMls]);

  useEffect(() => {
    if (!focus || !mapRef.current) return;
    skipBoundsNotify.current = true;
    mapRef.current.flyTo({
      center: [focus.lng, focus.lat],
      zoom: Math.min(focus.zoom ?? 12, MAP_MAX_ZOOM),
      essential: true,
    });
  }, [focus]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !popupListing) {
      setPopupPos(null);
      return;
    }

    function updatePopupPosition() {
      const activeMap = mapRef.current;
      const shell = containerRef.current;
      if (!activeMap || !shell || !popupListing) {
        setPopupPos(null);
        return;
      }

      const point = activeMap.project([popupListing.lng, popupListing.lat]);
      const shellW = shell.clientWidth;
      const shellH = shell.clientHeight;
      const cardW = popupRef.current?.offsetWidth ?? 320;
      const cardH = popupRef.current?.offsetHeight ?? 280;
      const gap = 14;
      const pad = 10;

      const placeAbove = point.y > cardH + gap + pad;
      let left = point.x - cardW / 2;
      left = Math.max(pad, Math.min(left, shellW - cardW - pad));
      let top = placeAbove ? point.y - cardH - gap : point.y + gap + 12;
      top = Math.max(pad, Math.min(top, shellH - cardH - pad));

      setPopupPos({
        left,
        top,
        placement: placeAbove ? "above" : "below",
      });
    }

    updatePopupPosition();
    // Re-measure after paint so card size is accurate.
    const raf = window.requestAnimationFrame(updatePopupPosition);

    map.on("move", updatePopupPosition);
    map.on("zoom", updatePopupPosition);
    map.on("resize", updatePopupPosition);
    return () => {
      window.cancelAnimationFrame(raf);
      map.off("move", updatePopupPosition);
      map.off("zoom", updatePopupPosition);
      map.off("resize", updatePopupPosition);
    };
  }, [popupListing]);

  function startDraw() {
    draftRef.current = [];
    setDraftCount(0);
    onPolygonChange(null);
    setDrawing(true);
  }

  function finishDraw() {
    if (draftRef.current.length < 3) {
      setDrawing(false);
      draftRef.current = [];
      setDraftCount(0);
      return;
    }
    onPolygonChange([...draftRef.current]);
    setDrawing(false);
    draftRef.current = [];
    setDraftCount(0);
  }

  function cancelDraw() {
    setDrawing(false);
    draftRef.current = [];
    setDraftCount(0);
  }

  function clearPolygon() {
    cancelDraw();
    onPolygonChange(null);
  }

  return (
    <div className={cn("relative h-full min-h-0 w-full", className)}>
      <div ref={containerRef} className="h-full w-full" />

      <div className="absolute left-3 top-3 z-10 flex flex-col gap-2">
        {!drawing ? (
          <button
            type="button"
            onClick={startDraw}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink shadow-md transition hover:border-canopy/40"
          >
            <Pencil className="size-3.5" aria-hidden />
            Draw area
          </button>
        ) : (
          <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface p-2 shadow-md">
            <p className="px-1 text-[11px] text-ink/55">
              Click the map to add points ({draftCount}). Need 3+.
            </p>
            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={draftCount < 3}
                onClick={finishDraw}
                className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-canopy px-2 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
              >
                <Check className="size-3.5" aria-hidden />
                Finish
              </button>
              <button
                type="button"
                onClick={cancelDraw}
                className="inline-flex items-center justify-center rounded-md border border-line px-2 py-1.5 text-xs font-semibold text-ink/70"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          </div>
        )}
        {polygon && !drawing ? (
          <button
            type="button"
            onClick={clearPolygon}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink/70 shadow-md transition hover:border-danger/40 hover:text-danger"
          >
            <Trash2 className="size-3.5" aria-hidden />
            Clear draw
          </button>
        ) : null}
      </div>

      {onOpenFilters ? (
        <div className="absolute right-3 top-3 z-10">
          <button
            type="button"
            onClick={onOpenFilters}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink shadow-md transition hover:border-canopy/40"
          >
            <ListFilter className="size-3.5" aria-hidden />
            Filters
            {activeFilterCount > 0 ? (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-canopy px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                {activeFilterCount}
              </span>
            ) : null}
          </button>
        </div>
      ) : null}

      {onStatusToggle ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center px-3">
          <div className="pointer-events-auto flex gap-2">
            {(isLease
              ? ([
                  ["ACTIVE", "For lease", "canopy"],
                  ["LEASED", "Leased", "danger"],
                  ["UNLISTED", "Unlisted", "muted"],
                ] as const)
              : ([
                  ["ACTIVE", "For sale", "canopy"],
                  ["SOLD_CONDITIONAL", "Sold cond.", "amber"],
                  ["SOLD", "Sold", "danger"],
                  ["UNLISTED", "Unlisted", "muted"],
                ] as const)
            ).map(([value, label, tone]) => {
              const selected = status.includes(value);
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setPopupMls(null);
                    onStatusToggle(value);
                  }}
                  className={cn(
                    "rounded-full px-3.5 py-2 text-xs font-bold uppercase tracking-wide shadow-lg transition sm:px-4 sm:text-sm",
                    tone === "canopy" &&
                      (selected
                        ? "bg-canopy text-white ring-2 ring-canopy/40 ring-offset-2 ring-offset-mist"
                        : "bg-canopy/35 text-white/80 hover:bg-canopy/55"),
                    tone === "amber" &&
                      (selected
                        ? "bg-amber text-white ring-2 ring-amber/40 ring-offset-2 ring-offset-mist"
                        : "bg-amber/35 text-white/80 hover:bg-amber/55"),
                    tone === "danger" &&
                      (selected
                        ? "bg-danger text-white ring-2 ring-danger/40 ring-offset-2 ring-offset-mist"
                        : "bg-danger/35 text-white/80 hover:bg-danger/55"),
                    tone === "muted" &&
                      (selected
                        ? "bg-ink/70 text-white ring-2 ring-ink/30 ring-offset-2 ring-offset-mist"
                        : "bg-ink/30 text-white/80 hover:bg-ink/45"),
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {popupListing && popupPos ? (
        <div
          ref={popupRef}
          className="pointer-events-auto absolute z-20"
          style={{
            left: popupPos.left,
            top: popupPos.top,
          }}
        >
          <SearchMapPopupCard
            listing={popupListing}
            onClose={clearPopup}
            onOpen={
              expandCardOnClick && onOpenListing
                ? () => onOpenListing(popupListing.mlsNumber)
                : undefined
            }
          />
        </div>
      ) : null}
    </div>
  );
}
