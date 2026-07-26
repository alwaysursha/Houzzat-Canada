"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  CompactPropertyCard,
  CompactPropertyCardSkeleton,
} from "@/components/listings/CompactPropertyCard";
import type { ListingCard as ListingCardData } from "@/lib/listings/types";
import { cn } from "@/lib/utils";

const GAP_PX = 12;
const KEYBOARD_STEP_RATIO = 0.75;

/**
 * compact-property-card rail — free horizontal scroll, swipe on touch,
 * desktop chevrons only, keyboard when rail is hovered/focused.
 */
export function CompactPropertyCardRail({
  items,
  loading = false,
  label = "Related listings",
}: {
  items: ListingCardData[];
  loading?: boolean;
  label?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [armed, setArmed] = useState(false);
  const labelId = useId();

  const syncScrollState = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft < maxScroll - 4);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    syncScrollState();
    el.addEventListener("scroll", syncScrollState, { passive: true });
    const ro = new ResizeObserver(() => syncScrollState());
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", syncScrollState);
      ro.disconnect();
    };
  }, [syncScrollState, items.length, loading]);

  const scrollByDir = useCallback((dir: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-compact-card]");
    const step = card
      ? card.offsetWidth + GAP_PX
      : el.clientWidth * KEYBOARD_STEP_RATIO;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (!armed) return;

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
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

  if (loading) {
    return (
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 3 }).map((_, i) => (
          <CompactPropertyCardSkeleton
            key={i}
            className="w-[min(340px,calc(100vw-4rem))] shrink-0 md:w-[min(340px,88vw)]"
          />
        ))}
      </div>
    );
  }

  if (items.length === 0) return null;

  const showDesktopArrows = items.length > 1;

  return (
    <div
      className="w-full min-w-0 space-y-3"
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
        {label}. Swipe freely to browse. On desktop, hover and use arrow keys,
        or the previous/next buttons.
      </p>

      <div className="relative w-full min-w-0">
        <div
          ref={scrollerRef}
          role="region"
          aria-labelledby={labelId}
          tabIndex={0}
          className={cn(
            "flex w-full min-w-0 gap-3 overflow-x-auto overscroll-x-contain pb-1",
            "scroll-smooth touch-pan-x touch-pan-y",
            "outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            "focus-visible:ring-2 focus-visible:ring-canopy/40 focus-visible:ring-offset-2 focus-visible:ring-offset-mist",
          )}
          style={{ gap: GAP_PX, WebkitOverflowScrolling: "touch" }}
        >
          {items.map((listing) => (
            <div
              key={listing.mlsNumber}
              className="w-[min(340px,calc(100vw-4rem))] shrink-0 grow-0 md:w-[min(340px,88vw)]"
            >
              <CompactPropertyCard listing={listing} />
            </div>
          ))}
        </div>

        {showDesktopArrows ? (
          <>
            <button
              type="button"
              aria-label="Previous listings"
              disabled={!canPrev}
              onClick={() => scrollByDir(-1)}
              className={cn(
                "absolute left-1 top-1/2 z-10 hidden size-9 -translate-y-1/2 items-center justify-center rounded-lg border border-line bg-surface/95 text-ink shadow-sm transition lg:flex",
                canPrev
                  ? "hover:border-canopy/40 hover:text-canopy"
                  : "cursor-not-allowed opacity-30",
              )}
            >
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Next listings"
              disabled={!canNext}
              onClick={() => scrollByDir(1)}
              className={cn(
                "absolute right-1 top-1/2 z-10 hidden size-9 -translate-y-1/2 items-center justify-center rounded-lg border border-line bg-surface/95 text-ink shadow-sm transition lg:flex",
                canNext
                  ? "hover:border-canopy/40 hover:text-canopy"
                  : "cursor-not-allowed opacity-30",
              )}
            >
              <ChevronRight className="size-5" aria-hidden />
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
