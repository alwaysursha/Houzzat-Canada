"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { getSession, signIn, useSession } from "next-auth/react";
import { EmailVerificationRequired } from "@/components/auth/EmailVerificationRequired";
import { safeInternalCallbackUrl } from "@/lib/auth/safe-callback-url";
import { stashVerificationSuccessSignal } from "@/lib/auth/verification-success-signal";
import { VERIFY_EMAIL_PROVIDER_ID } from "@/lib/auth/verify-email-constants";

const DIFFERENT_USER_MESSAGE =
  "This verification link belongs to a different account. Please sign out first.";

function verifyErrorMessage(code: string | null): string {
  switch (code) {
    case "missing":
      return "Verification link is missing.";
    case "invalid":
    default:
      return "Verification link expired or invalid.";
  }
}

function mapAuthError(error: string | undefined): string {
  const normalized = error?.trim() ?? "";
  if (
    normalized === "ACCOUNT_DISABLED" ||
    normalized.includes("DISABLED")
  ) {
    return "This account has been disabled. Contact Houzzat support.";
  }
  if (normalized === "STAFF_ACCOUNT" || normalized.includes("STAFF")) {
    return "Use your team sign-in page for this account.";
  }
  return verifyErrorMessage("invalid");
}

async function readContactStatus(): Promise<{ emailVerified: boolean } | null> {
  try {
    const res = await fetch("/api/account/contact-status", {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as { emailVerified: boolean };
  } catch {
    return null;
  }
}

function VerifyEmailInner() {
  const router = useRouter();
  const { update } = useSession();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const errorCode = searchParams.get("error");
  const callbackUrl = safeInternalCallbackUrl(
    searchParams.get("callbackUrl"),
    "/",
  );

  const [status, setStatus] = useState<"idle" | "working" | "error">(
    token && !errorCode ? "working" : errorCode ? "error" : "idle",
  );
  const [error, setError] = useState<string | null>(
    errorCode ? verifyErrorMessage(errorCode) : null,
  );
  const verifyStarted = useRef(false);

  function redirectAfterFreshVerification() {
    stashVerificationSuccessSignal();
    router.replace(callbackUrl);
    router.refresh();
  }

  useEffect(() => {
    if (!token || errorCode || verifyStarted.current) return;
    verifyStarted.current = true;

    void (async () => {
      const contactBefore = await readContactStatus();
      if (contactBefore?.emailVerified) {
        router.replace(callbackUrl);
        router.refresh();
        return;
      }

      const sessionBefore = await getSession();

      if (sessionBefore?.user) {
        const res = await fetch("/api/auth/verify-email/same-user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const body = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          code?: string;
        } | null;

        if (res.status === 403 && body?.code === "different_user") {
          setStatus("error");
          setError(DIFFERENT_USER_MESSAGE);
          return;
        }

        if (body?.error?.includes("disabled")) {
          setStatus("error");
          setError(
            "This account has been disabled. Contact Houzzat support.",
          );
          return;
        }
        if (body?.error?.includes("team sign-in")) {
          setStatus("error");
          setError("Use your team sign-in page for this account.");
          return;
        }

        if (res.ok && body?.ok) {
          await update({ refreshProfile: true });
          const contactAfter = await readContactStatus();
          if (!contactAfter?.emailVerified) {
            setStatus("error");
            setError(verifyErrorMessage("invalid"));
            return;
          }
          redirectAfterFreshVerification();
          return;
        }

        const contactAfterFail = await readContactStatus();
        if (contactAfterFail?.emailVerified) {
          router.replace(callbackUrl);
          router.refresh();
          return;
        }

        setStatus("error");
        setError(body?.error ?? verifyErrorMessage("invalid"));
        return;
      }

      let signInError: string | undefined;
      try {
        const result = await signIn(VERIFY_EMAIL_PROVIDER_ID, {
          token,
          redirect: false,
          callbackUrl,
        });
        signInError = result?.error ?? undefined;
      } catch (err) {
        signInError =
          err instanceof Error ? err.message : "Verification failed";
      }

      if (signInError) {
        const contactAfterFail = await readContactStatus();
        if (contactAfterFail?.emailVerified) {
          router.replace(callbackUrl);
          router.refresh();
          return;
        }
        setStatus("error");
        setError(mapAuthError(signInError));
        return;
      }

      const contactAfter = await readContactStatus();
      if (!contactAfter?.emailVerified) {
        setStatus("error");
        setError(verifyErrorMessage("invalid"));
        return;
      }

      await update({ refreshProfile: true });
      await getSession();
      redirectAfterFreshVerification();
    })();
  }, [token, errorCode, callbackUrl, router, update]);

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
