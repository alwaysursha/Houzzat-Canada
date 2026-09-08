"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { getSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { HouzzatProSignInForm } from "@/components/auth/HouzzatProSignInForm";
import { HouzzatProWordmark } from "@/components/auth/HouzzatProWordmark";
import { ProWorkspaceTransition } from "@/components/mobile/ProWorkspaceTransition";
import {
  isManualSignInRequired,
  markManualSignInRequired,
} from "@/lib/auth/remembered-login";
import { hardGo } from "@/lib/mobile/nav-back";
import { clearNativeNavStage } from "@/lib/mobile/native-route-latch";
import { proNativeAuthController } from "@/lib/mobile/pro-native-auth-controller";
import {
  OWNER_ONBOARDING_AUTH_QUERY,
  parseOwnerOnboardingAuthSearchParams,
} from "@/lib/platform/activation/onboarding-pro-auth";

function HouzzatProSignInInner() {
  const searchParams = useSearchParams();
  const checked = useRef(false);
  const callbackUrl = searchParams.get("callbackUrl");
  const signedOut = searchParams.get("signedOut") === "1";
  const { returnPath, workspaceHint } =
    parseOwnerOnboardingAuthSearchParams(searchParams);
  const [bootstrapping, setBootstrapping] = useState(false);

  useEffect(() => {
    if (checked.current) return;
    checked.current = true;
    if (signedOut) {
      markManualSignInRequired();
      clearNativeNavStage();
    }
    proNativeAuthController.setOnboardingAuthMeta({
      returnPath,
      workspaceHint,
    });
    // After explicit logout, stay on sign-in — user must click Sign in.
    if (signedOut || isManualSignInRequired()) return;
    void (async () => {
      const session = await getSession();
      if (!session?.user) return;
      const me = await fetch("/api/me", { cache: "no-store" }).catch(() => null);
      if (!me?.ok) return;
      setBootstrapping(true);
      void proNativeAuthController.discoverWorkspace().then((res) => {
        if (!res.ok || res.state?.kind === "select_workspace") {
          const q = new URLSearchParams();
          if (returnPath) {
            q.set(OWNER_ONBOARDING_AUTH_QUERY.returnPath, returnPath);
          }
          if (workspaceHint) {
            q.set(OWNER_ONBOARDING_AUTH_QUERY.workspaceHint, workspaceHint);
          }
          const qs = q.toString();
          hardGo(qs ? `/pro?${qs}` : "/pro");
        }
      });
    })();
  }, [callbackUrl, signedOut, returnPath, workspaceHint]);

  if (bootstrapping) {
    return <ProWorkspaceTransition />;
  }

  return (
    <div className="relative flex min-h-dvh flex-col bg-[linear-gradient(165deg,#96F0D8_0%,#63D9BD_42%,#2FC3A2_100%)] px-5 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))]">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        <div className="text-center">
          <HouzzatProWordmark size="xl" className="text-ink" />
          <p className="mt-3 text-base font-semibold tracking-tight text-[#0B5C49]">
            Agent or Broker Login
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-[#0B5C49]/75">
            Login to the most powerful CRM &amp; Leadgen system.
          </p>
        </div>

        <div className="mt-8 rounded-2xl border border-white/35 bg-white/20 p-5 shadow-[0_18px_50px_rgb(11_92_73_/0.12)] backdrop-blur-md sm:p-6">
          <HouzzatProSignInForm
            callbackUrl={callbackUrl}
            returnPath={returnPath}
            workspaceHint={workspaceHint}
          />
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-[#0B5C49]/60">
          HouzzatPRO is a realtors Trusted CRM &amp; LeadGen Platform.
        </p>
      </div>
    </div>
  );
}

export function HouzzatProSignInScreen() {
  return (
    <Suspense fallback={<ProWorkspaceTransition />}>
      <HouzzatProSignInInner />
    </Suspense>
  );
}
