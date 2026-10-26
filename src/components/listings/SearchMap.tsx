"use client";

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Check, ListFilter, Pencil, Trash2, X } from "lucide-react";
import type { ListingCard } from "@/lib/listings/types";
import { formatListPrice } from "@/lib/listings/constants";
import {
  PRICE_CLUSTER_MAX_ZOOM,
  PRICE_CLUSTER_RADIUS,
  PRICE_MARKER_SOURCE_ID,
  priceMarkerFeatureCollection,
} from "@/lib/maps/price-marker-source";
import { MAP_MAX_ZOOM, MAP_MIN_ZOOM, OSM_STYLE } from "@/lib/maps/osm-style";
import { readThemeColor } from "@/lib/tenancy/read-theme-color";
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

type MapStatus =
  | "ACTIVE"
  | "SOLD_CONDITIONAL"
  | "SOLD"
  | "LEASED"
  | "UNLISTED"
  | "TERMINATED"
  | "SUSPENDED"
  | "EXPIRED";

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
  appearance: "default" | "royal" = "default",
) {
  const base =
    appearance === "royal"
      ? "rounded-full border-2 border-[#C8A66A] bg-[#0B1F3A] px-2.5 py-1 text-xs font-semibold text-[#F7F4EE] shadow-md transition-colors "
      : "rounded-full border-2 border-white px-2.5 py-1 text-[11px] font-semibold shadow-md transition-colors ";
  if (appearance === "royal" && tone === "canopy") {
    return (
      base +
      (active
        ? "ring-2 ring-[#C8A66A]"
        : "hover:bg-[#071629]")
    );
  }
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

function geoJsonSource(
  source: maplibregl.Source | undefined,
): maplibregl.GeoJSONSource | null {
  if (!source || source.type !== "geojson") return null;
  return source as maplibregl.GeoJSONSource;
}

function clusterPillClass(appearance: "default" | "royal"): string {
  const base =
    "cursor-pointer rounded-full border-2 px-2.5 py-1.5 text-xs font-semibold shadow-md ";
  if (appearance === "royal") {
    return base + "border-[#C8A66A] bg-[#0B1F3A] text-[#F7F4EE]";
  }
  return base + "border-white bg-canopy text-white";
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
  searchThisAreaVisible = false,
  onSearchThisArea,
  mapFrame,
  openingCamera,
  markerAppearance = "default",
  initialCameraRef,
  framedTokenRef,
  onCamera,
  polygon,
  onPolygonChange,
  status = ["ACTIVE"],
  onStatusToggle,
  isLease = false,
  onOpenFilters,
  activeFilterCount = 0,
  className,
}: {
  listings: ListingCard[];
  activeMls?: string | null;
  activeListing?: ListingCard | null;
  onSelect?: (mlsNumber: string) => void;
  onClearSelection?: () => void;
  onBoundsChange?: (
    bounds: Bounds,
    meta?: { userGesture: boolean },
  ) => void;
  /** Show after the user pans/zooms; applies viewport without clearing filters. */
  searchThisAreaVisible?: boolean;
  onSearchThisArea?: () => void;
  /** One-shot camera command. The same token is not replayed after a remount. */
  mapFrame?: ({ token: string } & (
    | { kind: "center"; lat: number; lng: number; zoom: number }
    | {
        kind: "bounds";
        west: number;
        south: number;
        east: number;
        north: number;
        maxZoom: number;
      }
  )) | null;
  /**
   * Camera used only when this map has no remembered view.
   * Omit it to keep the GTA opening frame.
   */
  openingCamera?: { lat: number; lng: number; zoom: number };
  /** Royal Collection price pills. Other tenants keep the default pills. */
  markerAppearance?: "default" | "royal";
  /** Last camera, used when the map is created again after Cards mode. */
  initialCameraRef?: MutableRefObject<{
    lat: number;
    lng: number;
    zoom: number;
  } | null>;
  /** Tokens already applied, so view switches do not replay a fit. */
  framedTokenRef?: MutableRefObject<string>;
  onCamera?: (camera: { lat: number; lng: number; zoom: number }) => void;
  polygon: LngLat[] | null;
  onPolygonChange: (ring: LngLat[] | null) => void;
  status?: MapStatus[];
  onStatusToggle?: (status: MapStatus) => void;
  isLease?: boolean;
  /** Mobile: open full filter sheet from the map. */
  onOpenFilters?: () => void;
  activeFilterCount?: number;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const openingCameraRef = useRef(openingCamera);
  openingCameraRef.current = openingCamera;
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const listingsRef = useRef(listings);
  listingsRef.current = listings;
  const markerAppearanceRef = useRef(markerAppearance);
  markerAppearanceRef.current = markerAppearance;
  const priceDataRef = useRef(priceMarkerFeatureCollection(listings));
  const priceSignatureRef = useRef("");
  const syncPriceMarkersRef = useRef<() => void>(() => {});
  const popupRef = useRef<HTMLDivElement>(null);
  const onCameraRef = useRef(onCamera);
  onCameraRef.current = onCamera;
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

    const camera = initialCameraRef?.current ?? openingCameraRef.current;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: camera ? [camera.lng, camera.lat] : [-79.4, 43.7],
      zoom: camera?.zoom ?? 9.4,
      minZoom: MAP_MIN_ZOOM,
      maxZoom: MAP_MAX_ZOOM,
      attributionControl: { compact: true },
    });

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );

    map.on("load", () => {
      const brandColor = readThemeColor("--canopy", "#0f6b4c");
      map.addSource(DRAW_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: DRAW_FILL,
        type: "fill",
        source: DRAW_SOURCE,
        paint: {
          "fill-color": brandColor,
          "fill-opacity": 0.12,
        },
      });
      map.addLayer({
        id: DRAW_LINE,
        type: "line",
        source: DRAW_SOURCE,
        paint: {
          "line-color": brandColor,
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
          "circle-color": brandColor,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
      map.addSource(PRICE_MARKER_SOURCE_ID, {
        type: "geojson",
        data: priceDataRef.current,
        cluster: true,
        clusterRadius: PRICE_CLUSTER_RADIUS,
        clusterMaxZoom: PRICE_CLUSTER_MAX_ZOOM,
      });
      // These layers stay painted at zero opacity so MapLibre loads clustered
      // tiles. querySourceFeatures returns nothing while every layer is hidden.
      map.addLayer({
        id: "houzzat-price-clusters",
        type: "circle",
        source: PRICE_MARKER_SOURCE_ID,
        filter: ["has", "point_count"],
        paint: { "circle-opacity": 0, "circle-radius": 1 },
      });
      map.addLayer({
        id: "houzzat-price-unclustered",
        type: "circle",
        source: PRICE_MARKER_SOURCE_ID,
        filter: ["!", ["has", "point_count"]],
        paint: { "circle-opacity": 0, "circle-radius": 1 },
      });
      map.once("idle", () => syncPriceMarkersRef.current());
    });

    map.on("idle", () => {
      syncPriceMarkersRef.current();
    });

    map.on("moveend", (event) => {
      syncPriceMarkersRef.current();
      const center = map.getCenter();
      onCameraRef.current?.({
        lat: center.lat,
        lng: center.lng,
        zoom: map.getZoom(),
      });
      if (skipBoundsNotify.current) {
        skipBoundsNotify.current = false;
        return;
      }
      const b = map.getBounds();
      const userGesture = Boolean(
        (event as { originalEvent?: Event }).originalEvent,
      );
      onBoundsChangeRef.current?.(
        {
          west: b.getWest(),
          south: b.getSouth(),
          east: b.getEast(),
          north: b.getNorth(),
        },
        { userGesture },
      );
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

  function addPriceMarker(
    map: maplibregl.Map,
    listing: ListingCard,
    appearance: "default" | "royal",
  ) {
    // Outer node is owned by MapLibre. Never replace its className.
    const root = document.createElement("div");
    root.dataset.mls = listing.mlsNumber;
    root.dataset.listingStatus = listing.status;
    const isActive = listing.mlsNumber === activeMlsRef.current;
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = pricePillClass(
      isActive,
      pillToneFromListingStatus(listing.status),
      appearance,
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
    root.style.zIndex = isActive ? "2" : "1";
    return new maplibregl.Marker({ element: root, anchor: "center" })
      .setLngLat([listing.lng, listing.lat])
      .addTo(map);
  }

  syncPriceMarkersRef.current = () => {
    const map = mapRef.current;
    const source = geoJsonSource(map?.getSource(PRICE_MARKER_SOURCE_ID));
    if (!map || !source) return;

    const appearance = markerAppearanceRef.current;
    const seen = new Set<string>();
    const planned: Array<
      | {
          kind: "cluster";
          clusterId: number;
          count: number;
          lng: number;
          lat: number;
        }
      | { kind: "price"; listing: ListingCard }
    > = [];

    for (const feature of map.querySourceFeatures(PRICE_MARKER_SOURCE_ID)) {
      const geometry = feature.geometry;
      if (geometry.type !== "Point") continue;
      const [lng, lat] = geometry.coordinates;
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
      const props = feature.properties ?? {};
      if (props.cluster) {
        const clusterId = Number(props.cluster_id);
        const count = Number(props.point_count);
        if (!Number.isFinite(clusterId) || !Number.isFinite(count)) continue;
        const key = `cluster:${clusterId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        planned.push({ kind: "cluster", clusterId, count, lng, lat });
        continue;
      }
      const mlsNumber = String(props.mlsNumber ?? "");
      const listing = listingsRef.current.find(
        (item) => item.mlsNumber === mlsNumber,
      );
      if (!listing || seen.has(mlsNumber)) continue;
      seen.add(mlsNumber);
      planned.push({ kind: "price", listing });
    }

    const selected = listingsRef.current.find(
      (item) => item.mlsNumber === activeMlsRef.current,
    );
    if (
      selected &&
      !seen.has(selected.mlsNumber) &&
      Number.isFinite(selected.lat) &&
      Number.isFinite(selected.lng)
    ) {
      planned.push({ kind: "price", listing: selected });
    }

    const signature = planned
      .map((item) =>
        item.kind === "cluster"
          ? `cluster:${item.clusterId}:${item.count}`
          : `price:${item.listing.mlsNumber}`,
      )
      .sort()
      .join("|");
    const nextSignature = `${signature}|${appearance}`;
    if (
      nextSignature === priceSignatureRef.current &&
      markersRef.current.length > 0
    ) {
      return;
    }
    priceSignatureRef.current = nextSignature;
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    for (const item of planned) {
      if (item.kind === "price") {
        markersRef.current.push(addPriceMarker(map, item.listing, appearance));
        continue;
      }
      // Outer node is owned by MapLibre. Never replace its className.
      const root = document.createElement("div");
      root.dataset.clusterId = String(item.clusterId);
      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = clusterPillClass(appearance);
      pill.textContent = String(item.count);
      pill.setAttribute(
        "aria-label",
        `${item.count} listings in this area. Zoom in.`,
      );
      pill.addEventListener("click", (event) => {
        event.stopPropagation();
        event.preventDefault();
        const current = geoJsonSource(
          mapRef.current?.getSource(PRICE_MARKER_SOURCE_ID),
        );
        if (!current) return;
        void current.getClusterExpansionZoom(item.clusterId).then((zoom: number) => {
          const activeMap = mapRef.current;
          if (!activeMap) return;
          skipBoundsNotify.current = true;
          activeMap.easeTo({
            center: [item.lng, item.lat],
            zoom: Math.min(
              Math.max(zoom, activeMap.getZoom() + 1),
              MAP_MAX_ZOOM,
            ),
          });
        });
      });
      root.appendChild(pill);
      markersRef.current.push(
        new maplibregl.Marker({ element: root, anchor: "center" })
          .setLngLat([item.lng, item.lat])
          .addTo(map),
      );
    }
  };

  useEffect(() => {
    const data = priceMarkerFeatureCollection(listings, {
      excludeMls: activeMls,
    });
    priceDataRef.current = data;
    const map = mapRef.current;
    const source = geoJsonSource(map?.getSource(PRICE_MARKER_SOURCE_ID));
    if (!map || !source) return;
    void source.setData(data, true).then(() => {
      syncPriceMarkersRef.current();
    });
  }, [listings, activeMls, markerAppearance]);

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
      pill.className = pricePillClass(isActive, tone, markerAppearance);
      root.style.zIndex = isActive ? "2" : "1";
    }
  }, [activeMls, markerAppearance]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapFrame || !map) return;
    if (framedTokenRef && framedTokenRef.current === mapFrame.token) return;
    // Camera-only. The next moveend must not run a bounds search.
    skipBoundsNotify.current = true;
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches
      ? 0
      : 700;
    if (mapFrame.kind === "center") {
      const zoom = Math.min(mapFrame.zoom, MAP_MAX_ZOOM);
      if (initialCameraRef) {
        initialCameraRef.current = {
          lat: mapFrame.lat,
          lng: mapFrame.lng,
          zoom,
        };
      }
      if (framedTokenRef) framedTokenRef.current = mapFrame.token;
      map.flyTo({
        center: [mapFrame.lng, mapFrame.lat],
        zoom,
        essential: true,
        duration,
      });
      return;
    }
    const maxZoom = Math.min(mapFrame.maxZoom, MAP_MAX_ZOOM);
    const fitPadding = markerAppearance === "royal" ? 72 : 56;
    const camera = map.cameraForBounds(
      [
        [mapFrame.west, mapFrame.south],
        [mapFrame.east, mapFrame.north],
      ],
      { padding: fitPadding, maxZoom },
    );
    const fittedCenter = camera?.center;
    const fittedZoom = camera?.zoom;
    if (fittedCenter && fittedZoom != null && initialCameraRef) {
      const lng = Array.isArray(fittedCenter)
        ? fittedCenter[0]
        : "lng" in fittedCenter
          ? fittedCenter.lng
          : fittedCenter.lon;
      const lat = Array.isArray(fittedCenter)
        ? fittedCenter[1]
        : fittedCenter.lat;
      initialCameraRef.current = { lat, lng, zoom: fittedZoom };
    }
    if (framedTokenRef) framedTokenRef.current = mapFrame.token;
    map.fitBounds(
      [
        [mapFrame.west, mapFrame.south],
        [mapFrame.east, mapFrame.north],
      ],
      {
        padding: fitPadding,
        maxZoom,
        essential: true,
        duration,
      },
    );
  }, [framedTokenRef, initialCameraRef, mapFrame, markerAppearance]);

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

      {searchThisAreaVisible && onSearchThisArea && !drawing ? (
        <div className="pointer-events-none absolute inset-x-0 top-14 z-20 flex justify-center px-3">
          <button
            type="button"
            data-search-this-area=""
            onClick={onSearchThisArea}
            className="pointer-events-auto inline-flex max-w-[min(100%,20rem)] items-center justify-center rounded-full bg-canopy px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-canopy/90"
          >
            Search This Area
          </button>
        </div>
      ) : null}

      {onStatusToggle ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-12 z-10 flex justify-center px-3 pr-12 sm:bottom-3 sm:pr-3">
          <div className="pointer-events-auto flex max-w-full flex-nowrap items-center gap-1.5 overflow-x-auto sm:flex-wrap sm:justify-center sm:gap-2">
            {(isLease
              ? ([
                  ["ACTIVE", "For lease", "canopy"],
                  ["SOLD_CONDITIONAL", "Lease cond.", "amber"],
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
                    "shrink-0 rounded-full px-3.5 py-2 text-xs font-bold uppercase tracking-wide shadow-lg transition sm:px-4 sm:text-sm",
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
          />
        </div>
      ) : null}
    </div>
  );
}
