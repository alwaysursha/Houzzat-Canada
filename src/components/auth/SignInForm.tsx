"use client";

import { useEffect, useRef, useState } from "react";
import { getSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { AuthBenefitsPanel } from "@/components/auth/AuthBenefitsPanel";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  hadClientSession,
  loadRememberedLogin,
  rememberLoginCredentials,
} from "@/lib/auth/remembered-login";
import { flyToAccountPortal } from "@/lib/fly-to-account";
import { offerBiometricsAfterCredentialsSignIn } from "@/lib/mobile/offer-biometrics-opt-in";
import { clearIntentionalSignOut } from "@/lib/mobile/biometrics";

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
  const { confirm } = useSiteAlert();
  const submitRef = useRef<HTMLButtonElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [loginAgain, setLoginAgain] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const remembered = await loadRememberedLogin();
      if (cancelled || !remembered) {
        if (!cancelled) setLoginAgain(hadClientSession());
        return;
      }
      setEmail(remembered.email);
      if (remembered.password) setPassword(remembered.password);
      setLoginAgain(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const normalizedEmail = email.trim().toLowerCase();
    const result = await signIn("credentials", {
      email: normalizedEmail,
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

    await rememberLoginCredentials({ email: normalizedEmail, password });
    await getSession();
    await clearIntentionalSignOut();
    await offerBiometricsAfterCredentialsSignIn({
      email: normalizedEmail,
      password,
      confirm,
    });
    const fromRect = submitRef.current?.getBoundingClientRect() ?? null;
    setPending(false);
    onSuccess?.();
    router.refresh();
    window.setTimeout(() => flyToAccountPortal(fromRect), 40);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4"
      autoComplete="on"
      name="houzzat-signin"
    >
      <AuthBenefitsPanel />
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="auth-signin-email">
          Email
        </label>
        <Input
          id="auth-signin-email"
          name="username"
          type="email"
          autoComplete="username"
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
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={pending} ref={submitRef}>
        {pending ? "Signing in…" : loginAgain ? "Login again" : "Sign in"}
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
