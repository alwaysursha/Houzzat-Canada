"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type ListingSectionNavItem = {
  id: string;
  label: string;
};

/** Scroll a chip into the horizontal scroller without moving the page. */
function scrollChipIntoScroller(
  scroller: HTMLElement,
  chip: HTMLElement,
  behavior: ScrollBehavior = "smooth",
) {
  const scrollerRect = scroller.getBoundingClientRect();
  const chipRect = chip.getBoundingClientRect();
  const delta =
    chipRect.left -
    scrollerRect.left -
    (scrollerRect.width - chipRect.width) / 2;
  if (Math.abs(delta) < 2) return;
  scroller.scrollBy({ left: delta, behavior });
}

function isFramedDocument(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function readStickyTopPx(sheetMode: boolean): number {
  if (typeof window === "undefined") return sheetMode ? 0 : 64;
  if (
    sheetMode ||
    document.documentElement.dataset.listingSheet === "1" ||
    isFramedDocument()
  ) {
    return 0;
  }
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;visibility:hidden;pointer-events:none;top:var(--site-header-stack,4rem);";
  document.body.appendChild(probe);
  const px = Math.round(probe.getBoundingClientRect().top);
  probe.remove();
  return Number.isFinite(px) && px >= 0 ? px : 64;
}

/**
 * Mobile-only horizontal jump links for listing detail sections.
 * Pins flush to the top of the listing sheet (or under the site header on
 * full-page mobile) using fixed positioning — CSS sticky fails in the
 * Capacitor/iframe sheet because of column containing blocks.
 */
export function ListingDetailSectionNav({
  items,
  sheetMode = false,
}: {
  items: ListingSectionNavItem[];
  /** Listing overlay iframe (?sheet=1) — pin at top: 0 under Close bar. */
  sheetMode?: boolean;
}) {
  const [mountedItems, setMountedItems] = useState(items);
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");
  const [stuck, setStuck] = useState(false);
  const [topOffset, setTopOffset] = useState(() =>
    sheetMode ? 0 : 64,
  );
  const [navHeight, setNavHeight] = useState(0);
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const scrollerRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  /** Avoid centering chips on first paint (that was scrolling the page down). */
  const allowChipScrollRef = useRef(false);
  /** Ignore scroll-spy briefly after a chip tap so selection doesn't flicker mid-scroll. */
  const clickLockUntilRef = useRef(0);

  useEffect(() => {
    const present = items.filter((item) => document.getElementById(item.id));
    setMountedItems(present.length > 0 ? present : items);
  }, [items]);

  // Deferred sections (insights/amenities) mount later — re-check presence.
  useEffect(() => {
    if (typeof MutationObserver === "undefined") return;
    const root = document.getElementById("listing-about")?.parentElement;
    if (!root) return;

    const refresh = () => {
      const present = items.filter((item) => document.getElementById(item.id));
      if (present.length > 0) setMountedItems(present);
    };

    const observer = new MutationObserver(refresh);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [items]);

  useEffect(() => {
    const sync = () => setTopOffset(readStickyTopPx(sheetMode));
    sync();
    window.addEventListener("resize", sync);
    const mo = new MutationObserver(sync);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-listing-sheet", "style"],
    });
    return () => {
      window.removeEventListener("resize", sync);
      mo.disconnect();
    };
  }, [sheetMode]);

  // Scroll-based pin (more reliable than IntersectionObserver inside WebView iframes).
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const updateStuck = () => {
      const top = sentinel.getBoundingClientRect().top;
      setStuck(top <= topOffset + 1);
    };

    updateStuck();

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        updateStuck();
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    // visualViewport helps Android WebView chrome show/hide.
    window.visualViewport?.addEventListener("resize", onScroll);
    window.visualViewport?.addEventListener("scroll", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.visualViewport?.removeEventListener("resize", onScroll);
      window.visualViewport?.removeEventListener("scroll", onScroll);
    };
  }, [topOffset]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const publish = () => setNavHeight(nav.offsetHeight);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(nav);
    return () => ro.disconnect();
  }, [mountedItems.length, stuck]);

  const navItems = useMemo(() => mountedItems, [mountedItems]);

  useEffect(() => {
    if (navItems.length === 0) return;

    const activationY = () => {
      const nav = navRef.current;
      if (nav) return nav.getBoundingClientRect().bottom + 4;
      return topOffset + 48;
    };

    const updateActive = () => {
      if (Date.now() < clickLockUntilRef.current) return;

      const y = activationY();
      let current = navItems[0]?.id ?? "";

      for (const item of navItems) {
        const el = document.getElementById(item.id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= y) {
          current = item.id;
        }
      }

      if (current) {
        allowChipScrollRef.current = true;
        setActiveId((prev) => (prev === current ? prev : current));
      }
    };

    updateActive();

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        updateActive();
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [navItems, topOffset]);

  useEffect(() => {
    if (!allowChipScrollRef.current) return;
    const scroller = scrollerRef.current;
    const btn = buttonRefs.current.get(activeId);
    if (!scroller || !btn) return;
    scrollChipIntoScroller(scroller, btn);
  }, [activeId]);

  if (navItems.length === 0) return null;

  function goToSection(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    allowChipScrollRef.current = true;
    clickLockUntilRef.current = Date.now() + 700;
    setActiveId(id);
    // Offset for fixed nav so the section title isn't hidden under the chips.
    const y =
      el.getBoundingClientRect().top +
      window.scrollY -
      topOffset -
      (navHeight || 48) -
      8;
    window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
    window.history.replaceState(null, "", `#${id}`);
  }

  return (
    <>
      <div ref={sentinelRef} className="h-0 w-full md:hidden" aria-hidden />
      {stuck ? (
        <div
          className="md:hidden"
          style={{ height: navHeight || 48 }}
          aria-hidden
        />
      ) : null}
      <nav
        ref={navRef}
        aria-label="Listing sections"
        className={cn(
          "z-40 border-b border-line/80 bg-mist/95 backdrop-blur-md",
          "md:hidden",
          stuck
            ? "fixed inset-x-0 left-0 right-0 mx-0"
            : "relative -mx-4 sm:-mx-6",
        )}
        style={stuck ? { top: topOffset } : undefined}
      >
        <div
          ref={scrollerRef}
          className={cn(
            "flex gap-1.5 overflow-x-auto overscroll-x-contain px-4 py-2.5 sm:px-6",
            "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          )}
        >
          {navItems.map((item) => {
            const active = item.id === activeId;
            return (
              <button
                key={item.id}
                type="button"
                ref={(node) => {
                  if (node) buttonRefs.current.set(item.id, node);
                  else buttonRefs.current.delete(item.id);
                }}
                onClick={() => goToSection(item.id)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition",
                  active
                    ? "bg-canopy text-white shadow-sm"
                    : "bg-surface text-ink/65 ring-1 ring-line hover:bg-mist hover:text-ink",
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
