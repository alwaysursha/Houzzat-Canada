"use client";

import { useState, type FormEvent } from "react";
import { BookDemoTurnstile } from "@/components/platform/public/BookDemoTurnstile";
import {
  BOOK_DEMO_CTA_LABEL,
  BOOK_DEMO_CTA_SUBMITTING,
  BOOK_DEMO_FORM_INTRO,
  BOOK_DEMO_FORM_TITLE,
  BOOK_DEMO_HONEYPOT_FIELD,
  BOOK_DEMO_MESSAGE_MAX,
  BOOK_DEMO_REASSURANCE,
  BOOK_DEMO_SUCCESS_PRIMARY,
  BOOK_DEMO_SUCCESS_SECONDARY,
  BOOK_DEMO_SUCCESS_TITLE,
} from "@/lib/platform/public/book-demo-copy";
import { BOOK_DEMO_TURNSTILE_ERROR_MESSAGE } from "@/lib/platform/public/turnstile-constants";

type ApiEnvelope =
  | { ok: true; data: { received: true } }
  | { ok: false; code: string; message: string };

const fieldClass =
  "mt-1.5 w-full rounded-lg border border-slate-200/90 bg-[#fbfcfb] px-3.5 py-[0.8rem] text-[15px] leading-snug text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] outline-none transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-slate-400 hover:border-slate-300 focus:border-emerald-600 focus:bg-white focus:ring-[3px] focus:ring-emerald-600/15";
const labelClass =
  "block text-[12px] font-semibold tracking-[0.02em] text-slate-700";
const optionalClass = "font-medium text-slate-400";

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
      <div className="book-demo-success px-1 py-6 text-center sm:px-2 sm:py-10">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50">
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-full bg-emerald-600"
          />
        </div>
        <h2 className="mt-5 font-display text-3xl font-semibold tracking-tight text-slate-900">
          {BOOK_DEMO_SUCCESS_TITLE}
        </h2>
        <p className="mt-3 text-base font-medium text-slate-800">
          {BOOK_DEMO_SUCCESS_PRIMARY}
        </p>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-slate-600">
          {BOOK_DEMO_SUCCESS_SECONDARY}
        </p>
      </div>
    );
  }

  const canSubmit = Boolean(turnstileToken) && !submitting;

  return (
    <form onSubmit={onSubmit} className="relative space-y-5" noValidate>
      <header className="border-b border-slate-100 pb-5">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-emerald-700 uppercase">
          Private consultation
        </p>
        <h2 className="mt-2 font-display text-[1.75rem] leading-tight font-semibold tracking-tight text-slate-900 sm:text-[2rem]">
          {BOOK_DEMO_FORM_TITLE}
        </h2>
        <p className="mt-2.5 text-sm leading-relaxed text-slate-600 sm:text-[15px]">
          {BOOK_DEMO_FORM_INTRO}
        </p>
      </header>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-4">
        <label className={`${labelClass} sm:col-span-2`}>
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

        <label className={`${labelClass} sm:col-span-2`}>
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
          Region / city{" "}
          <span className={optionalClass}>(optional)</span>
          <input
            autoComplete="address-level2"
            name="region"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className={fieldClass}
          />
        </label>

        <label className={`${labelClass} sm:col-span-2`}>
          Website <span className={optionalClass}>(optional)</span>
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

        <label className={`${labelClass} sm:col-span-2`}>
          What are you looking for?{" "}
          <span className={optionalClass}>(optional)</span>
          <textarea
            name="message"
            rows={4}
            maxLength={BOOK_DEMO_MESSAGE_MAX}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className={`${fieldClass} min-h-[7rem] resize-y`}
          />
        </label>
      </div>

      <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-3 sm:px-4">
        <BookDemoTurnstile
          siteKey={turnstileSiteKey}
          onTokenChange={setTurnstileToken}
          resetSignal={turnstileResetSignal}
        />
      </div>

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

      <div className="space-y-3 pt-1">
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex w-full items-center justify-center rounded-lg bg-[#0b6b4a] px-5 py-3.5 text-[15px] font-semibold tracking-tight text-white shadow-[0_10px_24px_-12px_rgba(11,107,74,0.85)] transition-[background-color,transform,box-shadow] duration-150 hover:-translate-y-px hover:bg-[#095c40] hover:shadow-[0_14px_28px_-12px_rgba(11,107,74,0.9)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0 disabled:hover:bg-[#0b6b4a] disabled:hover:shadow-[0_10px_24px_-12px_rgba(11,107,74,0.85)]"
        >
          {submitting ? BOOK_DEMO_CTA_SUBMITTING : BOOK_DEMO_CTA_LABEL}
        </button>
        <p className="text-center text-[11px] leading-relaxed tracking-wide text-slate-500 sm:text-xs">
          {BOOK_DEMO_REASSURANCE}
        </p>
      </div>
    </form>
  );
}
