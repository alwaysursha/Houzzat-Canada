"use client";

import { useEffect, useState } from "react";
import {
  HomeAreaRail,
  type HomeAreaCardData,
} from "@/components/home/HomeAreaRail";
import { FreeSwipeRail } from "@/components/home/FreeSwipeRail";
import Link from "next/link";
import { scheduleAfterFirstPaint } from "@/lib/mobile/schedule-idle";

function HomeAreaRailSkeleton() {
  return (
    <section className="space-y-5" aria-busy="true" aria-label="Explore areas">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-2xl text-ink">Explore areas</h2>
        <Link href="/areas" className="text-sm font-semibold text-canopy">
          All areas →
        </Link>
      </div>
      <FreeSwipeRail label="Explore areas loading">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface"
          >
            <div className="aspect-[16/10] animate-pulse bg-mist" />
            <div className="flex flex-1 flex-col gap-3 px-4 py-4">
              <div className="h-4 w-[80%] animate-pulse rounded bg-mist" />
              <div className="grid grid-cols-2 gap-3">
                <div className="h-10 animate-pulse rounded bg-mist" />
                <div className="h-10 animate-pulse rounded bg-mist" />
                <div className="h-10 animate-pulse rounded bg-mist" />
                <div className="h-10 animate-pulse rounded bg-mist" />
              </div>
              <div className="mt-auto h-8 animate-pulse rounded bg-mist" />
            </div>
          </div>
        ))}
      </FreeSwipeRail>
    </section>
  );
}

/**
 * Loads Explore Areas after paint (same pattern as HomepageMarketRails).
 */
export function HomeAreaRailLive() {
  const [places, setPlaces] = useState<HomeAreaCardData[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      try {
        const res = await fetch("/api/geo/home-areas", {
          signal: controller.signal,
          credentials: "same-origin",
        });
        if (!res.ok) {
          if (!cancelled) setPlaces([]);
          return;
        }
        const data = (await res.json()) as { places?: HomeAreaCardData[] };
        if (cancelled) return;
        setPlaces(Array.isArray(data.places) ? data.places : []);
      } catch {
        if (!cancelled) setPlaces([]);
      }
    }

    const cancelSchedule = scheduleAfterFirstPaint(
      () => {
        if (!cancelled) void load();
      },
      { timeoutMs: 1_600 },
    );

    return () => {
      cancelled = true;
      cancelSchedule();
      controller.abort();
    };
  }, []);

  if (places == null) return <HomeAreaRailSkeleton />;
  if (places.length === 0) return null;
  return <HomeAreaRail places={places} />;
}
