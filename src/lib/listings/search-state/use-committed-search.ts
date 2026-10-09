"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { pushLocalRecentSearch } from "@/lib/listings/recent-searches-local";
import { savedSearchDisplayName } from "@/lib/listings/saved-search-query";
import { committedToSearchFilters } from "@/lib/listings/search-state/adapters";
import {
  isConsumerSearchPath,
  loadActiveSearchMemory,
  resolveActiveSearchRestoreHref,
  saveActiveSearchMemory,
  urlHasExplicitSearchCriteria,
} from "@/lib/listings/search-state/active-search-memory";
import { parseSearchUrl } from "@/lib/listings/search-state/parse";
import {
  createSearchStateFromUrl,
  reduceSearch,
} from "@/lib/listings/search-state/reduce";
import { serializeSearchUrl } from "@/lib/listings/search-state/serialize";
import { decideUrlHydrate } from "@/lib/listings/search-state/url-sync";
import type {
  CommittedSearch,
  SearchAction,
  SearchState,
} from "@/lib/listings/search-state/types";

function toSearchRelativeHref(href: string): string {
  if (href.startsWith("/search")) return href;
  try {
    const u = new URL(href, "https://houzzat.local");
    return `${u.pathname}${u.search}`;
  } catch {
    return href;
  }
}

/** Local Recent Searches only — never creates server SavedSearch rows. */
function rememberRecentCommittedSearch(
  href: string,
  committed: CommittedSearch,
) {
  const relative = toSearchRelativeHref(href);
  // Default /search or view-only must not pollute history.
  if (!urlHasExplicitSearchCriteria(relative)) return;
  const filters = committedToSearchFilters(committed);
  pushLocalRecentSearch({
    label: savedSearchDisplayName(filters, { cities: committed.cities }),
    href: relative,
  });
}

/**
 * Stage 2A controller: committed SearchState is the authority.
 *
 * Navigation contract:
 * - User commit / SET_VIEW → reducer updates → serializeSearchUrl → router.replace
 * - Browser Back/Forward → popstate → HYDRATE_FROM_URL
 * - External push (autocomplete) → searchParams change while idle → hydrate
 * - Self-written hrefs + in-flight replace intermediates are not hydrated
 *   (so a delayed searchParams update cannot overwrite newer commits).
 * - Active Search Memory restores when /search has no explicit criteria.
 *
 * Compatibility lifetime: lastWrittenHrefRef / expectingOwnNavigationRef are
 * the only adapters between Next.js searchParams and the reducer. Remove when
 * Experience no longer needs App Router URL as a secondary channel (post 2B).
 */
