"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import {
  dispatchEmailVerifiedRefresh,
  takeVerificationSuccessSignal,
} from "@/lib/auth/verification-success-signal";
import { useTenantDisplayName } from "@/components/tenancy/TenantBrandProvider";
import { cn } from "@/lib/utils";

const DISMISS_MS = 220;

export function AccountVerifiedSuccessBanner({ className }: { className?: string }) {
  const [visible, setVisible] = useState(false);
  const [entered, setEntered] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const brandName = useTenantDisplayName("Houzzat");

  useEffect(() => {
    if (!takeVerificationSuccessSignal()) return;
    setVisible(true);
    dispatchEmailVerifiedRefresh();
  }, []);

  useEffect(() => {
    if (!visible || dismissing) return;
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setEntered(true));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [visible, dismissing]);

  function dismiss() {
    if (dismissing) return;
    setDismissing(true);
    window.setTimeout(() => setVisible(false), DISMISS_MS);
  }

  if (!visible) return null;

  return (
    <div
      className={cn(
        "w-full px-4 pt-4 sm:px-6 sm:pt-5 lg:px-10",
        className,
      )}
    >
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "relative mx-auto w-full max-w-xl overflow-hidden rounded-2xl border border-canopy/15 bg-white",
          "shadow-[0_20px_50px_-28px_rgba(15,61,46,0.45)]",
          "motion-safe:transition-[opacity,transform] motion-safe:duration-300 motion-safe:ease-out",
          entered && !dismissing
            ? "motion-safe:translate-y-0 motion-safe:opacity-100 houzzat-verified-success-in"
            : "motion-safe:translate-y-2 motion-safe:opacity-0",
          dismissing && "motion-safe:translate-y-1 motion-safe:opacity-0",
        )}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-12 size-36 rounded-full bg-canopy/[0.08] blur-2xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-14 -left-8 size-32 rounded-full bg-signal/[0.06] blur-2xl"
        />

        <div className="relative flex gap-3 p-4 sm:gap-4 sm:p-5">
          <div className="shrink-0 pt-0.5">
            <span className="inline-flex size-11 items-center justify-center rounded-full bg-canopy text-white shadow-[0_10px_24px_-12px_rgba(15,61,46,0.65)] ring-4 ring-canopy/10 sm:size-12">
              <Check className="size-5 sm:size-[1.35rem]" strokeWidth={2.5} aria-hidden />
            </span>
          </div>

          <div className="min-w-0 flex-1 pr-10 sm:pr-12">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-canopy">
              Email verified ✓
            </p>
            <h2 className="mt-1 font-display text-lg leading-tight text-ink sm:text-xl">
              Your {brandName} account is ready.
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink/65">
              Your email has been successfully verified. You can now use all
              account features.
            </p>
          </div>

          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss verification success message"
            className={cn(
              "absolute right-2 top-2 inline-flex min-h-11 min-w-11 items-center justify-center",
              "rounded-xl text-ink/45 transition hover:bg-mist hover:text-ink",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-canopy",
            )}
          >
            <X className="size-5" strokeWidth={2.25} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}