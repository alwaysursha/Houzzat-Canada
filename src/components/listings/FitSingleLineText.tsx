"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shrinks font-size so `children` stays on one line within the parent width.
 */
export function FitSingleLineText({
  children,
  className,
  as: Tag = "h1",
  minPx = 13,
  maxPx = 24,
}: {
  children: ReactNode;
  className?: string;
  as?: "h1" | "h2" | "p" | "span";
  minPx?: number;
  maxPx?: number;
}) {
  const ref = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    function fit() {
      if (!el) return;
      el.style.whiteSpace = "nowrap";
      el.style.fontSize = `${maxPx}px`;

      if (el.scrollWidth <= el.clientWidth + 0.5) return;

      let lo = minPx;
      let hi = maxPx;
      while (hi - lo > 0.4) {
        const mid = (lo + hi) / 2;
        el.style.fontSize = `${mid}px`;
        if (el.scrollWidth <= el.clientWidth + 0.5) lo = mid;
        else hi = mid;
      }
      el.style.fontSize = `${lo}px`;
    }

    fit();

    const ro = new ResizeObserver(() => fit());
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);

    return () => ro.disconnect();
  }, [children, minPx, maxPx]);

  return (
    <Tag
      ref={ref as never}
      className={cn("block min-w-0 max-w-full overflow-hidden", className)}
    >
      {children}
    </Tag>
  );
}
