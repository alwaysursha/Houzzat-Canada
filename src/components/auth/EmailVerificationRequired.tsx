"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmailVerificationRequired({
  title = "Email verification required",
  body = "Verify your email to keep full access to sold prices, saved searches, photos, and other client tools.",
  callbackUrl,
  className,
  compact = false,
}: {
  title?: string;
  body?: string;
  callbackUrl?: string;
  className?: string;
  compact?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function requestEmail() {
    setPending(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/auth/request-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callbackUrl: callbackUrl?.startsWith("/") ? callbackUrl : undefined,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        alreadyVerified?: boolean;
        emailNotConfigured?: boolean;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not send verification email.");
        return;
      }
      if (data.alreadyVerified) {
        setMessage("Your email is already verified. Refresh the page.");
        return;
      }
      setMessage("Verification email sent. Check your inbox.");
    } catch {
      setError("Could not send verification email.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center text-center",
        compact ? "gap-2" : "gap-3",
        className,
      )}
    >
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full bg-canopy text-white shadow-sm",
          compact ? "size-9" : "size-11",
        )}
      >
        <Mail className={compact ? "size-4" : "size-5"} aria-hidden />
      </span>
      <div className={compact ? "space-y-1" : "space-y-1.5"}>
        <p
          className={cn(
            "font-semibold text-ink",
            compact ? "text-xs" : "text-sm",
          )}
        >
          {title}
        </p>
        <p
          className={cn(
            "leading-relaxed text-ink/60",
            compact ? "text-[11px]" : "text-xs",
          )}
        >
          {body}
        </p>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() => void requestEmail()}
        className={cn(
          "inline-flex w-full items-center justify-center rounded-lg bg-canopy font-semibold text-white transition hover:bg-canopy-deep disabled:opacity-60",
          compact ? "h-9 px-3 text-xs" : "h-10 px-4 text-sm",
        )}
      >
        {pending ? "Sending…" : "Request verification email"}
      </button>
      {message ? (
        <p className="text-xs font-medium text-canopy-deep">{message}</p>
      ) : null}
      {error ? (
        <p className="text-xs font-medium text-amber-800">{error}</p>
      ) : null}
    </div>
  );
}
