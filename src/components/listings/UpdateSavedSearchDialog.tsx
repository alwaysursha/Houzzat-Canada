"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

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

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 bg-ink/45"
        onClick={onCancel}
      />
      <div
        role="alertdialog"
        aria-labelledby="update-search-title"
        aria-describedby="update-search-desc"
        className="relative w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-xl"
      >
        <h2
          id="update-search-title"
          className="text-base font-semibold text-ink"
        >
          Update your saved search?
        </h2>
        <p id="update-search-desc" className="mt-2 text-sm leading-relaxed text-ink/65">
          You already have a search saved to your buyer profile. Updating makes
          this the primary search for property alerts. Your previous search will
          be kept as secondary.
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={onCancel}
          >
            Not now
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? "Updating…" : "Update search"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
