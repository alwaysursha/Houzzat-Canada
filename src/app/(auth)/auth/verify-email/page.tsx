"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { EmailVerificationRequired } from "@/components/auth/EmailVerificationRequired";
import { Button } from "@/components/ui/button";

function VerifyEmailInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const callbackUrl = searchParams.get("callbackUrl") || "/account";
  const safeCallback =
    callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")
      ? callbackUrl
      : "/account";

  const [status, setStatus] = useState<"idle" | "working" | "ok" | "error">(
    token ? "working" : "idle",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = (await res.json()) as { error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setStatus("error");
          setError(data.error ?? "Could not verify email.");
          return;
        }
        setStatus("ok");
        window.setTimeout(() => {
          router.replace(safeCallback);
          router.refresh();
        }, 1200);
      } catch {
        if (!cancelled) {
          setStatus("error");
          setError("Could not verify email.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, router, safeCallback]);

  return (
    <div className="mx-auto w-full max-w-lg rounded-3xl border border-line bg-white p-7 shadow-[0_24px_55px_-28px_rgba(15,40,30,0.35)] sm:p-9">
      {status === "working" ? (
        <div className="space-y-2.5 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-canopy">
            Almost there
          </p>
          <h1 className="font-display text-2xl text-ink sm:text-3xl">
            Verifying email…
          </h1>
          <p className="text-sm text-ink/60">Please wait a moment.</p>
        </div>
      ) : null}

      {status === "ok" ? (
        <div className="space-y-4 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-canopy">
            Success
          </p>
          <h1 className="font-display text-2xl text-ink sm:text-3xl">
            Email verified
          </h1>
          <p className="text-sm text-ink/60">
            Your account is unlocked. Redirecting…
          </p>
          <Button type="button" onClick={() => router.replace(safeCallback)}>
            Continue
          </Button>
        </div>
      ) : null}

      {status === "error" ? (
        <div className="space-y-6">
          <div className="space-y-2.5 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-canopy">
              Try again
            </p>
            <h1 className="font-display text-2xl text-ink sm:text-3xl">
              Verification failed
            </h1>
            <p className="text-sm text-ink/60">{error}</p>
          </div>
          <EmailVerificationRequired
            variant="featured"
            icon="mail"
            eyebrow="New link"
            callbackUrl={safeCallback}
            title="Request a fresh email"
            body="We’ll send a new verification link so you can unlock full client access."
          />
        </div>
      ) : null}

      {status === "idle" ? (
        <EmailVerificationRequired
          variant="featured"
          icon="mail"
          eyebrow="Client access"
          callbackUrl={safeCallback}
          title="Verify your email"
          body="Request a new verification link to unlock full client access."
        />
      ) : null}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-md p-6 text-center text-sm text-ink/60">
          Loading…
        </div>
      }
    >
      <VerifyEmailInner />
    </Suspense>
  );
}
