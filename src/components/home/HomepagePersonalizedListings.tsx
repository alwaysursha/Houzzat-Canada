"use client";

import { useEffect, useState } from "react";
import { HomeListingRail } from "@/components/home/HomeListingRail";
import type { HomepageSearchSource } from "@/lib/listings/homepage-search-source";
import { buildListingsQuery } from "@/lib/listings/search-state/query";
import { parseSearchUrl } from "@/lib/listings/search-state/parse";
import type { ListingCard as ListingCardData } from "@/lib/listings/types";

type SearchPayload = {
  items?: ListingCardData[];
  total?: number;
  error?: string;
};

/**
 * MLS cards matching the resolved homepage search (Primary or Active Search).
 * Uses Search V2 buildListingsQuery — no parallel filter interpreter.
 * Never substitutes unrelated fallback listings.
 */
export function HomepagePersonalizedListings({
  source,
}: {
  source: HomepageSearchSource;
}) {
  const [items, setItems] = useState<ListingCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const href = source.href;

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const committed = parseSearchUrl(href);
        const params = new URLSearchParams(
          buildListingsQuery({ ...committed, view: "cards" }),
        );
        params.set("limit", "12");
        if (!params.get("status") && !params.get("statuses")) {
          params.set("status", "ACTIVE");
        }
        const res = await fetch(`/api/listings/search?${params.toString()}`, {
          signal: controller.signal,
          credentials: "same-origin",
        });
        if (!res.ok) {
          if (!cancelled) {
            setItems([]);
            setError("Could not load matching homes.");
          }
          return;
        }
        const data = (await res.json()) as SearchPayload;
        if (cancelled) return;
        setItems(Array.isArray(data.items) ? data.items : []);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setItems([]);
        setError("Could not load matching homes.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [href]);

  return (
    <div className="mt-4">
      <HomeListingRail
        id="rail-homepage-personalized"
        href={href}
        items={items}
        loading={loading}
        railLabel="Recommended homes"
        emptyLabel={
          error
            ? error
            : "No listings match this search right now. Try adjusting filters."
        }
      />
    </div>
  );
}
