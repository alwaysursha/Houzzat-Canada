/**
 * Capacitor hardware Back: dismiss the mobile AddressAutocomplete search sheet
 * before listing sheet / history / app exit.
 *
 * Listing-header Search still uses {@link isListingSheetSearchOpen} (higher
 * priority) so one Back closes chrome search without also popping the listing.
 */

type Closer = () => void;

const closers = new Map<string, Closer>();
let seq = 0;

/**
 * Register an open mobile search sheet. Call the return value on close/unmount.
 */
export function registerMobileSearchSheet(close: Closer): () => void {
  const id = `mobile-search-${++seq}`;
  closers.set(id, close);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    closers.delete(id);
  };
}

export function isMobileSearchSheetOpen(): boolean {
  return closers.size > 0;
}

/** Close the most recently opened mobile search sheet. Returns true if consumed. */
export function requestCloseMobileSearchSheet(): boolean {
  if (closers.size === 0) return false;
  const entries = [...closers.entries()];
  const last = entries[entries.length - 1];
  if (!last) return false;
  const [id, close] = last;
  // Drop registration immediately so a rapid second Back does not re-close Search.
  closers.delete(id);
  try {
    close();
  } catch (error) {
    console.error("[mobile-search-sheet] close failed", error);
  }
  return true;
}

/** Test helper — not used in production paths. */
export function __resetMobileSearchSheetForTests() {
  closers.clear();
  seq = 0;
}
