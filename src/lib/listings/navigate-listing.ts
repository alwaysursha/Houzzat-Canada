/**
 * OpenNext on Cloudflare 500s soft RSC into `/listing/...` when the client
 * sends a full Next-Router-State-Tree. Opening the full listing detail in an
 * overlay sheet keeps the browse page mounted (web + Capacitor).
 */

import {
  LISTING_SHEET_OPEN_MESSAGE,
  openListingSheet,
} from "@/lib/mobile/listing-sheet-store";

export function isListingDetailPath(href: string): boolean {
  try {
    const path = href.startsWith("http")
      ? new URL(href).pathname
      : (href.split("?")[0] ?? "");
    return /^\/listing\//.test(path);
  } catch {
    return href.startsWith("/listing/");
  }
}

function toAppHref(href: string): string {
  try {
    const url = new URL(href, "https://houzzat.local");
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return href;
  }
}

function isInsideListingSheetFrame(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get("sheet") === "1") {
      return true;
    }
    return (
      window.self !== window.top &&
      isListingDetailPath(window.location.pathname)
    );
  } catch {
    return false;
  }
}

function openListing(href: string) {
  if (typeof window === "undefined") return;
  const path = toAppHref(href);

  // Inside the overlay iframe — ask the parent to push onto the sheet stack
  // (avoids nested popups; Back/Close live on the parent chrome).
  if (isInsideListingSheetFrame()) {
    try {
      window.parent.postMessage(
        { type: LISTING_SHEET_OPEN_MESSAGE, href: path },
        window.location.origin,
      );
      return;
    } catch {
      // fall through
    }
  }

  openListingSheet(path);
}

/** router.push that opens listing detail in the overlay sheet. */
export function pushHref(
  router: { push: (href: string) => void },
  href: string,
): void {
  if (typeof window !== "undefined" && isListingDetailPath(href)) {
    openListing(href);
    return;
  }
  router.push(href);
}

/** Open a listing detail URL in the overlay sheet (full listing page). */
export function openListingPath(href: string): void {
  if (typeof window === "undefined") return;
  openListing(href);
}
