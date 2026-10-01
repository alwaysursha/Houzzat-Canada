"use client";

import { useEffect, useState } from "react";
import type { ListingInsightsPayload } from "@/lib/market/listing-insights";

type InsightsEntry = {
  data: ListingInsightsPayload | null;
  failed: boolean;
  listeners: Set<() => void>;
  started: boolean;
};

const cache = new Map<string, InsightsEntry>();

function entryFor(mlsNumber: string): InsightsEntry {
  const existing = cache.get(mlsNumber);
  if (existing) return existing;
  const created: InsightsEntry = {
    data: null,
    failed: false,
    listeners: new Set(),
    started: false,
  };
  cache.set(mlsNumber, created);
  return created;
}

function notify(entry: InsightsEntry) {
  for (const listener of entry.listeners) listener();
}

function startInsightsLoad(mlsNumber: string) {
  const entry = entryFor(mlsNumber);
  if (entry.started) return;
  entry.started = true;
  const controller = new AbortController();
  void (async () => {
    try {
      const res = await fetch(
        `/api/listings/${encodeURIComponent(mlsNumber)}/insights`,
        { signal: controller.signal },
      );
      if (!res.ok) throw new Error(`insights ${res.status}`);
      const body = (await res.json()) as { insights?: ListingInsightsPayload };
      if (!body.insights) throw new Error("missing insights");
      entry.data = body.insights;
      entry.failed = false;
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error("[listing-insights]", error);
      entry.failed = true;
    }
    notify(entry);
  })();
}

/** One insights request per MLS, shared by the price line and the Insights panel. */
export function useListingInsights(mlsNumber: string, enabled = true) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const entry = entryFor(mlsNumber);
    const listener = () => setTick((value) => value + 1);
    entry.listeners.add(listener);
    startInsightsLoad(mlsNumber);
    return () => {
      entry.listeners.delete(listener);
    };
  }, [enabled, mlsNumber]);
  if (!enabled) return { data: null, failed: false, ready: false };
  const entry = cache.get(mlsNumber);
  return {
    data: entry?.data ?? null,
    failed: entry?.failed ?? false,
    ready: Boolean(entry?.data || entry?.failed),
  };
}
