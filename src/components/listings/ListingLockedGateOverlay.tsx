"use client";

import { Lock } from "lucide-react";
import { AuthOpenButton } from "@/components/auth/AuthOpenButton";
import { EmailVerificationRequired } from "@/components/auth/EmailVerificationRequired";
import { useTenantDisplayName } from "@/components/tenancy/TenantBrandProvider";
import { cn } from "@/lib/utils";

/** HouseSigma-style gate over locked listing media. */
export function ListingLockedGateOverlay({
  callbackUrl,
  className,
  needsEmailVerification = false,
}: {
  callbackUrl: string;
  className?: string;
  /** Signed-in but past grace / unverified. */
  needsEmailVerification?: boolean;
}) {
  const tenantName = useTenantDisplayName("Houzzat");
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-ink/45 px-4 backdrop-blur-[2px]",
        className,
      )}
    >
      <div className="pointer-events-auto w-full max-w-md rounded-3xl border border-white/60 bg-white p-7 shadow-[0_28px_60px_-24px_rgba(0,0,0,0.55)] sm:max-w-lg sm:p-9">
        {needsEmailVerification ? (
          <EmailVerificationRequired
            variant="featured"
            icon="lock"
            eyebrow="Restricted details"
            callbackUrl={callbackUrl}
            title="Email verification required"
            body="Verify your email to view sold, leased, and restricted property details."
          />
        ) : (
          <div className="flex w-full flex-col gap-6">
            <div className="flex justify-center">
              <span className="relative inline-flex size-16 items-center justify-center rounded-2xl bg-canopy text-white shadow-[0_12px_28px_-10px_rgba(15,61,46,0.55)] ring-8 ring-canopy/10 sm:size-[4.5rem]">
                <Lock
                  className="size-7 sm:size-8"
                  strokeWidth={2.25}
                  aria-hidden
                />
              </span>
            </div>
            <div className="space-y-2.5 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-canopy">
                Client login
              </p>
              <p className="font-sans font-semibold text-2xl leading-tight text-ink sm:text-3xl">
                Sign in required
              </p>
              <p className="mx-auto max-w-sm text-sm leading-relaxed text-ink/60 sm:text-[15px]">
                Sign in as a {tenantName} client to view sold, leased, and unlisted
                property details.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <AuthOpenButton
                mode="sign-in"
                callbackUrl={callbackUrl}
                className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-canopy px-5 text-sm font-semibold text-white shadow-[0_10px_24px_-12px_rgba(15,61,46,0.65)] transition hover:bg-canopy-deep sm:h-14 sm:text-[15px]"
              >
                Confirm login
              </AuthOpenButton>
              <AuthOpenButton
                mode="sign-up"
                callbackUrl={callbackUrl}
                className="text-center text-sm font-semibold text-canopy-deep underline underline-offset-2 hover:text-canopy"
              >
                Create a free account
              </AuthOpenButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
