"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Native overflow-x snap rail — vertical page scroll stays free;
 * horizontal paging is the browser's own pan-x, not JS pointer capture.
 */
export function useSnapRail(count: number) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex((i) => (count <= 0 ? 0 : Math.min(i, count - 1)));
    const el = ref.current;
    if (!el || count <= 0) return;
    const maxLeft = Math.max(count - 1, 0) * el.clientWidth;
    if (el.scrollLeft > maxLeft + 1) {
      el.scrollTo({ left: maxLeft, behavior: "auto" });
    }
  }, [count]);

  const goTo = useCallback(
    (next: number) => {
      const el = ref.current;
      if (!el || count <= 0) return;
      const clamped = ((next % count) + count) % count;
      el.scrollTo({ left: clamped * el.clientWidth, behavior: "smooth" });
      setIndex(clamped);
    },
    [count],
  );

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el || count <= 0) return;
    const width = el.clientWidth;
    if (width <= 0) return;
    const next = Math.round(el.scrollLeft / width);
    setIndex(Math.min(Math.max(next, 0), count - 1));
  }, [count]);

  return {
    ref,
    index,
    goPrev: () => goTo(index - 1),
    goNext: () => goTo(index + 1),
    goTo,
    onScroll,
  };
}

export const SNAP_RAIL_CLASS =
  "flex w-full min-w-0 max-w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-smooth [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden";

export const SNAP_SLIDE_CLASS =
  "min-w-0 shrink-0 grow-0 basis-full snap-start";
