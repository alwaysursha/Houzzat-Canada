"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ListingAccountChromePayload } from "@/lib/listings/load-listing-account-chrome";
import type { ViewingContactDefaults } from "@/components/listings/ViewingBookingModal";

type ListingAccountChromeState = ListingAccountChromePayload & {
  /** True when ListingAccountChromeProvider is mounted. */
  active: boolean;
  /** True when guest (no fetch) or signed-in fetch finished. */
  loaded: boolean;
};

const EMPTY: ListingAccountChromeState = {
  active: false,
  loaded: false,
  saved: false,
  watching: false,
  noteBody: "",
  relatedListingsMode: "SAME_AREA",
  phone: null,
};

const ListingAccountChromeContext =
  createContext<ListingAccountChromeState>(EMPTY);

type InflightChrome = {
  promise: Promise<ListingAccountChromePayload>;
};

const inflight = new Map<string, InflightChrome>();

const EMPTY_CHROME: ListingAccountChromePayload = {
  saved: false,
  watching: false,
  noteBody: "",
  relatedListingsMode: "SAME_AREA",
  phone: null,
};

async function fetchAccountChrome(
  mlsNumber: string,
  signal?: AbortSignal,
): Promise<ListingAccountChromePayload> {
  const key = mlsNumber.trim().toUpperCase();
  if (signal?.aborted) return EMPTY_CHROME;

  const existing = inflight.get(key);
  if (existing) {
    const data = await existing.promise;
    if (signal?.aborted) return EMPTY_CHROME;
    return data;
  }

  // Do not abort this fetch when a caller unmounts (React Strict Mode and
  // ListingSheetHost remounts). Aborting the shared request left the panel
  // with empty save/watch/notes/phone chrome.
  const request = (async () => {
    try {
      const res = await fetch(
        `/api/listings/${encodeURIComponent(key)}/account-chrome`,
        { credentials: "same-origin" },
      );
      if (!res.ok) return EMPTY_CHROME;
      const data = (await res.json()) as Partial<ListingAccountChromePayload>;
      return {
        saved: Boolean(data.saved),
        watching: Boolean(data.watching),
        noteBody: typeof data.noteBody === "string" ? data.noteBody : "",
        relatedListingsMode:
          data.relatedListingsMode === "SAME_FEATURES"
            ? ("SAME_FEATURES" as const)
            : ("SAME_AREA" as const),
        phone: typeof data.phone === "string" ? data.phone : null,
      };
    } catch {
      return EMPTY_CHROME;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, { promise: request });
  const data = await request;
  if (signal?.aborted) return EMPTY_CHROME;
  return data;
}

/**
 * Loads save/watch/note/prefs/phone after paint for signed-in listing pages.
 * Guests skip the network call. VOW gating stays on SSR — this is chrome only.
 */
export function ListingAccountChromeProvider({
  mlsNumber,
  signedIn,
  children,
}: {
  mlsNumber: string;
  signedIn: boolean;
  children: ReactNode;
}) {
  const [state, setState] = useState<ListingAccountChromeState>(() => ({
    ...EMPTY,
    active: true,
    loaded: !signedIn,
  }));

  useEffect(() => {
    if (!signedIn) {
      setState({
        ...EMPTY,
        active: true,
        loaded: true,
      });
      return;
    }

    const mls = mlsNumber.trim().toUpperCase();
    if (!mls) return;

    let cancelled = false;
    const controller = new AbortController();
    setState((prev) => ({ ...prev, active: true, loaded: false }));
    void fetchAccountChrome(mls, controller.signal).then((data) => {
      if (cancelled) return;
      setState({
        active: true,
        loaded: true,
        ...data,
      });
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [mlsNumber, signedIn]);

  return (
    <ListingAccountChromeContext.Provider value={state}>
      {children}
    </ListingAccountChromeContext.Provider>
  );
}

export function useListingAccountChrome(): ListingAccountChromeState {
  return useContext(ListingAccountChromeContext);
}

/** Merge SSR session name/email with deferred phone from account chrome. */
export function useListingContactDefaults(
  base?: ViewingContactDefaults | null,
): ViewingContactDefaults | undefined {
  const chrome = useListingAccountChrome();
  return useMemo(() => {
    if (!base) return undefined;
    return {
      name: base.name,
      email: base.email,
      phone: chrome.loaded ? chrome.phone : (base.phone ?? null),
    };
  }, [base, chrome.loaded, chrome.phone]);
}
