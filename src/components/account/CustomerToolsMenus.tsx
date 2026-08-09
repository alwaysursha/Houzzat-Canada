"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ListingLink } from "@/components/listings/ListingLink";
import { isListingDetailPath } from "@/lib/listings/navigate-listing";
import {
  Bell,
  Heart,
  NotebookPen,
  type LucideIcon,
} from "lucide-react";
import { formatListPrice } from "@/lib/listings/constants";
import { listingPath } from "@/lib/listings/listing-path";
import { useFlyoutFixedStyle } from "@/lib/use-flyout-fixed-style";
import { cn } from "@/lib/utils";

export type ToolsMenuItem = {
  id: string;
  href: string;
  title: string;
  subtitle?: string | null;
};

const BUTTON_CLASS =
  "inline-flex items-center gap-1.5 rounded-lg border border-canopy/30 bg-surface px-3 py-2 text-xs font-semibold text-canopy-deep transition hover:border-canopy/50 hover:bg-canopy/5";

function ToolsFlyoutMenu({
  label,
  icon: Icon,
  title,
  emptyMessage,
  manageHref,
  manageLabel,
  loadItems,
  savedTarget = false,
  reloadEvent,
}: {
  label: string;
  icon: LucideIcon;
  title: string;
  emptyMessage: string;
  manageHref: string;
  manageLabel: string;
  loadItems: () => Promise<ToolsMenuItem[]>;
  savedTarget?: boolean;
  reloadEvent?: string;
}) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [items, setItems] = useState<ToolsMenuItem[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const flyoutStyle = useFlyoutFixedStyle(menuOpen, rootRef);

  useEffect(() => {
    setMounted(true);
  }, []);

  const load = useCallback(async () => {
    try {
      const next = await loadItems();
      setItems(next);
    } catch {
      setItems([]);
    } finally {
      setLoaded(true);
    }
  }, [loadItems]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!reloadEvent) return;
    const onChange = () => void load();
    window.addEventListener(reloadEvent, onChange);
    return () => window.removeEventListener(reloadEvent, onChange);
  }, [reloadEvent, load]);

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
    void load();
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
  }, [menuOpen, load]);

  useEffect(() => () => clearCloseTimer(), []);

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
            {title}
          </p>
        </div>
        {!loaded ? (
          <p className="px-3 py-3 text-xs text-ink/50">Loading…</p>
        ) : items.length === 0 ? (
          <div className="space-y-2 px-3 py-3">
            <p className="text-xs text-ink/60">{emptyMessage}</p>
            <Link
              href={manageHref}
              role="menuitem"
              className="block text-xs font-semibold text-canopy hover:underline"
              onClick={() => setMenuOpen(false)}
            >
              {manageLabel} →
            </Link>
          </div>
        ) : (
          <ul className="max-h-64 overflow-y-auto py-1">
            {items.map((item) => {
              const ItemLink = isListingDetailPath(item.href)
                ? ListingLink
                : Link;
              return (
                <li key={item.id}>
                  <ItemLink
                    href={item.href}
                    role="menuitem"
                    className="flex w-full flex-col gap-0.5 px-3 py-2.5 text-left transition hover:bg-mist"
                    onClick={() => setMenuOpen(false)}
                  >
                    <span className="text-xs font-semibold text-ink">
                      {item.title}
                    </span>
                    {item.subtitle ? (
                      <span className="truncate text-[11px] text-ink/50">
                        {item.subtitle}
                      </span>
                    ) : null}
                  </ItemLink>
                </li>
              );
            })}
          </ul>
        )}
        {loaded && items.length > 0 ? (
          <div className="border-t border-line px-3 py-2">
            <Link
              href={manageHref}
              className="text-xs font-semibold text-canopy hover:underline"
              onClick={() => setMenuOpen(false)}
            >
              {manageLabel} →
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
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
        data-houzzat-saved-target={savedTarget ? "" : undefined}
        onClick={() => setMenuOpen((open) => !open)}
        className={BUTTON_CLASS}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
        {loaded && items.length > 0 ? (
          <span className="rounded-md bg-canopy/10 px-1.5 py-0.5 text-[10px] font-bold text-canopy">
            {items.length}
          </span>
        ) : null}
      </button>

      {mounted ? createPortal(panel, document.body) : null}
    </div>
  );
}

