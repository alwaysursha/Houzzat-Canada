"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { HouzzatProWordmark } from "@/components/auth/HouzzatProWordmark";
import { ProWorkspaceTransition } from "@/components/mobile/ProWorkspaceTransition";
import { Button } from "@/components/ui/button";
import { hardGo } from "@/lib/mobile/nav-back";
import { proNativeAuthController } from "@/lib/mobile/pro-native-auth-controller";

function isStaffRoleDestination(
  value: string | null | undefined,
): value is "/admin" | "/agent" {
  return value === "/admin" || value === "/agent";
}

// Stage 3K.5.19: method: "PUT" exchange and hardGo(destination) owned by proNativeAuthController.

function HandoffExchangeInner() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (started.current || !code) return;
    started.current = true;

    void (async () => {
      const result = await proNativeAuthController.exchangeHandoff(code);
      if (!result.ok) {
        setError(result.error ?? "Workspace handoff failed. Please try again.");
      }
    })();
  }, [code]);

  if (!code) {
    return (
      <div className="fixed inset-0 z-[99999] flex h-dvh w-full flex-col items-center justify-center bg-[linear-gradient(165deg,#96F0D8_0%,#63D9BD_42%,#2FC3A2_100%)] px-6 text-center">
        <HouzzatProWordmark size="lg" className="text-ink" />
        <p className="mt-4 text-base font-semibold text-[#0B5C49]">
          Missing workspace handoff code.
        </p>
        <Button
          type="button"
          onClick={() => proNativeAuthController.retry()}
          className="mt-6 bg-[#0B5C49] px-6 text-white hover:bg-[#094a3b]"
        >
          Sign in again
        </Button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-[99999] flex h-dvh w-full flex-col items-center justify-center bg-[linear-gradient(165deg,#96F0D8_0%,#63D9BD_42%,#2FC3A2_100%)] px-6 text-center">
        <HouzzatProWordmark size="lg" className="text-ink" />
        <p className="mt-5 text-lg font-bold text-[#0B5C49]">
          Unable to open your Workspace
        </p>
        <p className="mt-2 max-w-sm text-sm font-medium text-[#0B5C49]/80">
          {error}
        </p>

        <div className="mt-3 max-w-sm rounded-lg border border-[#0B5C49]/20 bg-white/20 p-2 text-left font-mono text-[10px] text-[#0B5C49]">
          <p>host: {typeof window !== "undefined" ? window.location.hostname : ""}</p>
          <p>codePresent: {code ? "yes" : "no"}</p>
          <p>codePrefix: {code ? code.substring(0, 6) : "(none)"}</p>
        </div>

        <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
          <Button
            type="button"
            disabled={retrying || signingOut}
            onClick={() => {
              setRetrying(true);
              proNativeAuthController.retry();
            }}
            className="h-12 w-full bg-[#0B5C49] text-base font-semibold text-white hover:bg-[#094a3b] disabled:opacity-60"
          >
            {retrying ? "Retrying…" : "Retry"}
          </Button>

          <Button
            type="button"
            variant="secondary"
            disabled={retrying || signingOut}
            onClick={async () => {
              setSigningOut(true);
              await proNativeAuthController.signOut();
            }}
            className="h-12 w-full border-white/50 bg-white/25 text-[#0B5C49] hover:bg-white/40 disabled:opacity-60"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>
        </div>
      </div>
    );
  }

  return <ProWorkspaceTransition />;
}

export function ProMobileHandoffExchange() {
  return (
    <Suspense fallback={<ProWorkspaceTransition />}>
      <HandoffExchangeInner />
    </Suspense>
  );
}
