"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { hasStaffOverlay } from "@/lib/mobile/staff-overlay-stack";

const PULL_THRESHOLD_PX = 96;
const MAX_PULL_PX = 120;
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
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [pullPx, setPullPx] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startXRef = useRef<number | null>(null);
  const startYRef = useRef<number | null>(null);
  const pullingRef = useRef(false);
  const scrollParentRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setLastRefresh(readStoredRefresh());
  }, []);

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
          "[data-snap-rail], [data-staff-overlay], [data-lead-profile-popup]",
        )
      ) {
        startXRef.current = null;
        startYRef.current = null;
        pullingRef.current = false;
        return;
      }
      if (hasStaffOverlay()) {
        startXRef.current = null;
        startYRef.current = null;
        pullingRef.current = false;
        return;
      }
      scrollParentRef.current = parent;
      if (parent.scrollTop > 2) {
        startXRef.current = null;
        startYRef.current = null;
        pullingRef.current = false;
        return;
      }
      startXRef.current = touch.clientX;
      startYRef.current = touch.clientY;
      pullingRef.current = true;
    },
    [findScrollParent, refreshing],
  );

  const onTouchMove = useCallback((event: React.TouchEvent) => {
    if (hasStaffOverlay()) {
      startXRef.current = null;
      startYRef.current = null;
      pullingRef.current = false;
      setPullPx(0);
      return;
    }
    if (!pullingRef.current || startYRef.current == null || refreshing) return;
    const touch = event.touches[0];
    if (!touch) return;
    const parent = scrollParentRef.current;
    if (parent && parent.scrollTop > 2) {
      startXRef.current = null;
      startYRef.current = null;
      pullingRef.current = false;
      setPullPx(0);
      return;
    }
    const deltaX = Math.abs(touch.clientX - (startXRef.current ?? touch.clientX));
    const deltaY = touch.clientY - startYRef.current;
    if (deltaX > deltaY && deltaX > 10) {
      // Horizontal swipe detected — cancel pull to refresh
      startXRef.current = null;
      startYRef.current = null;
      pullingRef.current = false;
      setPullPx(0);
      return;
    }
    if (deltaY <= 0) {
      setPullPx(0);
      return;
    }
    const damped = Math.min(MAX_PULL_PX, deltaY * 0.5);
    setPullPx(damped);
  }, [refreshing]);

  const finishRefresh = useCallback(async () => {
    setRefreshing(true);
    setPullPx(PULL_THRESHOLD_PX * 0.65);
    try {
      router.refresh();
      // Let RSC stream settle briefly so the indicator feels intentional.
      await new Promise((r) => window.setTimeout(r, 450));
      const iso = new Date().toISOString();
      writeStoredRefresh(iso);
      setLastRefresh(iso);
    } finally {
      setRefreshing(false);
      setPullPx(0);
      startXRef.current = null;
      startYRef.current = null;
      pullingRef.current = false;
    }
  }, [router]);

  const onTouchEnd = useCallback(() => {
    if (hasStaffOverlay()) {
      setPullPx(0);
      startXRef.current = null;
      startYRef.current = null;
      pullingRef.current = false;
      return;
    }
    if (!pullingRef.current) return;
    if (refreshing) return;
    if (pullPx >= PULL_THRESHOLD_PX) {
      void finishRefresh();
      return;
    }
    setPullPx(0);
    startXRef.current = null;
    startYRef.current = null;
    pullingRef.current = false;
  }, [finishRefresh, pullPx, refreshing]);

  const visible = pullPx > 8 || refreshing;
  const armed = pullPx >= PULL_THRESHOLD_PX || refreshing;

  return (
    <div
      className={cn("relative min-w-0 overflow-x-hidden", className)}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
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
          transition: pullingRef.current && !refreshing ? undefined : "transform 160ms ease-out",
        }}
      >
        {children}
      </div>
    </div>
  );
}
