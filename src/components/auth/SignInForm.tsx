"use client";

import { useState } from "react";
import { getSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function homeForRole(role: string | undefined) {
  if (role === "ADMIN") return "/admin";
  if (role === "AGENT") return "/agent";
  return "/account";
}

function resolveDestination(
  role: string | undefined,
  callbackUrl: string | null | undefined,
) {
  const roleHome = homeForRole(role);
  if (
    !callbackUrl ||
    !callbackUrl.startsWith("/") ||
    callbackUrl.startsWith("//")
  ) {
    return roleHome;
  }

  if (
    (role === "AGENT" || role === "ADMIN") &&
    callbackUrl.startsWith("/account")
  ) {
    return roleHome;
  }

  if (role === "AGENT" && callbackUrl.startsWith("/admin")) {
    return "/agent";
  }

  return callbackUrl;
}

export function SignInForm({
  callbackUrl = null,
  onSuccess,
  onSwitchMode,
}: {
  callbackUrl?: string | null;
  onSuccess?: () => void;
  onSwitchMode?: () => void;
}) {
  const router = useRouter();
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
      setError("Invalid email or password.");
      return;
    }

    const session = await getSession();
    const destination = resolveDestination(session?.user?.role, callbackUrl);

    setPending(false);
    onSuccess?.();
    router.push(destination);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-sm text-ink/65">
        Customers unlock sold data after registration. Agents and admins use the
        same sign-in.
      </p>
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
      <Button type="submit" className="w-full" disabled={pending}>
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
            Create a customer account
          </button>
        </p>
      ) : null}
    </form>
  );
}
