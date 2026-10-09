/**
 * Clear device-local customer browse caches on logout / account switch.
 * Prevents prior-account (or prior-guest) data from merging into the next session.
 *
 * Does NOT run during signup/auth resume — only explicit sign-out.
 */

import { CAPTURE_INTENT_STORAGE_KEY } from "@/lib/auth/capture-intent";
import {
  invalidateBrowseStateApplies,
} from "@/lib/listings/browse-state-client";
import {
  clearActiveSearchMemory,
} from "@/lib/listings/search-state/active-search-memory";
import { clearLocalRecentSearches } from "@/lib/listings/recent-searches-local";
import { clearLocalRecentViews } from "@/lib/recent-views-local";
import { clearLocalRoutePlanner } from "@/lib/route-planner/local";

export const ACCOUNT_LOCAL_CLEARED_EVENT = "houzzat:account-local-cleared";

/**
 * Wipe Active Search, Recent Searches, guest recent views, guest route planner,
 * and pending CaptureIntent for the current origin/tenant scope.
 */
export function clearAccountLocalBrowseCaches(): void {
  if (typeof window === "undefined") return;

  // Invalidate in-flight browse sync applies before clearing caches.
  invalidateBrowseStateApplies();

  try {
    clearActiveSearchMemory();
  } catch {
    // ignore
  }
  try {
    clearLocalRecentSearches();
  } catch {
    // ignore
  }
  try {
    clearLocalRecentViews();
  } catch {
    // ignore
  }
  try {
    clearLocalRoutePlanner();
  } catch {
    // ignore
  }
  try {
    sessionStorage.removeItem(CAPTURE_INTENT_STORAGE_KEY);
  } catch {
    // ignore
  }

  try {
    window.dispatchEvent(new Event(ACCOUNT_LOCAL_CLEARED_EVENT));
  } catch {
    // ignore
  }
}