function formatAddress(listing: {
  addressLine: string;
  unitNumber?: string | null;
  city: string;
}) {
  const street = listing.unitNumber
    ? `${listing.unitNumber} – ${listing.addressLine}`
    : listing.addressLine;
  return `${street}, ${listing.city}`;
}

export function SavedHomesMenuButton() {
  const loadItems = useCallback(async () => {
    const res = await fetch("/api/saved-listings?enrich=1");
    if (!res.ok) return [];
    const json = (await res.json()) as {
      items?: Array<{
        mlsNumber: string;
        addressLine?: string;
        unitNumber?: string | null;
        city?: string;
        listPrice?: number;
        transactionType?: string;
      }>;
    };
    return (json.items ?? []).map((item) => ({
      id: item.mlsNumber,
      href:
        item.addressLine && item.city
          ? listingPath({
              mlsNumber: item.mlsNumber,
              addressLine: item.addressLine,
              unitNumber: item.unitNumber,
              city: item.city,
            })
          : `/listing/${item.mlsNumber}`,
      title:
        item.addressLine && item.city
          ? formatAddress({
              addressLine: item.addressLine,
              unitNumber: item.unitNumber,
              city: item.city,
            })
          : item.mlsNumber,
      subtitle:
        item.listPrice != null
          ? formatListPrice(item.listPrice, item.transactionType ?? "SALE")
          : null,
    }));
  }, []);

  return (
    <ToolsFlyoutMenu
      label="Saved Listings"
      icon={Heart}
      title="Saved listings"
      emptyMessage="No saved listings yet. Heart a listing to keep it here."
      manageHref="/account/saved"
      manageLabel="Manage saved listings"
      loadItems={loadItems}
      savedTarget
      reloadEvent="houzzat:saved-listings-changed"
    />
  );
}

export function NotesMenuButton() {
  const loadItems = useCallback(async () => {
    const res = await fetch("/api/account/notes");
    if (!res.ok) return [];
    const json = (await res.json()) as {
      items?: Array<{
        mlsNumber: string;
        body: string;
        addressLine?: string;
        unitNumber?: string | null;
        city?: string;
      }>;
    };
    return (json.items ?? []).map((item) => ({
      id: item.mlsNumber,
      href:
        item.addressLine && item.city
          ? listingPath({
              mlsNumber: item.mlsNumber,
              addressLine: item.addressLine,
              unitNumber: item.unitNumber,
              city: item.city,
            })
          : `/listing/${item.mlsNumber}`,
      title:
        item.addressLine && item.city
          ? formatAddress({
              addressLine: item.addressLine,
              unitNumber: item.unitNumber,
              city: item.city,
            })
          : item.mlsNumber,
      subtitle: item.body.trim().slice(0, 80) || null,
    }));
  }, []);

  return (
    <ToolsFlyoutMenu
      label="Notes"
      icon={NotebookPen}
      title="Your notes"
      emptyMessage="No notes yet. Open a listing to add a private note."
      manageHref="/account/notes"
      manageLabel="Manage notes"
      loadItems={loadItems}
    />
  );
}

