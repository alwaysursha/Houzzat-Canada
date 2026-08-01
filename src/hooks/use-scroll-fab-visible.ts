"use client";

import { useEffect, useState } from "react";

const SHOW_AFTER_PX = 360;

/** Shared visibility for scroll-to-top + listing notes FAB. */
export function useScrollFabVisible() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > SHOW_AFTER_PX);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return visible;
}

/** Soft fade classes shared by floating corner FABs. */
export function scrollFabFadeClass(visible: boolean) {
  return visible
    ? "pointer-events-auto translate-y-0 opacity-100"
    : "pointer-events-none translate-y-1.5 opacity-0";
}

export const SCROLL_FAB_FADE_TRANSITION =
  "transition-[opacity,transform] duration-300 ease-out";
