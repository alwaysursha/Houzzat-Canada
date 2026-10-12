"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Bookmark, ChevronDown, Clock3, Crosshair, X } from "lucide-react";
import { SaveSearchButton } from "@/components/account/SaveSearchButton";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import { savedQueryToSearchHref } from "@/lib/agent/intent-to-search";
import { BROWSE_STATE_CHANGED_EVENT } from "@/lib/listings/browse-state-client";
import {
  readLocalRecentSearches,
  RECENT_SEARCHES_CHANGED_EVENT,
  type LocalRecentSearch,
} from "@/lib/listings/recent-searches-local";
import { savedSearchDisplayNameFromQuery } from "@/lib/listings/saved-search-query";
import { SITE_MESSAGES } from "@/lib/site-messages";
import { cn } from "@/lib/utils";

type SavedSearchItem = {
  id: string;
  name: string;
  query: Record<string, unknown>;
};

const MENU_WIDTH = 300;

function useFlyoutStyle(
  open: boolean,
  buttonRef: React.RefObject<HTMLButtonElement | null>,
): CSSProperties | null {
  const [style, setStyle] = useState<CSSProperties | null>(null);

  useEffect(() => {
    if (!open) {
      setStyle(null);
      return;
    }
    function sync() {
      const btn = buttonRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const width = Math.min(MENU_WIDTH, Math.max(240, window.innerWidth - 16));
      const left = Math.min(
        Math.max(8, rect.left),
        Math.max(8, window.innerWidth - width - 8),
      );
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const preferBelow = spaceBelow >= 220 || spaceBelow >= rect.top;
      const maxHeight = Math.min(
        360,
        preferBelow ? Math.max(180, spaceBelow) : Math.max(180, rect.top - 8),
      );
      setStyle({
        position: "fixed",
        left,
        width,
        maxHeight,
        zIndex: 80,
        ...(preferBelow
          ? { top: rect.bottom + 6 }
          : { bottom: window.innerHeight - rect.top + 6 }),
      });
    }
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
    };
  }, [open, buttonRef]);

  return style;
}

