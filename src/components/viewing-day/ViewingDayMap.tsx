"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { decodeGooglePolyline } from "@/lib/maps/decode-polyline";
import { OSM_STYLE } from "@/lib/maps/osm-style";

type MapPoint = { lat: number; lng: number; label: string };

export function ViewingDayMap({
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

  useEffect(() => {
    if (!containerRef.current || points.length === 0) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: [points[0]!.lng, points[0]!.lat],
      zoom: 11,
    });
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    mapRef.current = map;

    const markers: maplibregl.Marker[] = [];

    map.on("load", () => {
      const coords: Array<[number, number]> = [];
      for (const poly of polylines) {
        coords.push(...decodeGooglePolyline(poly));
      }
      if (coords.length > 1) {
        map.addSource("tour-line", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: coords },
          },
        });
        map.addLayer({
          id: "tour-line-layer",
          type: "line",
          source: "tour-line",
          paint: {
            "line-color": "#0f6b4c",
            "line-width": 4,
            "line-opacity": 0.85,
          },
        });
      }

      const bounds = new maplibregl.LngLatBounds();
      points.forEach((point, index) => {
        const el = document.createElement("div");
        el.className =
          "flex size-7 items-center justify-center rounded-full border-2 border-white bg-canopy text-[11px] font-bold text-white shadow";
        el.textContent = index === 0 ? "S" : String(index);
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([point.lng, point.lat])
          .setPopup(
            new maplibregl.Popup({ offset: 12 }).setText(point.label),
          )
          .addTo(map);
        markers.push(marker);
        bounds.extend([point.lng, point.lat]);
      });

      if (points.length === 1) {
        map.setCenter([points[0]!.lng, points[0]!.lat]);
        map.setZoom(12);
      } else if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 48, maxZoom: 13 });
      }
    });

    return () => {
      markers.forEach((m) => m.remove());
      map.remove();
      mapRef.current = null;
    };
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
