import { normalizeListingSheetHref } from "@/lib/mobile/listing-sheet-store";

/**
 * Ordered listing paths already loaded on the parent browsing surface.
 * Search publishes this. The sheet stores a snapshot at open time.
 * Paths only — never listing payloads.
 */
let hrefs: readonly string[] | null = null;

export function publishListingBrowseSource(
  next: readonly string[] | null,
): void {
  hrefs = next && next.length > 0 ? next : null;
}

/** Ordered paths when `href` is one of the currently published results. */
export function browseSourceForHref(href: string): readonly string[] | null {
  if (!hrefs) return null;
  const current = normalizeListingSheetHref(href);
  for (const candidate of hrefs) {
    if (normalizeListingSheetHref(candidate) === current) return hrefs;
  }
  return null;
}
