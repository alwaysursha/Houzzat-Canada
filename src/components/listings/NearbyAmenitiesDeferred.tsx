"use client";

import { useEffect, useState } from "react";
import { NearbyAmenities } from "@/components/listings/NearbyAmenities";
import { ListingSection } from "@/components/listings/ListingSection";
import type { NearbyPoi } from "@/lib/poi/nearby";

function AmenitiesSkeleton() {
  return (
    <ListingSection
      id="listing-nearby"
      eyebrow="Neighbourhood"
      title="Nearby"
      hint="Loading schools, parks, transit, and grocery…"
    >
      <div className="h-56 animate-pulse rounded-xl bg-mist" />
      <ul className="mt-4 space-y-2">
        {[1, 2, 3].map((i) => (
          <li key={i} className="h-10 animate-pulse rounded-lg bg-mist/80" />
        ))}
      </ul>
    </ListingSection>
  );
}

export function NearbyAmenitiesDeferred({
  lat,
  lng,
}: {
  lat: number;
  lng: number;
}) {
  const [pois, setPois] = useState<NearbyPoi[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setPois([]);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      try {
        const params = new URLSearchParams({
          lat: String(lat),
          lng: String(lng),
          radius: "2",
        });
        const res = await fetch(`/api/nearby?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`nearby ${res.status}`);
        const data = (await res.json()) as { items?: NearbyPoi[] };
        if (cancelled) return;
        setPois(data.items ?? []);
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        console.error("[NearbyAmenitiesDeferred]", error);
        setFailed(true);
      }
    }

    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [lat, lng]);

  if (pois) {
    return <NearbyAmenities lat={lat} lng={lng} pois={pois} />;
  }

  if (failed) {
    return (
      <ListingSection
        id="listing-nearby"
        eyebrow="Neighbourhood"
        title="Nearby"
        hint="Amenities temporarily unavailable."
      >
        <p className="text-sm text-ink/55">
          We couldn&apos;t load nearby schools and parks right now. Try again
          in a moment.
        </p>
      </ListingSection>
    );
  }

  return <AmenitiesSkeleton />;
}
