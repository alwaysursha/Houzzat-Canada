"use client";

import {
  useLayoutEffect,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";

const MENU_WIDTH = 256;
const VIEWPORT_PAD = 12;
const GAP = 4;
const MIN_HEIGHT = 140;
const PREFER_BELOW_PX = 180;

export type FlyoutFixedStyleOptions = {
  /**
   * When true, sets a definite `height` equal to the computed max so flex
   * children (header / scroll body / footer) can constrain correctly.
   * Default false — preserves max-height-only behavior for other consumers.
   */
  lockHeight?: boolean;
};

export type FlyoutViewportBox = {
  width: number;
  height: number;
};

/** Pure layout helper — used by the hook and unit-tested without DOM. */
export function computeFlyoutFixedStyle(
  anchor: { top: number; bottom: number; left: number; right: number },
  viewport: FlyoutViewportBox,
  menuWidthPx = MENU_WIDTH,
  options?: FlyoutFixedStyleOptions,
): CSSProperties {
  const width = Math.min(menuWidthPx, viewport.width - VIEWPORT_PAD * 2);
  let left = anchor.left;
  if (left + width > viewport.width - VIEWPORT_PAD) {
    left = anchor.right - width;
  }
  left = Math.max(
    VIEWPORT_PAD,
    Math.min(left, viewport.width - VIEWPORT_PAD - width),
  );

  const spaceBelow = viewport.height - anchor.bottom - VIEWPORT_PAD - GAP;
  const spaceAbove = anchor.top - VIEWPORT_PAD - GAP;
  const placeBelow = spaceBelow >= PREFER_BELOW_PX || spaceBelow >= spaceAbove;
  const available = Math.max(0, placeBelow ? spaceBelow : spaceAbove);
  let maxHeight = Math.max(MIN_HEIGHT, available);
  let top = placeBelow
    ? anchor.bottom + GAP
    : Math.max(VIEWPORT_PAD, anchor.top - GAP - maxHeight);

  if (options?.lockHeight) {
    // Definite height must fit the chosen gap — never spill past the viewport
    // (short laptop screens / zoom / trigger near the bottom edge).
    maxHeight = Math.max(1, Math.min(maxHeight, available));
    top = placeBelow
      ? anchor.bottom + GAP
      : Math.max(VIEWPORT_PAD, anchor.top - GAP - maxHeight);
    const maxBottom = viewport.height - VIEWPORT_PAD;
    if (top + maxHeight > maxBottom) {
      maxHeight = Math.max(1, maxBottom - top);
    }
  }

  const style: CSSProperties = {
    position: "fixed",
    top,
    left,
    width,
    maxHeight,
    zIndex: 80,
  };
  if (options?.lockHeight) {
    style.height = maxHeight;
  }
  return style;
}

/** Fixed coordinates so flyouts stay inside the viewport on mobile. */
export function useFlyoutFixedStyle(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  menuWidthPx = MENU_WIDTH,
  options?: FlyoutFixedStyleOptions,
): CSSProperties | undefined {
  const [style, setStyle] = useState<CSSProperties | undefined>(undefined);
  const lockHeight = options?.lockHeight === true;

  useLayoutEffect(() => {
    if (!open) {
      // Clear open coordinates. Consumers that keep the portal mounted while
      // closed must also keep position:fixed (e.g. Tailwind `fixed`) — without
      // it, invisible panels re-enter document flow and grow scrollHeight.
      setStyle(undefined);
      return;
    }

    function update() {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setStyle(
        computeFlyoutFixedStyle(
          {
            top: rect.top,
            bottom: rect.bottom,
            left: rect.left,
            right: rect.right,
          },
          { width: window.innerWidth, height: window.innerHeight },
          menuWidthPx,
          { lockHeight },
        ),
      );
    }

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
    };
  }, [open, anchorRef, menuWidthPx, lockHeight]);

  return style;
}