export function useCommittedSearch(pathname: string): {
  state: SearchState;
  dispatch: Dispatch<SearchAction>;
} {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, dispatch] = useReducer(
    reduceSearch,
    searchParams,
    (params) => createSearchStateFromUrl(params),
  );
  /** False on consumer /search until Active Search restore decides (one frame). */
  const [urlSyncReady, setUrlSyncReady] = useState(
    () => !isConsumerSearchPath(pathname),
  );

  const lastWrittenHrefRef = useRef<string | null>(null);
  const expectingOwnNavigationRef = useRef(false);
  const isPopNavigationRef = useRef(false);
  /** Mobile Cards default applies at most once per mount (never after explicit view). */
  const mobileCardsDefaultDoneRef = useRef(false);
  const skipNextPersistRef = useRef(false);
  const restoreAttemptedRef = useRef(false);

  const pageHref = useMemo(
    () => serializeSearchUrl(state.committed, { pathname }),
    [state.committed, pathname],
  );

  useEffect(() => {
    function onPopState() {
      isPopNavigationRef.current = true;
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Active Search Memory: restore before paint when the URL has no criteria.
  useLayoutEffect(() => {
    if (restoreAttemptedRef.current) return;
    restoreAttemptedRef.current = true;

    if (!isConsumerSearchPath(pathname)) {
      setUrlSyncReady(true);
      return;
    }

    if (urlHasExplicitSearchCriteria(searchParams)) {
      setUrlSyncReady(true);
      return;
    }

    const memory = loadActiveSearchMemory();
    if (!memory) {
      setUrlSyncReady(true);
      return;
    }

    const restoreHref = resolveActiveSearchRestoreHref({
      memoryHref: memory.href,
      currentParams: searchParams,
    });
    if (!restoreHref) {
      setUrlSyncReady(true);
      return;
    }

    const currentHref = serializeSearchUrl(parseSearchUrl(searchParams), {
      pathname,
    });
    if (restoreHref === currentHref) {
      setUrlSyncReady(true);
      return;
    }

    skipNextPersistRef.current = true;
    const restoreParams = new URLSearchParams(
      restoreHref.includes("?")
        ? restoreHref.slice(restoreHref.indexOf("?") + 1)
        : "",
    );
    dispatch({ type: "HYDRATE_FROM_URL", params: restoreParams });
    lastWrittenHrefRef.current = restoreHref;
    expectingOwnNavigationRef.current = true;
    if (restoreParams.get("view")) {
      mobileCardsDefaultDoneRef.current = true;
    }
    router.replace(restoreHref, { scroll: false });
    setUrlSyncReady(true);
  }, [pathname, router, searchParams]);

  // Commit / view → URL (canonical write path) + Active Search persist.
  useEffect(() => {
    if (!urlSyncReady) return;

    if (lastWrittenHrefRef.current === null) {
      lastWrittenHrefRef.current = pageHref;
      // Persist the landing/committed criteria (including first explicit URL).
      if (isConsumerSearchPath(pathname)) {
        if (skipNextPersistRef.current) {
          skipNextPersistRef.current = false;
        } else {
          const relative = toSearchRelativeHref(pageHref);
          saveActiveSearchMemory(relative);
          rememberRecentCommittedSearch(relative, state.committed);
        }
      }
      return;
    }
    // Restore already pointed lastWrittenHref at the remembered href. Consume
    // skipNextPersist here so the next deliberate commit (reset / new city)
    // still writes Active Search Memory.
    if (pageHref === lastWrittenHrefRef.current) {
      skipNextPersistRef.current = false;
      return;
    }
    lastWrittenHrefRef.current = pageHref;
    expectingOwnNavigationRef.current = true;
    router.replace(pageHref, { scroll: false });

    if (!isConsumerSearchPath(pathname)) return;
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }
    const relative = toSearchRelativeHref(pageHref);
    saveActiveSearchMemory(relative);
    rememberRecentCommittedSearch(relative, state.committed);
  }, [pageHref, router, pathname, urlSyncReady, state.committed]);

  // External URL → hydrate (Back/Forward, autocomplete push, shared links).
  useEffect(() => {
    if (!urlSyncReady) return;

    const fromUrl = serializeSearchUrl(parseSearchUrl(searchParams), {
      pathname,
    });
    const isPop = isPopNavigationRef.current;
    isPopNavigationRef.current = false;

    const decision = decideUrlHydrate({
      fromUrl,
      lastWrittenHref: lastWrittenHrefRef.current,
      expectingOwnNavigation: expectingOwnNavigationRef.current,
      isPopNavigation: isPop,
    });

    switch (decision.action) {
      case "ack-own":
        expectingOwnNavigationRef.current = false;
        return;
      case "ignore-stale":
        return;
      case "hydrate":
        expectingOwnNavigationRef.current = false;
        dispatch({ type: "HYDRATE_FROM_URL", params: searchParams });
        lastWrittenHrefRef.current = fromUrl;
        if (
          isConsumerSearchPath(pathname) &&
          urlHasExplicitSearchCriteria(searchParams)
        ) {
          const relative = toSearchRelativeHref(fromUrl);
          saveActiveSearchMemory(relative);
          rememberRecentCommittedSearch(
            relative,
            parseSearchUrl(searchParams),
          );
        }
        return;
      default: {
        const unexpected: never = decision;
        return unexpected;
      }
    }
  }, [searchParams, pathname, urlSyncReady]);

  /**
   * Mobile Cards default after mount when `view` is omitted (fresh search).
   * One-shot per mount: must not re-run when the user later chooses Split.
   * Explicit view=… in the URL skips the default. Active Search restore marks
   * the default done when memory already carried a view.
   */
  useEffect(() => {
    if (!urlSyncReady) return;
    if (mobileCardsDefaultDoneRef.current) return;
    if (searchParams.get("view")) {
      mobileCardsDefaultDoneRef.current = true;
      return;
    }
    if (!window.matchMedia("(max-width: 1023px)").matches) {
      mobileCardsDefaultDoneRef.current = true;
      return;
    }
    mobileCardsDefaultDoneRef.current = true;
    dispatch({ type: "SET_VIEW", view: "cards" });
  }, [searchParams, urlSyncReady]);

  return { state, dispatch };
}
