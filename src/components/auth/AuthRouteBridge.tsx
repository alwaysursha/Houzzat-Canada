"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useAuthModal,
  type AuthMode,
} from "@/components/auth/AuthModalProvider";

function backgroundPath(callbackUrl: string | null) {
  if (
    !callbackUrl ||
    !callbackUrl.startsWith("/") ||
    callbackUrl.startsWith("//")
  ) {
    return "/";
  }

  if (
    callbackUrl.startsWith("/account") ||
    callbackUrl.startsWith("/admin") ||
    callbackUrl.startsWith("/agent") ||
    callbackUrl.startsWith("/auth")
  ) {
    return "/";
  }

  return callbackUrl;
}

/** Opens the central auth modal, then returns the user to the app shell. */
export function AuthRouteBridge({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openAuth } = useAuthModal();
  const opened = useRef(false);

  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    const callbackUrl = searchParams.get("callbackUrl");
    openAuth({ mode, callbackUrl });
    router.replace(backgroundPath(callbackUrl));
  }, [mode, openAuth, router, searchParams]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4 text-sm text-ink/50">
      Opening {mode === "sign-in" ? "sign in" : "sign up"}…
    </div>
  );
}