export function WatchlistMenuButton() {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [homes, setHomes] = useState<ToolsMenuItem[]>([]);
  const [areas, setAreas] = useState<ToolsMenuItem[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const flyoutStyle = useFlyoutFixedStyle(menuOpen, rootRef);

  useEffect(() => {
    setMounted(true);
  }, []);

  const load = useCallback(async () => {
    try {
      const [homesRes, areasRes] = await Promise.all([
        fetch("/api/account/property-monitors?enrich=1"),
        fetch("/api/account/area-monitors"),
      ]);

      let nextHomes: ToolsMenuItem[] = [];
      if (homesRes.ok) {
        const json = (await homesRes.json()) as {
          items?: Array<{
            id: string;
            mlsNumber: string;
            lastKnownStatus?: string;
            addressLine?: string;
            unitNumber?: string | null;
            city?: string;
          }>;
        };
        nextHomes = (json.items ?? []).map((item) => ({
          id: item.id,
          href:
            item.addressLine && item.city
              ? listingPath({
                  mlsNumber: item.mlsNumber,
                  addressLine: item.addressLine,
                  unitNumber: item.unitNumber,
                  city: item.city,
                })
              : `/listing/${item.mlsNumber}`,
          title:
            item.addressLine && item.city
              ? formatAddress({
                  addressLine: item.addressLine,
                  unitNumber: item.unitNumber,
                  city: item.city,
                })
              : item.mlsNumber,
          subtitle: item.lastKnownStatus
            ? `Watching · ${item.lastKnownStatus}`
            : "Watching",
        }));
      }

      let nextAreas: ToolsMenuItem[] = [];
      if (areasRes.ok) {
        const json = (await areasRes.json()) as {
          items?: Array<{
            id: string;
            name: string;
            city: string;
            community: string | null;
            transactionType: string;
          }>;
        };
        nextAreas = (json.items ?? []).map((item) => ({
          id: item.id,
          href: `/account/watchlist#areas`,
          title: item.name,
          subtitle: [item.community, item.city, item.transactionType]
            .filter(Boolean)
            .join(" · "),
        }));
      }

      setHomes(nextHomes);
      setAreas(nextAreas);
    } catch {
      setHomes([]);
      setAreas([]);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
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
    void load();
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
  }, [menuOpen, load]);

  useEffect(() => () => clearCloseTimer(), []);

  const total = homes.length + areas.length;
  const empty = loaded && total === 0;

  function renderSection(
    sectionTitle: string,
    items: ToolsMenuItem[],
    emptyText: string,
  ) {
    return (
      <div>
        <div className="border-b border-line px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/45">
            {sectionTitle}
          </p>
        </div>
        {items.length === 0 ? (
          <p className="px-3 py-2.5 text-[11px] text-ink/45">{emptyText}</p>
        ) : (
          <ul className="py-1">
            {items.map((item) => {
              const ItemLink = isListingDetailPath(item.href)
                ? ListingLink
                : Link;
              return (
                <li key={item.id}>
                  <ItemLink
                    href={item.href}
                    role="menuitem"
                    className="flex w-full flex-col gap-0.5 px-3 py-2.5 text-left transition hover:bg-mist"
                    onClick={() => setMenuOpen(false)}
                  >
                    <span className="text-xs font-semibold text-ink">
                      {item.title}
                    </span>
                    {item.subtitle ? (
                      <span className="truncate text-[11px] text-ink/50">
                        {item.subtitle}
                      </span>
                    ) : null}
                  </ItemLink>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
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
      <div className="max-h-80 overflow-y-auto overflow-x-hidden rounded-xl border border-line bg-surface shadow-xl">
        {!loaded ? (
          <p className="px-3 py-3 text-xs text-ink/50">Loading…</p>
        ) : empty ? (
          <div className="space-y-2 px-3 py-3">
            <p className="text-xs text-ink/60">
              Nothing watched yet. Watch a listing or an area to get alerts here.
            </p>
            <Link
              href="/account/watchlist"
              role="menuitem"
              className="block text-xs font-semibold text-canopy hover:underline"
              onClick={() => setMenuOpen(false)}
            >
              Manage watchlist →
            </Link>
          </div>
        ) : (
          <>
            {renderSection(
              "Listings",
              homes,
              "No watched listings yet.",
            )}
            {renderSection("Areas", areas, "No watched areas yet.")}
          </>
        )}
        {loaded && !empty ? (
          <div className="border-t border-line px-3 py-2">
            <Link
              href="/account/watchlist"
              className="text-xs font-semibold text-canopy hover:underline"
              onClick={() => setMenuOpen(false)}
            >
              Manage watchlist →
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
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
        className={BUTTON_CLASS}
      >
        <Bell className="h-3.5 w-3.5" aria-hidden />
        Watchlist
        {loaded && total > 0 ? (
          <span className="rounded-md bg-canopy/10 px-1.5 py-0.5 text-[10px] font-bold text-canopy">
            {total}
          </span>
        ) : null}
      </button>

      {mounted ? createPortal(panel, document.body) : null}
    </div>
  );
}
