/**
 * OpenNext on Cloudflare 500s soft RSC into `/listing/...` when the client
 * sends a full Next-Router-State-Tree. Full document loads work.
 */

import { hardGo, rememberNavBackFrom } from "@/lib/mobile/nav-back";

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

/** router.push that hard-loads listing detail URLs. */
export function pushHref(
  router: { push: (href: string) => void },
  href: string,
): void {
  if (typeof window !== "undefined" && isListingDetailPath(href)) {
    rememberNavBackFrom();
    hardGo(toAppHref(href));
    return;
  }
  router.push(href);
}

/** Hard-load a listing detail URL (no soft navigation). */
export function openListingPath(href: string): void {
  if (typeof window === "undefined") return;
  rememberNavBackFrom();
  hardGo(toAppHref(href));
}
