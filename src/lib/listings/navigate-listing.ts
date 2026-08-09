/**
 * OpenNext on Cloudflare currently 500s soft RSC transitions into
 * `/listing/[...parts]` when the client sends a full Next-Router-State-Tree
 * (home/search → listing). Full document loads work.
 *
 * Use these helpers for listing detail navigation until that is fixed upstream.
 */

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

/** router.push that hard-loads listing detail URLs. */
export function pushHref(
  router: { push: (href: string) => void },
  href: string,
): void {
  if (typeof window !== "undefined" && isListingDetailPath(href)) {
    window.location.assign(href);
    return;
  }
  router.push(href);
}

/** Hard-load a listing detail URL (no soft navigation). */
export function openListingPath(href: string): void {
  if (typeof window === "undefined") return;
  window.location.assign(href);
}
