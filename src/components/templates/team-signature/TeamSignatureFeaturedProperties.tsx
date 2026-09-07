"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TeamSignatureListingCard } from "@/components/templates/team-signature/TeamSignatureListingCard";
import { citiesQueryParam } from "@/lib/geo/regions";
import type { ListingCard as ListingCardData } from "@/lib/listings/types";
import { scheduleAfterFirstPaint } from "@/lib/mobile/schedule-idle";

type RailsPayload = {
  newListings?: ListingCardData[];
};

/**
 * Stage 6.11E.2 — market featured properties (not "Our Listings").
 */
export function TeamSignatureFeaturedProperties({
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
      className="bg-[var(--ts-surface,#EEF3F0)] px-4 py-14 sm:px-6 lg:px-10 lg:py-20"
      aria-labelledby="ts-featured-heading"
      data-ts-section="featured-properties"
    >
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--ts-ink,#0F6B4C)]/12 pb-6">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--ts-ink,#0F6B4C)]/45">
              Featured Properties
            </p>
            <h2
              id="ts-featured-heading"
              className="mt-2 font-display text-3xl tracking-tight text-[var(--ts-ink,#0F6B4C)] sm:text-4xl"
            >
              Homes on the market
            </h2>
            <p className="mt-3 text-base text-[var(--ts-ink,#0F6B4C)]/60">
              A curated look at active inventory — explore the full market
              anytime.
            </p>
          </div>
          <Link
            href="/search?transactionType=SALE"
            className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ts-ink,#0F6B4C)] underline-offset-4 hover:underline"
          >
            View all listings →
          </Link>
        </div>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
          {items == null
            ? Array.from({ length: 3 }, (_, i) => (
                <div
                  key={i}
                  className="aspect-[5/4] animate-pulse bg-[var(--ts-surface-muted,#EEF3F0)]"
                  aria-hidden
                />
              ))
            : items.map((listing) => (
                <TeamSignatureListingCard
                  key={listing.mlsNumber}
                  listing={listing}
                />
              ))}
        </div>
      </div>
    </section>
  );
}
