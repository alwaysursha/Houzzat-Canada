"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FreeSwipeRail } from "@/components/home/FreeSwipeRail";
import { ListingCard } from "@/components/listings/ListingCard";
import type { ListingCard as ListingCardData } from "@/lib/listings/types";
import { cn } from "@/lib/utils";

type DayTab = "sat" | "sun";

function listingHasOpenHouseOnDay(
  listing: ListingCardData,
  day: DayTab,
): boolean {
  const want = day === "sat" ? 6 : 0;
  return listing.openHouses.some((oh) => {
    const d = new Date(oh.startsAt).getDay();
    return d === want;
  });
}

function soonestOpenHouseOnDay(
  listing: ListingCardData,
  day: DayTab,
): number {
  const want = day === "sat" ? 6 : 0;
  let min = Number.POSITIVE_INFINITY;
  for (const oh of listing.openHouses) {
    const at = new Date(oh.startsAt);
    if (at.getDay() !== want) continue;
    const t = at.getTime();
    if (t < min) min = t;
  }
  return min;
}

export function HomeOpenHousesRail({
  items,
  href,
  subtitle,
  emptyLabel,
}: {
  items: ListingCardData[];
  href: string;
  subtitle?: string;
  emptyLabel?: string;
}) {
  const [tab, setTab] = useState<DayTab>("sat");

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

  const active = tab === "sat" ? satItems : sunItems;

  return (
    <section
      id="rail-open-houses"
      className="scroll-mt-[calc(var(--site-header-stack)+0.75rem)] space-y-5"
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
            onClick={() => setTab(option.id)}
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

      {active.length === 0 ? (
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
