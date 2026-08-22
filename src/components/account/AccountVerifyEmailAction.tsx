"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { cn } from "@/lib/utils";

export function AccountVerifyEmailAction({
  daysRemaining,
  callbackUrl = "/account",
  className,
}: {
  daysRemaining?: number | null;
  callbackUrl?: string;
  className?: string;
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
          callbackUrl: callbackUrl.startsWith("/") ? callbackUrl : undefined,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        alreadyVerified?: boolean;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not send verification email.");
        return;
      }
      if (data.alreadyVerified) {
        setMessage("Your email is already verified.");
        return;
      }
      setMessage("Verification email sent — check your inbox.");
    } catch {
      setError("Could not send verification email.");
    } finally {
      setPending(false);
    }
  }

  const label =
    daysRemaining != null
      ? `Send verification email · ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} left`
      : "Send verification email";

  return (
    <div className={cn("space-y-2.5", className)}>
      <button
        type="button"
        disabled={pending}
        onClick={() => void requestEmail()}
        className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-canopy px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_-14px_rgba(15,107,76,0.55)] transition hover:bg-canopy-deep disabled:opacity-60 sm:w-auto"
      >
        <Mail className="size-4" strokeWidth={2.25} aria-hidden />
        {pending ? "Sending…" : label}
      </button>
      {message ? (
        <p className="text-xs font-medium text-canopy-deep">{message}</p>
      ) : null}
      {error ? (
        <p className="text-xs font-medium text-danger">{error}</p>
      ) : null}
    </div>
  );
}
