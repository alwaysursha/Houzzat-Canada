"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AgentSignatureFeaturedCard } from "@/components/templates/agent-signature/AgentSignatureFeaturedCard";
import { citiesQueryParam } from "@/lib/geo/regions";
import type { ListingCard as ListingCardData } from "@/lib/listings/types";
import { scheduleAfterFirstPaint } from "@/lib/mobile/schedule-idle";

type RailsPayload = {
  newListings?: ListingCardData[];
};

/**
 * Stage 6.11B.5 — curated Featured Properties with editorial homepage cards.
 */
export function AgentSignatureFeaturedProperties({
  cities,
}: {
  cities: string[];
}) {
  const [items, setItems] = useState<ListingCardData[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      try {
        const q = new URLSearchParams({
          cities: citiesQueryParam(cities),
          limit: "3",
        });
        const res = await fetch(`/api/listings/home-rails?${q.toString()}`, {
          signal: controller.signal,
          credentials: "same-origin",
        });
        if (!res.ok) {
          if (!cancelled) setItems([]);
          return;
        }
        const data = (await res.json()) as RailsPayload;
        if (cancelled) return;
        const list = Array.isArray(data.newListings) ? data.newListings : [];
        setItems(list.slice(0, 3));
      } catch {
        if (!cancelled) setItems([]);
      }
    }

    const cancelSchedule = scheduleAfterFirstPaint(
      () => {
        if (!cancelled) void load();
      },
      { timeoutMs: 900 },
    );

    return () => {
      cancelled = true;
      cancelSchedule();
      controller.abort();
    };
  }, [cities]);

  if (items != null && items.length === 0) return null;

  return (
    <section
      className="bg-surface px-4 py-12 sm:px-6 lg:px-10 lg:py-16"
      aria-labelledby="as-featured-heading"
      data-as-section="featured-properties"
    >
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink/45">
              Featured Properties
            </p>
            <h2
              id="as-featured-heading"
              className="mt-2 font-display text-3xl tracking-tight text-ink sm:text-4xl"
            >
              Exceptional homes on the market
            </h2>
            <p className="mt-3 text-base text-ink/60">
              A curated selection of active listings — explore the full market
              anytime.
            </p>
          </div>
          <Link
            href="/search?transactionType=SALE"
            className="text-xs font-semibold uppercase tracking-[0.14em] text-ink underline-offset-4 hover:underline"
          >
            View all listings →
          </Link>
        </div>

        <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3 lg:gap-10">
          {items == null
            ? Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="bg-mist" aria-hidden>
                  <div className="aspect-[5/4] animate-pulse bg-line/60" />
                  <div className="space-y-3 pt-5">
                    <div className="h-7 w-1/2 animate-pulse bg-line/50" />
                    <div className="h-4 w-full animate-pulse bg-line/40" />
                    <div className="h-3 w-2/3 animate-pulse bg-line/40" />
                  </div>
                </div>
              ))
            : items.map((listing) => (
                <AgentSignatureFeaturedCard
                  key={listing.mlsNumber}
                  listing={listing}
                />
              ))}
        </div>
      </div>
    </section>
  );
}
