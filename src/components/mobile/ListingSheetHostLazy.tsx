"use client";

import { useEffect, useState, type ComponentType } from "react";
import { X } from "lucide-react";
import {
  closeListingSheet,
  subscribeListingSheet,
} from "@/lib/mobile/listing-sheet-store";
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
      <div
        className="relative z-40 flex shrink-0 items-center justify-between gap-2 border-b border-line bg-canopy px-2 pt-[env(safe-area-inset-top,0px)] text-white sm:px-3"
        style={{ minHeight: "calc(2.75rem + env(safe-area-inset-top, 0px))" }}
      >
        <button
          type="button"
          onClick={() => closeListingSheet()}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-semibold text-white/95 transition hover:bg-white/10"
        >
          <X className="size-5" strokeWidth={2.2} />
          Close
        </button>
        <span className="shrink-0 pr-2 text-xs font-medium tracking-wide text-white/70">
          Loading…
        </span>
      </div>
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
