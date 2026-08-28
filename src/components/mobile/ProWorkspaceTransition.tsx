"use client";

import { HouzzatProMark } from "@/components/auth/HouzzatProMark";
import { HouzzatProWordmark } from "@/components/auth/HouzzatProWordmark";

/**
 * Single continuous HouzzatPRO transition surface for bootstrap + handoff.
 * Stage 3K.5.10.9 — one visual stage from sign-in through tenant destination.
 */
export function ProWorkspaceTransition({
  message = "Opening your workspace…",
}: {
  message?: string;
}) {
  return (
    <div className="relative flex min-h-dvh flex-col bg-[linear-gradient(165deg,#96F0D8_0%,#63D9BD_42%,#2FC3A2_100%)] px-5 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))]">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center text-center">
        <HouzzatProMark className="mx-auto" size={96} />
        <div className="mt-4">
          <HouzzatProWordmark size="lg" className="text-ink" />
        </div>
        <p className="mt-5 text-sm font-medium text-[#0B5C49]/80">{message}</p>
      </div>
    </div>
  );
}
