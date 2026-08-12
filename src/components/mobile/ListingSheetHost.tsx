"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, X } from "lucide-react";
import {
  abortListingGalleryFetches,
  mlsNumberFromListingHref,
} from "@/lib/listings/gallery-client";
import {
  LISTING_SHEET_OPEN_MESSAGE,
  backListingSheet,
  closeListingSheet,
  openListingSheet,
  subscribeListingSheet,
  type ListingSheetState,
} from "@/lib/mobile/listing-sheet-store";
import { acquireScrollLock } from "@/lib/scroll-lock";

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
 * Full listing-detail overlay (same page as /listing/..., not the map card).
 * Stack of listings: Back pops one; Close / Escape dismisses the whole overlay.
 */
export function ListingSheetHost() {
  const [framed, setFramed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  });
  const [state, setState] = useState<ListingSheetState>({
    href: null,
    depth: 0,
    canBack: false,
  });
  const historyPushedRef = useRef(false);
  const syncingHistoryRef = useRef(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    try {
      setFramed(window.self !== window.top);
    } catch {
      setFramed(true);
    }
  }, []);

  useEffect(() => {
    if (framed) return;
    return subscribeListingSheet(setState);
  }, [framed]);

  // Child iframe asks parent to push another listing onto the stack.
  useEffect(() => {
    if (framed) return;
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data as {
        type?: string;
        href?: string;
      } | null;
      if (data?.type !== LISTING_SHEET_OPEN_MESSAGE) return;
      if (typeof data.href !== "string" || !data.href) return;
      openListingSheet(data.href);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [framed]);

  useEffect(() => {
    if (!state.href) return;
    return acquireScrollLock();
  }, [state.href]);

  // One browser-history entry while the overlay is open (Close clears it).
  useEffect(() => {
    if (!state.href) {
      if (historyPushedRef.current) {
        historyPushedRef.current = false;
        syncingHistoryRef.current = true;
        window.history.back();
        queueMicrotask(() => {
          syncingHistoryRef.current = false;
        });
      }
      return;
    }

    if (!historyPushedRef.current) {
      window.history.pushState({ houzzatListingSheet: true }, "");
      historyPushedRef.current = true;
    }

    const onPopState = () => {
      if (syncingHistoryRef.current) return;
      historyPushedRef.current = false;
      // Browser Back closes the whole overlay (in-sheet Back steps the stack).
      closeListingSheet();
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [state.href]);

  useEffect(() => {
    if (!state.href) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeListingSheet();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.href]);

  const src = useMemo(
    () => (state.href ? sheetSrc(state.href) : null),
    [state.href],
  );

  // One iframe only: blank the outgoing document immediately so its fetches die
  // before the next listing mounts (key remount is not enough on its own).
  useLayoutEffect(() => {
    const iframe = iframeRef.current;
    return () => {
      if (!iframe) return;
      try {
        iframe.src = "about:blank";
      } catch {
        // Ignore teardown races
      }
    };
  }, [src]);

  useEffect(() => {
    const mls = state.href ? mlsNumberFromListingHref(state.href) : null;
    abortListingGalleryFetches(mls);
  }, [state.href]);

  if (framed || !state.href || !src) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-surface"
      role="dialog"
      aria-modal="true"
      aria-label="Listing details"
    >
      <div
        className="flex shrink-0 items-center justify-between gap-2 border-b border-line bg-canopy px-2 pt-[env(safe-area-inset-top,0px)] text-white sm:px-3"
        style={{ minHeight: "calc(2.75rem + env(safe-area-inset-top, 0px))" }}
      >
        <div className="flex min-w-0 items-center gap-0.5">
          {state.canBack ? (
            <button
              type="button"
              onClick={() => backListingSheet()}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-sm font-semibold text-white/95 transition hover:bg-white/10"
            >
              <ChevronLeft className="size-5" strokeWidth={2.2} />
              Back
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => closeListingSheet()}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-semibold text-white/95 transition hover:bg-white/10"
          >
            <X className="size-5" strokeWidth={2.2} />
            Close
          </button>
        </div>
        <span className="shrink-0 pr-2 text-xs font-medium tracking-wide text-white/70">
          {state.depth > 1 ? `Listing · ${state.depth}` : "Listing"}
        </span>
      </div>
      <iframe
        key={src}
        ref={iframeRef}
        title="Listing"
        src={src}
        className="min-h-0 w-full flex-1 border-0 bg-mist"
      />
    </div>
  );
}
