"use client";

import {
  Check,
  ChevronLeft,
  Heart,
  Link2,
  Search,
  Share2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSavedListingToggle } from "@/components/account/useSavedListingToggle";
import { LazyAddressAutocomplete } from "@/components/listings/LazyAddressAutocomplete";
import { mlsNumberFromListingHref } from "@/lib/listings/gallery-client";
import { useTenantDisplayName } from "@/components/tenancy/TenantBrandProvider";
import { leaveListingSheetThenGo } from "@/lib/listings/navigate-listing";
import {
  backListingSheet,
  closeListingSheet,
  openListingSheet,
  replaceListingSheet,
} from "@/lib/mobile/listing-sheet-store";
import { browseSourceForHref } from "@/lib/mobile/listing-browse-source";
import {
  isListingSheetSearchOpen,
  setListingSheetSearchOpen,
  subscribeListingSheetSearchClose,
} from "@/lib/mobile/listing-sheet-search";
import {
  parseSearchQuery,
  searchHrefFromParsed,
} from "@/lib/listings/parse-search-query";
import { pushLocalRecentSearch } from "@/lib/listings/recent-searches-local";
import type { AutocompleteSuggestion } from "@/lib/listings/types";
import { cn } from "@/lib/utils";


/** Two-row sheet chrome body height (excludes safe-area; Host adds inset). */
/** Row 1 (2.75rem) + desktop search band (~3.25rem). Mobile action row matches. */
/** Desktop sheet header is one compact row. Mobile chrome height is set separately. */
export const LISTING_SHEET_CHROME_BODY = "3.5rem";

const SEARCH_PLACEHOLDER =
  "Search active or sold listings by MLS® #, address or neighbourhood";

function listingUrl(mlsNumber: string, path?: string) {
  const relative = path ?? `/listing/${mlsNumber}`;
  if (typeof window !== "undefined") {
    return `${window.location.origin}${relative}`;
  }
  return relative;
}

function useIsDesktopChrome() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return isDesktop;
}

