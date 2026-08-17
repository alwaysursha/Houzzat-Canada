"use client";

import { Suspense, useEffect, useRef } from "react";
import { getSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { HouzzatProMark } from "@/components/auth/HouzzatProMark";
import { HouzzatProSignInForm } from "@/components/auth/HouzzatProSignInForm";
import { HouzzatProWordmark } from "@/components/auth/HouzzatProWordmark";
import { hardGo } from "@/lib/mobile/nav-back";
import {
  HOUZZATPRO_STAFF_ONLY_PATH,
  HOUZZATPRO_START_PATH,
} from "@/lib/mobile/app-shell";
import { isAdminRole, isAgentRole } from "@/lib/roles";

function safeCallbackPath(callbackUrl: string | null) {
  if (
    !callbackUrl ||
    !callbackUrl.startsWith("/") ||
    callbackUrl.startsWith("//")
  ) {
    return HOUZZATPRO_START_PATH;
  }
  if (callbackUrl.startsWith("/auth") || callbackUrl.startsWith("/pro/sign-in")) {
    return HOUZZATPRO_START_PATH;
  }
  return callbackUrl;
}

function resolvePostSignInHref(callbackUrl: string | null, role?: string) {
  const target = safeCallbackPath(callbackUrl);
  if (
    target === HOUZZATPRO_START_PATH ||
    target.startsWith("/pro") ||
    target.startsWith("/admin") ||
    target.startsWith("/agent")
  ) {
    if (isAdminRole(role)) return "/admin";
    if (isAgentRole(role)) return "/agent";
    return HOUZZATPRO_STAFF_ONLY_PATH;
  }
  return target;
}

function HouzzatProSignInInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const checked = useRef(false);
  const callbackUrl = searchParams.get("callbackUrl");

  useEffect(() => {
    if (checked.current) return;
    checked.current = true;
    void (async () => {
      const session = await getSession();
      if (!session?.user) return;
      const me = await fetch("/api/me", { cache: "no-store" }).catch(() => null);
      if (!me?.ok) return;
      hardGo(resolvePostSignInHref(callbackUrl, session.user.role));
    })();
  }, [callbackUrl, router]);

  return (
    <div className="relative flex min-h-dvh flex-col bg-[linear-gradient(165deg,#96F0D8_0%,#63D9BD_42%,#2FC3A2_100%)] px-5 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))]">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        <div className="text-center">
          <HouzzatProMark className="mx-auto" size={112} />
          <div className="-mt-3">
            <HouzzatProWordmark size="xl" className="text-ink" />
          </div>
          <p className="mt-3 text-base font-semibold tracking-tight text-[#0B5C49]">
            Agent or Broker Login
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-[#0B5C49]/75">
            Login to the most powerful CRM &amp; Leadgen system.
          </p>
        </div>

        <div className="mt-8 rounded-2xl border border-white/35 bg-white/20 p-5 shadow-[0_18px_50px_rgb(11_92_73_/0.12)] backdrop-blur-md sm:p-6">
          <HouzzatProSignInForm callbackUrl={callbackUrl} />
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-[#0B5C49]/60">
          HouzzatPRO is the realtors CRM &amp; LeadGen Platform. Buyers/Sellers
          visit Houzzat.com
        </p>
      </div>
    </div>
  );
}

export function HouzzatProSignInScreen() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-[linear-gradient(165deg,#96F0D8_0%,#63D9BD_42%,#2FC3A2_100%)] text-sm font-medium text-[#0B5C49]/70">
          Opening HouzzatPro…
        </div>
      }
    >
      <HouzzatProSignInInner />
    </Suspense>
  );
}
