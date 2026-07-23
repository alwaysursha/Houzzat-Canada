"use client";

import { useEffect, useId, useState } from "react";
import { LeadRequestForm } from "@/components/listings/LeadRequestForm";
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
  initialKind = "showing",
}: {
  open: boolean;
  onClose: () => void;
  mlsNumber: string;
  contact?: ViewingContactDefaults;
  initialKind?: "showing" | "virtual_viewing";
}) {
  const titleId = useId();
  const [kind, setKind] = useState<"showing" | "virtual_viewing">(initialKind);

  useEffect(() => {
    if (open) setKind(initialKind);
  }, [open, initialKind]);

  useEffect(() => {
    if (!open) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }

    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/60 p-4 sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-surface p-5 shadow-xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="font-display text-2xl text-ink">
              Book a viewing
            </h2>
            <p className="mt-1 text-sm text-ink/60">
              In-person or Virtual Viewing · MLS® {mlsNumber}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm font-semibold text-ink/55 hover:bg-mist hover:text-ink"
          >
            Close
          </button>
        </div>

        <div className="mt-4 flex gap-2">
          {(
            [
              ["showing", "In-person"],
              ["virtual_viewing", "Virtual Viewing"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setKind(value)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition",
                kind === value
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
            key={`${kind}-${mlsNumber}`}
            mlsNumber={mlsNumber}
            kind={kind}
            defaults={{
              name: contact?.name ?? "",
              email: contact?.email ?? "",
              phone: contact?.phone ?? "",
              message: defaultViewingMessage(mlsNumber, kind),
            }}
          />
        </div>
      </div>
    </div>
  );
}
