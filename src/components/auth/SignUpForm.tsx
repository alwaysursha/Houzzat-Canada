"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { getSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { AuthBenefitsPanel } from "@/components/auth/AuthBenefitsPanel";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { rememberLoginCredentials } from "@/lib/auth/remembered-login";
import { flyToAccountPortal } from "@/lib/fly-to-account";
import { clearIntentionalSignOut } from "@/lib/mobile/biometrics";
import { offerBiometricsAfterCredentialsSignIn } from "@/lib/mobile/offer-biometrics-opt-in";

export function SignUpForm({
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
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const normalizedEmail = email.trim().toLowerCase();
    const response = await fetch("/api/auth/sign-up", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email: normalizedEmail,
        password,
        acceptTerms: true,
      }),
    });

    const data = (await response.json()) as { error?: string };

    if (!response.ok) {
      setPending(false);
      setError(data.error ?? "Could not create account.");
      return;
    }

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
      setError("Account created — please sign in.");
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
      <AuthBenefitsPanel />
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
          onChange={(event) => setName(event.target.value)}
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
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="auth-signup-password">
          Password
        </label>
        <Input
          id="auth-signup-password"
          name="new-password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={pending} ref={submitRef}>
        {pending ? "Creating…" : "Create Houzzat client account"}
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
        contact from Houzzat about your home search.
      </p>
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
