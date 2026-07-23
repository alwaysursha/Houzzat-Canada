"use client";

import { useMemo, useState } from "react";
import { loadPersistedUtm } from "@/components/ads/UtmCapture";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const CHECKS = [
  { id: "repairs", label: "Major repairs or reno done / budgeted", weight: 15 },
  { id: "declutter", label: "Decluttered & staged-ready", weight: 15 },
  { id: "docs", label: "Tax / utility / condo docs gathered", weight: 15 },
  { id: "photos", label: "Professional photos booked or done", weight: 15 },
  { id: "timeline", label: "Clear move timeline (90 days or less)", weight: 20 },
  { id: "price", label: "Reviewed recent area comps / valuation", weight: 20 },
] as const;

export function SellerReadinessForm() {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [address, setAddress] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
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
    setPending(true);
    await fetch("/api/tools/seller-readiness", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address,
        name,
        email,
        score,
        checks: checked,
        ...loadPersistedUtm(),
      }),
    });
    setPending(false);
    setDone(true);
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

      <div className="space-y-3 rounded-2xl border border-line bg-surface p-5">
        <Input
          required
          placeholder="Property address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <Input
          required
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          required
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Saving…" : "Get a launch plan"}
        </Button>
      </div>
    </form>
  );
}
