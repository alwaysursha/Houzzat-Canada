"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FreeSwipeRail } from "@/components/home/FreeSwipeRail";
import { HomeRailCardsSkeleton } from "@/components/home/HomeRailCardsSkeleton";
import { ListingCard } from "@/components/listings/ListingCard";
import {
  defaultOpenHouseDayTab,
  listingHasOpenHouseOnDay,
  soonestOpenHouseOnDay,
  type OpenHouseDayTab,
} from "@/lib/listings/home-open-house-day";
import type { ListingCard as ListingCardData } from "@/lib/listings/types";
import { cn } from "@/lib/utils";

type DayTab = OpenHouseDayTab;

export function HomeOpenHousesRail({
  items,
  href,
  subtitle,
  emptyLabel,
  loading = false,
}: {
  items: ListingCardData[];
  href: string;
  subtitle?: string;
  emptyLabel?: string;
  loading?: boolean;
}) {
  const satItems = useMemo(
    () =>
      items
        .filter((l) => listingHasOpenHouseOnDay(l, "sat"))
        .sort(
          (a, b) =>
            soonestOpenHouseOnDay(a, "sat") - soonestOpenHouseOnDay(b, "sat"),
        ),
    [items],
  );
  const sunItems = useMemo(
    () =>
      items
        .filter((l) => listingHasOpenHouseOnDay(l, "sun"))
        .sort(
          (a, b) =>
            soonestOpenHouseOnDay(a, "sun") - soonestOpenHouseOnDay(b, "sun"),
        ),
    [items],
  );

  const preferredTab = defaultOpenHouseDayTab(
    satItems.length,
    sunItems.length,
  );
  const [userTab, setUserTab] = useState<DayTab | null>(null);
  const tab = userTab ?? preferredTab;
  const active = tab === "sat" ? satItems : sunItems;

  return (
    <section
      id="rail-open-houses"
      className="scroll-mt-[calc(var(--site-header-stack)+env(safe-area-inset-top,0px)+1.25rem)] space-y-5"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-ink">Open Houses</h2>
          {subtitle ? (
            <p className="mt-1 text-sm text-ink/60">{subtitle}</p>
          ) : null}
        </div>
        <Link href={href} className="text-sm font-semibold text-canopy">
          See all →
        </Link>
      </div>

      <div
        className="inline-flex rounded-full border border-line bg-surface p-1"
        role="tablist"
        aria-label="Open house day"
      >
        {(
          [
            { id: "sat", label: "Sat", count: satItems.length },
            { id: "sun", label: "Sun", count: sunItems.length },
          ] as const
        ).map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={tab === option.id}
            onClick={() => setUserTab(option.id)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-semibold transition",
              tab === option.id
                ? "bg-canopy text-white"
                : "text-ink/60 hover:text-ink",
            )}
          >
            {option.label}
            <span className="ml-1.5 tabular-nums opacity-70">
              {option.count}
            </span>
          </button>
        ))}
      </div>

      {loading && items.length === 0 ? (
        <HomeRailCardsSkeleton label="Loading open houses" />
      ) : active.length === 0 ? (
        <p className="text-sm text-ink/50">
          {emptyLabel ??
            (tab === "sat"
              ? "No Saturday open houses in this area yet."
              : "No Sunday open houses in this area yet.")}
        </p>
      ) : (
        <FreeSwipeRail label={`Open Houses ${tab === "sat" ? "Sat" : "Sun"}`}>
          {active.map((listing) => (
            <ListingCard key={listing.mlsNumber} listing={listing} />
          ))}
        </FreeSwipeRail>
      )}
    </section>
  );
}