export function SearchesDropdown({
  signedIn,
  callbackPath,
  savedSearchQuery,
  className,
}: {
  signedIn: boolean;
  callbackPath: string;
  savedSearchQuery: Record<string, unknown>;
  className?: string;
}) {
  const router = useRouter();
  const { confirm, toast } = useSiteAlert();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [recent, setRecent] = useState<LocalRecentSearch[]>([]);
  const [saved, setSaved] = useState<SavedSearchItem[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const flyoutStyle = useFlyoutStyle(open, buttonRef);

  const currentLabel = useMemo(
    () => savedSearchDisplayNameFromQuery(savedSearchQuery),
    [savedSearchQuery],
  );

  const refreshRecent = useCallback(() => {
    setRecent(readLocalRecentSearches());
  }, []);

  const refreshSaved = useCallback(async () => {
    if (!signedIn) {
      setSaved([]);
      return;
    }
    setSavedLoading(true);
    try {
      const res = await fetch("/api/saved-searches");
      if (!res.ok) {
        setSaved([]);
        return;
      }
      const data = (await res.json()) as { items?: SavedSearchItem[] };
      setSaved(data.items ?? []);
    } catch {
      setSaved([]);
    } finally {
      setSavedLoading(false);
    }
  }, [signedIn]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    refreshRecent();
    void refreshSaved();
  }, [open, refreshRecent, refreshSaved]);

  useEffect(() => {
    function onChanged() {
      refreshRecent();
      void refreshSaved();
    }
    window.addEventListener("houzzat:saved-searches-changed", onChanged);
    window.addEventListener(RECENT_SEARCHES_CHANGED_EVENT, onChanged);
    window.addEventListener(BROWSE_STATE_CHANGED_EVENT, onChanged);
    window.addEventListener("storage", onChanged);
    return () => {
      window.removeEventListener("houzzat:saved-searches-changed", onChanged);
      window.removeEventListener(RECENT_SEARCHES_CHANGED_EVENT, onChanged);
      window.removeEventListener(BROWSE_STATE_CHANGED_EVENT, onChanged);
      window.removeEventListener("storage", onChanged);
    };
  }, [refreshRecent, refreshSaved]);

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      const target = event.target as Node;
      if (
        rootRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  async function removeSavedSearch(id: string) {
    const ok = await confirm({
      ...SITE_MESSAGES.deleteSavedSearch,
      destructive: true,
    });
    if (!ok) return;

    setDeletingId(id);
    try {
      const res = await fetch("/api/saved-searches", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        toast({ message: SITE_MESSAGES.genericErrorToast, tone: "error" });
        return;
      }
      setSaved((prev) => prev.filter((item) => item.id !== id));
      toast({ message: "Saved search deleted.", tone: "success" });
      window.dispatchEvent(new Event("houzzat:saved-searches-changed"));
      window.dispatchEvent(
        new Event("houzzat:homepage-personalization-changed"),
      );
    } catch {
      toast({ message: SITE_MESSAGES.genericErrorToast, tone: "error" });
    } finally {
      setDeletingId(null);
    }
  }

  const panel =
    open && flyoutStyle && mounted ? (
      <div
        ref={menuRef}
        role="dialog"
        aria-labelledby={id}
        style={flyoutStyle}
        className="flex flex-col overflow-hidden rounded-xl border border-canopy/30 bg-surface shadow-[0_12px_40px_rgba(20,32,28,0.16)]"
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
          <p className="px-2 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wider text-ink/40">
            Current Search
          </p>
          <button
            type="button"
            onClick={() => go(callbackPath)}
            className="flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-sm text-ink transition hover:bg-canopy/10"
          >
            <Crosshair
              className="mt-0.5 size-3.5 shrink-0 text-canopy"
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate font-medium">
              {currentLabel}
            </span>
          </button>

          <div className="my-2 border-t border-line/80" />

          <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-ink/40">
            Recent Searches
          </p>
          {recent.length === 0 ? (
            <p className="px-2 py-2 text-xs text-ink/45">
              No recent searches yet. Commit a search to see it here.
            </p>
          ) : (
            <ul className="space-y-0.5" aria-label="Recent searches">
              {recent.map((item) => (
                <li key={`${item.href}:${item.at}`}>
                  <button
                    type="button"
                    onClick={() => go(item.href)}
                    className="flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-sm text-ink transition hover:bg-canopy/10"
                  >
                    <Clock3
                      className="mt-0.5 size-3.5 shrink-0 text-ink/35"
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {item.label}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="my-2 border-t border-line/80" />

          <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-ink/40">
            Saved Searches
          </p>
          {!signedIn ? (
            <p className="px-2 py-2 text-xs text-ink/45">
              Sign in to see your saved searches.
            </p>
          ) : savedLoading ? (
            <p className="px-2 py-2 text-xs text-ink/45">Loading…</p>
          ) : saved.length === 0 ? (
            <p className="px-2 py-2 text-xs text-ink/45">
              No saved searches yet. Save this search to get alerts.
            </p>
          ) : (
            <ul className="space-y-0.5" aria-label="Saved searches">
              {saved.map((item) => (
                <li
                  key={item.id}
                  className="flex items-stretch gap-0.5 rounded-lg hover:bg-canopy/10"
                >
                  <button
                    type="button"
                    onClick={() => go(savedQueryToSearchHref(item.query ?? {}))}
                    className="flex min-w-0 flex-1 items-start gap-2 rounded-lg px-2 py-2 text-left text-sm text-ink transition"
                  >
                    <Bookmark
                      className="mt-0.5 size-3.5 shrink-0 text-canopy"
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {item.name}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete saved search ${item.name}`}
                    disabled={deletingId === item.id}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void removeSavedSearch(item.id);
                    }}
                    className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                  >
                    <X className="size-3.5" aria-hidden strokeWidth={2.5} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="shrink-0 border-t border-line/80 bg-mist/40 p-2">
          <SaveSearchButton
            signedIn={signedIn}
            callbackPath={callbackPath}
            query={savedSearchQuery}
            label="Save as new"
            saveAsNew
            className="h-9 w-full justify-center rounded-lg px-3"
          />
        </div>
      </div>
    ) : null;

  return (
    <div className={cn("relative shrink-0", className)} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        id={id}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Searches"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex h-9 items-center gap-1 rounded-full border-2 border-canopy bg-canopy px-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-canopy-deep sm:px-3",
          open && "bg-canopy-deep",
        )}
      >
        <Bookmark className="size-3.5 shrink-0" aria-hidden />
        Searches
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 opacity-90 transition",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {panel && createPortal(panel, document.body)}
    </div>
  );
}
