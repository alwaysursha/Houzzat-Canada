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
    <div className="mx-auto w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-sm">
      {status === "working" ? (
        <div className="space-y-2 text-center">
          <h1 className="text-xl font-bold text-ink">Verifying email…</h1>
          <p className="text-sm text-ink/60">Please wait a moment.</p>
        </div>
      ) : null}

      {status === "ok" ? (
        <div className="space-y-3 text-center">
          <h1 className="text-xl font-bold text-ink">Email verified</h1>
          <p className="text-sm text-ink/60">
            Your account is unlocked. Redirecting…
          </p>
          <Button type="button" onClick={() => router.replace(safeCallback)}>
            Continue
          </Button>
        </div>
      ) : null}

      {status === "error" ? (
        <div className="space-y-4">
          <div className="space-y-2 text-center">
            <h1 className="text-xl font-bold text-ink">Verification failed</h1>
            <p className="text-sm text-ink/60">{error}</p>
          </div>
          <EmailVerificationRequired callbackUrl={safeCallback} />
        </div>
      ) : null}

      {status === "idle" ? (
        <div className="space-y-4">
          <div className="space-y-2 text-center">
            <h1 className="text-xl font-bold text-ink">Verify your email</h1>
            <p className="text-sm text-ink/60">
              Request a new verification link to unlock full client access.
            </p>
          </div>
          <EmailVerificationRequired callbackUrl={safeCallback} />
        </div>
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
