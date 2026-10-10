"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import {
  ACCOUNT_LOCAL_CLEARED_EVENT,
} from "@/lib/auth/account-local-cleanup";
import {
  applyBrowseStateToLocalCache,
  currentBrowseApplyGeneration,
  fetchBrowseState,
  putBrowseState,
  readLocalBrowseSnapshot,
} from "@/lib/listings/browse-state-client";
import { RECENT_SEARCHES_CHANGED_EVENT } from "@/lib/listings/recent-searches-local";
import { ACTIVE_SEARCH_CHANGED_EVENT } from "@/lib/listings/search-state/active-search-memory";

const FOCUS_THROTTLE_MS = 30_000;
const PUSH_DEBOUNCE_MS = 600;

/**
 * Signed-in browse-state sync:
 * - Merge guest local → account on auth
 * - Push committed Active/Recent changes (debounced)
 * - Pull on focus/visibility (throttled)
 * Never force-navigates /search.
 */
export function BrowseStateSync() {
  const { status } = useSession();
  const mergedRef = useRef(false);
  const revisionRef = useRef(0);
  const lastFocusFetchRef = useRef(0);
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightPushRef = useRef(false);
  const syncGenRef = useRef(0);
  const signedIn = status === "authenticated";

  useEffect(() => {
    if (!signedIn) {
      syncGenRef.current += 1;
      mergedRef.current = false;
      revisionRef.current = 0;
      if (pushTimerRef.current) {
        clearTimeout(pushTimerRef.current);
        pushTimerRef.current = null;
      }
      return;
    }

    let cancelled = false;
    const syncGen = syncGenRef.current;
    const applyGenAtStart = currentBrowseApplyGeneration();

    function stillValid(): boolean {
      return (
        !cancelled &&
        syncGen === syncGenRef.current &&
        applyGenAtStart === currentBrowseApplyGeneration()
      );
    }

    async function bootstrap() {
      if (mergedRef.current) return;
      const local = readLocalBrowseSnapshot();
      const result = await putBrowseState({
        activeSearchHref: local.activeSearchHref,
        activeUpdatedAt: local.activeUpdatedAt,
        recentSearches: local.recentSearches,
        merge: true,
      });
      if (!stillValid()) return;
      if (result.ok) {
        mergedRef.current = true;
        revisionRef.current = result.state.revision;
        applyBrowseStateToLocalCache(result.state);
        return;
      }
      if (result.conflict) {
        mergedRef.current = true;
        revisionRef.current = result.conflict.revision;
        applyBrowseStateToLocalCache(result.conflict);
        return;
      }
      // Fallback GET if PUT failed (e.g. table not migrated yet / transient).
      const state = await fetchBrowseState();
      if (!stillValid() || !state) return;
      mergedRef.current = true;
      revisionRef.current = state.revision;
      applyBrowseStateToLocalCache(state);
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  useEffect(() => {
    if (!signedIn) return;

    const syncGen = syncGenRef.current;

    function stillSignedInValid(applyGenAtStart: number): boolean {
      return (
        syncGen === syncGenRef.current &&
        applyGenAtStart === currentBrowseApplyGeneration()
      );
    }

    function schedulePush() {
      // After logout, mergedRef is cleared — never enqueue another push.
      if (!mergedRef.current) return;
      if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
      pushTimerRef.current = setTimeout(() => {
        void flushPush();
      }, PUSH_DEBOUNCE_MS);
    }

    async function flushPush() {
      if (inFlightPushRef.current || !mergedRef.current) return;
      const applyGenAtStart = currentBrowseApplyGeneration();
      if (!stillSignedInValid(applyGenAtStart)) return;
      inFlightPushRef.current = true;
      try {
        const local = readLocalBrowseSnapshot();
        const result = await putBrowseState({
          activeSearchHref: local.activeSearchHref,
          activeUpdatedAt: local.activeUpdatedAt,
          recentSearches: local.recentSearches,
          expectedRevision: revisionRef.current,
          merge: false,
        });
        if (!stillSignedInValid(applyGenAtStart)) return;
        if (result.ok) {
          revisionRef.current = result.state.revision;
          applyBrowseStateToLocalCache(result.state);
          return;
        }
        if (result.conflict) {
          // 409 → adopt server state, then retry once from reconciled local.
          revisionRef.current = result.conflict.revision;
          applyBrowseStateToLocalCache(result.conflict);
          if (!stillSignedInValid(applyGenAtStart)) return;
          const retryLocal = readLocalBrowseSnapshot();
          const retry = await putBrowseState({
            activeSearchHref: retryLocal.activeSearchHref,
            activeUpdatedAt: retryLocal.activeUpdatedAt,
            recentSearches: retryLocal.recentSearches,
            expectedRevision: revisionRef.current,
            merge: false,
          });
          if (!stillSignedInValid(applyGenAtStart)) return;
          if (retry.ok) {
            revisionRef.current = retry.state.revision;
            applyBrowseStateToLocalCache(retry.state);
          } else if (retry.conflict) {
            revisionRef.current = retry.conflict.revision;
            applyBrowseStateToLocalCache(retry.conflict);
          }
        }
      } finally {
        inFlightPushRef.current = false;
      }
    }

    async function pullOnFocus() {
      const now = Date.now();
      if (now - lastFocusFetchRef.current < FOCUS_THROTTLE_MS) return;
      if (document.visibilityState !== "visible") return;
      const applyGenAtStart = currentBrowseApplyGeneration();
      if (!stillSignedInValid(applyGenAtStart)) return;
      lastFocusFetchRef.current = now;
      const state = await fetchBrowseState();
      if (!stillSignedInValid(applyGenAtStart) || !state) return;
      revisionRef.current = state.revision;
      applyBrowseStateToLocalCache(state);
    }

    function onAccountLocalCleared() {
      syncGenRef.current += 1;
      mergedRef.current = false;
      revisionRef.current = 0;
      if (pushTimerRef.current) {
        clearTimeout(pushTimerRef.current);
        pushTimerRef.current = null;
      }
    }

    window.addEventListener(ACTIVE_SEARCH_CHANGED_EVENT, schedulePush);
    window.addEventListener(RECENT_SEARCHES_CHANGED_EVENT, schedulePush);
    window.addEventListener("focus", pullOnFocus);
    document.addEventListener("visibilitychange", pullOnFocus);
    window.addEventListener(ACCOUNT_LOCAL_CLEARED_EVENT, onAccountLocalCleared);

    return () => {
      if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
      window.removeEventListener(ACTIVE_SEARCH_CHANGED_EVENT, schedulePush);
      window.removeEventListener(RECENT_SEARCHES_CHANGED_EVENT, schedulePush);
      window.removeEventListener("focus", pullOnFocus);
      document.removeEventListener("visibilitychange", pullOnFocus);
      window.removeEventListener(
        ACCOUNT_LOCAL_CLEARED_EVENT,
        onAccountLocalCleared,
      );
    };
  }, [signedIn]);

  return null;
}
