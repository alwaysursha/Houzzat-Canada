"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MAP_MAX_ZOOM, MAP_MIN_ZOOM, OSM_STYLE } from "@/lib/maps/osm-style";
import type { NearbyPoi } from "@/lib/poi/nearby";

import { readThemeColor } from "@/lib/tenancy/read-theme-color";

const BASE_TYPE_COLOR: Record<string, string> = {
  SCHOOL: "#1F7A8C",
  TRANSIT: "#C4891A",
  GROCERY: "#14201C",
  OTHER: "#6B7280",
};

function poiTypeColor(type: string): string {
  if (type === "PARK") {
    return readThemeColor("--canopy", "#0F6B4C");
  }
  return BASE_TYPE_COLOR[type] ?? BASE_TYPE_COLOR.OTHER;
}

/** Listing-centered; slightly closer than city overview so streets/amenities read. */
const NEARBY_INITIAL_ZOOM = 14;

/**
 * Embedded Nearby amenities map.
 * Cooperative gestures: one finger scrolls the listing; two fingers pan/zoom.
 * (Search map intentionally keeps one-finger pan — leave that alone.)
 */
export function NearbyMap({
  lat,
  lng,
  pois,
  types,
}: {
  lat: number;
  lng: number;
  pois: NearbyPoi[];
  types: string[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: [lng, lat],
      zoom: NEARBY_INITIAL_ZOOM,
      minZoom: MAP_MIN_ZOOM,
      maxZoom: MAP_MAX_ZOOM,
      // Mobile: block one-finger map pan so listing scroll continues.
      // Desktop: require Ctrl/⌘ + scroll to zoom (same handler).
      cooperativeGestures: true,
    });
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    mapRef.current = map;
    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [lat, lng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const home = document.createElement("div");
    home.className = "h-3.5 w-3.5 rounded-full border-2 border-white bg-canopy shadow";
    markersRef.current.push(
      new maplibregl.Marker({ element: home }).setLngLat([lng, lat]).addTo(map),
    );

    for (const poi of pois) {
      if (!types.includes(poi.type)) continue;
      const el = document.createElement("div");
      el.className = "h-2.5 w-2.5 rounded-full border border-white shadow";
      el.style.background = poiTypeColor(poi.type);
      el.title = `${poi.name} · ${poi.distanceKm.toFixed(1)} km`;
      markersRef.current.push(
        new maplibregl.Marker({ element: el })
          .setLngLat([poi.lng, poi.lat])
          .setPopup(
            new maplibregl.Popup({ offset: 8 }).setHTML(
              `<strong>${poi.name}</strong><br/><span style="font-size:12px">${poi.type.toLowerCase()} · ${poi.distanceKm.toFixed(1)} km</span>`,
            ),
          )
          .addTo(map),
      );
    }
  }, [pois, types, lat, lng]);

  return (
    <div
      ref={containerRef}
      className="h-64 w-full overflow-hidden rounded-2xl border border-line bg-mist [&_.maplibregl-cooperative-gesture-screen]:rounded-2xl"
    />
  );
}
