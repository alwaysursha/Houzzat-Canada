/** Cross-document sync for Route Planner mutations (parent ↔ listing iframe). */

export const ROUTE_PLANNER_CHANGED_EVENT = "houzzat:route-planner-changed";

export const ROUTE_PLANNER_CHANGED_MESSAGE =
  "houzzat:route-planner-changed" as const;

const ROUTE_PLANNER_REV_KEY = "houzzat:route-planner-rev";

/**
 * Notify every same-origin RoutePlannerProvider to reload.
 * Covers: same window, parent sheet chrome, and listing iframe body.
 */
export function notifyRoutePlannerChanged() {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new Event(ROUTE_PLANNER_CHANGED_EVENT));

  try {
    localStorage.setItem(ROUTE_PLANNER_REV_KEY, String(Date.now()));
  } catch {
    // private mode / quota
  }

  const payload = { type: ROUTE_PLANNER_CHANGED_MESSAGE };
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

export function isRoutePlannerChangedMessage(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    "type" in data &&
    (data as { type?: string }).type === ROUTE_PLANNER_CHANGED_MESSAGE
  );
}

export function isRoutePlannerRevStorageKey(key: string | null): boolean {
  return key === ROUTE_PLANNER_REV_KEY;
}
