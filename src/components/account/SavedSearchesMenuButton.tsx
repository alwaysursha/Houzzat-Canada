"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import { PersonalizeHomepageModal } from "@/components/home/PersonalizeHomepageModal";
import { parseHomepagePersonalizationQuery } from "@/lib/listings/homepage-personalization";
import { useFlyoutFixedStyle } from "@/lib/use-flyout-fixed-style";
import { SITE_MESSAGES } from "@/lib/site-messages";
import { cn } from "@/lib/utils";

type SavedSearchItem = {
  id: string;
  name: string;
  query: Record<string, unknown>;
  isHomepageActive?: boolean;
};

export function SavedSearchesMenuButton({
  cities = [],
}: {
  cities?: string[];
}) {
  const router = useRouter();
  const { confirm, alert, toast } = useSiteAlert();
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [items, setItems] = useState<SavedSearchItem[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [editSearch, setEditSearch] = useState<SavedSearchItem | null>(null);
  const flyoutStyle = useFlyoutFixedStyle(menuOpen, rootRef);

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

  function clearCloseTimer() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function openMenu() {
    clearCloseTimer();
    setMenuOpen(true);
  }

  function scheduleClose() {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setMenuOpen(false), 120);
  }

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        rootRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setMenuOpen(false);
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

  useEffect(() => () => clearCloseTimer(), []);

  async function requestApply(search: SavedSearchItem) {
    setMenuOpen(false);
    if (search.isHomepageActive) {
      await alert({
        title: "Already applied",
        message: `“${search.name}” is already personalizing your homepage.`,
        confirmLabel: "Got it",
      });
      return;
    }

    const ok = await confirm({
      title: "Apply saved search?",
      message: `Search criteria saved in “${search.name}” will be applied. Only matching listings will show on your homepage. You can switch or clear this anytime with Show all listings.`,
      confirmLabel: "Yes, apply search",
      cancelLabel: "Cancel",
    });
    if (!ok) return;

    const res = await fetch("/api/saved-searches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: search.id, isHomepageActive: true }),
    });
    if (!res.ok) {
      toast({ message: SITE_MESSAGES.genericErrorToast, tone: "error" });
      return;
    }
    toast({ message: `“${search.name}” applied to your homepage.`, tone: "success" });
    window.dispatchEvent(new Event("houzzat:homepage-personalization-changed"));
    window.dispatchEvent(new Event("houzzat:saved-searches-changed"));
    router.refresh();
  }

  const panel = (
    <div
      ref={menuRef}
      id={menuId}
      role="menu"
      style={flyoutStyle}
      onMouseEnter={openMenu}
      onMouseLeave={scheduleClose}
      className={cn(
        "transition",
        menuOpen && flyoutStyle
          ? "pointer-events-auto visible opacity-100"
          : "pointer-events-none invisible opacity-0",
      )}
    >
      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-xl">
        <div className="border-b border-line px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/45">
            Saved searches
          </p>
        </div>
        {items.length === 0 ? (
          <div className="space-y-2 px-3 py-3">
            <p className="text-xs text-ink/60">
              No saved searches yet. Create one to personalize your homepage.
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
            {items.map((item) => (
              <li key={item.id} className="px-3 py-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-ink">
                  {item.name}
                  {item.isHomepageActive ? (
                    <span className="rounded bg-canopy/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-canopy">
                      Active
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <button
                    type="button"
                    role="menuitem"
                    className="text-[11px] font-semibold text-canopy hover:underline"
                    onClick={() => {
                      setMenuOpen(false);
                      setEditSearch(item);
                    }}
                  >
                    Modify Search
                  </button>
                  <span
                    aria-hidden
                    className="h-3 w-px shrink-0 bg-ink/20"
                  />
                  <button
                    type="button"
                    role="menuitem"
                    className="text-[11px] font-semibold text-canopy hover:underline"
                    onClick={() => void requestApply(item)}
                  >
                    Apply this search
                  </button>
                </div>
              </li>
            ))}
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
  );

  return (
    <>
      <div
        ref={rootRef}
        className="group relative"
        onMouseEnter={openMenu}
        onMouseLeave={scheduleClose}
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

        {mounted ? createPortal(panel, document.body) : null}
      </div>

      <PersonalizeHomepageModal
        open={Boolean(editSearch)}
        onClose={() => setEditSearch(null)}
        cities={cities}
        searchId={editSearch?.id}
        initial={
          editSearch
            ? {
                name: editSearch.name,
                ...parseHomepagePersonalizationQuery(editSearch.query),
              }
            : undefined
        }
      />
    </>
  );
}
