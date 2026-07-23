"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthOpenButton } from "@/components/auth/AuthOpenButton";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { Button } from "@/components/ui/button";
import { VOW_SUMMARY } from "@/lib/vow";

/** Shown to guests when sold / history is locked. Registered clients already have access. */
export function VowAcceptCard({
  callbackPath,
}: {
  callbackPath?: string;
}) {
  const { status } = useSession();
  const router = useRouter();
  const { openAuth } = useAuthModal();
  const [pending, setPending] = useState(false);

  const callback = callbackPath ?? "/account";

  async function ensureClientAccess() {
    if (status === "authenticated") {
      setPending(true);
      await fetch("/api/vow/accept", { method: "POST" });
      setPending(false);
      router.refresh();
      return;
    }
    openAuth({ mode: "sign-up", callbackUrl: callback });
  }

  return (
    <div className="rounded-2xl border border-canopy/25 bg-canopy/5 p-5">
      <h3 className="font-semibold text-ink">
        Sold prices & history for Houzzat clients
      </h3>
      <p className="mt-2 text-sm text-ink/70">{VOW_SUMMARY}</p>
      {status === "authenticated" ? (
        <Button
          className="mt-4"
          onClick={() => void ensureClientAccess()}
          disabled={pending}
        >
          {pending ? "Unlocking…" : "Refresh client access"}
        </Button>
      ) : (
        <div className="mt-4 flex flex-wrap gap-3">
          <Button onClick={() => void ensureClientAccess()}>
            Register free
          </Button>
          <AuthOpenButton
            mode="sign-in"
            callbackUrl={callback}
            className="inline-flex h-11 items-center rounded-lg border border-line px-5 text-sm font-semibold text-ink"
          >
            Sign in
          </AuthOpenButton>
        </div>
      )}
    </div>
  );
}
