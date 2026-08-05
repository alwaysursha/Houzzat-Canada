"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type ListingSectionNavItem = {
  id: string;
  label: string;
};

/**
 * Mobile-only horizontal jump links for listing detail sections.
 * Sticks under the site header once it reaches the top.
 */
export function ListingDetailSectionNav({
  items,
}: {
  items: ListingSectionNavItem[];
}) {
  const [mountedItems, setMountedItems] = useState(items);
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    const present = items.filter((item) => document.getElementById(item.id));
    setMountedItems(present.length > 0 ? present : items);
  }, [items]);

  const navItems = useMemo(() => mountedItems, [mountedItems]);

  useEffect(() => {
    if (navItems.length === 0) return;

    const elements = navItems
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => Boolean(el));

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) =>
              a.boundingClientRect.top - b.boundingClientRect.top,
          );
        const top = visible[0]?.target;
        if (top?.id) setActiveId(top.id);
      },
      {
        // Account for sticky header + this nav bar.
        rootMargin: "-28% 0px -55% 0px",
        threshold: [0, 0.1, 0.25],
      },
    );

    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [navItems]);

  useEffect(() => {
    const btn = buttonRefs.current.get(activeId);
    btn?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [activeId]);

  if (navItems.length === 0) return null;

  function goToSection(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    setActiveId(id);
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.replaceState(null, "", `#${id}`);
  }

  return (
    <nav
      aria-label="Listing sections"
      className={cn(
        "sticky z-30 -mx-4 border-b border-line/80 bg-mist/95 backdrop-blur-md sm:-mx-6",
        "top-[var(--site-header-stack,4rem)] md:hidden",
      )}
    >
      <div
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
