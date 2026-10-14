"use client";

import { useMemo, useState } from "react";
import { loadPersistedUtm } from "@/components/ads/UtmCapture";
import { BookDemoTurnstile } from "@/components/platform/public/BookDemoTurnstile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SELLER_READINESS_TURNSTILE_ACTION,
  SELLER_READINESS_TURNSTILE_ERROR_MESSAGE,
} from "@/lib/platform/public/turnstile-constants";
import {
  SELLER_READINESS_GENERIC_ERROR,
  SELLER_READINESS_HONEYPOT_FIELD,
} from "@/lib/tools/seller-readiness-abuse";

const CHECKS = [
  { id: "repairs", label: "Major repairs or reno done / budgeted", weight: 15 },
  { id: "declutter", label: "Decluttered & staged-ready", weight: 15 },
  { id: "docs", label: "Tax / utility / condo docs gathered", weight: 15 },
  { id: "photos", label: "Professional photos booked or done", weight: 15 },
  { id: "timeline", label: "Clear move timeline (90 days or less)", weight: 20 },
  { id: "price", label: "Reviewed recent area comps / valuation", weight: 20 },
] as const;

type SellerReadinessFormProps = {
  turnstileSiteKey: string | null;
};

export function SellerReadinessForm({
  turnstileSiteKey,
}: SellerReadinessFormProps) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [address, setAddress] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  const score = useMemo(
    () =>
      CHECKS.reduce(
        (n, c) => n + (checked[c.id] ? c.weight : 0),
        0,
      ),
    [checked],
  );

  const band =
    score >= 80 ? "Listing-ready" : score >= 50 ? "Almost there" : "Early stage";

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!turnstileSiteKey) {
      setError(SELLER_READINESS_TURNSTILE_ERROR_MESSAGE);
      return;
    }
    if (!turnstileToken) {
      setError(SELLER_READINESS_TURNSTILE_ERROR_MESSAGE);
      return;
    }

    setPending(true);
    try {
      const response = await fetch("/api/tools/seller-readiness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          name,
          email,
          score,
          checks: checked,
          turnstileToken,
          [SELLER_READINESS_HONEYPOT_FIELD]: honeypot,
          ...loadPersistedUtm(),
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;

      if (!response.ok || !payload?.ok) {
        setError(
          typeof payload?.error === "string" && payload.error.trim()
            ? payload.error
            : SELLER_READINESS_GENERIC_ERROR,
        );
        setTurnstileToken(null);
        setResetSignal((n) => n + 1);
        return;
      }

      setDone(true);
    } catch {
      setError(SELLER_READINESS_GENERIC_ERROR);
      setTurnstileToken(null);
      setResetSignal((n) => n + 1);
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <p className="rounded-2xl border border-canopy/30 bg-canopy/5 p-6 text-sm text-canopy-deep">
        Score saved — an agent can help close the remaining gaps and time your
        launch.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="rounded-2xl border border-line bg-surface p-5">
        <p className="text-sm text-ink/55">Readiness score</p>
        <p className="font-display text-4xl text-canopy">{score}/100</p>
        <p className="mt-1 text-sm font-medium text-ink">{band}</p>
      </div>

      <ul className="space-y-2">
        {CHECKS.map((c) => (
          <li key={c.id}>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={Boolean(checked[c.id])}
                onChange={(e) =>
                  setChecked((prev) => ({ ...prev, [c.id]: e.target.checked }))
                }
              />
              <span>
                {c.label}
                <span className="text-ink/40"> · {c.weight} pts</span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      <div className="relative space-y-3 rounded-2xl border border-line bg-surface p-5">
        <Input
          required
          placeholder="Property address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          autoComplete="street-address"
        />
        <Input
          required
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
        />
        <Input
          required
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        {/* Honeypot — hidden from humans, visible to naive bots */}
        <div
          aria-hidden="true"
          className="absolute -left-[9999px] h-0 w-0 overflow-hidden"
        >
          <label>
            Company URL
            <input
              tabIndex={-1}
              autoComplete="off"
              name={SELLER_READINESS_HONEYPOT_FIELD}
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
            />
          </label>
        </div>

        {turnstileSiteKey ? (
          <BookDemoTurnstile
            siteKey={turnstileSiteKey}
            onTokenChange={setTurnstileToken}
            resetSignal={resetSignal}
            action={SELLER_READINESS_TURNSTILE_ACTION}
            errorMessage={SELLER_READINESS_TURNSTILE_ERROR_MESSAGE}
          />
        ) : (
          <p className="text-sm text-red-700" role="alert">
            {SELLER_READINESS_TURNSTILE_ERROR_MESSAGE}
          </p>
        )}

        {error ? (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}

        <Button
          type="submit"
          className="w-full"
          disabled={pending || !turnstileSiteKey || !turnstileToken}
        >
          {pending ? "Saving…" : "Get a launch plan"}
        </Button>
      </div>
    </form>
  );
}
