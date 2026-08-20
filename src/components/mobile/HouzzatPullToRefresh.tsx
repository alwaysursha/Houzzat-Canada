"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { Loader2 } from "lucide-react";
import { isListingSheetOpen } from "@/lib/mobile/listing-sheet-store";
import { cn } from "@/lib/utils";

/** Commit refresh only after a deliberate downward pull. */
const PULL_THRESHOLD_PX = 118;
/** Visual rubber-band ceiling (page can travel farther than before). */
const MAX_PULL_PX = 176;
const HOLD_PULL_PX = 72;
/** Ignore tiny jitters before direction lock. */
const DIRECTION_LOCK_PX = 14;
/** Vertical must clearly dominate horizontal (≈ ~34° from vertical). */
const VERTICAL_DOMINANCE = 1.75;
const LAST_REFRESH_KEY = "houzzat:last-refresh";

function formatLastRefresh(iso: string | null): string {
  if (!iso) return "Pull to refresh";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Pull to refresh";
  try {
    return `Updated ${date.toLocaleString("en-CA", {
      hour: "numeric",
      minute: "2-digit",
    })}`;
  } catch {
    return "Pull to refresh";
  }
}

function isConsumerHome(pathname: string) {
  return pathname === "/";
}

function isHorizontalGestureTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (
    target.closest(
      "input, textarea, select, [data-no-ptr], [data-snap-rail], [data-horizontal-scroll]",
    )
  ) {
    return true;
  }
  let node: Element | null = target;
  while (node && node !== document.documentElement) {
    if (node instanceof HTMLElement) {
      const style = window.getComputedStyle(node);
      const ox = style.overflowX;
      if (
        (ox === "auto" || ox === "scroll" || ox === "overlay") &&
        node.scrollWidth > node.clientWidth + 8
      ) {
        return true;
      }
    }
    node = node.parentElement;
  }
  return false;
}

/**
 * Native Houzzat consumer pull-to-refresh — Home only.
 * Indicator sits below the status-bar brand strip.
 */
