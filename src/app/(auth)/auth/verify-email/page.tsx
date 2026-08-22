"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { EmailVerificationRequired } from "@/components/auth/EmailVerificationRequired";
import { safeInternalCallbackUrl } from "@/lib/auth/safe-callback-url";

function verifyErrorMessage(code: string | null): string {
  switch (code) {
    case "missing":
      return "Verification link is missing.";
    case "invalid":
    default:
      return "Verification link expired or invalid.";
  }
}

function VerifyEmailInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const errorCode = searchParams.get("error");
  const callbackUrl = safeInternalCallbackUrl(
    searchParams.get("callbackUrl"),
    "/",
  );

  const [status] = useState<"idle" | "working" | "error">(
    token && !errorCode ? "working" : errorCode ? "error" : "idle",
  );
  const [error] = useState<string | null>(
    errorCode ? verifyErrorMessage(errorCode) : null,
  );

  useEffect(() => {
    if (!token || errorCode) return;

    const params = new URLSearchParams({ token });
    if (callbackUrl !== "/") {
      params.set("callbackUrl", callbackUrl);
    }
    window.location.replace(`/api/auth/verify-email?${params.toString()}`);
  }, [token, errorCode, callbackUrl]);

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
            callbackUrl={callbackUrl}
            title="Request a fresh email"
            body="We’ll send a new verification link so you can unlock full client access."
          />
          <p className="text-center text-sm text-ink/60">
            Already verified?{" "}
            <Link
              href={`/auth/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`}
              className="font-semibold text-canopy hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      ) : null}

      {status === "idle" ? (
        <EmailVerificationRequired
          variant="featured"
          icon="mail"
          eyebrow="Client access"
          callbackUrl={callbackUrl}
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
