"use client";

import { useEffect, useRef } from "react";
import { getSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useAuthModal,
  type AuthMode,
} from "@/components/auth/AuthModalProvider";

function safeCallbackPath(callbackUrl: string | null) {
  if (
    !callbackUrl ||
    !callbackUrl.startsWith("/") ||
    callbackUrl.startsWith("//")
  ) {
    return "/account";
  }
  if (callbackUrl.startsWith("/auth")) {
    return "/account";
  }
  return callbackUrl;
}

function backgroundPath(callbackUrl: string | null) {
  const target = safeCallbackPath(callbackUrl);
  if (
    target.startsWith("/account") ||
    target.startsWith("/admin") ||
    target.startsWith("/agent")
  ) {
    return "/";
  }
  return target;
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

    void (async () => {
      const session = await getSession();
      if (session?.user) {
        // Already signed in — skip the modal bounce and go where they asked.
        router.replace(safeCallbackPath(callbackUrl));
        router.refresh();
        return;
      }
      openAuth({ mode, callbackUrl });
      router.replace(backgroundPath(callbackUrl));
    })();
  }, [mode, openAuth, router, searchParams]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4 text-sm text-ink/50">
      Opening {mode === "sign-in" ? "sign in" : "sign up"}…
    </div>
  );
}
