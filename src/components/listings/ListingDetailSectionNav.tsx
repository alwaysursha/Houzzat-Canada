"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type ListingSectionNavItem = {
  id: string;
  label: string;
};

/** Mobile listing section-nav layout contexts. */
export type ListingSectionNavLayout = "page" | "iframe" | "panel";

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

/** Nearest overflow scroll ancestor, else window (full page / iframe). */
function getScrollRoot(from: HTMLElement | null): HTMLElement | Window {
  let node = from?.parentElement ?? null;
  while (node && node !== document.body && node !== document.documentElement) {
    const style = window.getComputedStyle(node);
    const oy = style.overflowY;
    if (
      (oy === "auto" || oy === "scroll" || oy === "overlay") &&
      node.scrollHeight > node.clientHeight + 1
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return window;
}

/**
 * Viewport Y where the section nav should pin.
 * - page: under site header
 * - panel: under sheet chrome (--listing-sheet-chrome-height)
 * - iframe: 0 (Close lives outside the iframe)
 */
function readSectionNavTopPx(layout: ListingSectionNavLayout): number {
  if (typeof window === "undefined") {
    return layout === "page" ? 64 : 0;
  }

  const probe = document.createElement("div");
  if (layout === "panel") {
    probe.style.cssText =
      "position:fixed;visibility:hidden;pointer-events:none;top:var(--listing-sheet-chrome-height, calc(6.5rem + env(safe-area-inset-top, 0px)));";
  } else if (layout === "iframe") {
    probe.style.cssText =
      "position:fixed;visibility:hidden;pointer-events:none;top:0;";
  } else {
    probe.style.cssText =
      "position:fixed;visibility:hidden;pointer-events:none;top:var(--site-header-stack,4rem);";
  }
  document.body.appendChild(probe);
  const px = Math.round(probe.getBoundingClientRect().top);
  probe.remove();
  return Number.isFinite(px) && px >= 0 ? px : layout === "page" ? 64 : 0;
}

function resolveLayout(
  sheetMode: boolean,
  layoutProp?: ListingSectionNavLayout,
): ListingSectionNavLayout {
  if (layoutProp) return layoutProp;
  if (
    isFramedDocument() ||
    document.documentElement.dataset.listingSheet === "1"
  ) {
    return "iframe";
  }
  if (sheetMode || document.querySelector('[data-listing-panel="1"]')) {
    return "panel";
  }
  return "page";
}

/**
 * Mobile-only horizontal jump links for listing detail sections.
 *
 * Layering (mobile listing):
 *   content < sticky bar (md) < section nav (z-34) < action bar (z-46)
 *   < bottom nav (z-57) < sheet chrome (z-50 inside z-200 sheet)
 *
 * Panel mode prefers `position: sticky` inside the panel scrollport (already
 * below Close). Page/iframe keep fixed pinning when stuck.
 */
export function ListingDetailSectionNav({
  items,
  sheetMode = false,
  layout: layoutProp,
}: {
  items: ListingSectionNavItem[];
  /** @deprecated Prefer `layout`. Listing overlay sheet/panel. */
  sheetMode?: boolean;
  layout?: ListingSectionNavLayout;
}) {
  const [layout, setLayout] = useState<ListingSectionNavLayout>(() =>
    resolveLayout(sheetMode, layoutProp),
  );
  const [mountedItems, setMountedItems] = useState(items);
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");
  const [stuck, setStuck] = useState(false);
  const [topOffset, setTopOffset] = useState(() =>
    readSectionNavTopPx(resolveLayout(sheetMode, layoutProp)),
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

  const useStickyPin = layout === "panel";

  useEffect(() => {
    const next = resolveLayout(sheetMode, layoutProp);
    setLayout(next);
  }, [sheetMode, layoutProp]);

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
    const sync = () => setTopOffset(readSectionNavTopPx(layout));
    sync();
    window.addEventListener("resize", sync);
    const mo = new MutationObserver(sync);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-listing-sheet", "style", "data-listing-panel"],
    });
    return () => {
      window.removeEventListener("resize", sync);
      mo.disconnect();
    };
  }, [layout]);

  // Scroll-based pin — listen on the real scroll root (panel overflow, not only window).
  useEffect(() => {
    if (useStickyPin) {
      setStuck(true);
      return;
    }

    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const scrollRoot = getScrollRoot(sentinel);

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

    const target: HTMLElement | Window = scrollRoot;
    target.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    window.visualViewport?.addEventListener("resize", onScroll);
    window.visualViewport?.addEventListener("scroll", onScroll);
    return () => {
      target.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.visualViewport?.removeEventListener("resize", onScroll);
      window.visualViewport?.removeEventListener("scroll", onScroll);
    };
  }, [topOffset, useStickyPin]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const publish = () => setNavHeight(nav.offsetHeight);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(nav);
    return () => ro.disconnect();
  }, [mountedItems.length, stuck, useStickyPin]);

  const navItems = useMemo(() => mountedItems, [mountedItems]);

  useEffect(() => {
    if (navItems.length === 0) return;

    const scrollRoot = getScrollRoot(navRef.current);

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

    scrollRoot.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      scrollRoot.removeEventListener("scroll", onScroll);
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

    const offset = topOffset + (navHeight || 48) + 8;
    const scrollRoot = getScrollRoot(navRef.current);

    if (scrollRoot === window) {
      const y =
        el.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
    } else {
      const root = scrollRoot as HTMLElement;
      const rootRect = root.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      // Panel sticky: pin under scrollport top (chrome already outside).
      const pin =
        useStickyPin
          ? (navHeight || 48) + 8
          : offset - rootRect.top;
      const nextTop = root.scrollTop + (elRect.top - rootRect.top) - pin;
      root.scrollTo({ top: Math.max(0, nextTop), behavior: "smooth" });
    }
    window.history.replaceState(null, "", `#${id}`);
  }

  const pinned = useStickyPin || stuck;

  return (
    <>
      <div ref={sentinelRef} className="h-0 w-full md:hidden" aria-hidden />
      {stuck && !useStickyPin ? (
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
          // Above listing content / sticky bar (z-30); below action bar (z-46) + sheet chrome (z-50).
          "z-[34] border-b border-line/80 bg-mist/95 backdrop-blur-md",
          "md:hidden",
          useStickyPin
            ? "sticky top-0"
            : pinned
              ? "fixed inset-x-0 left-0 right-0 mx-0"
              : "relative -mx-4 sm:-mx-6",
        )}
        style={
          !useStickyPin && pinned
            ? { top: topOffset }
            : undefined
        }
      >
        <div
          ref={scrollerRef}
          className={cn(
            "flex gap-1.5 overflow-x-auto overscroll-x-contain px-4 py-2 sm:px-6",
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
                  "inline-flex h-11 shrink-0 items-center rounded-full px-3.5 font-sans text-sm font-medium transition",
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
