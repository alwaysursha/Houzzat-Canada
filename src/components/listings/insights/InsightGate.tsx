"use client";

import { Lock } from "lucide-react";
import { AuthOpenButton } from "@/components/auth/AuthOpenButton";
import { EmailVerificationRequired } from "@/components/auth/EmailVerificationRequired";
import { cn } from "@/lib/utils";

export function InsightGate({
  title,
  body,
  callbackPath,
  className,
  children,
  needsEmailVerification = false,
}: {
  title: string;
  body: string;
  callbackPath: string;
  className?: string;
  children?: React.ReactNode;
  needsEmailVerification?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl",
        className,
      )}
    >
      {/* Background fills whatever height the card content needs */}
      {children ? (
        <div
          className="pointer-events-none absolute inset-0 select-none overflow-hidden blur-[7px] opacity-50"
          aria-hidden
        >
          <div className="flex h-full min-h-[12rem] items-stretch justify-center">
            {children}
          </div>
        </div>
      ) : (
        <div
          className="absolute inset-0 bg-[radial-gradient(circle_at_18%_15%,rgb(15_107_76/0.16),transparent_52%),radial-gradient(circle_at_85%_80%,rgb(15_107_76/0.08),transparent_45%),linear-gradient(145deg,rgb(244_247_245),rgb(226_236_231))]"
          aria-hidden
        />
      )}
      <div className="absolute inset-0 bg-ink/[0.08] backdrop-blur-[2px]" aria-hidden />

      {/* Content drives height — no fixed min-height clipping the CTA */}
      <div className="relative z-10 flex items-center justify-center px-3 py-5 sm:px-6 sm:py-8">
        <div className="w-full max-w-[22rem] rounded-3xl border border-white/70 bg-white p-5 shadow-[0_28px_60px_-24px_rgba(15,40,30,0.45)] sm:max-w-md sm:p-7">
          {needsEmailVerification ? (
            <EmailVerificationRequired
              variant="featured"
              compact
              icon="mail"
              eyebrow="Market insights"
              callbackUrl={callbackPath}
              title={title}
              body={body}
            />
          ) : (
            <div className="flex w-full flex-col gap-5">
              <div className="flex justify-center">
                <span className="relative inline-flex size-12 items-center justify-center rounded-xl bg-canopy text-white shadow-[0_12px_28px_-10px_rgba(15,61,46,0.55)] ring-4 ring-canopy/10 sm:size-14 sm:rounded-2xl sm:ring-8">
                  <Lock
                    className="size-5 sm:size-6"
                    strokeWidth={2.25}
                    aria-hidden
                  />
                </span>
              </div>
              <div className="space-y-2 text-center">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-canopy">
                  Client access
                </p>
                <p className="font-sans font-semibold text-xl leading-snug text-ink sm:text-2xl">
                  {title}
                </p>
                <p className="mx-auto text-sm leading-relaxed text-ink/60 break-words">
                  {body}
                </p>
              </div>
              <div className="flex flex-col gap-2.5 sm:flex-row sm:gap-3">
                <AuthOpenButton
                  mode="sign-up"
                  callbackUrl={callbackPath}
                  className="inline-flex h-11 flex-1 items-center justify-center rounded-xl bg-canopy px-4 text-sm font-semibold text-white shadow-[0_10px_24px_-12px_rgba(15,61,46,0.65)] transition hover:bg-canopy-deep sm:h-12"
                >
                  Create free account
                </AuthOpenButton>
                <AuthOpenButton
                  mode="sign-in"
                  callbackUrl={callbackPath}
                  className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-line bg-mist px-4 text-sm font-semibold text-ink transition hover:border-canopy/35 hover:bg-canopy/5 sm:h-12"
                >
                  Sign in
                </AuthOpenButton>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
