"use client";

import { useSession } from "next-auth/react";
import { Check, ChevronLeft, Heart, Search, Share2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import { useSavedListingsStatus } from "@/components/account/SavedListingsProvider";
import { mlsNumberFromListingHref } from "@/lib/listings/gallery-client";
import { SITE_NAME } from "@/lib/constants";
import { hardGo } from "@/lib/mobile/nav-back";
import {
  backListingSheet,
  closeListingSheet,
} from "@/lib/mobile/listing-sheet-store";
import { SITE_MESSAGES } from "@/lib/site-messages";
import { cn } from "@/lib/utils";

/** Two-row sheet chrome body height (excludes safe-area; Host adds inset). */
export const LISTING_SHEET_CHROME_BODY = "6.125rem";

function listingAbsoluteUrl(href: string) {
  try {
    return new URL(href, window.location.origin).href;
  } catch {
    return href;
  }
}

function SheetShareButton({
  href,
  title,
}: {
  href: string;
  title: string;
}) {
  const { toast } = useSiteAlert();
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  async function onShare() {
    const url = listingAbsoluteUrl(href);
    const shareTitle = `${title} | ${SITE_NAME}`;
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: shareTitle, url });
        return;
      } catch {
        // User cancel or unsupported — fall through to menu.
      }
    }
    setMenuOpen((open) => !open);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(listingAbsoluteUrl(href));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
      setMenuOpen(false);
    } catch {
      toast({ message: SITE_MESSAGES.genericErrorToast, tone: "error" });
    }
  }

  return (
    <div ref={menuRef} className="relative flex-1">
      <button
        type="button"
        onClick={() => void onShare()}
        className="flex h-11 w-full flex-col items-center justify-center gap-0.5 rounded-lg text-white/95 transition active:bg-white/15 hover:bg-white/10"
        aria-label="Share listing"
      >
        {copied ? (
          <Check className="size-5" strokeWidth={2.1} aria-hidden />
        ) : (
          <Share2 className="size-5" strokeWidth={2.1} aria-hidden />
        )}
        <span className="text-[10px] font-semibold tracking-wide">
          {copied ? "Copied" : "Share"}
        </span>
      </button>
      {menuOpen ? (
        <div className="absolute left-1/2 top-full z-50 mt-1 w-44 -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lg">
          <button
            type="button"
            onClick={() => void copyLink()}
            className="flex w-full px-3 py-2.5 text-left text-sm font-medium text-ink hover:bg-mist"
          >
            Copy link
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

function goSearchFromSheet() {
  closeListingSheet();
  requestAnimationFrame(() => {
    if (!window.location.pathname.startsWith("/search")) {
      hardGo("/search");
    }
  });
}

/**
 * Listing overlay chrome — two rows:
 * 1) Listing | centered Houzzat mark | Back/Close (right)
 * 2) Search · Share · Save
 */
export function ListingSheetChrome({
  href,
  canBack,
  loading = false,
}: {
  href: string | null;
  canBack: boolean;
  loading?: boolean;
}) {
  const mlsNumber = href ? mlsNumberFromListingHref(href) : null;
  const callbackPath =
    href?.split("?")[0] ?? (mlsNumber ? `/listing/${mlsNumber}` : "/");
  const shareTitle = mlsNumber ? `MLS® ${mlsNumber}` : SITE_NAME;

  return (
    <header
      className="relative z-50 shrink-0 border-b border-white/15 bg-canopy text-white"
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      {/* Absolute center mark — true viewport center, not flex midpoint */}
      <div className="pointer-events-none absolute inset-x-0 top-[env(safe-area-inset-top,0px)] flex h-11 items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/houzzat-house-mark.png"
          alt=""
          width={28}
          height={28}
          className="size-7 object-contain opacity-95"
          aria-hidden
        />
        <span className="sr-only">{SITE_NAME}</span>
      </div>

      <div className="relative flex h-11 items-center justify-between gap-2 px-1.5 sm:px-2">
        <span className="min-w-[4.5rem] pl-2 text-sm font-semibold tracking-wide text-white/90">
          {loading ? "Loading…" : "Listing"}
        </span>

        <div className="flex min-w-[4.5rem] items-center justify-end">
          {canBack ? (
            <button
              type="button"
              onClick={() => backListingSheet()}
              className="inline-flex h-11 min-w-11 items-center justify-center gap-0.5 rounded-lg px-2 text-sm font-semibold text-white transition active:bg-white/15 hover:bg-white/10"
              aria-label="Back to previous listing"
            >
              <ChevronLeft className="size-5" strokeWidth={2.2} aria-hidden />
              Back
            </button>
          ) : (
            <button
              type="button"
              onClick={() => closeListingSheet()}
              className="inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-lg px-2.5 text-sm font-semibold text-white transition active:bg-white/15 hover:bg-white/10"
              aria-label="Close listing"
            >
              <X className="size-5" strokeWidth={2.2} aria-hidden />
              Close
            </button>
          )}
        </div>
      </div>

      <div className="flex items-stretch gap-1 border-t border-white/12 bg-canopy-deep/25 px-2 py-1">
        <button
          type="button"
          onClick={goSearchFromSheet}
          className="flex h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg text-white/95 transition active:bg-white/15 hover:bg-white/10"
          aria-label="Open search"
        >
          <Search className="size-5" strokeWidth={2.1} aria-hidden />
          <span className="text-[10px] font-semibold tracking-wide">Search</span>
        </button>
        {href ? <SheetShareButton href={href} title={shareTitle} /> : null}
        {mlsNumber ? (
          <SheetSaveButton mlsNumber={mlsNumber} callbackPath={callbackPath} />
        ) : (
          <div className="flex-1" aria-hidden />
        )}
      </div>
    </header>
  );
}

/** CSS length for --listing-sheet-chrome-height. */
export function listingSheetChromeHeightVar(): string {
  return `calc(${LISTING_SHEET_CHROME_BODY} + env(safe-area-inset-top, 0px))`;
}
