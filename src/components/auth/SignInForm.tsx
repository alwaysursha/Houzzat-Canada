"use client";

import { useRef, useState } from "react";
import { getSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { AuthBenefitsPanel } from "@/components/auth/AuthBenefitsPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { flyToAccountPortal } from "@/lib/fly-to-account";

export function SignInForm({
  callbackUrl: _callbackUrl = null,
  onSuccess,
  onSwitchMode,
}: {
  callbackUrl?: string | null;
  onSuccess?: () => void;
  onSwitchMode?: () => void;
}) {
  const router = useRouter();
  const submitRef = useRef<HTMLButtonElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const result = await signIn("credentials", {
      email: email.trim().toLowerCase(),
      password,
      redirect: false,
    });

    if (result?.error) {
      setPending(false);
      if (result.error === "Configuration") {
        setError("Sign-in is temporarily unavailable. Please try again shortly.");
      } else {
        setError("Invalid email or password.");
      }
      return;
    }

    await getSession();
    const fromRect = submitRef.current?.getBoundingClientRect() ?? null;
    setPending(false);
    onSuccess?.();
    router.refresh();
    // Stay on the current page — fly to the header account / dashboard control.
    window.setTimeout(() => flyToAccountPortal(fromRect), 40);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <AuthBenefitsPanel />
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="auth-signin-email">
          Email
        </label>
        <Input
          id="auth-signin-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="auth-signin-password">
          Password
        </label>
        <Input
          id="auth-signin-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={pending} ref={submitRef}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      {onSwitchMode ? (
        <p className="text-center text-sm text-ink/60">
          New here?{" "}
          <button
            type="button"
            onClick={onSwitchMode}
            className="font-semibold text-canopy hover:underline"
          >
            Create account
          </button>
        </p>
      ) : null}
    </form>
  );
}
