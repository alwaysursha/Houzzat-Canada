"use client";

import { useEffect } from "react";
import { HouzzatProMark } from "@/components/auth/HouzzatProMark";
import { HouzzatProWordmark } from "@/components/auth/HouzzatProWordmark";

/**
 * Single continuous HouzzatPRO transition surface for sign-in, bootstrap, and handoff.
 * Stage 3K.5.12 — viewport-locked, non-scrollable, body-scroll-locked fullscreen transition.
 */
export function ProWorkspaceTransition({
  message = "Opening your Workspace...",
}: {
  message?: string;
}) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const origBodyOverflow = document.body.style.overflow;
    const origDocOverflow = document.documentElement.style.overflow;
    const origTouchAction = document.body.style.touchAction;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.style.touchAction = "none";

    return () => {
      document.body.style.overflow = origBodyOverflow;
      document.documentElement.style.overflow = origDocOverflow;
      document.body.style.touchAction = origTouchAction;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[99999] flex h-dvh w-full flex-col overflow-hidden select-none bg-[linear-gradient(165deg,#96F0D8_0%,#63D9BD_42%,#2FC3A2_100%)] px-5 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))]"
      style={{ touchAction: "none" }}
    >
      <style>{`
        @keyframes proWorkspaceProgress {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(80%); }
          100% { transform: translateX(260%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .pro-workspace-indicator {
            animation: none !important;
            width: 100% !important;
            transform: none !important;
          }
        }
      `}</style>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center text-center">
        <HouzzatProMark className="mx-auto" size={112} />
        <div className="mt-4">
          <HouzzatProWordmark size="xl" className="text-ink" />
        </div>
        <p className="mt-5 text-base font-semibold tracking-tight text-[#0B5C49]">
          {message}
        </p>
        <div
          className="mt-6 h-1.5 w-48 overflow-hidden rounded-full bg-[#0B5C49]/15"
          role="progressbar"
          aria-label="Loading workspace"
        >
          <div
            className="pro-workspace-indicator h-full rounded-full bg-[#0B5C49]"
            style={{
              width: "45%",
              animation: "proWorkspaceProgress 1.4s ease-in-out infinite",
            }}
          />
        </div>
      </div>
    </div>
  );
}
