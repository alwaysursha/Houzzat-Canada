"use client";

import { useEffect, useState, type ComponentType } from "react";
import { subscribeListingSheet } from "@/lib/mobile/listing-sheet-store";
import { ListingSheetChrome } from "@/components/mobile/ListingSheetChrome";
import { scheduleAfterFirstPaint } from "@/lib/mobile/schedule-idle";

type HostComponent = ComponentType<Record<string, never>>;

let hostModulePromise: Promise<HostComponent> | null = null;

function loadListingSheetHost(): Promise<HostComponent> {
  if (!hostModulePromise) {
    hostModulePromise = import("@/components/mobile/ListingSheetHost").then(
      (mod) => mod.ListingSheetHost,
    );
  }
  return hostModulePromise;
}

/**
 * Immediate chrome while the ListingSheetHost chunk downloads.
 * Keeps the first listing tap from feeling like a dead click.
 */
function ListingSheetOpeningChrome() {
  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-surface"
      role="dialog"
      aria-modal="true"
      aria-busy="true"
      aria-label="Listing details"
    >
      <ListingSheetChrome href={null} canBack={false} loading />
      <div className="flex min-h-0 flex-1 items-center justify-center bg-mist">
        <div
          className="size-9 animate-spin rounded-full border-2 border-canopy/25 border-t-canopy"
          aria-hidden
        />
      </div>
    </div>
  );
}

/**
 * Keeps listing-detail / MapLibre out of the initial Home client graph.
 * Uses imperative import() (not next/dynamic) so Turbopack does not attach
 * map CSS to the root layout entry.
 */
export function ListingSheetHostLazy() {
  const [armed, setArmed] = useState(false);
  const [Host, setHost] = useState<HostComponent | null>(null);

  useEffect(() => {
    return subscribeListingSheet((state) => {
      if (state.href) setArmed(true);
    });
  }, []);

  useEffect(() => {
    return scheduleAfterFirstPaint(
      () => {
        void loadListingSheetHost();
      },
      { timeoutMs: 2_800 },
    );
  }, []);

  useEffect(() => {
    if (!armed || Host) return;
    let cancelled = false;
    void loadListingSheetHost().then((Comp) => {
      if (!cancelled) setHost(() => Comp);
    });
    return () => {
      cancelled = true;
    };
  }, [armed, Host]);

  if (!armed) return null;
  if (!Host) return <ListingSheetOpeningChrome />;
  return <Host />;
}
