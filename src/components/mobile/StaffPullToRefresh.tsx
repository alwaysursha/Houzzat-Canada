"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { hasStaffOverlay } from "@/lib/mobile/staff-overlay-stack";
import {
  createInitialGestureState,
  evaluatePullMove,
  shouldCommitRefresh,
  STAFF_PULL_THRESHOLD_PX,
  type StaffPullGestureState,
} from "@/lib/mobile/staff-pull-gesture";

const LAST_REFRESH_KEY = "houzzat:staff-last-refresh";

function formatLastRefresh(iso: string | null): string {
  if (!iso) return "Pull to refresh";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Pull to refresh";
  try {
    return `Last refreshed ${date.toLocaleString("en-CA", {
      dateStyle: "medium",
      timeStyle: "short",
    })}`;
  } catch {
    return `Last refreshed ${date.toISOString()}`;
  }
}

function readStoredRefresh(): string | null {
  try {
    return localStorage.getItem(LAST_REFRESH_KEY);
  } catch {
    return null;
  }
}

function writeStoredRefresh(iso: string) {
  try {
    localStorage.setItem(LAST_REFRESH_KEY, iso);
  } catch {
    // ignore quota / private mode
  }
}

/**
 * Mobile pull-to-refresh for staff shells (Admin HQ / CRM).
 * Shows last refresh timestamp while pulling; calls router.refresh() on release.
 */
export function StaffPullToRefresh({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [pullPx, setPullPx] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const gestureStateRef = useRef<StaffPullGestureState | null>(null);
  const lastRefreshTimeRef = useRef<number>(0);
  const scrollParentRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setLastRefresh(readStoredRefresh());
  }, []);

  // Reset state whenever route changes or component unmounts
  useEffect(() => {
    gestureStateRef.current = null;
    setPullPx(0);
    setRefreshing(false);
  }, [pathname]);

  const findScrollParent = useCallback((el: EventTarget | null) => {
    let node = el instanceof HTMLElement ? el : null;
    while (node) {
      const style = window.getComputedStyle(node);
      const overflowY = style.overflowY;
      if (
        (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
        node.scrollHeight > node.clientHeight + 1
      ) {
        return node;
      }
      node = node.parentElement;
    }
    return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
  }, []);

  const onTouchStart = useCallback(
    (event: React.TouchEvent) => {
      if (refreshing) return;
      const touch = event.touches[0];
      if (!touch) return;
      const parent = findScrollParent(event.target);
      const origin =
        event.target instanceof Element
          ? event.target
          : ((event.target as Node | null)?.parentElement ?? null);
      if (
        origin?.closest(
          "[data-snap-rail], [data-staff-overlay], [data-lead-profile-popup], input, textarea, select, button, a",
        )
      ) {
        gestureStateRef.current = null;
        return;
      }
      if (hasStaffOverlay()) {
        gestureStateRef.current = null;
        return;
      }
      scrollParentRef.current = parent;
      if (parent.scrollTop > 1) {
        gestureStateRef.current = null;
        return;
      }
      gestureStateRef.current = createInitialGestureState(touch.clientX, touch.clientY);
    },
    [findScrollParent, refreshing],
  );

  const onTouchMove = useCallback((event: React.TouchEvent) => {
    if (hasStaffOverlay()) {
      gestureStateRef.current = null;
      setPullPx(0);
      return;
    }
    if (!gestureStateRef.current || refreshing) return;
    const touch = event.touches[0];
    if (!touch) return;
    const parent = scrollParentRef.current;
    const scrollTop = parent?.scrollTop ?? 0;

    const nextState = evaluatePullMove(
      gestureStateRef.current,
      touch.clientX,
      touch.clientY,
      { scrollTop },
    );
    gestureStateRef.current = nextState;

    setPullPx(nextState.pullPx);
  }, [refreshing]);

  const finishRefresh = useCallback(async () => {
    setRefreshing(true);
    setPullPx(STAFF_PULL_THRESHOLD_PX * 0.65);
    lastRefreshTimeRef.current = Date.now();
    try {
      router.refresh();
      // Let RSC stream settle briefly so the indicator feels intentional.
      await new Promise((r) => window.setTimeout(r, 600));
      const iso = new Date().toISOString();
      writeStoredRefresh(iso);
      setLastRefresh(iso);
    } finally {
      setRefreshing(false);
      setPullPx(0);
      gestureStateRef.current = null;
    }
  }, [router]);

  const onTouchEnd = useCallback(() => {
    if (hasStaffOverlay()) {
      setPullPx(0);
      gestureStateRef.current = null;
      return;
    }
    if (!gestureStateRef.current) return;
    if (refreshing) return;

    if (
      shouldCommitRefresh(
        gestureStateRef.current,
        refreshing,
        lastRefreshTimeRef.current,
      )
    ) {
      void finishRefresh();
      return;
    }

    setPullPx(0);
    gestureStateRef.current = null;
  }, [finishRefresh, refreshing]);

  const onTouchCancel = useCallback(() => {
    setPullPx(0);
    gestureStateRef.current = null;
  }, []);

  const visible = pullPx > 8 || refreshing;
  const armed = pullPx >= STAFF_PULL_THRESHOLD_PX || refreshing;

  return (
    <div
      className={cn("relative min-w-0 overflow-x-hidden", className)}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center transition-[height,opacity] duration-150",
          visible ? "opacity-100" : "opacity-0",
        )}
        style={{ height: Math.max(pullPx, refreshing ? 48 : 0) }}
        aria-live="polite"
      >
        <div
          className={cn(
            "mt-1 flex items-center gap-2 rounded-full border border-line/80 bg-surface/95 px-3 py-1.5 text-[11px] font-medium shadow-sm backdrop-blur-md",
            armed ? "text-canopy" : "text-ink/55",
          )}
        >
          {refreshing ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : null}
          <span>
            {refreshing
              ? "Refreshing…"
              : armed
                ? "Release to refresh"
                : formatLastRefresh(lastRefresh)}
          </span>
        </div>
      </div>
      <div
        className="min-w-0"
        style={{
          transform: pullPx > 0 || refreshing ? `translateY(${Math.min(pullPx, 56)}px)` : undefined,
          transition: gestureStateRef.current && !refreshing ? undefined : "transform 160ms ease-out",
        }}
      >
        {children}
      </div>
    </div>
  );
}
