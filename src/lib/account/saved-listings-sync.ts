/** Cross-document sync for saved-listing mutations (parent ↔ listing iframe). */

export const SAVED_LISTINGS_CHANGED_EVENT = "houzzat:saved-listings-changed";

export const SAVED_LISTINGS_CHANGED_MESSAGE =
  "houzzat:saved-listings-changed" as const;

const SAVED_LISTINGS_REV_KEY = "houzzat:saved-listings-rev";

/**
 * Notify every same-origin SavedListingsProvider to reload from the API.
 * Covers: same window, parent sheet chrome, and listing iframe body.
 */
export function notifySavedListingsChanged() {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new Event(SAVED_LISTINGS_CHANGED_EVENT));

  try {
    localStorage.setItem(SAVED_LISTINGS_REV_KEY, String(Date.now()));
  } catch {
    // private mode / quota
  }

  const payload = { type: SAVED_LISTINGS_CHANGED_MESSAGE };
  const origin = window.location.origin;

  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(payload, origin);
    }
  } catch {
    // cross-origin parent
  }

  try {
    for (const frame of document.querySelectorAll("iframe")) {
      frame.contentWindow?.postMessage(payload, origin);
    }
  } catch {
    // detached / cross-origin frame
  }
}

export function isSavedListingsChangedMessage(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    "type" in data &&
    (data as { type?: string }).type === SAVED_LISTINGS_CHANGED_MESSAGE
  );
}

export function isSavedListingsRevStorageKey(key: string | null): boolean {
  return key === SAVED_LISTINGS_REV_KEY;
}
