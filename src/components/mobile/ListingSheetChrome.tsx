"use client";

import { useSession } from "next-auth/react";
import {
  Check,
  ChevronLeft,
  Heart,
  Link2,
  Search,
  Share2,
  X,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import { useSavedListingsStatus } from "@/components/account/SavedListingsProvider";
import { LazyAddressAutocomplete } from "@/components/listings/LazyAddressAutocomplete";
import { Button } from "@/components/ui/button";
import { mlsNumberFromListingHref } from "@/lib/listings/gallery-client";
import { SITE_NAME } from "@/lib/constants";
import { hardGo } from "@/lib/mobile/nav-back";
import {
  backListingSheet,
  closeListingSheet,
  openListingSheet,
} from "@/lib/mobile/listing-sheet-store";
import {
  parseSearchQuery,
  searchHrefFromParsed,
} from "@/lib/listings/parse-search-query";
import { pushLocalRecentSearch } from "@/lib/listings/recent-searches-local";
import type { AutocompleteSuggestion } from "@/lib/listings/types";
import { SITE_MESSAGES } from "@/lib/site-messages";
import { acquireScrollLock } from "@/lib/scroll-lock";
import { cn } from "@/lib/utils";

/** Two-row sheet chrome body height (excludes safe-area; Host adds inset). */
export const LISTING_SHEET_CHROME_BODY = "6.125rem";

function listingUrl(mlsNumber: string, path?: string) {
  const relative = path ?? `/listing/${mlsNumber}`;
  if (typeof window !== "undefined") {
    return `${window.location.origin}${relative}`;
  }
  return relative;
}

/** Same social share menu as property cards / ShareListingButton — no OS share sheet. */
function SheetShareButton({
  mlsNumber,
  title,
  path,
}: {
  mlsNumber: string;
  title: string;
  path?: string;
}) {
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
  const encodedTitle = encodeURIComponent(`${title} | ${SITE_NAME}`);

  return (
    <div ref={menuRef} className="relative flex-1">
      <button
        type="button"
        aria-label="Share property"
        aria-expanded={shareOpen}
        onClick={() => setShareOpen((open) => !open)}
        className="flex h-11 w-full flex-col items-center justify-center gap-0.5 rounded-lg text-white/95 transition active:bg-white/15 hover:bg-white/10"
      >
        <Share2 className="size-5" strokeWidth={2.1} aria-hidden />
        <span className="text-[10px] font-semibold tracking-wide">Share</span>
      </button>
      {shareOpen ? (
        <div className="absolute left-1/2 top-full z-[60] mt-1 w-48 -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lg">
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
}: {
  mlsNumber: string;
  callbackPath: string;
}) {
  const { status } = useSession();
  const signedIn = status === "authenticated";
  const savedStatus = useSavedListingsStatus();
  const { openAuth } = useAuthModal();
  const { toast } = useSiteAlert();
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!signedIn) {
      setSaved(false);
      return;
    }
    if (savedStatus?.ready) {
      setSaved(savedStatus.isSaved(mlsNumber));
    }
  }, [signedIn, mlsNumber, savedStatus, savedStatus?.ready]);

  async function toggle() {
    if (!signedIn) {
      openAuth({ mode: "sign-in", callbackUrl: callbackPath });
      return;
    }
    const saving = !saved;
    setPending(true);
    const res = await fetch("/api/saved-listings", {
      method: saved ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mlsNumber }),
    });
    setPending(false);
    if (!res.ok) {
      toast({ message: SITE_MESSAGES.genericErrorToast, tone: "error" });
      return;
    }
    setSaved(saving);
    savedStatus?.setSavedState(mlsNumber, saving);
    window.dispatchEvent(new Event("houzzat:saved-listings-changed"));
    toast({
      message: saving
        ? SITE_MESSAGES.saveAddedToast
        : SITE_MESSAGES.saveRemovedToast,
      tone: saving ? "success" : "info",
    });
  }

  return (
    <button
      type="button"
      disabled={pending || !mlsNumber}
      onClick={() => void toggle()}
      className={cn(
        "flex h-11 w-full flex-1 flex-col items-center justify-center gap-0.5 rounded-lg text-white/95 transition active:bg-white/15 hover:bg-white/10",
        saved && "text-white",
      )}
      aria-label={saved ? "Remove saved listing" : "Save listing"}
    >
      <Heart
        className={cn("size-5", saved && "fill-white")}
        strokeWidth={2.1}
        aria-hidden
      />
      <span className="text-[10px] font-semibold tracking-wide">
        {saved ? "Saved" : "Save"}
      </span>
    </button>
  );
}

