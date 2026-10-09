"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { ViewingBookingModal } from "@/components/listings/ViewingBookingModal";
import { reportTourPromptShown } from "@/lib/auth/funnel-analytics";

const SESSION_KEY = "houzzat:tour-prompt-dismissed";

function wasDismissed(mlsNumber: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return sessionStorage.getItem(`${SESSION_KEY}:${mlsNumber}`) === "1";
  } catch {
    return false;
  }
}

function markDismissed(mlsNumber: string): void {
  try {
    sessionStorage.setItem(`${SESSION_KEY}:${mlsNumber}`, "1");
  } catch {
    /* ignore */
  }
}

/**
 * Soft non-blocking tour prompt after VIEW_LISTING funnel completion.
 * Tour CTA reuses ViewingBookingModal → LeadRequestForm → POST /api/leads.
 */
export function TourThisHomePrompt({
  mlsNumber,
  address: _address,
  thumbnailUrl,
  contact,
}: {
  mlsNumber: string;
  /** Retained for callers; copy no longer interpolates address / MLS. */
  address?: string | null;
  thumbnailUrl?: string | null;
  contact?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  };
}) {
  void _address;
  const [visible, setVisible] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);

  useEffect(() => {
    if (!mlsNumber || wasDismissed(mlsNumber)) return;
    const timer = window.setTimeout(() => {
      setVisible(true);
      reportTourPromptShown();
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [mlsNumber]);

  if (!visible && !bookingOpen) return null;

  function dismiss() {
    markDismissed(mlsNumber);
    setVisible(false);
  }

  function requestTour() {
    markDismissed(mlsNumber);
    setVisible(false);
    setBookingOpen(true);
  }

  return (
    <>
      {visible ? (
        <div
          className="pointer-events-none fixed inset-x-0 z-[90] flex justify-center px-3 sm:justify-end sm:px-6 sm:bottom-6 bottom-[max(calc(var(--mobile-bottom-nav,0px)+5.5rem),calc(env(safe-area-inset-bottom,0px)+5.5rem))]"
          role="dialog"
          aria-label="Tour this home"
        >
          <div className="pointer-events-auto w-full max-w-[340px] rounded-2xl border border-line bg-surface/95 p-4 shadow-xl backdrop-blur transition duration-500 [animation:tourFade_0.45s_ease-out]">
            <div className="flex items-start gap-3">
              {thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumbnailUrl}
                  alt=""
                  className="size-14 shrink-0 rounded-lg object-cover"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">Like this home?</p>
                <p className="mt-0.5 text-sm text-ink/70">
                  Want to view this home in person?
                </p>
              </div>
              <button
                type="button"
                onClick={dismiss}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-ink/50 hover:bg-mist"
                aria-label="Dismiss"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={requestTour}
                className="flex-1 rounded-xl bg-canopy px-3 py-2.5 text-sm font-semibold text-white"
              >
                Tour This Home
              </button>
              <button
                type="button"
                onClick={dismiss}
                className="rounded-xl px-3 py-2.5 text-sm font-medium text-ink/60 hover:bg-mist"
              >
                Maybe Later
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <ViewingBookingModal
        open={bookingOpen}
        onClose={() => setBookingOpen(false)}
        mlsNumber={mlsNumber}
        contact={contact}
        callbackPath={
          typeof window !== "undefined" ? window.location.pathname : undefined
        }
        initialKind="showing"
      />
    </>
  );
}
