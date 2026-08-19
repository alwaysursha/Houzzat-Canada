"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { isListingSheetOpen } from "@/lib/mobile/listing-sheet-store";
import { cn } from "@/lib/utils";

const PULL_THRESHOLD_PX = 70;
const MAX_PULL_PX = 108;
const LAST_REFRESH_KEY = "houzzat:last-refresh";
const RING = 2 * Math.PI * 13;

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

function isStaffPath(pathname: string) {
  return (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/agent") ||
    pathname.startsWith("/pro")
  );
}

/**
 * Native Houzzat consumer pull-to-refresh.
 * Lightweight rubber-band + canopy progress ring; skips CRM/Pro shells.
 */
export function HouzzatPullToRefresh({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const [native, setNative] = useState(false);
  const enabled = native && !isStaffPath(pathname);

  const rootRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef<number | null>(null);
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
      if (
        target instanceof Element &&
        (target.closest("input, textarea, select, [data-no-ptr]") ||
          target.closest("[data-snap-rail]"))
      ) {
        pullingRef.current = false;
        startYRef.current = null;
        return;
      }
      const parent = findScrollParent(target);
      scrollParentRef.current = parent;
      if (parent.scrollTop > 2) {
        pullingRef.current = false;
        startYRef.current = null;
        return;
      }
      startYRef.current = touch.clientY;
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
        pullingRef.current = false;
        startYRef.current = null;
        setPull(0);
        return;
      }
      const delta = touch.clientY - startYRef.current;
      if (delta <= 0) {
        setPull(0);
        return;
      }
      event.preventDefault();
      const damped = Math.min(MAX_PULL_PX, delta * 0.48);
      setPull(damped);
      if (damped >= PULL_THRESHOLD_PX && !armedHapticRef.current) {
        armedHapticRef.current = true;
        try {
          navigator.vibrate?.(12);
        } catch {
          // ignore
        }
      }
    };

    const finish = async () => {
      refreshingRef.current = true;
      setRefreshing(true);
      setPull(Math.round(PULL_THRESHOLD_PX * 0.72));
      try {
        router.refresh();
        await new Promise((r) => window.setTimeout(r, 420));
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
        setPull(0);
        startYRef.current = null;
        pullingRef.current = false;
      }
    };

    const onEnd = () => {
      if (!pullingRef.current) return;
      if (refreshingRef.current) return;
      if (pullPxRef.current >= PULL_THRESHOLD_PX) {
        void finish();
        return;
      }
      setPull(0);
      startYRef.current = null;
      pullingRef.current = false;
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
  }, [enabled, findScrollParent, router, setPull]);

  if (!enabled) return children;

  const visible = pullPx > 6 || refreshing;
  const progress = Math.min(1, pullPx / PULL_THRESHOLD_PX);
  const armed = progress >= 1 || refreshing;

  return (
    <div ref={rootRef} className="relative min-w-0">
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-[60] flex justify-center",
          visible ? "opacity-100" : "opacity-0",
        )}
        style={{
          height: Math.max(pullPx, refreshing ? 52 : 0),
          paddingTop: "env(safe-area-inset-top)",
          transition: pullingRef.current && !refreshing ? "opacity 80ms" : "height 180ms ease-out, opacity 180ms",
        }}
        aria-live="polite"
      >
        <div className="mt-1 flex flex-col items-center gap-1">
          <svg
            width="36"
            height="36"
            viewBox="0 0 36 36"
            className={cn(refreshing && "hz-ptr-spin")}
            aria-hidden
          >
            <circle
              cx="18"
              cy="18"
              r="13"
              fill="none"
              stroke="rgba(26,123,89,0.18)"
              strokeWidth="2.4"
            />
            <circle
              cx="18"
              cy="18"
              r="13"
              fill="none"
              stroke="#1A7B59"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeDasharray={RING}
              strokeDashoffset={refreshing ? RING * 0.28 : RING * (1 - progress)}
              transform="rotate(-90 18 18)"
            />
            <circle
              cx="18"
              cy="18"
              r="3.1"
              fill="#1A7B59"
              opacity={armed ? 1 : 0.35 + progress * 0.65}
            />
          </svg>
          <span
            className={cn(
              "text-[10px] font-semibold tracking-wide",
              armed ? "text-canopy" : "text-ink/45",
            )}
          >
            {refreshing
              ? "Refreshing"
              : armed
                ? "Release"
                : formatLastRefresh(lastRefresh)}
          </span>
        </div>
      </div>
      <div
        style={{
          transform:
            pullPx > 0 || refreshing
              ? `translate3d(0, ${Math.min(pullPx, 52)}px, 0)`
              : undefined,
          transition:
            pullingRef.current && !refreshing
              ? undefined
              : "transform 200ms cubic-bezier(0.22, 1, 0.36, 1)",
          willChange: pullPx > 0 || refreshing ? "transform" : undefined,
        }}
      >
        {children}
      </div>
      <style>{`
        .hz-ptr-spin { animation: hz-ptr-spin 0.7s linear infinite; }
        @keyframes hz-ptr-spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          .hz-ptr-spin { animation: none; }
        }
      `}</style>
    </div>
  );
}
