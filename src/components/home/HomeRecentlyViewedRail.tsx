"use client";

import { useEffect, useState } from "react";
import { HomeListingRail } from "@/components/home/HomeListingRail";
import { localRecentMlsNumbers } from "@/lib/recent-views-local";
import type { ListingCard as ListingCardData } from "@/lib/listings/types";

export function HomeRecentlyViewedRail({
  items,
  emptyLabel,
  useLocalFallback = false,
}: {
  items: ListingCardData[];
  /** When set, the rail stays visible even with no items. */
  emptyLabel?: string;
  /** Guests: load recent MLS#s from localStorage when server items are empty. */
  useLocalFallback?: boolean;
}) {
  const [localItems, setLocalItems] = useState<ListingCardData[] | null>(null);

  useEffect(() => {
    if (!useLocalFallback || items.length > 0) {
      setLocalItems(null);
      return;
    }

    const mlsNumbers = localRecentMlsNumbers(4);
    if (mlsNumbers.length === 0) {
      setLocalItems([]);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/listings/by-mls?ids=${encodeURIComponent(mlsNumbers.join(","))}`,
        );
        if (!res.ok || cancelled) {
          if (!cancelled) setLocalItems([]);
          return;
        }
        const data = (await res.json()) as { items?: ListingCardData[] };
        if (!cancelled) setLocalItems(data.items ?? []);
      } catch {
        if (!cancelled) setLocalItems([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [useLocalFallback, items]);

  const resolved =
    items.length > 0
      ? items
      : useLocalFallback
        ? (localItems ?? [])
        : items;

  const stillLoadingLocal =
    useLocalFallback && items.length === 0 && localItems === null;

  if (stillLoadingLocal) return null;
  if (resolved.length === 0 && !emptyLabel) return null;

  return (
    <HomeListingRail
      title="Recently viewed"
      href={useLocalFallback && items.length === 0 ? "/search" : "/account"}
      items={resolved}
      emptyLabel={emptyLabel}
    />
  );
}
