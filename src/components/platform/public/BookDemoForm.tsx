"use client";

import { useState, type FormEvent } from "react";
import { BookDemoTurnstile } from "@/components/platform/public/BookDemoTurnstile";
import {
  BOOK_DEMO_HONEYPOT_FIELD,
  BOOK_DEMO_MESSAGE_MAX,
  BOOK_DEMO_SUCCESS_PRIMARY,
  BOOK_DEMO_SUCCESS_SECONDARY,
  BOOK_DEMO_SUCCESS_TITLE,
} from "@/lib/platform/public/book-demo-copy";
import { BOOK_DEMO_TURNSTILE_ERROR_MESSAGE } from "@/lib/platform/public/turnstile-constants";

type ApiEnvelope =
  | { ok: true; data: { received: true } }
  | { ok: false; code: string; message: string };

const fieldClass =
  "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-base text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20";
const labelClass = "block text-sm font-medium text-slate-700";

type BookDemoFormProps = {
  turnstileSiteKey: string;
};

export function BookDemoForm({ turnstileSiteKey }: BookDemoFormProps) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetSignal, setTurnstileResetSignal] = useState(0);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [brokerageName, setBrokerageName] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [website, setWebsite] = useState("");
  const [region, setRegion] = useState("");
  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (!turnstileToken) {
      setError(BOOK_DEMO_TURNSTILE_ERROR_MESSAGE);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/platform/public/book-demo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          fullName,
          email,
          phone,
          brokerageName,
          teamSize: teamSize.trim() ? Number(teamSize) : null,
          website: website.trim() || null,
          region: region.trim() || null,
          message: message.trim() || null,
          [BOOK_DEMO_HONEYPOT_FIELD]: honeypot,
          turnstileToken,
        }),
      });
      const body = (await response.json()) as ApiEnvelope;
      if (!response.ok || !body.ok) {
        setError(
          body.ok === false
            ? body.message
            : "Unable to submit your request. Please try again.",
        );
        setTurnstileToken(null);
        setTurnstileResetSignal((n) => n + 1);
        return;
      }
      setDone(true);
    } catch {
      setError("Network error. Please check your connection and try again.");
      setTurnstileToken(null);
      setTurnstileResetSignal((n) => n + 1);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-6 py-8 text-center sm:px-8">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
          {BOOK_DEMO_SUCCESS_TITLE}
        </h2>
        <p className="mt-3 text-base text-slate-700">{BOOK_DEMO_SUCCESS_PRIMARY}</p>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          {BOOK_DEMO_SUCCESS_SECONDARY}
        </p>
      </div>
    );
  }

  const canSubmit = Boolean(turnstileToken) && !submitting;

  return (
    <form onSubmit={onSubmit} className="relative space-y-4" noValidate>
      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </div>
      ) : null}

      <label className={labelClass}>
        Full name
        <input
          required
          autoComplete="name"
          name="fullName"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className={fieldClass}
        />
      </label>

      <label className={labelClass}>
        Email
        <input
          required
          type="email"
          autoComplete="email"
          inputMode="email"
          name="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={fieldClass}
        />
      </label>

      <label className={labelClass}>
        Phone
        <input
          required
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          name="phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={fieldClass}
        />
      </label>

      <label className={labelClass}>
        Brokerage / company name
        <input
          required
          autoComplete="organization"
          name="brokerageName"
          value={brokerageName}
          onChange={(e) => setBrokerageName(e.target.value)}
          className={fieldClass}
        />
      </label>

      <label className={labelClass}>
        Team size
        <input
          required
          type="number"
          inputMode="numeric"
          min={1}
          max={10000}
          name="teamSize"
          value={teamSize}
          onChange={(e) => setTeamSize(e.target.value)}
          className={fieldClass}
        />
      </label>

      <label className={labelClass}>
        Website <span className="font-normal text-slate-400">(optional)</span>
        <input
          type="url"
          inputMode="url"
          autoComplete="url"
          name="website"
          placeholder="https://"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          className={fieldClass}
        />
      </label>

      <label className={labelClass}>
        Region / city{" "}
        <span className="font-normal text-slate-400">(optional)</span>
        <input
          autoComplete="address-level2"
          name="region"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          className={fieldClass}
        />
      </label>

      <label className={labelClass}>
        What are you looking for?{" "}
        <span className="font-normal text-slate-400">(optional)</span>
        <textarea
          name="message"
          rows={4}
          maxLength={BOOK_DEMO_MESSAGE_MAX}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className={fieldClass}
        />
      </label>

      <BookDemoTurnstile
        siteKey={turnstileSiteKey}
        onTokenChange={setTurnstileToken}
        resetSignal={turnstileResetSignal}
      />

      {/* Honeypot — hidden from humans */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0"
      >
        <label>
          Fax number
          <input
            tabIndex={-1}
            autoComplete="off"
            name={BOOK_DEMO_HONEYPOT_FIELD}
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className="mt-2 inline-flex w-full items-center justify-center rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {submitting ? "Submitting…" : "Book a Demo"}
      </button>
    </form>
  );
}
