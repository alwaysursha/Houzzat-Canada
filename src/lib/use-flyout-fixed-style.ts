"use client";

import {
  useLayoutEffect,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";

const MENU_WIDTH = 256;
const VIEWPORT_PAD = 12;

/** Fixed coordinates so flyouts stay inside the viewport on mobile. */
export function useFlyoutFixedStyle(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  menuWidthPx = MENU_WIDTH,
): CSSProperties | undefined {
  const [style, setStyle] = useState<CSSProperties | undefined>(undefined);

  useLayoutEffect(() => {
    if (!open) {
      setStyle(undefined);
      return;
    }

    function update() {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const width = Math.min(menuWidthPx, window.innerWidth - VIEWPORT_PAD * 2);
      let left = rect.left;
      if (left + width > window.innerWidth - VIEWPORT_PAD) {
        left = rect.right - width;
      }
      left = Math.max(
        VIEWPORT_PAD,
        Math.min(left, window.innerWidth - VIEWPORT_PAD - width),
      );
      setStyle({
        position: "fixed",
        top: rect.bottom + 4,
        left,
        width,
        zIndex: 80,
      });
    }

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchorRef, menuWidthPx]);

  return style;
}
