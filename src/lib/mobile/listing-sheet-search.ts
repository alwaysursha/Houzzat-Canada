/**
 * Listing-sheet chrome search mode — Cap Back closes search before the sheet.
 * Not route-driven; mirrors in-memory listing-sheet-store.
 */

const CLOSE_EVENT = "houzzat:listing-sheet-search-close";

let searchOpen = false;

export function isListingSheetSearchOpen(): boolean {
  return searchOpen;
}

export function setListingSheetSearchOpen(open: boolean) {
  searchOpen = open;
}

/** Ask ListingSheetChrome to collapse search (Capacitor Back). */
export function requestCloseListingSheetSearch() {
  // Clear immediately so a second Cap Back in the same frame hits the listing
  // sheet, not Search again (React setState for the flag runs in an effect).
  searchOpen = false;
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CLOSE_EVENT));
}

export function subscribeListingSheetSearchClose(
  onClose: () => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  function handler() {
    onClose();
  }
  window.addEventListener(CLOSE_EVENT, handler);
  return () => window.removeEventListener(CLOSE_EVENT, handler);
}
