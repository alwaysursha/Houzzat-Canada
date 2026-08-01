"use client";

import { Lock } from "lucide-react";
import { AuthOpenButton } from "@/components/auth/AuthOpenButton";
import { cn } from "@/lib/utils";

export function InsightGate({
  title,
  body,
  callbackPath,
  className,
  children,
}: {
  title: string;
  body: string;
  callbackPath: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-2xl", className)}>
      {children ? (
        <div className="pointer-events-none select-none blur-[6px] opacity-55" aria-hidden>
          {children}
        </div>
      ) : (
        <div
          className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgb(15_107_76/0.12),transparent_55%),linear-gradient(135deg,rgb(244_247_245),rgb(232_239_235))]"
          aria-hidden
        />
      )}
      <div className="absolute inset-0 flex items-center justify-center bg-surface/55 p-4 backdrop-blur-[2px]">
        <div className="max-w-sm rounded-2xl border border-line bg-surface/95 p-5 text-center shadow-lg">
          <span className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-canopy/10 text-canopy">
            <Lock className="size-4" aria-hidden />
          </span>
          <p className="text-sm font-semibold text-ink">{title}</p>
          <p className="mt-1.5 text-xs leading-relaxed text-ink/55">{body}</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <AuthOpenButton
              mode="sign-up"
              callbackUrl={callbackPath}
              className="rounded-lg bg-canopy px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-canopy-deep"
            >
              Create free account
            </AuthOpenButton>
            <AuthOpenButton
              mode="sign-in"
              callbackUrl={callbackPath}
              className="rounded-lg px-3 py-2 text-xs font-semibold text-canopy transition hover:bg-canopy/10"
            >
              Sign in
            </AuthOpenButton>
          </div>
        </div>
      </div>
    </div>
  );
}
