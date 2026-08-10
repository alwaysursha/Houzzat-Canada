"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  closeListingSheet,
  subscribeListingSheet,
} from "@/lib/mobile/listing-sheet-store";

function sheetSrc(href: string): string {
  try {
    const url = new URL(href, window.location.origin);
    url.searchParams.set("sheet", "1");
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return href.includes("?") ? `${href}&sheet=1` : `${href}?sheet=1`;
  }
}

/**
 * Full-screen listing overlay for the Capacitor app.
 * Underlying browse page stays alive — Back closes this layer only.
 */
export function ListingSheetHost() {
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => subscribeListingSheet(setHref), []);

  useEffect(() => {
    if (!href) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [href]);

  const src = useMemo(() => (href ? sheetSrc(href) : null), [href]);

  if (!href || !src) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-surface"
      role="dialog"
      aria-modal="true"
      aria-label="Listing details"
    >
      <div
        className="flex shrink-0 items-center justify-between border-b border-line bg-canopy px-3 pt-[env(safe-area-inset-top,0px)] text-white"
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
        <span className="pr-2 text-xs font-medium tracking-wide text-white/70">
          Listing
        </span>
      </div>
      <iframe
        key={src}
        title="Listing"
        src={src}
        className="min-h-0 w-full flex-1 border-0 bg-mist"
        // Same-origin listing page; cookies/session stay available.
      />
    </div>
  );
}
