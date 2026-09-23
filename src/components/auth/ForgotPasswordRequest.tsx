"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ForgotPasswordRequest({
  initialEmail,
  workspaceHint = null,
  onBack,
}: {
  initialEmail: string;
  workspaceHint?: string | null;
  onBack: () => void;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          ...(workspaceHint ? { workspaceHint } : {}),
        }),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (response.status === 429) {
        setError(
          data?.error ?? "Please wait a minute before requesting another email.",
        );
        setPending(false);
        return;
      }
      if (!response.ok) {
        setError(data?.error ?? "Enter a valid email address.");
        setPending(false);
        return;
      }

      setSent(true);
    } catch {
      setError("Could not send the reset email. Try again shortly.");
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <div className="space-y-1.5">
          <h3 className="font-display text-xl text-ink">Check your email</h3>
          <p className="text-sm leading-relaxed text-ink/65">
            If an account exists for that address, we sent a reset link. It
            expires in one hour.
          </p>
        </div>
        <Button type="button" className="w-full" onClick={onBack}>
          Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <h3 className="font-display text-xl text-ink">Forgot your password?</h3>
        <p className="text-sm leading-relaxed text-ink/65">
          Enter your email and we’ll send a link to choose a new password.
        </p>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="auth-forgot-email">
          Email
        </label>
        <Input
          id="auth-forgot-email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
      <p className="text-center text-sm text-ink/60">
        <button
          type="button"
          onClick={onBack}
          className="font-semibold text-canopy hover:underline"
        >
          Back to sign in
        </button>
      </p>
    </form>
  );
}
