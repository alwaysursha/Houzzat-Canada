"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
} from "react";
import { useSession } from "next-auth/react";
import {
  abortListingGalleryFetches,
  mlsNumberFromListingHref,
} from "@/lib/listings/gallery-client";
import { isListingPanelEnabled } from "@/lib/listings/listing-panel-flag";
import { leaveListingSheetThenGo } from "@/lib/listings/navigate-listing";
import {
  LISTING_SHEET_LEAVE_MESSAGE,
  LISTING_SHEET_OPEN_MESSAGE,
  closeListingSheet,
  openListingSheet,
  subscribeListingSheet,
  type ListingSheetState,
} from "@/lib/mobile/listing-sheet-store";
import {
  ListingSheetChrome,
  listingSheetChromeHeightVar,
} from "@/components/mobile/ListingSheetChrome";
import { acquireScrollLock } from "@/lib/scroll-lock";

type PanelComponent = ComponentType<{ href: string }>;

let panelModulePromise: Promise<PanelComponent> | null = null;

function loadListingDetailPanel(): Promise<PanelComponent> {
  if (!panelModulePromise) {
    panelModulePromise = import(
      "@/components/listings/ListingDetailPanel"
    ).then((mod) => mod.ListingDetailPanel);
  }
  return panelModulePromise;
}
type SheetHistoryState = {
  houzzatListingSheet?: boolean;
};

function sheetSrc(href: string): string {
  try {
    const url = new URL(href, window.location.origin);
    url.searchParams.set("sheet", "1");
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return href.includes("?") ? `${href}&sheet=1` : `${href}?sheet=1`;
  }
}

function absoluteUrl(href: string): string {
  try {
    return new URL(href, window.location.origin).href;
  } catch {
    return href;
  }
}

/** Prefer replace so iframe loads don't push joint session-history entries. */
function navigateIframe(iframe: HTMLIFrameElement, url: string) {
  try {
    const win = iframe.contentWindow;
    if (win) {
      win.location.replace(url);
      return;
    }
  } catch {
    // fall through — cross-origin or detached
  }
  iframe.src = url;
}

/**
 * Full listing-detail overlay (same page as /listing/..., not the map card).
 * Stack of listings: Back pops one; Close / Escape dismisses the whole overlay.
 *
 * Production default: iframe of /listing/...?sheet=1.
 * Limited cohort: signed-in ADMIN/AGENT, or `?listingPanel=1`.
 * Rollback: `?listingPanel=0` forces the iframe.
 */
