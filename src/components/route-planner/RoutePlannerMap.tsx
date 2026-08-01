"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { decodeGooglePolyline } from "@/lib/maps/decode-polyline";
import { MAP_MAX_ZOOM, MAP_MIN_ZOOM, OSM_STYLE } from "@/lib/maps/osm-style";

type MapPoint = { lat: number; lng: number; label: string };

function pointsKey(points: MapPoint[]) {
  return points
    .map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)},${p.label}`)
    .join("|");
}

function polylinesKey(polylines: string[]) {
  return polylines.join("|");
}

function lineFeature(polylines: string[]) {
  const coords: Array<[number, number]> = [];
  for (const poly of polylines) {
    coords.push(...decodeGooglePolyline(poly));
  }
  return {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "LineString" as const,
      coordinates: coords.length > 1 ? coords : [],
    },
  };
}

function createStartPinElement() {
  const el = document.createElement("div");
  el.className = "houzzat-route-start-pin";
  el.setAttribute("aria-label", "Starting point");
  el.innerHTML = `
    <svg width="32" height="40" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M16 0C7.715 0 1 6.715 1 15c0 10.5 13.2 23.4 14.2 24.35a1.2 1.2 0 0 0 1.6 0C17.8 38.4 31 25.5 31 15 31 6.715 24.285 0 16 0Z" fill="#1f7a8c"/>
      <path d="M16 0C7.715 0 1 6.715 1 15c0 10.5 13.2 23.4 14.2 24.35a1.2 1.2 0 0 0 1.6 0C17.8 38.4 31 25.5 31 15 31 6.715 24.285 0 16 0Z" stroke="#fff" stroke-width="2"/>
      <circle cx="16" cy="15" r="5.5" fill="#fff"/>
    </svg>
  `;
  Object.assign(el.style, {
    width: "32px",
    height: "40px",
    cursor: "pointer",
    filter: "drop-shadow(0 3px 6px rgba(20, 32, 28, 0.35))",
  });
  return el;
}

function createStopMarkerElement(index: number) {
  const el = document.createElement("div");
  el.className =
    "flex size-7 items-center justify-center rounded-full border-2 border-white bg-canopy text-[11px] font-bold text-white shadow";
  el.textContent = String(index);
  return el;
}

function applyRouteToMap(
  map: maplibregl.Map,
  points: MapPoint[],
  polylines: string[],
  markersRef: { current: maplibregl.Marker[] },
  animate: boolean,
) {
  const source = map.getSource("route-line") as maplibregl.GeoJSONSource | undefined;
  if (source) {
    source.setData(lineFeature(polylines));
  }

  markersRef.current.forEach((m) => m.remove());
  markersRef.current = [];

  if (points.length === 0) return;

  const bounds = new maplibregl.LngLatBounds();
  points.forEach((point, index) => {
    const isStart = index === 0;
    const el = isStart
      ? createStartPinElement()
      : createStopMarkerElement(index);
    const marker = new maplibregl.Marker({
      element: el,
      anchor: isStart ? "bottom" : "center",
    })
      .setLngLat([point.lng, point.lat])
      .setPopup(new maplibregl.Popup({ offset: 12 }).setText(point.label))
      .addTo(map);
    markersRef.current.push(marker);
    bounds.extend([point.lng, point.lat]);
  });

  if (points.length === 1) {
    if (animate) {
      map.easeTo({
        center: [points[0]!.lng, points[0]!.lat],
        zoom: 12,
        duration: 450,
      });
    } else {
      map.setCenter([points[0]!.lng, points[0]!.lat]);
      map.setZoom(12);
    }
    return;
  }

  if (!bounds.isEmpty()) {
    map.fitBounds(bounds, {
      padding: 48,
      maxZoom: 13,
      duration: animate ? 500 : 0,
    });
  }
}

export function RoutePlannerMap({
  points,
  polylines,
  className,
}: {
  points: MapPoint[];
  polylines: string[];
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const loadedRef = useRef(false);
  const lastPointsKeyRef = useRef("");
  const lastPolylinesKeyRef = useRef("");
  const pointsRef = useRef(points);
  const polylinesRef = useRef(polylines);
  pointsRef.current = points;
  polylinesRef.current = polylines;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: [-79.3832, 43.6532],
      zoom: 10,
      minZoom: MAP_MIN_ZOOM,
      maxZoom: MAP_MAX_ZOOM,
    });
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    mapRef.current = map;

    const onLoad = () => {
      if (!map.getSource("route-line")) {
        map.addSource("route-line", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: [] },
          },
        });
        map.addLayer({
          id: "route-line-layer",
          type: "line",
          source: "route-line",
          paint: {
            "line-color": "#0f6b4c",
            "line-width": 4,
            "line-opacity": 0.85,
          },
        });
      }
      loadedRef.current = true;
      lastPointsKeyRef.current = "";
      lastPolylinesKeyRef.current = "";
      applyRouteToMap(
        map,
        pointsRef.current,
        polylinesRef.current,
        markersRef,
        false,
      );
      lastPointsKeyRef.current = pointsKey(pointsRef.current);
      lastPolylinesKeyRef.current = polylinesKey(polylinesRef.current);
    };

    if (map.loaded()) onLoad();
    else map.on("load", onLoad);

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      loadedRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;

    const nextPointsKey = pointsKey(points);
    const nextPolylinesKey = polylinesKey(polylines);
    if (
      nextPointsKey === lastPointsKeyRef.current &&
      nextPolylinesKey === lastPolylinesKeyRef.current
    ) {
      return;
    }

    const animate =
      lastPointsKeyRef.current !== "" || lastPolylinesKeyRef.current !== "";
    applyRouteToMap(map, points, polylines, markersRef, animate);
    lastPointsKeyRef.current = nextPointsKey;
    lastPolylinesKeyRef.current = nextPolylinesKey;
  }, [points, polylines]);

  if (points.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className={
        className ??
        "h-64 w-full overflow-hidden rounded-xl border border-line bg-mist sm:h-80"
      }
    />
  );
}
