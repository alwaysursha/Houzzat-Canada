"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { AuthBenefitsPanel } from "@/components/auth/AuthBenefitsPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SignUpForm({
  callbackUrl = null,
  onSuccess,
  onSwitchMode,
}: {
  callbackUrl?: string | null;
  onSuccess?: () => void;
  onSwitchMode?: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const response = await fetch("/api/auth/sign-up", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, acceptTerms: true }),
    });

    const data = (await response.json()) as { error?: string };

    if (!response.ok) {
      setPending(false);
      setError(data.error ?? "Could not create account.");
      return;
    }

    const result = await signIn("credentials", {
      email: email.trim().toLowerCase(),
      password,
      redirect: false,
    });

    setPending(false);

    if (result?.error) {
      onSwitchMode?.();
      setError("Account created — please sign in.");
      return;
    }

    onSuccess?.();
    const destination =
      callbackUrl &&
      callbackUrl.startsWith("/") &&
      !callbackUrl.startsWith("//")
        ? callbackUrl
        : "/account";
    router.push(destination);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <AuthBenefitsPanel />
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="auth-signup-name">
          Name
        </label>
        <Input
          id="auth-signup-name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="auth-signup-email">
          Email
        </label>
        <Input
          id="auth-signup-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="auth-signup-password">
          Password
        </label>
        <Input
          id="auth-signup-password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating…" : "Create Houzzat client account"}
      </Button>
      {onSwitchMode ? (
        <p className="text-center text-sm text-ink/60">
          Already registered?{" "}
          <button
            type="button"
            onClick={onSwitchMode}
            className="font-semibold text-canopy hover:underline"
          >
            Sign in
          </button>
        </p>
      ) : null}
    </form>
  );
}
