/**
 * OpenNext on Cloudflare 500s soft RSC into `/listing/...` when the client
 * sends a full Next-Router-State-Tree. Full document loads work on web.
 *
 * On Capacitor, open listings in an overlay sheet so Back only closes the
 * sheet — the browse page underneath never remounts.
 */

import { hardGo, rememberNavBackFrom } from "@/lib/mobile/nav-back";
import { openListingSheet } from "@/lib/mobile/listing-sheet-store";

function isNativeApp(): boolean {
  try {
    const cap = (
      window as unknown as {
        Capacitor?: { isNativePlatform?: () => boolean };
      }
    ).Capacitor;
    return cap?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

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

function openListing(href: string) {
  const path = toAppHref(href);
  if (typeof window === "undefined") return;

  if (isNativeApp()) {
    openListingSheet(path);
    return;
  }

  rememberNavBackFrom();
  hardGo(path);
}

/** router.push that hard-loads listing detail URLs (or opens the app sheet). */
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

/** Open a listing detail URL (sheet on native, document load on web). */
export function openListingPath(href: string): void {
  if (typeof window === "undefined") return;
  openListing(href);
}
