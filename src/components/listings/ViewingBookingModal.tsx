"use client";

import { useEffect, useId, useState } from "react";
import { useSession } from "next-auth/react";
import { X } from "lucide-react";
import { LeadRequestForm } from "@/components/listings/LeadRequestForm";
import { useLeadRequestRestore } from "@/components/listings/useLeadRequestRestore";
import type { LeadRequestEntry } from "@/lib/auth/lead-request-intent";
import { cn } from "@/lib/utils";

export type ViewingContactDefaults = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
};

export function defaultViewingMessage(
  mlsNumber: string,
  kind: "showing" | "virtual_viewing",
) {
  if (kind === "virtual_viewing") {
    return `I'd like to schedule a Virtual Viewing for MLS® ${mlsNumber}. Please let me know available times.`;
  }
  return `I'd like to schedule an in-person viewing for MLS® ${mlsNumber}. Please let me know available times.`;
}

export function ViewingBookingModal({
  open,
  onClose,
  mlsNumber,
  contact,
  callbackPath,
  initialKind = "showing",
  restoreEntry,
}: {
  open: boolean;
  onClose: () => void;
  mlsNumber: string;
  contact?: ViewingContactDefaults;
  callbackPath?: string;
  initialKind?: "showing" | "virtual_viewing";
  restoreEntry?: LeadRequestEntry;
}) {
  const titleId = useId();
  const { status } = useSession();
  const restore = useLeadRequestRestore(mlsNumber, open);
  const [kind, setKind] = useState<"showing" | "virtual_viewing">(initialKind);
  const [kindChosen, setKindChosen] = useState(false);
  const [entered, setEntered] = useState(false);
  const shownKind =
    !kindChosen &&
    (restore?.kind === "showing" || restore?.kind === "virtual_viewing")
      ? restore.kind
      : kind;

  useEffect(() => {
    if (open) setKind(initialKind);
  }, [open, initialKind]);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const frame = window.requestAnimationFrame(() => setEntered(true));

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }

    document.addEventListener("keydown", onKey, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <button
        type="button"
        aria-label="Close booking sheet"
        className={cn(
          "absolute inset-0 bg-ink/55 transition-opacity duration-300",
          entered ? "opacity-100" : "opacity-0",
        )}
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col",
          "rounded-t-[1.75rem] border border-line bg-surface shadow-2xl",
          "sm:rounded-2xl",
          "transition-transform duration-300 ease-out",
          entered ? "translate-y-0" : "translate-y-full sm:translate-y-0",
          entered ? "sm:opacity-100" : "sm:opacity-0",
        )}
      >
        {/* Mobile swipe-up chrome */}
        <div className="flex shrink-0 flex-col items-center pt-2.5 sm:hidden">
          <div
            className="h-1 w-10 rounded-full bg-ink/20"
            aria-hidden
          />
        </div>

        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-1 pt-3 sm:px-6 sm:pt-5">
          <div className="min-w-0">
            <h2 id={titleId} className="font-sans font-semibold text-2xl text-ink">
              Book a viewing
            </h2>
            <p className="mt-1 text-sm text-ink/60">
              In-person or Virtual Viewing · MLS® {mlsNumber}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-line text-ink/60 transition hover:bg-mist hover:text-ink"
            aria-label="Close"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-6">
          <div className="flex gap-2">
            {(
              [
                ["showing", "In-person"],
                ["virtual_viewing", "Virtual Viewing"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setKindChosen(true);
                  setKind(value);
                }}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition",
                  shownKind === value
                    ? value === "virtual_viewing"
                      ? "bg-signal text-white"
                      : "bg-canopy text-white"
                    : "border border-line text-ink/70 hover:border-canopy/40",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-4">
            <LeadRequestForm
              key={`${status}-${shownKind}-${mlsNumber}-${restore?.restoredAt ?? "base"}`}
              mlsNumber={mlsNumber}
              kind={shownKind}
              callbackPath={callbackPath}
              restoreEntry={restoreEntry}
              defaults={{
                name: contact?.name ?? "",
                email: contact?.email ?? "",
                phone: contact?.phone ?? "",
                message:
                  restore && restore.kind === shownKind && restore.message
                    ? restore.message
                    : defaultViewingMessage(mlsNumber, shownKind),
                focusNotes:
                  restore?.kind === "virtual_viewing" &&
                  shownKind === "virtual_viewing"
                    ? (restore.focusNotes ?? "")
                    : "",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
