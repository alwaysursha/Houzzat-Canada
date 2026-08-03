"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthOpenButton } from "@/components/auth/AuthOpenButton";
import { EmailVerificationRequired } from "@/components/auth/EmailVerificationRequired";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { Button } from "@/components/ui/button";
import { VOW_SUMMARY } from "@/lib/vow";

/** Shown when sold / history is locked for guests or unverified accounts. */
export function VowAcceptCard({
  callbackPath,
}: {
  callbackPath?: string;
}) {
  const { status } = useSession();
  const router = useRouter();
  const { openAuth } = useAuthModal();
  const [pending, setPending] = useState(false);
  const [needsVerify, setNeedsVerify] = useState(false);

  const callback = callbackPath ?? "/account";

  useEffect(() => {
    if (status !== "authenticated") {
      setNeedsVerify(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/account/contact-status");
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          needsEmailVerification?: boolean;
        };
        if (!cancelled) {
          setNeedsVerify(Boolean(data.needsEmailVerification));
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  async function ensureClientAccess() {
    if (status === "authenticated") {
      if (needsVerify) return;
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
      {status === "authenticated" && needsVerify ? (
        <div className="mt-5 rounded-3xl border border-white/70 bg-white p-6 shadow-[0_20px_50px_-28px_rgba(15,61,46,0.3)] sm:p-8">
          <EmailVerificationRequired
            variant="featured"
            icon="mail"
            eyebrow="Sold & history"
            callbackUrl={callback}
            title="Email verification required"
            body="Verify your email to unlock sold prices and listing history."
          />
        </div>
      ) : status === "authenticated" ? (
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
