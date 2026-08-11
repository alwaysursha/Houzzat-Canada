"use client";

import { useEffect, useRef, useState } from "react";
import { loadPersistedUtm } from "@/components/ads/UtmCapture";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Kind = "inquiry" | "showing" | "virtual_viewing";

export function LeadRequestForm({
  mlsNumber,
  kind,
  defaults,
}: {
  mlsNumber: string;
  kind: Kind;
  defaults?: {
    name?: string;
    email?: string;
    phone?: string;
    message?: string;
  };
}) {
  const [name, setName] = useState(defaults?.name ?? "");
  const [email, setEmail] = useState(defaults?.email ?? "");
  const [phone, setPhone] = useState(defaults?.phone ?? "");
  const [message, setMessage] = useState(defaults?.message ?? "");
  const [focusNotes, setFocusNotes] = useState("");
  const [contactConsent, setContactConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const phoneTouched = useRef(false);

  useEffect(() => {
    if (phoneTouched.current) return;
    const next = defaults?.phone ?? "";
    if (next && !phone) setPhone(next);
  }, [defaults?.phone, phone]);

  const isVirtual = kind === "virtual_viewing";

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!contactConsent) {
      setError("Please confirm you agree to be contacted by a Houzzat agent.");
      return;
    }

    setPending(true);
    setError(null);

    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mlsNumber,
        kind,
        name,
        email,
        phone: phone || undefined,
        message: message || undefined,
        focusNotes: focusNotes || undefined,
        contactConsent: true,
        ...loadPersistedUtm(),
      }),
    });

    const data = (await res.json()) as { error?: string };
    setPending(false);

    if (!res.ok) {
      setError(data.error ?? "Could not submit.");
      return;
    }

    setDone(true);
  }

  if (done) {
    const label = isVirtual
      ? "Virtual Viewing request"
      : kind === "showing"
        ? "showing request"
        : "inquiry";
    return (
      <p className="rounded-xl border border-canopy/30 bg-canopy/5 px-4 py-3 text-sm text-canopy-deep">
        Thanks — your {label} was sent. An agent will follow up shortly
        {isVirtual ? " to schedule the live walkthrough" : ""}.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {isVirtual ? (
        <p className="rounded-lg bg-signal/10 px-3 py-2 text-xs text-ink/70">
          An agent goes to the property and walks you through live on video —
          Houzzat’s Virtual Viewing.
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          required
          placeholder="Full name"
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
      </div>
      <Input
        placeholder="Phone (optional)"
        value={phone}
        onChange={(e) => {
          phoneTouched.current = true;
          setPhone(e.target.value);
        }}
        autoComplete="tel"
      />
      {isVirtual ? (
        <Input
          placeholder="What should we focus on? (basement, light, parking…)"
          value={focusNotes}
          onChange={(e) => setFocusNotes(e.target.value)}
        />
      ) : null}
      <textarea
        className="min-h-24 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
        placeholder={
          isVirtual
            ? "Anything else before your Virtual Viewing?"
            : kind === "showing"
              ? "Anything we should know before the showing?"
              : "Ask a question about this home"
        }
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line bg-mist/40 px-3 py-2.5 text-sm text-ink/80">
        <input
          type="checkbox"
          required
          checked={contactConsent}
          onChange={(e) => {
            setContactConsent(e.target.checked);
            if (e.target.checked) setError(null);
          }}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-line accent-canopy"
        />
        <span>
          I agree to be contacted by a Houzzat agent about this request by
          phone, email, or text. I can unsubscribe anytime.
        </span>
      </label>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending
          ? "Sending…"
          : isVirtual
            ? "Request Virtual Viewing"
            : kind === "showing"
              ? "Request in-person showing"
              : "Send inquiry"}
      </Button>
    </form>
  );
}
