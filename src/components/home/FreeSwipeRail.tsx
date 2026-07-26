"use client";

import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

const GAP_PX = 20;
const KEYBOARD_STEP_RATIO = 0.8;

/**
 * Mobile: free horizontal swipe rail with smooth scroll + arrow/Home/End keys.
 * sm+: responsive grid (unchanged desktop layout).
 */
export function FreeSwipeRail({
  children,
  label,
  className,
}: {
  children: ReactNode;
  label: string;
  className?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [armed, setArmed] = useState(false);
  const labelId = useId();
  const items = Children.toArray(children).filter(Boolean);

  const scrollByDir = useCallback((dir: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    // Only treat as a slider on mobile widths.
    if (window.matchMedia("(min-width: 640px)").matches) return;
    const card = el.querySelector<HTMLElement>("[data-free-swipe-item]");
    const step = card
      ? card.offsetWidth + GAP_PX
      : el.clientWidth * KEYBOARD_STEP_RATIO;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (!armed) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (window.matchMedia("(min-width: 640px)").matches) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        scrollByDir(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        scrollByDir(-1);
      } else if (event.key === "Home") {
        event.preventDefault();
        scrollerRef.current?.scrollTo({ left: 0, behavior: "smooth" });
      } else if (event.key === "End") {
        event.preventDefault();
        const el = scrollerRef.current;
        if (el) el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [armed, scrollByDir]);

  if (items.length === 0) return null;

  return (
    <div
      className={cn("w-full min-w-0", className)}
      onMouseEnter={() => setArmed(true)}
      onMouseLeave={() => setArmed(false)}
      onFocusCapture={() => setArmed(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setArmed(false);
        }
      }}
    >
      <p id={labelId} className="sr-only">
        {label}. On mobile, swipe freely or use arrow keys when focused.
      </p>
      <div
        ref={scrollerRef}
        role="region"
        aria-labelledby={labelId}
        tabIndex={0}
        className={cn(
          "flex w-full min-w-0 gap-5 overflow-x-auto overscroll-x-contain scroll-smooth touch-pan-x touch-pan-y pb-1",
          "outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          "focus-visible:ring-2 focus-visible:ring-canopy/40 focus-visible:ring-offset-2 focus-visible:ring-offset-mist",
          "sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 sm:outline-none sm:focus-visible:ring-0 xl:grid-cols-4",
        )}
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {items.map((child, index) => (
          <div
            key={
              isValidElement(child) && child.key != null
                ? String(child.key)
                : index
            }
            data-free-swipe-item
            className="w-[min(22.5rem,calc(100vw-1.5rem))] shrink-0 grow-0 sm:w-auto sm:min-w-0 sm:shrink"
          >
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}
