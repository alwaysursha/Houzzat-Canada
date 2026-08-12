/**
 * Internal test flag for in-app ListingDetailPanel (Phase 3).
 * Production default: false → ListingSheetHost keeps the iframe.
 *
 * Enable (any of):
 * - `?listingPanel=1` or `?houzzat-listing-panel=1` (persists for the session)
 * - cookie `houzzat-listing-panel=1`
 * - sessionStorage `houzzat-listing-panel=1`
 *
 * Disable: `?listingPanel=0` (clears cookie + sessionStorage)
 */
export const LISTING_PANEL_FLAG_COOKIE = "houzzat-listing-panel";
export const LISTING_PANEL_FLAG_STORAGE = "houzzat-listing-panel";

function readQueryFlag(): "on" | "off" | null {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const raw =
      params.get("listingPanel") ?? params.get("houzzat-listing-panel");
    if (raw === "1" || raw === "true") return "on";
    if (raw === "0" || raw === "false") return "off";
  } catch {
    // ignore
  }
  return null;
}

function persistOn() {
  try {
    document.cookie = `${LISTING_PANEL_FLAG_COOKIE}=1; path=/; max-age=86400; SameSite=Lax`;
  } catch {
    // ignore
  }
  try {
    sessionStorage.setItem(LISTING_PANEL_FLAG_STORAGE, "1");
  } catch {
    // ignore
  }
}

function persistOff() {
  try {
    document.cookie = `${LISTING_PANEL_FLAG_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  } catch {
    // ignore
  }
  try {
    sessionStorage.removeItem(LISTING_PANEL_FLAG_STORAGE);
  } catch {
    // ignore
  }
}

function cookieEnabled(): boolean {
  if (typeof document === "undefined") return false;
  try {
    return document.cookie
      .split(";")
      .some((part) => part.trim().startsWith(`${LISTING_PANEL_FLAG_COOKIE}=1`));
  } catch {
    return false;
  }
}

function storageEnabled(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(LISTING_PANEL_FLAG_STORAGE) === "1";
  } catch {
    return false;
  }
}

/** Client-only. Production default is false (iframe sheet). */
export function isListingPanelEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const query = readQueryFlag();
  if (query === "on") {
    persistOn();
    return true;
  }
  if (query === "off") {
    persistOff();
    return false;
  }
  return storageEnabled() || cookieEnabled();
}
