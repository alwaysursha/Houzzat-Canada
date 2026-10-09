/**
 * Client helpers for account browse-state sync.
 * Local storage remains a cache; account DB is authoritative when signed in.
 */

import {
  browseStateEquals,
  canonicalizeBrowseSearchHref,
  type BrowseStatePayload,
} from "@/lib/listings/browse-state";
import { normalizeRecentSearchHref } from "@/lib/listings/recent-searches-local";
import {
  readLocalRecentSearches,
  writeLocalRecentSearches,
} from "@/lib/listings/recent-searches-local";
import {
  loadActiveSearchMemory,
  saveActiveSearchMemory,
  clearActiveSearchMemory,
} from "@/lib/listings/search-state/active-search-memory";

export const BROWSE_STATE_CHANGED_EVENT = "houzzat:browse-state-changed";

/**
 * Generation token bumped on logout / account switch so in-flight sync
 * responses cannot repopulate caches after clearAccountLocalBrowseCaches.
 */
let browseApplyGeneration = 0;

export function invalidateBrowseStateApplies(): void {
  browseApplyGeneration += 1;
}

export function currentBrowseApplyGeneration(): number {
  return browseApplyGeneration;
}

export function readLocalBrowseSnapshot(): {
  activeSearchHref: string | null;
  activeUpdatedAt: number | null;
  recentSearches: BrowseStatePayload["recentSearches"];
} {
  const memory = loadActiveSearchMemory();
  const activeSearchHref = canonicalizeBrowseSearchHref(memory?.href ?? null);
  return {
    activeSearchHref,
    activeUpdatedAt: memory?.updatedAt ?? null,
    recentSearches: readLocalRecentSearches().map((row) => ({
      label: row.label,
      href: row.href,
      at: row.at,
    })),
  };
}

/**
 * Apply account state into local cache without navigating.
 * Updates Active Search Memory + Recent Searches only.
 * No-ops when already equal to avoid event feedback loops.
 * Aborts if invalidateBrowseStateApplies() ran since this call started.
 */
export function applyBrowseStateToLocalCache(state: BrowseStatePayload): void {
  const gen = browseApplyGeneration;
  const local = readLocalBrowseSnapshot();
  if (
    browseStateEquals(local, state) &&
    (local.activeUpdatedAt ?? 0) === (state.activeUpdatedAt ?? 0)
  ) {
    return;
  }

  if (gen !== browseApplyGeneration) return;

  const href = canonicalizeBrowseSearchHref(state.activeSearchHref);
  const localHref = canonicalizeBrowseSearchHref(local.activeSearchHref);
  if (href) {
    if (
      href !== localHref ||
      (local.activeUpdatedAt ?? 0) !== (state.activeUpdatedAt ?? 0)
    ) {
      saveActiveSearchMemory(href, {
        now: state.activeUpdatedAt ?? Date.now(),
      });
    }
  } else if (localHref) {
    clearActiveSearchMemory();
  }

  if (gen !== browseApplyGeneration) return;

  const localRecentKey = local.recentSearches
    .map((r) => `${normalizeRecentSearchHref(r.href)}:${r.at}`)
    .join("|");
  const nextRecentKey = state.recentSearches
    .map((r) => `${normalizeRecentSearchHref(r.href)}:${r.at}`)
    .join("|");
  if (localRecentKey !== nextRecentKey) {
    writeLocalRecentSearches(
      state.recentSearches.map((row) => ({
        label: row.label,
        href: row.href,
        at: row.at,
      })),
    );
  }

  if (gen !== browseApplyGeneration) return;

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(BROWSE_STATE_CHANGED_EVENT, { detail: state }),
    );
  }
}

export async function fetchBrowseState(): Promise<BrowseStatePayload | null> {
  const res = await fetch("/api/account/browse-state", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403 || res.status === 503) {
    return null;
  }
  if (!res.ok) return null;
  const data = (await res.json()) as { state?: BrowseStatePayload };
  return data.state ?? null;
}

export async function putBrowseState(input: {
  activeSearchHref?: string | null;
  activeUpdatedAt?: number | null;
  recentSearches?: BrowseStatePayload["recentSearches"];
  expectedRevision?: number;
  merge?: boolean;
}): Promise<
  | { ok: true; state: BrowseStatePayload; wrote: boolean }
  | { ok: false; conflict?: BrowseStatePayload; status: number }
> {
  const res = await fetch("/api/account/browse-state", {
    method: "PUT",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (res.status === 409) {
    const data = (await res.json()) as { state?: BrowseStatePayload };
    return { ok: false, conflict: data.state, status: 409 };
  }
  if (!res.ok) return { ok: false, status: res.status };
  const data = (await res.json()) as {
    state: BrowseStatePayload;
    wrote?: boolean;
  };
  return { ok: true, state: data.state, wrote: Boolean(data.wrote) };
}
