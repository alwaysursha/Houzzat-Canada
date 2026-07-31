"use client";

import { useMemo, useState } from "react";
import { NearbyMap } from "@/components/listings/NearbyMap";
import type { NearbyPoi } from "@/lib/poi/nearby";

const LAYERS = [
  { type: "SCHOOL", label: "Schools" },
  { type: "PARK", label: "Parks" },
  { type: "TRANSIT", label: "Transit" },
  { type: "GROCERY", label: "Grocery" },
] as const;

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

const TYPE_LABEL: Record<string, string> = {
  SCHOOL: "School",
  PARK: "Park",
  TRANSIT: "Transit",
  GROCERY: "Grocery",
  OTHER: "Amenity",
};

export function NearbyAmenities({
  lat,
  lng,
  pois,
}: {
  lat: number;
  lng: number;
  pois: NearbyPoi[];
}) {
  const [active, setActive] = useState<string[]>(
    LAYERS.map((l) => l.type),
  );

  const filtered = useMemo(
    () => pois.filter((p) => active.includes(p.type)),
    [pois, active],
  );

  function toggle(type: string) {
    setActive((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-display text-2xl text-ink">Nearby</h2>
        <p className="mt-1 text-sm text-ink/60">
          Schools, parks, transit, and grocery within ~2 km.
        </p>
        <p className="mt-1 text-xs text-ink/40">
          Sources: Toronto open data, GTFS transit feeds, and OpenStreetMap.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {LAYERS.map((layer) => {
          const on = active.includes(layer.type);
          return (
            <button
              key={layer.type}
              type="button"
              onClick={() => toggle(layer.type)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                on
                  ? "bg-canopy text-white"
                  : "border border-line bg-surface text-ink/65"
              }`}
            >
              {layer.label}
            </button>
          );
        })}
      </div>

      <NearbyMap lat={lat} lng={lng} pois={pois} types={active} />

      {filtered.length === 0 ? (
        <p className="text-sm text-ink/55">
          No amenities in the selected layers for this pin yet.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {filtered.slice(0, 12).map((poi) => (
            <li
              key={poi.id}
              className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm"
            >
              <span>
                <span className="font-medium text-ink">{poi.name}</span>
                <span className="text-ink/45">
                  {" "}
                  · {TYPE_LABEL[poi.type] ?? poi.type}
                </span>
              </span>
              <span className="text-ink/55">{formatDistance(poi.distanceKm)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
