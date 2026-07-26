"use client";

import { useEffect, useRef } from "react";
import { getSession, signOut } from "next-auth/react";
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
        // Cookie can look valid while JWT `sub` points at a deleted user row
        // after a DB switch. Confirm the account still resolves before skipping
        // the modal — otherwise we bounce /account ↔ /auth/sign-in forever.
        const me = await fetch("/api/me", { cache: "no-store" }).catch(
          () => null,
        );
        if (me?.ok) {
          router.replace(safeCallbackPath(callbackUrl));
          router.refresh();
          return;
        }
        await signOut({ redirect: false });
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
