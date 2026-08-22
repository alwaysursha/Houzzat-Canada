"use client";

import { useState } from "react";
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
      ? `Request verification email — ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining`
      : "Request verification email";

  return (
    <div className={cn("space-y-2", className)}>
      <button
        type="button"
        disabled={pending}
        onClick={() => void requestEmail()}
        className="text-sm font-semibold text-white underline decoration-white/50 underline-offset-4 transition hover:decoration-white disabled:opacity-60"
      >
        {pending ? "Sending…" : label}
      </button>
      {message ? (
        <p className="text-xs font-medium text-white/90">{message}</p>
      ) : null}
      {error ? (
        <p className="text-xs font-medium text-amber-100">{error}</p>
      ) : null}
    </div>
  );
}