function SheetSearchPopup({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AutocompleteSuggestion | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const release = acquireScrollLock();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      release();
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSelected(null);
    }
  }, [open]);

  function leaveSheetForSearch(href: string, label: string) {
    pushLocalRecentSearch({ label, href });
    onClose();
    closeListingSheet();
    requestAnimationFrame(() => {
      hardGo(href);
    });
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
      onClose();
      openListingSheet(listingHref);
      return;
    }
    if (suggestion.href?.startsWith("/listing/")) {
      onClose();
      openListingSheet(suggestion.href);
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
      onClose();
      openListingSheet(listingHref);
      return;
    }
    if (selected?.href?.startsWith("/listing/") && !rawQuery) {
      onClose();
      openListingSheet(selected.href);
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

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[220]" role="presentation">
      <button
        type="button"
        aria-label="Close search"
        className="absolute inset-0 bg-ink/45"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-x-0 top-0 border-b border-line bg-surface px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] shadow-xl"
      >
        <div className="mb-2 flex items-center gap-2">
          <h2
            id={titleId}
            className="flex-1 text-base font-semibold text-ink"
          >
            Search
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-10 items-center justify-center rounded-full text-ink/60 transition hover:bg-mist hover:text-ink"
            aria-label="Close search"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div
          data-search-bar
          className="flex items-center gap-2 rounded-xl border border-line bg-mist/50 p-1"
        >
          <div className="min-w-0 flex-1">
            <LazyAddressAutocomplete
              minChars={1}
              transactionType="SALE"
              placeholder="City, neighbourhood, address, or MLS® #"
              inputClassName="h-11 rounded-lg border-0 bg-transparent text-[15px] shadow-none focus-visible:ring-0"
              onQueryChange={(value) => {
                setQuery(value);
                setSelected(null);
              }}
              onPlaceSelect={goToSuggestion}
              onPlaceResolved={(place) => {
                setSelected(place);
              }}
              onSearchSubmit={(q) => onSearch(q)}
            />
          </div>
          <Button
            type="button"
            size="sm"
            className="h-11 shrink-0 rounded-lg px-4"
            onClick={() => onSearch()}
          >
            Search
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Listing overlay chrome — two rows:
 * 1) Listing[+count] | centered Houzzat mark + wordmark | Back (if stack) + Close
 * 2) Search · Share · Save
 */
export function ListingSheetChrome({
  href,
  canBack,
  depth = 1,
  usePanel = false,
  loading = false,
}: {
  href: string | null;
  canBack: boolean;
  /** Stack size — shown as “Listing · N” when N > 1. */
  depth?: number;
  usePanel?: boolean;
  loading?: boolean;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const mlsNumber = href ? mlsNumberFromListingHref(href) : null;
  const callbackPath =
    href?.split("?")[0] ?? (mlsNumber ? `/listing/${mlsNumber}` : "/");
  const shareTitle = mlsNumber ? `MLS® ${mlsNumber}` : SITE_NAME;

  const listingLabel = (() => {
    if (loading) return "Loading…";
    const noun = usePanel ? "Panel" : "Listing";
    if (depth > 1) return `${noun} · ${depth}`;
    return noun;
  })();

  return (
    <header
      className="relative z-50 shrink-0 border-b border-white/15 bg-canopy text-white"
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      {/*
        True screen-center brand (absolute), not flex-space between Listing/Close.
        Official house mark + display wordmark — reads as logo, not tiny header text.
      */}
      <div className="pointer-events-none absolute inset-x-0 top-[env(safe-area-inset-top,0px)] z-[1] flex h-11 items-center justify-center gap-1.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/houzzat-house-mark.png"
          alt=""
          width={32}
          height={32}
          className="size-8 shrink-0 object-contain"
          aria-hidden
        />
        <span className="font-display text-xl font-semibold leading-none tracking-tight text-white sm:text-[1.35rem]">
          {SITE_NAME}
        </span>
      </div>

      <div className="relative z-[2] flex h-11 items-center justify-between gap-1 px-1 sm:px-2">
        <span className="min-w-0 max-w-[38%] truncate pl-2 text-sm font-semibold tracking-wide text-white/90">
          {listingLabel}
        </span>

        <div className="flex shrink-0 items-center justify-end">
          {canBack ? (
            <button
              type="button"
              onClick={() => backListingSheet()}
              className="inline-flex h-11 items-center justify-center gap-0.5 rounded-lg px-1.5 text-sm font-semibold text-white transition active:bg-white/15 hover:bg-white/10"
              aria-label="Back to previous listing"
            >
              <ChevronLeft className="size-5" strokeWidth={2.2} aria-hidden />
              Back
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => closeListingSheet()}
            className="inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-lg px-2 text-sm font-semibold text-white transition active:bg-white/15 hover:bg-white/10"
            aria-label="Close listing"
          >
            <X className="size-5" strokeWidth={2.2} aria-hidden />
            Close
          </button>
        </div>
      </div>

      <div className="flex items-stretch gap-1 border-t border-white/12 bg-canopy-deep/25 px-2 py-1">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg text-white/95 transition active:bg-white/15 hover:bg-white/10"
          aria-label="Open search"
        >
          <Search className="size-5" strokeWidth={2.1} aria-hidden />
          <span className="text-[10px] font-semibold tracking-wide">Search</span>
        </button>
        {mlsNumber ? (
          <SheetShareButton
            mlsNumber={mlsNumber}
            title={shareTitle}
            path={callbackPath}
          />
        ) : (
          <div className="flex-1" aria-hidden />
        )}
        {mlsNumber ? (
          <SheetSaveButton mlsNumber={mlsNumber} callbackPath={callbackPath} />
        ) : (
          <div className="flex-1" aria-hidden />
        )}
      </div>

      <SheetSearchPopup open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}

/** CSS length for --listing-sheet-chrome-height. */
export function listingSheetChromeHeightVar(): string {
  return `calc(${LISTING_SHEET_CHROME_BODY} + env(safe-area-inset-top, 0px))`;
}
