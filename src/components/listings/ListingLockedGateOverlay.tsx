"use client";

import { Lock } from "lucide-react";
import { AuthOpenButton } from "@/components/auth/AuthOpenButton";
import { cn } from "@/lib/utils";

/** HouseSigma-style gate over locked listing media. */
export function ListingLockedGateOverlay({
  callbackUrl,
  className,
}: {
  callbackUrl: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-4",
        className,
      )}
    >
      <div className="pointer-events-auto flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl border border-white/50 bg-white/90 px-6 py-5 text-center shadow-xl backdrop-blur-md">
        <span className="inline-flex size-11 items-center justify-center rounded-full bg-canopy text-white shadow-sm">
          <Lock className="size-5" strokeWidth={2.5} aria-hidden />
        </span>
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-ink">
            Login required to view details
          </p>
          <p className="text-xs leading-relaxed text-ink/60">
            Local real estate board rules require a registered client login to
            see sold, leased, and unlisted property details.
          </p>
        </div>
        <AuthOpenButton
          mode="sign-in"
          callbackUrl={callbackUrl}
          className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-canopy px-4 text-sm font-semibold text-white transition hover:bg-canopy-deep"
        >
          Confirm login
        </AuthOpenButton>
        <AuthOpenButton
          mode="sign-up"
          callbackUrl={callbackUrl}
          className="text-sm font-semibold text-canopy-deep underline underline-offset-2 hover:text-canopy"
        >
          Create a free account
        </AuthOpenButton>
      </div>
    </div>
  );
}
