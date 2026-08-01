"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MAP_MAX_ZOOM, MAP_MIN_ZOOM, OSM_STYLE } from "@/lib/maps/osm-style";
import type { NearbyPoi } from "@/lib/poi/nearby";

const TYPE_COLOR: Record<string, string> = {
  SCHOOL: "#1F7A8C",
  PARK: "#0F6B4C",
  TRANSIT: "#C4891A",
  GROCERY: "#14201C",
  OTHER: "#6B7280",
};

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
      zoom: 13.2,
      minZoom: MAP_MIN_ZOOM,
      maxZoom: MAP_MAX_ZOOM,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
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
      el.style.background = TYPE_COLOR[poi.type] ?? TYPE_COLOR.OTHER;
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
      className="h-64 w-full overflow-hidden rounded-2xl border border-line bg-mist"
    />
  );
}