/** Same social share menu as property cards / ShareListingButton — no OS share sheet. */
function SheetShareButton({
  mlsNumber,
  title,
  path,
  iconOnly = false,
}: {
  mlsNumber: string;
  title: string;
  path?: string;
  iconOnly?: boolean;
}) {
  const siteName = useTenantDisplayName();
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!shareOpen) return;
    function onDoc(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setShareOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setShareOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [shareOpen]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(listingUrl(mlsNumber, path));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard errors.
    }
  }

  function openNetwork(href: string) {
    window.open(href, "_blank", "noopener,noreferrer,width=600,height=560");
    setShareOpen(false);
  }

  const url = listingUrl(mlsNumber, path);
  const encoded = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(`${title} | ${siteName}`);

  return (
    <div ref={menuRef} className={iconOnly ? "relative" : "relative flex-1"}>
      <button
        type="button"
        aria-label="Share property"
        aria-expanded={shareOpen}
        onClick={() => setShareOpen((open) => !open)}
        className={
          iconOnly
            ? "inline-flex size-11 items-center justify-center rounded-lg text-white/95 transition hover:bg-white/10 active:bg-white/15"
            : "flex h-11 w-full flex-col items-center justify-center gap-0.5 rounded-lg text-white/95 transition active:bg-white/15 hover:bg-white/10"
        }
      >
        <Share2 className="size-5" strokeWidth={2.1} aria-hidden />
        {iconOnly ? null : (
          <span className="text-[10px] font-semibold tracking-wide">Share</span>
        )}
      </button>
      {shareOpen ? (
        <div
          className={cn(
            "absolute top-full z-[60] mt-1 w-48 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lg",
            iconOnly ? "right-0" : "left-1/2 -translate-x-1/2",
          )}
        >
          <button
            type="button"
            onClick={() => void copyLink()}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-ink hover:bg-mist"
          >
            {copied ? (
              <Check className="size-4 text-canopy" aria-hidden />
            ) : (
              <Link2 className="size-4 text-canopy" aria-hidden />
            )}
            {copied ? "Link copied" : "Copy link"}
          </button>
          <button
            type="button"
            onClick={() =>
              openNetwork(
                `https://www.facebook.com/sharer/sharer.php?u=${encoded}`,
              )
            }
            className="flex w-full px-3 py-2.5 text-left text-sm font-medium text-ink hover:bg-mist"
          >
            Facebook
          </button>
          <button
            type="button"
            onClick={() =>
              openNetwork(
                `https://twitter.com/intent/tweet?url=${encoded}&text=${encodedTitle}`,
              )
            }
            className="flex w-full px-3 py-2.5 text-left text-sm font-medium text-ink hover:bg-mist"
          >
            X
          </button>
          <button
            type="button"
            onClick={() =>
              openNetwork(
                `https://www.linkedin.com/sharing/share-offsite/?url=${encoded}`,
              )
            }
            className="flex w-full px-3 py-2.5 text-left text-sm font-medium text-ink hover:bg-mist"
          >
            LinkedIn
          </button>
          <button
            type="button"
            onClick={() =>
              openNetwork(`https://wa.me/?text=${encodedTitle}%20${encoded}`)
            }
            className="flex w-full px-3 py-2.5 text-left text-sm font-medium text-ink hover:bg-mist"
          >
            WhatsApp
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SheetSaveButton({
  mlsNumber,
  callbackPath,
  iconOnly = false,
}: {
  mlsNumber: string;
  callbackPath: string;
  iconOnly?: boolean;
}) {
  const { saved, pending, ready, toggle } = useSavedListingToggle({
    mlsNumber,
    authCallbackUrl: callbackPath,
  });

  return (
    <button
      type="button"
      disabled={pending || !mlsNumber || !ready}
      onClick={() => void toggle()}
      className={cn(
        iconOnly
          ? "inline-flex size-11 items-center justify-center rounded-lg text-white/95 transition hover:bg-white/10 active:bg-white/15"
          : "flex h-11 w-full flex-1 flex-col items-center justify-center gap-0.5 rounded-lg text-white/95 transition active:bg-white/15 hover:bg-white/10",
        saved && "text-white",
      )}
      aria-label={saved ? "Remove saved listing" : "Save listing"}
      aria-busy={pending || !ready}
    >
      <Heart
        className={cn("size-5", saved && "fill-white")}
        strokeWidth={2.1}
        aria-hidden
      />
      {iconOnly ? null : (
        <span className="text-[10px] font-semibold tracking-wide">
          {saved ? "Saved" : "Save"}
        </span>
      )}
    </button>
  );
}

function useListingChromeSearchNav(onCloseSearch: () => void) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AutocompleteSuggestion | null>(null);

  function leaveSheetForSearch(href: string, label: string) {
    pushLocalRecentSearch({ label, href });
    onCloseSearch();
    leaveListingSheetThenGo(href);
  }

  function goToSuggestion(suggestion: AutocompleteSuggestion) {
    setSelected(suggestion);
    setQuery(
      suggestion.city && suggestion.province
        ? `${suggestion.label}, ${suggestion.city}, ${suggestion.province}`
        : suggestion.label,
    );
    if (suggestion.type === "place" && !suggestion.action) {
      return;
    }
    if (suggestion.action === "near_me" && suggestion.href) {
      leaveSheetForSearch(suggestion.href, "Near me");
      return;
    }
    if (suggestion.mlsNumber) {
      const listingHref =
        suggestion.href ?? `/listing/${suggestion.mlsNumber}`;
      onCloseSearch();
      openListingSheet(listingHref, browseSourceForHref(listingHref));
      return;
    }
    if (suggestion.href?.startsWith("/listing/")) {
      onCloseSearch();
      openListingSheet(suggestion.href, browseSourceForHref(suggestion.href));
      return;
    }
    if (suggestion.href) {
      leaveSheetForSearch(suggestion.href, suggestion.label);
      return;
    }
    if (suggestion.lat != null && suggestion.lng != null) {
      const params = new URLSearchParams({
        transactionType: "SALE",
        lat: String(suggestion.lat),
        lng: String(suggestion.lng),
      });
      if (suggestion.city) params.set("city", suggestion.city);
      leaveSheetForSearch(`/search?${params.toString()}`, suggestion.label);
      return;
    }
    leaveSheetForSearch(
      `/search?transactionType=SALE&q=${encodeURIComponent(suggestion.label)}`,
      suggestion.label,
    );
  }

  function onSearch(rawQuery?: string) {
    const q = (rawQuery ?? query).trim();
    if (!q) {
      leaveSheetForSearch("/search?transactionType=SALE", "Search");
      return;
    }
    if (selected?.mlsNumber && !rawQuery) {
      const listingHref =
        selected.href ?? `/listing/${selected.mlsNumber}`;
      onCloseSearch();
      openListingSheet(listingHref, browseSourceForHref(listingHref));
      return;
    }
    if (selected?.href?.startsWith("/listing/") && !rawQuery) {
      onCloseSearch();
      openListingSheet(selected.href, browseSourceForHref(selected.href));
      return;
    }
    if (selected?.href && !rawQuery) {
      leaveSheetForSearch(selected.href, selected.label);
      return;
    }
    if (selected?.lat != null && selected?.lng != null && !rawQuery) {
      const params = new URLSearchParams({
        transactionType: "SALE",
        lat: String(selected.lat),
        lng: String(selected.lng),
      });
      if (selected.city) params.set("city", selected.city);
      leaveSheetForSearch(`/search?${params.toString()}`, selected.label);
      return;
    }
    const parsed = parseSearchQuery(q);
    if (!parsed.transactionType) {
      parsed.transactionType = "SALE";
      parsed.hasFilters = true;
    }
    const href = searchHrefFromParsed(parsed, { transactionType: "SALE" });
    leaveSheetForSearch(href, q);
  }

  return {
    query,
    setQuery,
    setSelected,
    goToSuggestion,
    onSearch,
  };
}

/**
 * Listing overlay chrome — two rows:
 * 1) Listing[+count] | centered Houzzat mark + wordmark | Back (if stack) + Close
 * 2) Desktop: full Search bar. Mobile: search opens from the header icon.
 */
export function ListingSheetChrome({
  href,
  canBack,
  depth = 1,
  usePanel = false,
  loading = false,
  hasBrowse = false,
  previousHref = null,
  nextHref = null,
}: {
  href: string | null;
  canBack: boolean;
  /** Stack size — shown as “Listing · N” when N > 1. */
  depth?: number;
  usePanel?: boolean;
  loading?: boolean;
  hasBrowse?: boolean;
  previousHref?: string | null;
  nextHref?: string | null;
}) {
  const tenantDisplayName = useTenantDisplayName();
  const isDesktop = useIsDesktopChrome();
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const mlsNumber = href ? mlsNumberFromListingHref(href) : null;
  const callbackPath =
    href?.split("?")[0] ?? (mlsNumber ? `/listing/${mlsNumber}` : "/");
  const shareTitle = mlsNumber ? `MLS® ${mlsNumber}` : tenantDisplayName;

  const closeMobileSearch = useCallback(() => {
    setMobileSearchOpen(false);
  }, []);

  const onMobileSheetOpenChange = useCallback(
    (open: boolean) => {
      if (!open) closeMobileSearch();
    },
    [closeMobileSearch],
  );

  const desktopNav = useListingChromeSearchNav(() => {});
  const mobileNav = useListingChromeSearchNav(closeMobileSearch);

  useEffect(() => {
    setListingSheetSearchOpen(mobileSearchOpen);
    return () => {
      if (isListingSheetSearchOpen()) setListingSheetSearchOpen(false);
    };
  }, [mobileSearchOpen]);

  useEffect(() => {
    return subscribeListingSheetSearchClose(() => {
      setMobileSearchOpen(false);
    });
  }, []);

  useEffect(() => {
    if (!mobileSearchOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileSearchOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileSearchOpen]);

  // Leaving mobile viewport while search is open should not leave Cap flag stuck.
  useEffect(() => {
    if (isDesktop && mobileSearchOpen) setMobileSearchOpen(false);
  }, [isDesktop, mobileSearchOpen]);

  const listingLabel = (() => {
    if (loading) return "Loading…";
    const noun = usePanel ? "Panel" : "Listing";
    if (depth > 1) return `${noun} · ${depth}`;
    return noun;
  })();

  const searchField = (
    nav: ReturnType<typeof useListingChromeSearchNav>,
    opts: {
      portalDesktop: boolean;
      autoOpenMobile?: boolean;
      mobileZ?: string;
      inputClassName?: string;
      className?: string;
      onMobileSheetOpenChange?: (open: boolean) => void;
    },
  ) => (
    <div data-search-bar className={cn("min-w-0 flex-1", opts.className)}>
      <LazyAddressAutocomplete
        minChars={1}
        transactionType="SALE"
        fillOnly
        placeholder={SEARCH_PLACEHOLDER}
        portalDesktopSuggestions={opts.portalDesktop}
        autoOpenMobileSheet={opts.autoOpenMobile}
        mobileSheetZClassName={opts.mobileZ}
        onMobileSheetOpenChange={opts.onMobileSheetOpenChange}
        inputClassName={
          opts.inputClassName ??
          "h-10 rounded-lg border-0 bg-white/95 pl-10 text-[15px] text-ink shadow-sm placeholder:text-ink/40 focus-visible:ring-2 focus-visible:ring-white/50"
        }
        onQueryChange={(value) => {
          nav.setQuery(value);
          nav.setSelected(null);
        }}
        onPlaceSelect={nav.goToSuggestion}
        onPlaceResolved={(place) => {
          nav.setSelected(place);
        }}
        onSearchSubmit={(q) => nav.onSearch(q)}
      />
    </div>
  );

  return (
    <header
      className="relative z-50 shrink-0 border-b border-white/15 bg-canopy text-white md:border-line/70 md:bg-white md:text-ink"
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      {/*
        True screen-center brand (absolute), not flex-space between Listing/Close.
        Hidden while mobile search is expanded (AC sheet covers; chrome stays stable).
      */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-[env(safe-area-inset-top,0px)] z-[1] flex h-11 items-center justify-center transition-opacity duration-200 ease-out md:h-14",
          mobileSearchOpen ? "opacity-0" : "opacity-100",
        )}
        aria-hidden={mobileSearchOpen}
      >
        <span className="font-display text-[1.7rem] font-semibold leading-none tracking-tight text-white sm:text-[1.85rem] md:text-canopy">
          {tenantDisplayName}
        </span>
      </div>

      <div
        className={cn(
          "relative z-[2] flex h-11 items-center justify-between gap-1 px-1 transition-opacity duration-200 ease-out sm:px-2 md:h-14 md:px-4",
          mobileSearchOpen && "pointer-events-none opacity-0",
        )}
      >
        <div className="flex min-w-0 items-center md:hidden">
          <button
            type="button"
            onClick={() => closeListingSheet()}
            className="inline-flex size-11 items-center justify-center rounded-lg text-white transition hover:bg-white/10 active:bg-white/15"
            aria-label="Close listing"
          >
            <X className="size-5" strokeWidth={2.2} aria-hidden />
          </button>
          {canBack ? (
            <button
              type="button"
              onClick={() => backListingSheet()}
              className="inline-flex size-11 items-center justify-center rounded-lg text-white transition hover:bg-white/10 active:bg-white/15"
              aria-label="Back to previous listing"
            >
              <ChevronLeft className="size-5" strokeWidth={2.2} aria-hidden />
            </button>
          ) : null}
        </div>
        <span
          className={cn(
            "min-w-0 max-w-[38%] truncate pl-2 text-sm font-semibold tracking-wide text-white/90",
            hasBrowse ? "hidden" : "hidden md:inline",
          )}
        >
          {listingLabel}
        </span>
        {hasBrowse ? (
          <button
            type="button"
            onClick={() => closeListingSheet()}
            className="hidden h-10 min-w-0 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-ink transition hover:bg-mist active:bg-line/40 md:inline-flex"
            aria-label="Back to search results"
          >
            <ChevronLeft className="size-5 shrink-0" strokeWidth={2.2} aria-hidden />
            <span className="truncate">Back to search results</span>
          </button>
        ) : null}

        <div className="flex shrink-0 items-center justify-end md:gap-2">
          {hasBrowse ? (
            <>
              <button
                type="button"
                disabled={!previousHref}
                onClick={() => {
                  if (previousHref) replaceListingSheet(previousHref);
                }}
                className="hidden h-9 items-center rounded-lg border border-line px-3 text-sm font-medium text-ink transition hover:bg-mist active:bg-line/40 disabled:pointer-events-none disabled:text-ink/30 md:inline-flex"
                aria-label="Previous listing"
              >
                Previous listing
              </button>
              <button
                type="button"
                disabled={!nextHref}
                onClick={() => {
                  if (nextHref) replaceListingSheet(nextHref);
                }}
                className="hidden h-9 items-center rounded-lg border border-line px-3 text-sm font-medium text-ink transition hover:bg-mist active:bg-line/40 disabled:pointer-events-none disabled:text-ink/30 md:inline-flex"
                aria-label="Next listing"
              >
                Next listing
              </button>
            </>
          ) : null}
          {canBack ? (
            <button
              type="button"
              onClick={() => backListingSheet()}
              className="hidden h-9 items-center justify-center gap-0.5 rounded-lg border border-line px-2.5 text-sm font-semibold text-ink transition hover:bg-mist active:bg-line/40 md:inline-flex"
              aria-label="Back to previous listing"
            >
              <ChevronLeft className="size-5" strokeWidth={2.2} aria-hidden />
              Back
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => closeListingSheet()}
            className="hidden size-9 items-center justify-center rounded-lg text-ink transition hover:bg-mist active:bg-line/40 md:inline-flex"
            aria-label="Close listing"
          >
            <X className="size-5" strokeWidth={2.2} aria-hidden />
          </button>
          <div className="flex items-center md:hidden">
            <button
              type="button"
              onClick={() => setMobileSearchOpen(true)}
              className="inline-flex size-11 items-center justify-center rounded-lg text-white/95 transition hover:bg-white/10 active:bg-white/15"
              aria-label="Open search"
              aria-expanded={mobileSearchOpen}
            >
              <Search className="size-5" strokeWidth={2.1} aria-hidden />
            </button>
            {mlsNumber ? (
              <SheetSaveButton
                mlsNumber={mlsNumber}
                callbackPath={callbackPath}
                iconOnly
              />
            ) : null}
            {mlsNumber ? (
              <SheetShareButton
                mlsNumber={mlsNumber}
                title={shareTitle}
                path={callbackPath}
                iconOnly
              />
            ) : null}
          </div>
        </div>
      </div>

      {/* Desktop: centered search — not edge-to-edge; breathing room in the band. */}
      <div className="hidden">
        <div className="mx-auto flex max-w-2xl items-center px-6 py-3 lg:px-8">
          {searchField(desktopNav, {
            portalDesktop: true,
            inputClassName:
              "h-10 rounded-xl border-0 bg-white pl-10 text-[15px] text-ink shadow-[0_1px_2px_rgb(0_0_0/0.08)] placeholder:text-ink/40 focus-visible:ring-2 focus-visible:ring-white/55",
          })}
        </div>
      </div>

      {/*
        Mobile search mode: in-chrome back + field (matches reference proportions)
        while AddressAutocomplete mobile sheet provides suggestions (reuse).
      */}
      <div
        className={cn(
          "border-t border-white/12 bg-canopy-deep/25 transition-[opacity,transform] duration-200 ease-out md:hidden",
          mobileSearchOpen
            ? "relative flex items-center gap-1 px-2 py-1 opacity-100"
            : "pointer-events-none absolute inset-x-0 flex translate-y-1 items-center gap-1 px-2 py-1 opacity-0",
        )}
        aria-hidden={!mobileSearchOpen}
      >
        <button
          type="button"
          onClick={closeMobileSearch}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-white transition active:bg-white/15 hover:bg-white/10"
          aria-label="Close search"
        >
          <ChevronLeft className="size-5" strokeWidth={2.2} aria-hidden />
        </button>
        {mobileSearchOpen
          ? searchField(mobileNav, {
              portalDesktop: false,
              autoOpenMobile: true,
              mobileZ: "z-[220]",
              inputClassName:
                "h-11 rounded-md border-white/80 bg-white/95 pl-10 text-[15px] text-ink shadow-sm placeholder:text-ink/45 focus-visible:ring-2 focus-visible:ring-white/40",
              onMobileSheetOpenChange,
            })
          : null}
      </div>
    </header>
  );
}

/** CSS length for --listing-sheet-chrome-height. */
export function listingSheetChromeHeightVar(): string {
  return `calc(${LISTING_SHEET_CHROME_BODY} + env(safe-area-inset-top, 0px))`;
}
