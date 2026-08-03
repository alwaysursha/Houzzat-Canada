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
    <div className={cn("relative min-h-[22rem] overflow-hidden rounded-3xl", className)}>
      {children ? (
        <div
          className="pointer-events-none select-none blur-[7px] opacity-50"
          aria-hidden
        >
          {children}
        </div>
      ) : (
        <div
          className="absolute inset-0 bg-[radial-gradient(circle_at_18%_15%,rgb(15_107_76/0.16),transparent_52%),radial-gradient(circle_at_85%_80%,rgb(15_107_76/0.08),transparent_45%),linear-gradient(145deg,rgb(244_247_245),rgb(226_236_231))]"
          aria-hidden
        />
      )}
      <div className="absolute inset-0 flex items-center justify-center bg-ink/[0.08] p-4 backdrop-blur-[2px] sm:p-6">
        <div className="w-full max-w-md rounded-3xl border border-white/70 bg-white p-7 shadow-[0_28px_60px_-24px_rgba(15,40,30,0.45)] sm:max-w-lg sm:p-9">
          {needsEmailVerification ? (
            <EmailVerificationRequired
              variant="featured"
              icon="mail"
              eyebrow="Market insights"
              callbackUrl={callbackPath}
              title="Email verification required"
              body={body}
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
                  Client access
                </p>
                <p className="font-display text-2xl leading-tight text-ink sm:text-3xl">
                  {title}
                </p>
                <p className="mx-auto max-w-sm text-sm leading-relaxed text-ink/60 sm:text-[15px]">
                  {body}
                </p>
              </div>
              <div className="flex flex-col gap-2.5 sm:flex-row sm:gap-3">
                <AuthOpenButton
                  mode="sign-up"
                  callbackUrl={callbackPath}
                  className="inline-flex h-12 flex-1 items-center justify-center rounded-xl bg-canopy px-5 text-sm font-semibold text-white shadow-[0_10px_24px_-12px_rgba(15,61,46,0.65)] transition hover:bg-canopy-deep sm:h-14 sm:text-[15px]"
                >
                  Create free account
                </AuthOpenButton>
                <AuthOpenButton
                  mode="sign-in"
                  callbackUrl={callbackPath}
                  className="inline-flex h-12 flex-1 items-center justify-center rounded-xl border border-line bg-mist px-5 text-sm font-semibold text-ink transition hover:border-canopy/35 hover:bg-canopy/5 sm:h-14 sm:text-[15px]"
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
