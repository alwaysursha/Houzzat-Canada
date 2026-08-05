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

/**
 * Mobile-only horizontal jump links for listing detail sections.
 * Sticks under the site header once it reaches the top.
 *
 * Active chip = last section whose top has crossed the sticky nav bottom
 * (stays selected until the next section reaches that line).
 */
export function ListingDetailSectionNav({
  items,
}: {
  items: ListingSectionNavItem[];
}) {
  const [mountedItems, setMountedItems] = useState(items);
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const scrollerRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
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

  const navItems = useMemo(() => mountedItems, [mountedItems]);

  useEffect(() => {
    if (navItems.length === 0) return;

    const activationY = () => {
      const nav = navRef.current;
      if (nav) return nav.getBoundingClientRect().bottom + 4;
      return 96;
    };

    const updateActive = () => {
      if (Date.now() < clickLockUntilRef.current) return;

      const y = activationY();
      let current = navItems[0]?.id ?? "";

      for (const item of navItems) {
        const el = document.getElementById(item.id);
        if (!el) continue;
        // Section has reached / passed the sticky line → it becomes active.
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
  }, [navItems]);

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
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.replaceState(null, "", `#${id}`);
  }

  return (
    <nav
      ref={navRef}
      aria-label="Listing sections"
      className={cn(
        "sticky z-30 -mx-4 border-b border-line/80 bg-mist/95 backdrop-blur-md sm:-mx-6",
        "top-[var(--site-header-stack,4rem)] md:hidden",
      )}
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
  );
}
