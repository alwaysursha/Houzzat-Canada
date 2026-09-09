"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { PasswordField } from "@/components/auth/PasswordField";
import { Button } from "@/components/ui/button";
import { rememberLoginCredentials } from "@/lib/auth/remembered-login";
import { clearIntentionalSignOut } from "@/lib/mobile/biometrics";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "ready" | "invalid">(
    token.trim() ? "checking" : "invalid",
  );
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token.trim()) {
      setStatus("invalid");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/auth/reset-password?token=${encodeURIComponent(token)}`,
          { cache: "no-store" },
        );
        if (cancelled) return;
        if (!res.ok) {
          setStatus("invalid");
          return;
        }
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("invalid");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setPending(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        email?: string;
      } | null;
      if (!res.ok) {
        setError(data?.error ?? "This reset link is invalid or has expired.");
        setPending(false);
        return;
      }

      const email = data?.email;
      if (email) {
        const result = await signIn("credentials", {
          email,
          password,
          redirect: false,
        });
        if (!result?.error) {
          await rememberLoginCredentials({ email, password });
          const session = await getSession();
          await clearIntentionalSignOut({ userId: session?.user?.id });
          setDone(true);
          router.replace("/");
          router.refresh();
          return;
        }
      }

      setDone(true);
    } catch {
      setError("Could not update your password. Try again shortly.");
    } finally {
      setPending(false);
    }
  }

  function renderBody() {
    switch (status) {
      case "checking":
        return (
          <div className="space-y-2.5 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-canopy">
              Almost there
            </p>
            <h1 className="font-display text-2xl text-ink sm:text-3xl">
              Checking reset link…
            </h1>
          </div>
        );
      case "invalid":
        return (
          <div className="space-y-5 text-center">
            <div className="space-y-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-canopy">
                Try again
              </p>
              <h1 className="font-display text-2xl text-ink sm:text-3xl">
                Link expired
              </h1>
              <p className="text-sm text-ink/60">
                This reset link is invalid or has expired. Request a new one from
                sign in.
              </p>
            </div>
            <Link
              href="/auth/sign-in"
              className="inline-flex h-11 items-center justify-center rounded-lg bg-canopy px-5 text-sm font-semibold text-white hover:bg-canopy-deep"
            >
              Back to sign in
            </Link>
          </div>
        );
      case "ready":
        if (done) {
          return (
            <div className="space-y-5 text-center">
              <div className="space-y-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-canopy">
                  Password updated
                </p>
                <h1 className="font-display text-2xl text-ink sm:text-3xl">
                  You can sign in now
                </h1>
              </div>
              <Link
                href="/auth/sign-in"
                className="inline-flex h-11 items-center justify-center rounded-lg bg-canopy px-5 text-sm font-semibold text-white hover:bg-canopy-deep"
              >
                Sign in
              </Link>
            </div>
          );
        }
        return (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2.5 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-canopy">
                Account
              </p>
              <h1 className="font-display text-2xl text-ink sm:text-3xl">
                Choose a new password
              </h1>
              <p className="text-sm text-ink/60">
                Use at least 8 characters. You’ll be signed in after saving.
              </p>
            </div>
            <PasswordField
              id="auth-reset-password"
              name="new-password"
              label="New password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={setPassword}
            />
            <PasswordField
              id="auth-reset-password-confirm"
              name="confirm-password"
              label="Confirm password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirm}
              onChange={setConfirm}
            />
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Saving…" : "Save new password"}
            </Button>
          </form>
        );
      default: {
        const _exhaustive: never = status;
        throw new Error(`Unhandled reset status: ${String(_exhaustive)}`);
      }
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg rounded-3xl border border-line bg-white p-7 shadow-[0_24px_55px_-28px_rgba(15,40,30,0.35)] sm:p-9">
      {renderBody()}
    </div>
  );
}
