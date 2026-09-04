"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  HOUZZATPRO_PRIVACY_PATH,
  HOUZZATPRO_PRIVACY_VERSION,
  HOUZZATPRO_TERMS_PATH,
  HOUZZATPRO_TERMS_VERSION,
} from "@/lib/platform/legal/versions";
import {
  PRIVATE_OFFER_ACCEPT_COMMERCIAL,
  PRIVATE_OFFER_ACCEPT_EMAIL_HINT,
  PRIVATE_OFFER_ACCEPT_EMAIL_LABEL,
  PRIVATE_OFFER_ACCEPT_PRIVACY,
  PRIVATE_OFFER_ACCEPT_SUBMIT,
  PRIVATE_OFFER_ACCEPT_SUBMITTING,
  PRIVATE_OFFER_ACCEPT_TERMS,
  PRIVATE_OFFER_CTA_BODY,
  PRIVATE_OFFER_CTA_TITLE,
} from "@/lib/platform/offers/private-offer-copy";

export function PrivateOfferAcceptForm({ rawToken }: { rawToken: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [acceptCommercialTerms, setAcceptCommercialTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(
        `/api/platform/public/offers/${encodeURIComponent(rawToken)}/accept`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            acceptTerms,
            acceptPrivacy,
            acceptCommercialTerms,
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
      } | null;
      if (!response.ok || !payload?.ok) {
        setError(
          payload?.message ||
            "Unable to accept this offer right now. Please try again.",
        );
        return;
      }
      router.refresh();
    } catch {
      setError("Unable to accept this offer right now. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mt-6 rounded-[1.35rem] border border-emerald-900/20 bg-[#07111f] p-5 text-white sm:p-8">
      <h2 className="font-display text-2xl font-semibold tracking-tight">
        {PRIVATE_OFFER_CTA_TITLE}
      </h2>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-300 sm:text-base">
        {PRIVATE_OFFER_CTA_BODY}
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-5">
        <div>
          <label
            htmlFor="private-offer-accept-email"
            className="block text-[11px] font-semibold tracking-[0.14em] text-slate-400 uppercase"
          >
            {PRIVATE_OFFER_ACCEPT_EMAIL_LABEL}
          </label>
          <input
            id="private-offer-accept-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-2 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/50"
            placeholder="you@brokerage.com"
          />
          <p className="mt-1.5 text-xs text-slate-400">
            {PRIVATE_OFFER_ACCEPT_EMAIL_HINT}
          </p>
        </div>

        <label className="flex items-start gap-3 text-sm leading-relaxed text-slate-200">
          <input
            type="checkbox"
            checked={acceptTerms}
            onChange={(e) => setAcceptTerms(e.target.checked)}
            className="mt-1 size-4 shrink-0 rounded border-white/30 bg-transparent"
          />
          <span>
            {PRIVATE_OFFER_ACCEPT_TERMS}{" "}
            <Link
              href={HOUZZATPRO_TERMS_PATH}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-emerald-300 underline-offset-2 hover:underline"
            >
              Terms of Service
            </Link>
            <span className="mt-1 block text-[11px] text-slate-500">
              Version {HOUZZATPRO_TERMS_VERSION}
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 text-sm leading-relaxed text-slate-200">
          <input
            type="checkbox"
            checked={acceptPrivacy}
            onChange={(e) => setAcceptPrivacy(e.target.checked)}
            className="mt-1 size-4 shrink-0 rounded border-white/30 bg-transparent"
          />
          <span>
            {PRIVATE_OFFER_ACCEPT_PRIVACY}{" "}
            <Link
              href={HOUZZATPRO_PRIVACY_PATH}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-emerald-300 underline-offset-2 hover:underline"
            >
              Privacy Policy
            </Link>
            <span className="mt-1 block text-[11px] text-slate-500">
              Version {HOUZZATPRO_PRIVACY_VERSION}
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 text-sm leading-relaxed text-slate-200">
          <input
            type="checkbox"
            checked={acceptCommercialTerms}
            onChange={(e) => setAcceptCommercialTerms(e.target.checked)}
            className="mt-1 size-4 shrink-0 rounded border-white/30 bg-transparent"
          />
          <span>{PRIVATE_OFFER_ACCEPT_COMMERCIAL}</span>
        </label>

        {error ? (
          <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting
            ? PRIVATE_OFFER_ACCEPT_SUBMITTING
            : PRIVATE_OFFER_ACCEPT_SUBMIT}
        </button>
      </form>
    </section>
  );
}
