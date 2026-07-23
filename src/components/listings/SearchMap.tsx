"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { ListingCard } from "@/lib/listings/types";
import { formatListPrice } from "@/lib/listings/constants";
import { OSM_STYLE } from "@/lib/maps/osm-style";

export function SearchMap({
  listings,
  activeMls,
  onSelect,
  onBoundsChange,
  focus,
}: {
  listings: ListingCard[];
  activeMls?: string | null;
  onSelect?: (mlsNumber: string) => void;
  onBoundsChange?: (bounds: {
    west: number;
    south: number;
    east: number;
    north: number;
  }) => void;
  focus?: { lat: number; lng: number; zoom?: number } | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const onBoundsChangeRef = useRef(onBoundsChange);
  onBoundsChangeRef.current = onBoundsChange;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: [-79.4, 43.7],
      zoom: 9.4,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("moveend", () => {
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

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    for (const listing of listings) {
      const el = document.createElement("button");
      el.type = "button";
      el.className =
        "rounded-full border border-white px-2.5 py-1 text-[11px] font-semibold shadow-md transition " +
        (listing.mlsNumber === activeMls
          ? "bg-canopy-deep text-white scale-110"
          : "bg-canopy text-white hover:bg-canopy-deep");
      el.textContent = formatListPrice(
        listing.listPrice,
        listing.transactionType,
      ).replace("CA$", "$");
      el.addEventListener("click", () => onSelect?.(listing.mlsNumber));

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([listing.lng, listing.lat])
        .addTo(map);
      markersRef.current.push(marker);
    }
  }, [listings, activeMls, onSelect]);

  useEffect(() => {
    if (!focus || !mapRef.current) return;
    mapRef.current.flyTo({
      center: [focus.lng, focus.lat],
      zoom: focus.zoom ?? 12,
      essential: true,
    });
  }, [focus]);

  return (
    <div
      ref={containerRef}
      className="h-full min-h-[420px] w-full overflow-hidden rounded-2xl border border-line"
    />
  );
}
