"use client";

import { useEffect, useRef, useState } from "react";
import { getSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { AuthBenefitsPanel } from "@/components/auth/AuthBenefitsPanel";
import { ForgotPasswordRequest } from "@/components/auth/ForgotPasswordRequest";
import { PasswordField } from "@/components/auth/PasswordField";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  hadClientSession,
  loadRememberedLogin,
  rememberLoginCredentials,
} from "@/lib/auth/remembered-login";
import { flyToAccountPortal } from "@/lib/fly-to-account";
import { authSuccessReturnPath } from "@/lib/auth/safe-callback-url";
import { offerBiometricsAfterCredentialsSignIn } from "@/lib/mobile/offer-biometrics-opt-in";
import { clearIntentionalSignOut } from "@/lib/mobile/biometrics";

export function SignInForm({
  callbackUrl = null,
  onSuccess,
  onSwitchMode,
  initialEmail = null,
  notice = null,
}: {
  callbackUrl?: string | null;
  onSuccess?: () => void;
  onSwitchMode?: () => void;
  initialEmail?: string | null;
  notice?: string | null;
}) {
  const router = useRouter();
  const { confirm } = useSiteAlert();
  const submitRef = useRef<HTMLButtonElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [loginAgain, setLoginAgain] = useState(false);
  const [forgotPassword, setForgotPassword] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (initialEmail) {
        setEmail(initialEmail);
        setLoginAgain(true);
        return;
      }
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
  }, [initialEmail]);

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
    const session = await getSession();
    await clearIntentionalSignOut({ userId: session?.user?.id });
    await offerBiometricsAfterCredentialsSignIn({
      email: normalizedEmail,
      password,
      confirm,
      userId: session?.user?.id,
    });
    const fromRect = submitRef.current?.getBoundingClientRect() ?? null;
    setPending(false);
    onSuccess?.();
    const dest = authSuccessReturnPath(callbackUrl);
    if (dest && dest !== window.location.pathname) {
      router.push(dest);
      router.refresh();
      return;
    }
    router.refresh();
    window.setTimeout(() => flyToAccountPortal(fromRect), 40);
  }

  if (forgotPassword) {
    return (
      <ForgotPasswordRequest
        initialEmail={email}
        onBack={() => setForgotPassword(false)}
      />
    );
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
      <PasswordField
        id="auth-signin-password"
        name="password"
        label="Password"
        autoComplete="current-password"
        required
        value={password}
        onChange={setPassword}
        accessory={
          <button
            type="button"
            onClick={() => setForgotPassword(true)}
            className="text-sm font-semibold text-canopy hover:underline"
          >
            Forgot your password?
          </button>
        }
      />
      {notice ? <p className="text-sm text-ink/70">{notice}</p> : null}
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
