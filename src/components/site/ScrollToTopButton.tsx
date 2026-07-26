"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

const SHOW_AFTER_PX = 360;

export function ScrollToTopButton() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const aboveListingBar = pathname.startsWith("/listing/");

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > SHOW_AFTER_PX);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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
        "fixed right-4 z-40 flex size-10 items-center justify-center rounded-md border border-canopy/20 bg-canopy text-white shadow-md transition-[opacity,transform] duration-200 ease-out hover:bg-canopy-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canopy/40 focus-visible:ring-offset-2 focus-visible:ring-offset-mist sm:right-6",
        aboveListingBar
          ? "bottom-[4.75rem] md:bottom-6"
          : "bottom-5 sm:bottom-6",
        visible
          ? "pointer-events-auto translate-y-0 opacity-100"
          : "pointer-events-none translate-y-2 opacity-0",
      )}
    >
      <ChevronUp className="size-5" strokeWidth={2.25} aria-hidden />
    </button>
  );
}