export function ListingSheetHost() {
  const { data: session, status } = useSession();
  const [framed, setFramed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  });
  const [state, setState] = useState<ListingSheetState>({
    href: null,
    depth: 0,
    canBack: false,
  });
  const [usePanel, setUsePanel] = useState(false);
  const [Panel, setPanel] = useState<PanelComponent | null>(null);
  const historyPushedRef = useRef(false);
  const syncingHistoryRef = useRef(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    try {
      setFramed(window.self !== window.top);
    } catch {
      setFramed(true);
    }
  }, []);

  useEffect(() => {
    if (framed) return;
    return subscribeListingSheet(setState);
  }, [framed]);

  // Re-read flag when the sheet opens (query/cookie/sessionStorage/staff).
  // Query/cookie apply immediately; staff wait until session is known.
  // Do not persist staff enablement — sign-out returns to iframe.
  useEffect(() => {
    if (!state.href) {
      setUsePanel(false);
      return;
    }
    if (isListingPanelEnabled()) {
      setUsePanel(true);
      return;
    }
    if (status === "loading") return;
    setUsePanel(isListingPanelEnabled({ role: session?.user?.role }));
  }, [state.href, status, session?.user?.role]);

  // Panel cohort only — load ListingDetailView/MapLibre after panel mode is chosen.
  useEffect(() => {
    if (!usePanel || Panel) return;
    let cancelled = false;
    void loadListingDetailPanel().then((Comp) => {
      if (!cancelled) setPanel(() => Comp);
    });
    return () => {
      cancelled = true;
    };
  }, [usePanel, Panel]);

  // Child iframe: push another listing, or leave sheet for Area/Search/etc.
  useEffect(() => {
    if (framed) return;
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data as {
        type?: string;
        href?: string;
      } | null;
      if (typeof data?.href !== "string" || !data.href) return;
      if (data.type === LISTING_SHEET_OPEN_MESSAGE) {
        openListingSheet(data.href);
        return;
      }
      if (data.type === LISTING_SHEET_LEAVE_MESSAGE) {
        leaveListingSheetThenGo(data.href);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [framed]);

  useEffect(() => {
    if (!state.href) return;
    return acquireScrollLock();
  }, [state.href]);

  // One browser-history entry while the overlay is open (Close clears it).
  // Desktop browsers share joint session history with the same-origin iframe;
  // loading/swapping listings via iframe.src can push extra entries above our
  // marker. Browser Back / trackpad swipe into that marker must NOT dismiss
  // the green Close bar — only leaving the marker should. (Capacitor mobile
  // uses the native back handler instead, which is why mobile looked fine.)
  useEffect(() => {
    if (!state.href) {
      if (historyPushedRef.current) {
        historyPushedRef.current = false;
        syncingHistoryRef.current = true;
        window.history.back();
        queueMicrotask(() => {
          syncingHistoryRef.current = false;
        });
      }
      return;
    }

    if (!historyPushedRef.current) {
      const prev = (window.history.state ?? {}) as Record<string, unknown>;
      window.history.pushState({ ...prev, houzzatListingSheet: true }, "");
      historyPushedRef.current = true;
    }

    const onPopState = (event: PopStateEvent) => {
      if (syncingHistoryRef.current) return;
      const next = event.state as SheetHistoryState | null;
      if (next?.houzzatListingSheet) {
        // Still on (or back to) our sheet history entry — keep overlay open.
        return;
      }
      historyPushedRef.current = false;
      closeListingSheet();
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [state.href]);

  useEffect(() => {
    if (!state.href) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeListingSheet();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.href]);

  const src = useMemo(
    () => (state.href && !usePanel ? sheetSrc(state.href) : null),
    [state.href, usePanel],
  );

  // Stable iframe + location.replace: avoid joint-history pushes from src=
  // assignment / key remounts (those made desktop Back dismiss the sheet).
  useLayoutEffect(() => {
    if (!src) return;
    const iframe = iframeRef.current;
    if (!iframe) return;

    navigateIframe(iframe, absoluteUrl(src));

    return () => {
      navigateIframe(iframe, "about:blank");
    };
  }, [src]);

  useEffect(() => {
    const mls = state.href ? mlsNumberFromListingHref(state.href) : null;
    abortListingGalleryFetches(mls);
  }, [state.href]);

  if (framed || !state.href) return null;
  if (!usePanel && !src) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-surface"
      role="dialog"
      aria-modal="true"
      aria-label="Listing details"
      data-listing-panel={usePanel ? "1" : undefined}
      // Panel mode shares the parent viewport (no iframe document flags):
      // - chrome-height offsets ListingStickyBar / section nav under sheet chrome
      // - site-header-stack 0 so Book a viewing / scroll-mt don't reserve
      //   a phantom site header (iframe sheet sets this on <html> instead)
      style={
        {
          "--listing-sheet-chrome-height": listingSheetChromeHeightVar(),
          "--site-header-stack": "0px",
          "--listing-viewing-sticky-gap": "0px",
        } as CSSProperties
      }
    >
      <ListingSheetChrome
        href={state.href}
        canBack={state.canBack}
        depth={state.depth}
        usePanel={usePanel}
      />
      {usePanel ? (
        Panel ? (
          <Panel key={state.href} href={state.href} />
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center bg-mist text-sm text-ink/55">
            Loading listing…
          </div>
        )
      ) : (
        <iframe
          ref={iframeRef}
          title="Listing"
          src="about:blank"
          className="min-h-0 w-full flex-1 border-0 bg-mist"
        />
      )}
    </div>
  );
}
