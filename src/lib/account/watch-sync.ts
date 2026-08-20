/** Cross-document sync for property/area watch mutations (parent ↔ listing iframe). */

export const PROPERTY_WATCHES_CHANGED_EVENT = "houzzat:property-watches-changed";
export const PROPERTY_WATCHES_CHANGED_MESSAGE =
  "houzzat:property-watches-changed" as const;
const PROPERTY_WATCHES_REV_KEY = "houzzat:property-watches-rev";

export const AREA_WATCHES_CHANGED_EVENT = "houzzat:area-watches-changed";
export const AREA_WATCHES_CHANGED_MESSAGE =
  "houzzat:area-watches-changed" as const;
const AREA_WATCHES_REV_KEY = "houzzat:area-watches-rev";

function broadcast(eventName: string, messageType: string, revKey: string) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new Event(eventName));

  try {
    localStorage.setItem(revKey, String(Date.now()));
  } catch {
    // private mode / quota
  }

  const payload = { type: messageType };
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

export function notifyPropertyWatchesChanged() {
  broadcast(
    PROPERTY_WATCHES_CHANGED_EVENT,
    PROPERTY_WATCHES_CHANGED_MESSAGE,
    PROPERTY_WATCHES_REV_KEY,
  );
}

export function notifyAreaWatchesChanged() {
  broadcast(
    AREA_WATCHES_CHANGED_EVENT,
    AREA_WATCHES_CHANGED_MESSAGE,
    AREA_WATCHES_REV_KEY,
  );
}

export function isPropertyWatchesChangedMessage(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    "type" in data &&
    (data as { type?: string }).type === PROPERTY_WATCHES_CHANGED_MESSAGE
  );
}

export function isAreaWatchesChangedMessage(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    "type" in data &&
    (data as { type?: string }).type === AREA_WATCHES_CHANGED_MESSAGE
  );
}

export function isPropertyWatchesRevStorageKey(key: string | null): boolean {
  return key === PROPERTY_WATCHES_REV_KEY;
}

export function isAreaWatchesRevStorageKey(key: string | null): boolean {
  return key === AREA_WATCHES_REV_KEY;
}
