"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { acquireScrollLock } from "@/lib/scroll-lock";
import { visualViewportOverlayStyle } from "@/lib/visual-viewport-overlay-style";

type ConfirmHistoryState = { houzzatUpdateSavedSearch?: boolean };

export function UpdateSavedSearchDialog({
  open,
  pending,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const historyPushedRef = useRef(false);
  const ignorePopRef = useRef(false);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  const dismissViaUi = useCallback(() => {
    if (historyPushedRef.current) {
      window.history.back();
      return;
    }
    onCancelRef.current();
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const release = acquireScrollLock();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") dismissViaUi();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      release();
      document.removeEventListener("keydown", onKey);
    };
  }, [open, dismissViaUi]);

  // Same-URL history entry so Android/browser Back dismisses the dialog
  // instead of leaving /search after Filters already consumed its entry.
  useEffect(() => {
    if (!open) return;

    if (!historyPushedRef.current) {
      const prev = (window.history.state ?? {}) as ConfirmHistoryState;
      if (prev.houzzatUpdateSavedSearch) {
        historyPushedRef.current = true;
      } else {
        window.history.pushState(
          { ...prev, houzzatUpdateSavedSearch: true },
          "",
        );
        historyPushedRef.current = true;
      }
    }

    const onPopState = (event: PopStateEvent) => {
      if (!historyPushedRef.current) return;
      if (ignorePopRef.current) {
        ignorePopRef.current = false;
        historyPushedRef.current = false;
        return;
      }
      event.stopImmediatePropagation();
      historyPushedRef.current = false;
      onCancelRef.current();
    };
    window.addEventListener("popstate", onPopState, true);
    return () => {
      window.removeEventListener("popstate", onPopState, true);
      if (historyPushedRef.current) {
        // Confirm success / parent closed dialog without Back — consume entry.
        historyPushedRef.current = false;
        ignorePopRef.current = true;
        window.history.back();
      }
    };
  }, [open]);

  // Pin to the visual viewport so the dialog cannot extend past the visible
  // screen when the keyboard, zoom, or a residual VV pan is active.
  useEffect(() => {
    if (!open) return;

    function syncViewport() {
      const el = overlayRef.current;
      if (!el) return;
      const style = visualViewportOverlayStyle(window.visualViewport);
      el.style.left = style.left;
      el.style.top = style.top;
      el.style.width = style.width;
      el.style.height = style.height;
      el.style.right = style.right;
      el.style.bottom = style.bottom;
    }

    syncViewport();
    window.addEventListener("resize", syncViewport);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", syncViewport);
    vv?.addEventListener("scroll", syncViewport);
    return () => {
      window.removeEventListener("resize", syncViewport);
      vv?.removeEventListener("resize", syncViewport);
      vv?.removeEventListener("scroll", syncViewport);
      const el = overlayRef.current;
      if (!el) return;
      el.style.left = "";
      el.style.top = "";
      el.style.width = "";
      el.style.height = "";
      el.style.right = "";
      el.style.bottom = "";
    };
  }, [open, mounted]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      ref={overlayRef}
      data-update-saved-search-dialog=""
      className="fixed top-0 left-0 z-[100] flex h-full w-full items-center justify-center overflow-hidden overscroll-none px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 touch-none bg-ink/45"
        onClick={dismissViaUi}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="update-search-title"
        aria-describedby="update-search-desc"
        className="relative flex max-h-full min-h-0 w-full min-w-0 max-w-md flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-xl"
      >
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-5">
          <h2
            id="update-search-title"
            className="text-base font-semibold text-ink"
          >
            Update your saved search?
          </h2>
          <p
            id="update-search-desc"
            className="mt-2 text-sm leading-relaxed break-words text-ink/65"
          >
            You already have a search saved to your buyer profile. Updating makes
            this the primary search for property alerts. Your previous search will
            be kept as secondary.
          </p>
          <div className="mt-5 flex flex-col-reverse gap-2 min-[380px]:flex-row min-[380px]:flex-wrap min-[380px]:justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={dismissViaUi}
              className="w-full min-[380px]:w-auto"
            >
              Not now
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={onConfirm}
              className="w-full min-[380px]:w-auto"
            >
              {pending ? "Updating…" : "Update search"}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
