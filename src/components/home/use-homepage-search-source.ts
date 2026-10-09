"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  HOMEPAGE_SEARCH_DEFAULT_NAME,
  parseHomepagePersonalizationQuery,
} from "@/lib/listings/homepage-personalization";
import {
  committedFromActiveSearchHref,
  committedFromHomepagePersonalizationQuery,
  homepagePersonalizationQueryFromCommitted,
  homepageSearchHrefFromCommitted,
  isMeaningfulActiveSearchHref,
  type HomepageSearchSource,
} from "@/lib/listings/homepage-search-source";
import {
  ACTIVE_SEARCH_CHANGED_EVENT,
  loadActiveSearchMemory,
} from "@/lib/listings/search-state/active-search-memory";

type SavedSearchRow = {
  id: string;
  name: string;
  query: unknown;
  isHomepageActive?: boolean;
};

function sourceFromActiveMemory(): HomepageSearchSource | null {
  const memory = loadActiveSearchMemory();
  if (!memory || !isMeaningfulActiveSearchHref(memory.href)) return null;
  const committed = committedFromActiveSearchHref(memory.href);
  if (!committed) return null;
  return {
    kind: "active",
    name: HOMEPAGE_SEARCH_DEFAULT_NAME,
    committed,
    query: homepagePersonalizationQueryFromCommitted(committed),
    href: homepageSearchHrefFromCommitted(committed),
  };
}

function sourceFromPrimary(row: SavedSearchRow): HomepageSearchSource {
  const query = parseHomepagePersonalizationQuery(row.query);
  const committed = committedFromHomepagePersonalizationQuery(query);
  return {
    kind: "primary",
    searchId: row.id,
    name: row.name?.trim() || HOMEPAGE_SEARCH_DEFAULT_NAME,
    committed,
    query,
    href: homepageSearchHrefFromCommitted(committed),
  };
}

/**
 * Resolve homepage personalization: Primary Home Search, else meaningful Active Search.
 */
export function useHomepageSearchSource(): {
  source: HomepageSearchSource | null;
  primary: HomepageSearchSource | null;
  reload: () => void;
  ready: boolean;
} {
  const { status, data } = useSession();
  const role = data?.user?.role;
  const [primary, setPrimary] = useState<HomepageSearchSource | null>(null);
  const [active, setActive] = useState<HomepageSearchSource | null>(null);
  const [ready, setReady] = useState(false);

  const loadActive = useCallback(() => {
    setActive(sourceFromActiveMemory());
  }, []);

  const loadPrimary = useCallback(async () => {
    if (status !== "authenticated" || role === "ADMIN" || role === "AGENT") {
      setPrimary(null);
      return;
    }
    try {
      const res = await fetch("/api/saved-searches");
      if (!res.ok) {
        setPrimary(null);
        return;
      }
      const json = (await res.json()) as { items?: SavedSearchRow[] };
      const current =
        json.items?.find((item) => item.isHomepageActive) ?? null;
      setPrimary(current ? sourceFromPrimary(current) : null);
    } catch {
      setPrimary(null);
    }
  }, [status, role]);

  const reload = useCallback(() => {
    loadActive();
    void loadPrimary().finally(() => setReady(true));
  }, [loadActive, loadPrimary]);

  useEffect(() => {
    loadActive();
    void loadPrimary().finally(() => setReady(true));
    const onActive = () => loadActive();
    const onPrimary = () => void loadPrimary();
    window.addEventListener(ACTIVE_SEARCH_CHANGED_EVENT, onActive);
    window.addEventListener("houzzat:homepage-personalization-changed", onPrimary);
    window.addEventListener("houzzat:saved-searches-changed", onPrimary);
    window.addEventListener("storage", onActive);
    return () => {
      window.removeEventListener(ACTIVE_SEARCH_CHANGED_EVENT, onActive);
      window.removeEventListener(
        "houzzat:homepage-personalization-changed",
        onPrimary,
      );
      window.removeEventListener("houzzat:saved-searches-changed", onPrimary);
      window.removeEventListener("storage", onActive);
    };
  }, [loadActive, loadPrimary]);

  // Primary wins when explicitly configured; otherwise Active Search.
  const source = primary ?? active;

  return { source, primary, reload, ready };
}