export function HouzzatPullToRefresh({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const [native, setNative] = useState(false);
  const enabled = native && isConsumerHome(pathname);

  const rootRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startYRef = useRef<number | null>(null);
  /** null = undecided, true = vertical PTR, false = hand off to scroll/horizontal */
  const axisLockedRef = useRef<boolean | null>(null);
  const pullingRef = useRef(false);
  const armedHapticRef = useRef(false);
  const scrollParentRef = useRef<HTMLElement | null>(null);
  const pullPxRef = useRef(0);
  const refreshingRef = useRef(false);

  const [pullPx, setPullPx] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);

  useEffect(() => {
    setNative(Capacitor.isNativePlatform());
  }, []);

  useEffect(() => {
    try {
      setLastRefresh(localStorage.getItem(LAST_REFRESH_KEY));
    } catch {
      setLastRefresh(null);
    }
  }, []);

  const findScrollParent = useCallback((el: EventTarget | null) => {
    let node = el instanceof HTMLElement ? el : null;
    while (node) {
      const overflowY = window.getComputedStyle(node).overflowY;
      if (
        (overflowY === "auto" ||
          overflowY === "scroll" ||
          overflowY === "overlay") &&
        node.scrollHeight > node.clientHeight + 1
      ) {
        return node;
      }
      node = node.parentElement;
    }
    return (
      (document.scrollingElement as HTMLElement | null) ??
      document.documentElement
    );
  }, []);

  const setPull = useCallback((px: number) => {
    pullPxRef.current = px;
    setPullPx(px);
  }, []);

  const resetGesture = useCallback(() => {
    startYRef.current = null;
    axisLockedRef.current = null;
    pullingRef.current = false;
    armedHapticRef.current = false;
    setPull(0);
  }, [setPull]);

  useEffect(() => {
    if (!enabled) return;
    const root = rootRef.current;
    if (!root) return;

    const onStart = (event: TouchEvent) => {
      if (refreshingRef.current) return;
      if (isListingSheetOpen()) return;
      const touch = event.touches[0];
      if (!touch) return;
      const target = event.target;
      if (isHorizontalGestureTarget(target)) {
        resetGesture();
        return;
      }
      const parent = findScrollParent(target);
      scrollParentRef.current = parent;
      if (parent.scrollTop > 2) {
        resetGesture();
        return;
      }
      startXRef.current = touch.clientX;
      startYRef.current = touch.clientY;
      axisLockedRef.current = null;
      pullingRef.current = true;
      armedHapticRef.current = false;
    };

    const onMove = (event: TouchEvent) => {
      if (!pullingRef.current || startYRef.current == null || refreshingRef.current) {
        return;
      }
      const touch = event.touches[0];
      if (!touch) return;
      const parent = scrollParentRef.current;
      if (parent && parent.scrollTop > 2) {
        resetGesture();
        return;
      }

      const deltaX = touch.clientX - startXRef.current;
      const deltaY = touch.clientY - startYRef.current;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (axisLockedRef.current === null) {
        if (absX < DIRECTION_LOCK_PX && absY < DIRECTION_LOCK_PX) {
          return;
        }
        // Horizontal or diagonal → abandon PTR (do not preventDefault).
        if (absY <= absX * VERTICAL_DOMINANCE || deltaY <= 0) {
          axisLockedRef.current = false;
          pullingRef.current = false;
          setPull(0);
          return;
        }
        axisLockedRef.current = true;
      }

      if (axisLockedRef.current !== true) {
        return;
      }

      if (deltaY <= 0) {
        setPull(0);
        return;
      }

      event.preventDefault();
      // Ease-out rubber band — longer travel before commit.
      const t = Math.min(1, deltaY / (MAX_PULL_PX * 2.35));
      const damped = MAX_PULL_PX * (1 - Math.pow(1 - t, 2.35));
      setPull(damped);
      if (damped >= PULL_THRESHOLD_PX && !armedHapticRef.current) {
        armedHapticRef.current = true;
        try {
          navigator.vibrate?.(14);
        } catch {
          // ignore
        }
      }
    };

    const finish = async () => {
      refreshingRef.current = true;
      setRefreshing(true);
      setPull(HOLD_PULL_PX);
      try {
        router.refresh();
        await new Promise((r) => window.setTimeout(r, 480));
        const iso = new Date().toISOString();
        try {
          localStorage.setItem(LAST_REFRESH_KEY, iso);
        } catch {
          // ignore
        }
        setLastRefresh(iso);
      } finally {
        refreshingRef.current = false;
        setRefreshing(false);
        resetGesture();
      }
    };

    const onEnd = () => {
      if (!pullingRef.current && axisLockedRef.current !== true) {
        resetGesture();
        return;
      }
      if (refreshingRef.current) return;
      if (
        axisLockedRef.current === true &&
        pullPxRef.current >= PULL_THRESHOLD_PX
      ) {
        void finish();
        return;
      }
      resetGesture();
    };

    root.addEventListener("touchstart", onStart, { passive: true });
    root.addEventListener("touchmove", onMove, { passive: false });
    root.addEventListener("touchend", onEnd);
    root.addEventListener("touchcancel", onEnd);
    return () => {
      root.removeEventListener("touchstart", onStart);
      root.removeEventListener("touchmove", onMove);
      root.removeEventListener("touchend", onEnd);
      root.removeEventListener("touchcancel", onEnd);
    };
  }, [enabled, findScrollParent, resetGesture, router, setPull]);

  if (!enabled) return children;

  const visible = pullPx > 10 || refreshing;
  const progress = Math.min(1, pullPx / PULL_THRESHOLD_PX);
  const armed = progress >= 1 || refreshing;
  const contentShift = Math.min(pullPx, HOLD_PULL_PX + 12);

  return (
    <div ref={rootRef} className="relative min-w-0">
      <div
        className={cn(
          "pointer-events-none fixed inset-x-0 z-[80] flex justify-center",
          "transition-[opacity,transform] duration-200 ease-out",
          visible
            ? "translate-y-0 opacity-100"
            : "-translate-y-2 opacity-0",
        )}
        style={{
          top: "calc(env(safe-area-inset-top, 0px) + 10px)",
        }}
        aria-live="polite"
        aria-busy={refreshing}
      >
        <div
          className={cn(
            "flex items-center gap-2 rounded-full border px-3.5 py-2 shadow-[0_8px_24px_rgb(10_47_36/0.18)] backdrop-blur-md",
            "transition-[background-color,border-color,box-shadow] duration-200 ease-out",
            armed
              ? "border-canopy/35 bg-white text-canopy shadow-[0_10px_28px_rgb(26_123_89/0.22)]"
              : "border-white/70 bg-white/95 text-ink/70",
          )}
          style={{
            transform: `scale(${0.92 + progress * 0.08})`,
          }}
        >
          {refreshing ? (
            <Loader2
              className="size-4 shrink-0 animate-spin text-canopy"
              strokeWidth={2.4}
              aria-hidden
            />
          ) : (
            <span
              className="relative grid size-4 shrink-0 place-items-center"
              aria-hidden
            >
              <span className="absolute inset-0 rounded-full border-2 border-canopy/20" />
              <span
                className="absolute inset-0 rounded-full border-2 border-transparent border-t-canopy transition-[transform,opacity] duration-100"
                style={{
                  transform: `rotate(${progress * 360}deg)`,
                  opacity: 0.45 + progress * 0.55,
                }}
              />
              <span
                className="size-1.5 rounded-full bg-canopy transition-opacity duration-100"
                style={{ opacity: 0.35 + progress * 0.65 }}
              />
            </span>
          )}
          <span className="text-[12px] font-semibold tracking-wide">
            {refreshing
              ? "Refreshing…"
              : armed
                ? "Release to refresh"
                : formatLastRefresh(lastRefresh)}
          </span>
        </div>
      </div>

      <div
        style={{
          transform:
            contentShift > 0 ? `translate3d(0, ${contentShift}px, 0)` : undefined,
          transition:
            pullingRef.current && !refreshing
              ? undefined
              : "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)",
          willChange: contentShift > 0 ? "transform" : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}
