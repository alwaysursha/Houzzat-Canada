"use client";

import { useEffect, useId, useRef, useState } from "react";
import { PenLine, X } from "lucide-react";
import { ListingNotesPanel } from "@/components/account/ListingNotesPanel";
import {
  SCROLL_FAB_FADE_TRANSITION,
  scrollFabFadeClass,
  useScrollFabVisible,
} from "@/hooks/use-scroll-fab-visible";
import { cn } from "@/lib/utils";

/**
 * Mobile-only: pen control stacked above Scroll to top.
 * Shows/hides with the same scroll threshold + fade as scroll-to-top.
 */
export function ListingMobileNotes({
  mlsNumber,
  signedIn,
  initialBody = "",
  authCallbackUrl,
}: {
  mlsNumber: string;
  signedIn: boolean;
  initialBody?: string;
  authCallbackUrl?: string;
}) {
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const visible = useScrollFabVisible();

  useEffect(() => {
    if (!visible) setOpen(false);
  }, [visible]);

  useEffect(() => {
    if (!open) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    }

    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (target && rootRef.current?.contains(target)) return;
      setOpen(false);
    }

    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      aria-hidden={!visible}
      className={cn(
        "fixed right-4 z-40 flex flex-col items-end gap-2 md:hidden sm:right-6",
        // Sit just above ScrollToTopButton (size-10) on listing pages.
        "bottom-[calc(4.75rem+2.5rem+0.2rem)]",
        SCROLL_FAB_FADE_TRANSITION,
        scrollFabFadeClass(visible),
      )}
    >
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={cn(
            "w-[min(calc(100vw-2rem),20rem)] overflow-hidden rounded-2xl",
            "border border-line/80 bg-surface shadow-[0_12px_40px_-12px_rgba(20,32,28,0.35)]",
          )}
        >
          <div className="flex items-center justify-between border-b border-line/70 px-3.5 py-2.5">
            <h2 id={titleId} className="font-display text-base text-ink">
              Your notes
            </h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close notes"
              className="rounded-lg p-1.5 text-ink/55 transition hover:bg-mist hover:text-ink"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <div className="max-h-[min(50vh,22rem)] overflow-y-auto p-3.5">
            <ListingNotesPanel
              mlsNumber={mlsNumber}
              signedIn={signedIn}
              initialBody={initialBody}
              authCallbackUrl={authCallbackUrl}
              embedded
            />
          </div>
        </div>
      ) : null}

      <button
        type="button"
        data-houzzat-listing-coach="notes"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "Close notes" : "Open notes"}
        aria-expanded={open}
        tabIndex={visible ? 0 : -1}
        className={cn(
          "flex size-10 items-center justify-center rounded-md border border-canopy/20",
          "bg-surface text-canopy shadow-md transition hover:bg-mist",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canopy/40",
          open && "border-canopy/40 bg-canopy/5",
        )}
      >
        <PenLine className="size-5" strokeWidth={2.25} aria-hidden />
      </button>
    </div>
  );
}
