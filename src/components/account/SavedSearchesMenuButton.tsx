"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import {
  parseHomepagePersonalizationQuery,
  summarizePersonalization,
} from "@/lib/listings/homepage-personalization";
import { cn } from "@/lib/utils";

type SavedSearchItem = {
  id: string;
  name: string;
  query: Record<string, unknown>;
  isHomepageActive?: boolean;
};

export function SavedSearchesMenuButton() {
  const router = useRouter();
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<SavedSearchItem[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, setPending] = useState<SavedSearchItem | null>(null);
  const [applying, setApplying] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const load = useCallback(async () => {
    const res = await fetch("/api/saved-searches");
    if (!res.ok) {
      setItems([]);
      return;
    }
    const json = (await res.json()) as { items?: SavedSearchItem[] };
    setItems(json.items ?? []);
  }, []);

  useEffect(() => {
    void load();
    const onChange = () => void load();
    window.addEventListener("houzzat:saved-searches-changed", onChange);
    window.addEventListener("houzzat:homepage-personalization-changed", onChange);
    return () => {
      window.removeEventListener("houzzat:saved-searches-changed", onChange);
      window.removeEventListener(
        "houzzat:homepage-personalization-changed",
        onChange,
      );
    };
  }, [load]);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!pending) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !applying) setPending(null);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [pending, applying]);

  async function applySearch(search: SavedSearchItem) {
    setApplying(true);
    const res = await fetch("/api/saved-searches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: search.id, isHomepageActive: true }),
    });
    setApplying(false);
    if (!res.ok) return;
    setPending(null);
    window.dispatchEvent(new Event("houzzat:homepage-personalization-changed"));
    window.dispatchEvent(new Event("houzzat:saved-searches-changed"));
    router.refresh();
  }

  return (
    <>
      <div
        ref={rootRef}
        className="group relative"
        onMouseEnter={() => setMenuOpen(true)}
        onMouseLeave={() => setMenuOpen(false)}
      >
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          onClick={() => setMenuOpen((open) => !open)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-canopy/30 bg-surface px-3 py-2 text-xs font-semibold text-canopy-deep transition hover:border-canopy/50 hover:bg-canopy/5"
        >
          <Search className="h-3.5 w-3.5" aria-hidden />
          Saved Search
          {items.length > 0 ? (
            <span className="rounded-md bg-canopy/10 px-1.5 py-0.5 text-[10px] font-bold text-canopy">
              {items.length}
            </span>
          ) : null}
        </button>

        <div
          id={menuId}
          role="menu"
          className={cn(
            "absolute left-0 top-full z-50 pt-1 transition",
            menuOpen
              ? "pointer-events-auto visible opacity-100"
              : "pointer-events-none invisible opacity-0",
          )}
        >
          <div className="w-64 overflow-hidden rounded-xl border border-line bg-surface shadow-xl">
            <div className="border-b border-line px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/45">
                Saved searches
              </p>
            </div>
            {items.length === 0 ? (
              <div className="space-y-2 px-3 py-3">
                <p className="text-xs text-ink/60">
                  No saved searches yet. Create one to personalize your
                  homepage.
                </p>
                <Link
                  href="/account/searches"
                  role="menuitem"
                  className="block text-xs font-semibold text-canopy hover:underline"
                  onClick={() => setMenuOpen(false)}
                >
                  Manage searches →
                </Link>
              </div>
            ) : (
              <ul className="max-h-64 overflow-y-auto py-1">
                {items.map((item) => {
                  const summary = summarizePersonalization(
                    parseHomepagePersonalizationQuery(item.query),
                  );
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        role="menuitem"
                        className="flex w-full flex-col gap-0.5 px-3 py-2.5 text-left transition hover:bg-mist"
                        onClick={() => {
                          setMenuOpen(false);
                          setPending(item);
                        }}
                      >
                        <span className="flex items-center gap-2 text-xs font-semibold text-ink">
                          {item.name}
                          {item.isHomepageActive ? (
                            <span className="rounded bg-canopy/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-canopy">
                              Active
                            </span>
                          ) : null}
                        </span>
                        {summary ? (
                          <span className="truncate text-[11px] text-ink/50">
                            {summary}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {items.length > 0 ? (
              <div className="border-t border-line px-3 py-2">
                <Link
                  href="/account/searches"
                  className="text-xs font-semibold text-canopy hover:underline"
                  onClick={() => setMenuOpen(false)}
                >
                  Manage all searches →
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {mounted && pending
        ? createPortal(
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-8">
              <button
                type="button"
                className="absolute inset-0 bg-ink/55 backdrop-blur-md"
                aria-label="Dismiss"
                disabled={applying}
                onClick={() => {
                  if (!applying) setPending(null);
                }}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="apply-saved-search-title"
                className="relative z-10 max-h-[min(90vh,40rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-surface px-6 py-8 text-center shadow-2xl sm:px-10 sm:py-10"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-canopy">
                  Apply saved search
                </p>
                <h2
                  id="apply-saved-search-title"
                  className="mt-3 font-display text-2xl leading-snug tracking-tight text-ink sm:text-3xl"
                >
                  Search Criteria saved in “{pending.name}” will be applied
                </h2>
                <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-ink/65">
                  {pending.isHomepageActive
                    ? "This search is already personalizing your homepage. You can keep it as is."
                    : "Only listings that match this search will be displayed. You can modify, switch between different saved searches, or clear it anytime by clicking Show all listings."}
                </p>
                <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    disabled={applying}
                    onClick={() => setPending(null)}
                    className="rounded-lg border border-line bg-surface px-5 py-2.5 text-sm font-semibold text-ink/70 transition hover:border-canopy/40 hover:text-canopy"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={applying}
                    onClick={() => {
                      if (pending.isHomepageActive) {
                        setPending(null);
                        return;
                      }
                      void applySearch(pending);
                    }}
                    className="rounded-lg bg-canopy px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-canopy-deep disabled:opacity-60"
                  >
                    {applying
                      ? "Applying…"
                      : pending.isHomepageActive
                        ? "Keep applied"
                        : "Yes, apply search"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
