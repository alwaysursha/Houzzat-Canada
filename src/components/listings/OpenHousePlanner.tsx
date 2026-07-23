"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ListingCard } from "@/components/listings/ListingCard";
import type { ListingCard as ListingCardData } from "@/lib/listings/types";
import { formatOpenHouseChip } from "@/lib/listings/constants";
import { Button } from "@/components/ui/button";

function isWeekend(iso: string) {
  const d = new Date(iso);
  const day = d.getDay();
  return day === 0 || day === 6;
}

function earliestOpenHouse(listing: ListingCardData) {
  return listing.openHouses[0] ?? null;
}

export function OpenHousePlanner({
  items,
}: {
  items: ListingCardData[];
}) {
  const [weekendOnly, setWeekendOnly] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);

  const filtered = useMemo(() => {
    if (!weekendOnly) return items.filter((i) => i.openHouses.length > 0);
    return items.filter((i) =>
      i.openHouses.some((oh) => isWeekend(oh.startsAt)),
    );
  }, [items, weekendOnly]);

  const itinerary = useMemo(
    () => filtered.filter((i) => selected.includes(i.mlsNumber)),
    [filtered, selected],
  );

  function toggle(mls: string) {
    setSelected((prev) =>
      prev.includes(mls) ? prev.filter((m) => m !== mls) : [...prev, mls],
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="sm"
          variant={weekendOnly ? "default" : "secondary"}
          onClick={() => setWeekendOnly(true)}
        >
          This weekend
        </Button>
        <Button
          type="button"
          size="sm"
          variant={!weekendOnly ? "default" : "secondary"}
          onClick={() => setWeekendOnly(false)}
        >
          All upcoming
        </Button>
        <span className="text-sm text-ink/55">
          {filtered.length} homes · {selected.length} on your route
        </span>
      </div>

      {itinerary.length > 0 ? (
        <section className="rounded-2xl border border-signal/25 bg-signal/5 p-5">
          <h2 className="font-semibold text-ink">Your open-house route</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
            {itinerary
              .slice()
              .sort((a, b) => {
                const ta = earliestOpenHouse(a)
                  ? new Date(earliestOpenHouse(a)!.startsAt).getTime()
                  : 0;
                const tb = earliestOpenHouse(b)
                  ? new Date(earliestOpenHouse(b)!.startsAt).getTime()
                  : 0;
                return ta - tb;
              })
              .map((item) => (
                <li key={item.mlsNumber}>
                  <Link
                    href={`/listing/${item.mlsNumber}`}
                    className="font-medium text-canopy"
                  >
                    {item.addressLine}
                  </Link>
                  {item.openHouses.length > 0 ? (
                    <span className="text-ink/55">
                      {" "}
                      ·{" "}
                      {item.openHouses
                        .map((oh) => formatOpenHouseChip(oh.startsAt, oh.endsAt))
                        .join("; ")}
                    </span>
                  ) : null}
                </li>
              ))}
          </ol>
        </section>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((listing) => {
          const on = selected.includes(listing.mlsNumber);
          return (
            <div key={listing.mlsNumber} className="relative">
              <ListingCard listing={listing} />
              <button
                type="button"
                onClick={() => toggle(listing.mlsNumber)}
                className={`absolute right-3 top-3 rounded-lg px-2.5 py-1 text-xs font-semibold shadow ${
                  on
                    ? "bg-canopy text-white"
                    : "bg-surface/95 text-ink border border-line"
                }`}
              >
                {on ? "On route" : "Add"}
              </button>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-sm text-ink/55">
          No open houses match this filter.
        </p>
      ) : null}
    </div>
  );
}
