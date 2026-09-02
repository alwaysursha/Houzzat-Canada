/**
 * Stage 5.4 — Canonical SavedListing state for native Properties.
 * UI label: Shortlist. Backend: SavedListing (user-scoped).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { mobileApiClient } from "../api/client";
import { savedListingsCache, clearShortlistListCache } from "../lib/lead-tab-cache";
import { unwrapSavedListingsBulk } from "../lib/property-response";

function cacheKeyFor(workspaceId: string | undefined): string | null {
  return workspaceId ? `${workspaceId}:saved-listings` : null;
}

export function usePropertySavedListings(workspaceId: string | undefined) {
  const key = cacheKeyFor(workspaceId);
  const cached = key ? savedListingsCache.get(key) : undefined;

  const [savedSet, setSavedSet] = useState<Set<string>>(
    () => new Set(cached?.mlsNumbers ?? []),
  );
  const [ready, setReady] = useState(Boolean(cached));
  const [pendingMls, setPendingMls] = useState<string | null>(null);
  const fetchGen = useRef(0);

  const persist = useCallback(
    (next: Set<string>) => {
      if (!key) return;
      savedListingsCache.set(key, { mlsNumbers: new Set(next), timestamp: Date.now() });
    },
    [key],
  );

  const hydrate = useCallback(async () => {
    if (!workspaceId) return;
    const gen = ++fetchGen.current;
    try {
      const res = await mobileApiClient.get<unknown>("/properties/saved");
      if (gen !== fetchGen.current) return;
      if (!res.ok) return;
      const mlsNumbers = unwrapSavedListingsBulk(res.data);
      const next = new Set(mlsNumbers);
      setSavedSet(next);
      persist(next);
    } finally {
      if (gen === fetchGen.current) setReady(true);
    }
  }, [workspaceId, persist]);

  useEffect(() => {
    if (cached) {
      setSavedSet(new Set(cached.mlsNumbers));
      setReady(true);
    }
    void hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- workspace switch
  }, [workspaceId]);

  const isSaved = useCallback(
    (mlsNumber: string) => savedSet.has(mlsNumber.trim().toUpperCase()),
    [savedSet],
  );

  const setSavedLocal = useCallback(
    (mlsNumber: string, saved: boolean) => {
      const normalized = mlsNumber.trim().toUpperCase();
      setSavedSet((prev) => {
        const next = new Set(prev);
        if (saved) next.add(normalized);
        else next.delete(normalized);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const toggleSaved = useCallback(
    async (mlsNumber: string): Promise<boolean> => {
      const normalized = mlsNumber.trim().toUpperCase();
      if (!normalized || pendingMls) return false;

      const wasSaved = savedSet.has(normalized);
      const nextSaved = !wasSaved;
      setPendingMls(normalized);
      setSavedLocal(normalized, nextSaved);

      try {
        const endpoint = `/properties/${encodeURIComponent(normalized)}/saved`;
        const res = nextSaved
          ? await mobileApiClient.post<unknown>(endpoint)
          : await mobileApiClient.delete<unknown>(endpoint);

        if (!res.ok) {
          setSavedLocal(normalized, wasSaved);
          return false;
        }
        clearShortlistListCache(workspaceId);
        return true;
      } catch {
        setSavedLocal(normalized, wasSaved);
        return false;
      } finally {
        setPendingMls(null);
      }
    },
    [savedSet, pendingMls, setSavedLocal, workspaceId],
  );

  return {
    ready,
    isSaved,
    toggleSaved,
    pendingMls,
    setSavedLocal,
  };
}
