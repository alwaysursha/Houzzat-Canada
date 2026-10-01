import { mlsNumberFromListingPath } from "@/lib/listings/listing-path";
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

function sameBrowseHref(left: string, right: string) {
  if (normalizeListingSheetHref(left) === normalizeListingSheetHref(right)) {
    return true;
  }
  const a = mlsNumberFromListingPath(left);
  const b = mlsNumberFromListingPath(right);
  return Boolean(a && b && a.toUpperCase() === b.toUpperCase());
}

/** Ordered paths when `href` is one of the currently published results. */
export function browseSourceForHref(href: string): readonly string[] | null {
  if (!hrefs) return null;
  for (const candidate of hrefs) {
    if (sameBrowseHref(candidate, href)) return hrefs;
  }
  return null;
}
