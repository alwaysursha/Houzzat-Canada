"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Search, X } from "lucide-react";
import { SaveListingButton } from "@/components/account/SaveListingButton";
import { WatchAreaButton } from "@/components/account/WatchAreaButton";
import { WatchListingButton } from "@/components/account/WatchListingButton";
import { cn } from "@/lib/utils";

/**
 * Mobile-only edge tab + slide-out sheet for listing pages.
 */
export function ListingMobileSideMenu({
  mlsNumber,
  callbackPath,
  initiallySaved,
  initiallyWatching,
  signedIn,
  city,
  community,
  transactionType,
  segment,
  inactive = false,
  similarHomesHref,
}: {
  mlsNumber: string;
  /** Canonical SEO path for auth redirects. */
  callbackPath?: string;
  initiallySaved: boolean;
  initiallyWatching: boolean;
  signedIn: boolean;
  city: string;
  community?: string | null;
  transactionType: "SALE" | "LEASE";
  segment?: "RESIDENTIAL" | "COMMERCIAL" | "PRE_CONSTRUCTION" | string;
  inactive?: boolean;
  similarHomesHref?: string;
}) {
  const authCallbackUrl = callbackPath ?? `/listing/${mlsNumber}`;
  const [open, setOpen] = useState(false);
  const [nudge, setNudge] = useState(false);
  const titleId = useId();

  const watchSegment =
    segment === "COMMERCIAL" ? "COMMERCIAL" : ("RESIDENTIAL" as const);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Soft one-time peek after the customer starts scrolling — tab only, menu stays closed.
  useEffect(() => {
    if (open) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let played = false;
    let clearTimer: number | undefined;

    function onScroll() {
      if (played) return;
      if (window.scrollY < 72) return;
      played = true;
      setNudge(true);
      clearTimer = window.setTimeout(() => setNudge(false), 1600);
      window.removeEventListener("scroll", onScroll);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (clearTimer) window.clearTimeout(clearTimer);
    };
  }, [open]);

  return (
    <div className="md:hidden">
      {/*
        Fixed flex rail centers the tab vertically. Nudge animates translateX only
        so it cannot fight Tailwind translate / double-shift the tab upward.
      */}
      <div
        className={cn(
          "pointer-events-none fixed inset-y-0 right-0 z-40 flex items-center",
          open && "invisible",
        )}
      >
        <button
          type="button"
          aria-expanded={open}
          aria-controls="listing-mobile-side-menu"
          onClick={() => setOpen(true)}
          className={cn(
            "pointer-events-auto flex items-center",
            "rounded-l-xl border border-r-0 border-line/80 bg-surface/95 px-1.5 py-7 shadow-sm backdrop-blur-md",
            "text-canopy transition-[background-color,color,box-shadow] hover:bg-white hover:text-canopy-deep",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canopy/40",
            nudge &&
              "listing-side-tab-nudge shadow-md [animation:listing-side-tab-nudge_1.45s_cubic-bezier(0.22,1,0.36,1)_both]",
          )}
        >
          <span className="sr-only">Open listing menu</span>
          <ChevronLeft className="size-4" strokeWidth={2.25} aria-hidden />
        </button>
      </div>

      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close menu"
        tabIndex={open ? 0 : -1}
        onClick={() => setOpen(false)}
        className={cn(
          "fixed inset-0 z-[45] bg-ink/35 transition duration-300",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      {/* Sheet — keep off-flow when closed so it cannot widen the page */}
      <aside
        id="listing-mobile-side-menu"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        inert={!open ? true : undefined}
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-[min(20rem,88vw)] flex-col",
          "border-l border-line bg-surface shadow-[-8px_0_30px_rgba(20,32,28,0.12)]",
          "transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "pointer-events-none translate-x-full",
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5">
          <div className="min-w-0">
            <p
              id={titleId}
              className="font-display text-lg tracking-tight text-ink"
            >
              Listing menu
            </p>
            <p className="text-xs text-ink/50">Shortcuts for this home</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg bg-mist p-2 text-ink/70 transition hover:bg-line/50 hover:text-ink"
            aria-label="Close menu"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-ink/40">
            Follow this listing
          </p>
          <ul className="space-y-2">
            <li className="[&_button]:h-11 [&_button]:w-full [&_button]:justify-start [&_button]:px-3 [&_button]:text-sm">
              <SaveListingButton
                mlsNumber={mlsNumber}
                initiallySaved={initiallySaved}
                signedIn={signedIn}
                authCallbackUrl={authCallbackUrl}
              />
            </li>
            {inactive ? (
              <>
                <li className="[&_button]:h-11 [&_button]:w-full [&_button]:justify-start [&_button]:px-3 [&_button]:text-sm">
                  <WatchAreaButton
                    city={city}
                    community={community ?? undefined}
                    transactionType={transactionType}
                    segment={watchSegment}
                    signedIn={signedIn}
                    idleLabel="Watch this area"
                    authCallbackUrl={authCallbackUrl}
                  />
                </li>
                {similarHomesHref ? (
                  <li>
                    <Link
                      href={similarHomesHref}
                      onClick={() => setOpen(false)}
                      className="inline-flex h-11 w-full items-center justify-start gap-2 rounded-lg bg-canopy px-3 text-sm font-semibold text-white transition hover:bg-canopy-deep"
                    >
                      <Search className="size-4" aria-hidden />
                      Find similar homes
                    </Link>
                  </li>
                ) : null}
              </>
            ) : (
              <>
                <li className="[&_button]:h-11 [&_button]:w-full [&_button]:justify-start [&_button]:px-3 [&_button]:text-sm">
                  <WatchListingButton
                    mlsNumber={mlsNumber}
                    initiallyWatching={initiallyWatching}
                    signedIn={signedIn}
                    idleLabel="Watch property"
                    activeLabel="Watching"
                    authCallbackUrl={authCallbackUrl}
                  />
                </li>
                <li className="[&_button]:h-11 [&_button]:w-full [&_button]:justify-start [&_button]:px-3 [&_button]:text-sm">
                  <WatchAreaButton
                    city={city}
                    community={community ?? undefined}
                    transactionType={transactionType}
                    segment={watchSegment}
                    signedIn={signedIn}
                    idleLabel="Watch area"
                    authCallbackUrl={authCallbackUrl}
                  />
                </li>
              </>
            )}
          </ul>
        </nav>
      </aside>
    </div>
  );
}
