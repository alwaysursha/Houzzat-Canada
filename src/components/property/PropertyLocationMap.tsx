"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MAP_MAX_ZOOM, MAP_MIN_ZOOM, OSM_STYLE } from "@/lib/maps/osm-style";

export function PropertyLocationMap({
  lat,
  lng,
  label,
}: {
  lat: number;
  lng: number;
  label: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const map = new maplibregl.Map({
      container: el,
      style: OSM_STYLE,
      center: [lng, lat],
      zoom: 15,
      minZoom: MAP_MIN_ZOOM,
      maxZoom: MAP_MAX_ZOOM,
      attributionControl: { compact: true },
    });
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );

    const pin = document.createElement("div");
    pin.className =
      "size-4 rounded-full border-2 border-white bg-canopy shadow-md";
    pin.setAttribute("role", "img");
    pin.setAttribute("aria-label", label);

    const marker = new maplibregl.Marker({ element: pin, anchor: "center" })
      .setLngLat([lng, lat])
      .addTo(map);

    return () => {
      marker.remove();
      map.remove();
    };
  }, [lat, lng, label]);

  return (
    <div
      ref={containerRef}
      className="h-56 w-full overflow-hidden rounded-xl border border-line bg-mist sm:h-72"
      aria-label={`Map showing ${label}`}
    />
  );
}
