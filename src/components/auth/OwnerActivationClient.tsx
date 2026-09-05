"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Props = { token: string };

type View = {
  workspaceName: string;
  ownerEmailMasked: string;
  expiresAt: string;
};

export function OwnerActivationClient({ token }: Props) {
  const router = useRouter();
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/public/activate/${encodeURIComponent(token)}`,
          { headers: { Accept: "application/json" } },
        );
        const body = (await res.json()) as {
          ok: boolean;
          data?: View;
          message?: string;
        };
        if (cancelled) return;
        if (!res.ok || !body.ok || !body.data) {
          setError(body.message ?? "This activation link is invalid or no longer available.");
          return;
        }
        setView(body.data);
      } catch {
        if (!cancelled) setError("Unable to load activation.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/public/activate/${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ password, confirmPassword }),
        },
      );
      const body = (await res.json()) as {
        ok: boolean;
        message?: string;
        data?: { signInPath?: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.message ?? "Unable to activate account.");
        return;
      }
      setDone(true);
      router.refresh();
    } catch {
      setError("Network error while activating account.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Account activated</h1>
        <p className="mt-3 text-sm text-slate-600">
          Your password is set. Sign in to continue workspace setup.
        </p>
        <Link
          href="/auth/sign-in"
          className="mt-6 inline-flex rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (error && !view) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Activation unavailable</h1>
        <p className="mt-3 text-sm text-slate-600">{error}</p>
      </div>
    );
  }

  if (!view) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm text-slate-600">Loading activation…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
        HouzzatPRO
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">
        Activate your account
      </h1>
      <p className="mt-3 text-sm text-slate-600">
        Workspace <span className="font-medium text-slate-800">{view.workspaceName}</span>
        {" · "}
        {view.ownerEmailMasked}
      </p>
      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <label className="block text-sm text-slate-700">
          Password
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm text-slate-700">
          Confirm password
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
        >
          {submitting ? "Saving…" : "Create password"}
        </button>
      </form>
    </div>
  );
}
