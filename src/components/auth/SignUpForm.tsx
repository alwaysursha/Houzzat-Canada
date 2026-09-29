"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { getSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { loadPersistedUtm } from "@/components/ads/UtmCapture";
import { reportGa4SignUp } from "@/lib/ads/ga4-sign-up";
import { PasswordField } from "@/components/auth/PasswordField";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EXISTING_ACCOUNT_SIGN_IN_MESSAGE } from "@/lib/auth/existing-account-message";
import { rememberLoginCredentials } from "@/lib/auth/remembered-login";
import { flyToAccountPortal } from "@/lib/fly-to-account";
import { authSuccessReturnPath } from "@/lib/auth/safe-callback-url";
import { clearIntentionalSignOut } from "@/lib/mobile/biometrics";
import { offerBiometricsAfterCredentialsSignIn } from "@/lib/mobile/offer-biometrics-opt-in";

export function SignUpForm({
  callbackUrl = null,
  displayName = "your team",
  initialName = "",
  initialEmail = "",
  focusPassword = false,
  onIdentityChange,
  onSuccess,
  onSwitchMode,
  onExistingAccount,
  afterConsent = null,
}: {
  callbackUrl?: string | null;
  displayName?: string;
  initialName?: string;
  initialEmail?: string;
  focusPassword?: boolean;
  onIdentityChange?: (next: { name: string; email: string }) => void;
  onSuccess?: () => void;
  onSwitchMode?: () => void;
  onExistingAccount?: (email: string) => void;
  afterConsent?: ReactNode;
}) {
  const router = useRouter();
  const { confirm } = useSiteAlert();
  const submitRef = useRef<HTMLButtonElement>(null);
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const continuedRequest = initialName.trim() !== "" && initialEmail.trim() !== "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const trimmedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (!trimmedName) {
      setPending(false);
      setError("Enter your name.");
      return;
    }
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setPending(false);
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setPending(false);
      setError("Password must be at least 8 characters.");
      return;
    }

    let response: Response;
    try {
      response = await fetch("/api/auth/sign-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: trimmedName,
            email: normalizedEmail,
            password,
            acceptTerms: true,
            ...loadPersistedUtm(),
          }),
      });
    } catch {
      setPending(false);
      setError(
        "Could not reach Houzzat. Check your connection and try again.",
      );
      return;
    }

    let data: { error?: string } = {};
    try {
      const raw = await response.text();
      data = raw ? (JSON.parse(raw) as { error?: string }) : {};
    } catch {
      setPending(false);
      if (response.status === 409) {
        if (onExistingAccount) {
          onExistingAccount(normalizedEmail);
          return;
        }
        setError(EXISTING_ACCOUNT_SIGN_IN_MESSAGE);
        return;
      }
      setError("Something went wrong. Please try again.");
      return;
    }

    if (!response.ok) {
      setPending(false);
      if (response.status === 409) {
        if (onExistingAccount) {
          onExistingAccount(normalizedEmail);
          return;
        }
        setError(data.error ?? EXISTING_ACCOUNT_SIGN_IN_MESSAGE);
        return;
      }
      if (response.status === 400) {
        setError(data.error ?? "Please check your name, email, and password.");
        return;
      }
      if (response.status === 403) {
        setError(
          data.error ??
            "This account cannot be created. Contact Houzzat support.",
        );
        return;
      }
      setError(
        data.error ??
          "We couldn't create your account right now. Please try again.",
      );
      return;
    }

    reportGa4SignUp();

    await rememberLoginCredentials({
      email: normalizedEmail,
      password,
    });

    const result = await signIn("credentials", {
      email: normalizedEmail,
      password,
      redirect: false,
    });

    setPending(false);

    if (result?.error) {
      onSwitchMode?.();
      setError(
        "Account created — please sign in with your email and password.",
      );
      return;
    }

    const session = await getSession();
    await clearIntentionalSignOut({ userId: session?.user?.id });
    await offerBiometricsAfterCredentialsSignIn({
      email: normalizedEmail,
      password,
      confirm,
      userId: session?.user?.id,
    });

    const fromRect = submitRef.current?.getBoundingClientRect() ?? null;
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

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4"
      autoComplete="on"
      name="houzzat-signup"
    >
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="auth-signup-name">
          Name
        </label>
        <Input
          id="auth-signup-name"
          name="name"
          autoComplete="name"
          required
          value={name}
          onChange={(event) => {
            const next = event.target.value;
            setName(next);
            onIdentityChange?.({ name: next, email });
          }}
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="auth-signup-email">
          Email
        </label>
        <Input
          id="auth-signup-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => {
            const next = event.target.value;
            setEmail(next);
            onIdentityChange?.({ name, email: next });
          }}
        />
      </div>
      {continuedRequest ? (
        <p className="text-sm text-ink/70">
          Choose a password to finish. Your name and email are still editable.
        </p>
      ) : null}
      <PasswordField
        id="auth-signup-password"
        name="new-password"
        label="Password"
        autoComplete="new-password"
        minLength={8}
        required
        autoFocus={focusPassword || continuedRequest}
        value={password}
        onChange={setPassword}
      />
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={pending} ref={submitRef}>
        {pending ? "Creating…" : "Create Free Account"}
      </Button>
      <p className="text-center text-[11px] leading-relaxed text-ink/50">
        By creating an account you agree to our{" "}
        <Link
          href="/terms"
          className="underline underline-offset-2 hover:text-ink/70"
        >
          Terms
        </Link>
        ,{" "}
        <Link
          href="/privacy"
          className="underline underline-offset-2 hover:text-ink/70"
        >
          Privacy Policy
        </Link>
        , PropTx / VOW client agreement, and to receive email alerts and phone
        contact from {displayName} about your home search.
      </p>
      {afterConsent}
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
