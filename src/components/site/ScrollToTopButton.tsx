"use client";

import { usePathname } from "next/navigation";
import { ChevronUp } from "lucide-react";
import {
  SCROLL_FAB_FADE_TRANSITION,
  scrollFabFadeClass,
  useScrollFabVisible,
} from "@/hooks/use-scroll-fab-visible";
import { cn } from "@/lib/utils";

export function ScrollToTopButton() {
  const pathname = usePathname();
  const visible = useScrollFabVisible();
  const aboveListingBar = pathname.startsWith("/listing/");

  function scrollToTop() {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    window.scrollTo({
      top: 0,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Scroll to top"
      tabIndex={visible ? 0 : -1}
      className={cn(
        "fixed right-4 z-40 flex size-10 items-center justify-center rounded-md border border-canopy/20 bg-canopy text-white shadow-md hover:bg-canopy-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canopy/40 focus-visible:ring-offset-2 focus-visible:ring-offset-mist sm:right-6",
        SCROLL_FAB_FADE_TRANSITION,
        aboveListingBar
          ? "bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:bottom-6"
          : "bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] sm:bottom-6",
        scrollFabFadeClass(visible),
      )}
    >
      <ChevronUp className="size-5" strokeWidth={2.25} aria-hidden />
    </button>
  );
}
