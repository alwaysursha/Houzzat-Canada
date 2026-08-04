"use client";

import { useCallback, useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

const SWIPE_THRESHOLD_PX = 48;
const WHEEL_THRESHOLD = 28;
const WHEEL_COOLDOWN_MS = 420;

/**
 * Carousel navigation:
 * - Mobile: one-finger horizontal swipe
 * - Desktop trackpad: two-finger horizontal swipe (wheel deltaX)
 * - Mouse click-drag is ignored on purpose
 */
export function useCarouselSwipe(options: {
  enabled: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const enabledRef = useRef(options.enabled);
  const onPrevRef = useRef(options.onPrev);
  const onNextRef = useRef(options.onNext);
  const wheelLockUntil = useRef(0);
  const wheelAccum = useRef(0);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const detachWheel = useRef<(() => void) | null>(null);

  useEffect(() => {
    enabledRef.current = options.enabled;
    onPrevRef.current = options.onPrev;
    onNextRef.current = options.onNext;
  }, [options.enabled, options.onPrev, options.onNext]);

  useEffect(() => {
    return () => {
      detachWheel.current?.();
      detachWheel.current = null;
    };
  }, []);

  const attachWheel = useCallback((node: HTMLDivElement) => {
    detachWheel.current?.();
    const onWheel = (event: WheelEvent) => {
      if (!enabledRef.current) return;

      const absX = Math.abs(event.deltaX);
      const absY = Math.abs(event.deltaY);
      // Only react to clearly horizontal trackpad gestures.
      if (absX < 4 || absX < absY * 1.15) {
        wheelAccum.current = 0;
        return;
      }

      event.preventDefault();
      const now = Date.now();
      if (now < wheelLockUntil.current) return;

      wheelAccum.current += event.deltaX;
      if (Math.abs(wheelAccum.current) < WHEEL_THRESHOLD) return;

      if (wheelAccum.current > 0) onNextRef.current();
      else onPrevRef.current();

      wheelAccum.current = 0;
      wheelLockUntil.current = now + WHEEL_COOLDOWN_MS;
    };

    node.addEventListener("wheel", onWheel, { passive: false });
    detachWheel.current = () => node.removeEventListener("wheel", onWheel);
  }, []);

  const setSurfaceRef = useCallback(
    (node: HTMLDivElement | null) => {
      surfaceRef.current = node;
      if (node) attachWheel(node);
      else {
        detachWheel.current?.();
        detachWheel.current = null;
      }
    },
    [attachWheel],
  );

  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const locked = useRef<"h" | "v" | null>(null);

  const onPointerDown = useCallback((event: ReactPointerEvent) => {
    if (!enabledRef.current) return;
    // Desktop: use two-finger trackpad swipe (wheel), not click-drag.
    if (event.pointerType === "mouse") return;
    startX.current = event.clientX;
    startY.current = event.clientY;
    locked.current = null;
  }, []);

  const onPointerMove = useCallback((event: ReactPointerEvent) => {
    if (!enabledRef.current || startX.current == null || startY.current == null)
      return;
    const dx = event.clientX - startX.current;
    const dy = event.clientY - startY.current;
    if (locked.current == null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      locked.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
    }
  }, []);

  const finishTouch = useCallback((clientX: number) => {
    if (!enabledRef.current || startX.current == null) {
      startX.current = null;
      startY.current = null;
      locked.current = null;
      return;
    }
    const dx = clientX - startX.current;
    const axis = locked.current;
    startX.current = null;
    startY.current = null;
    locked.current = null;
    if (axis === "v") return;
    if (dx <= -SWIPE_THRESHOLD_PX) onNextRef.current();
    else if (dx >= SWIPE_THRESHOLD_PX) onPrevRef.current();
  }, []);

  const onPointerUp = useCallback(
    (event: ReactPointerEvent) => {
      if (event.pointerType === "mouse") return;
      finishTouch(event.clientX);
    },
    [finishTouch],
  );

  const onPointerCancel = useCallback(() => {
    startX.current = null;
    startY.current = null;
    locked.current = null;
  }, []);

  return {
    ref: setSurfaceRef,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    style: { touchAction: "pan-y" as const },
  };
}
