"use client";

import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type Dispatch,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { parseSearchUrl } from "@/lib/listings/search-state/parse";
import {
  createSearchStateFromUrl,
  reduceSearch,
} from "@/lib/listings/search-state/reduce";
import { serializeSearchUrl } from "@/lib/listings/search-state/serialize";
import { decideUrlHydrate } from "@/lib/listings/search-state/url-sync";
import type { SearchAction, SearchState } from "@/lib/listings/search-state/types";

/**
 * Stage 2A controller: committed SearchState is the authority.
 *
 * Navigation contract:
 * - User commit / SET_VIEW → reducer updates → serializeSearchUrl → router.replace
 * - Browser Back/Forward → popstate → HYDRATE_FROM_URL
 * - External push (autocomplete) → searchParams change while idle → hydrate
 * - Self-written hrefs + in-flight replace intermediates are not hydrated
 *   (so a delayed searchParams update cannot overwrite newer commits).
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

  const lastWrittenHrefRef = useRef<string | null>(null);
  const expectingOwnNavigationRef = useRef(false);
  const isPopNavigationRef = useRef(false);
  /** Mobile Cards default applies at most once per mount (never after explicit view). */
  const mobileCardsDefaultDoneRef = useRef(false);

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

  // Commit / view → URL (canonical write path).
  useEffect(() => {
    if (lastWrittenHrefRef.current === null) {
      lastWrittenHrefRef.current = pageHref;
      return;
    }
    if (pageHref === lastWrittenHrefRef.current) return;
    lastWrittenHrefRef.current = pageHref;
    expectingOwnNavigationRef.current = true;
    router.replace(pageHref, { scroll: false });
  }, [pageHref, router]);

  // External URL → hydrate (Back/Forward, autocomplete push, shared links).
  useEffect(() => {
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
        return;
      default: {
        const unexpected: never = decision;
        return unexpected;
      }
    }
  }, [searchParams, pathname]);

  /**
   * Mobile Cards default after mount when `view` is omitted (fresh search).
   * One-shot per mount: must not re-run when the user later chooses Split
   * (Split used to omit `view` from the URL, which re-triggered this effect).
   * Explicit view=… in the URL skips the default. Resize alone does not re-run.
   */
  useEffect(() => {
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
  }, [searchParams]);

  return { state, dispatch };
}
