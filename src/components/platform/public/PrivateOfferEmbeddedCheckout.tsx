"use client";

import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { HouzzatProWordmark } from "@/components/auth/HouzzatProWordmark";
import {
  PRIVATE_OFFER_CHECKOUT_BACK_LABEL,
  PRIVATE_OFFER_CHECKOUT_PAGE_BODY,
  PRIVATE_OFFER_CHECKOUT_PAGE_TITLE,
  PRIVATE_OFFER_CHECKOUT_UNAVAILABLE,
  PRIVATE_OFFER_CTA_SUPPORT_LABEL,
} from "@/lib/platform/offers/private-offer-copy";
import { PRIVATE_OFFER_PATH_PREFIX } from "@/lib/platform/offers/constants";
import type { PrivateOfferAcceptedPresentation } from "@/lib/platform/offers/private-offer";
import { resolveHouzzatProSupportCta } from "@/lib/platform/status/support";

function readPublishableKey(): string | null {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? "";
  if (!key.startsWith("pk_")) return null;
  return key;
}

let stripePromise: Promise<Stripe | null> | null = null;

function getStripePromise(): Promise<Stripe | null> {
  if (stripePromise) return stripePromise;
  const key = readPublishableKey();
  stripePromise = key ? loadStripe(key) : Promise.resolve(null);
  return stripePromise;
}

function formatCad(cents: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function cadenceLabel(cadence: string): string {
  return cadence === "ANNUAL" ? "Annual" : "Monthly";
}

export function PrivateOfferEmbeddedCheckout({
  rawToken,
  summary,
}: {
  rawToken: string;
  summary: Pick<
    PrivateOfferAcceptedPresentation,
    | "planCode"
    | "billingCadence"
    | "currency"
    | "recurringTotalCents"
    | "oneTimeTotalCents"
    | "preparedFor"
  >;
}) {
  const support = resolveHouzzatProSupportCta();
  const offerHref = `${PRIVATE_OFFER_PATH_PREFIX}/${encodeURIComponent(rawToken)}`;
  const [error, setError] = useState<string | null>(null);
  const publishableConfigured = Boolean(readPublishableKey());

  const fetchClientSecret = useCallback(async () => {
    setError(null);
    const response = await fetch(
      `/api/platform/public/offers/${encodeURIComponent(rawToken)}/checkout`,
      { method: "POST" },
    );
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
      data?: { clientSecret?: string };
    } | null;
    if (!response.ok || !payload?.ok || !payload.data?.clientSecret) {
      const message =
        payload?.message || PRIVATE_OFFER_CHECKOUT_UNAVAILABLE;
      setError(message);
      throw new Error(message);
    }
    return payload.data.clientSecret;
  }, [rawToken]);

  const options = useMemo(
    () => ({
      fetchClientSecret,
    }),
    [fetchClientSecret],
  );

  return (
    <div className="min-h-dvh overflow-x-hidden bg-[#f4f6f5] text-slate-900">
      <header className="relative overflow-hidden bg-[#07111f] text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(16,185,129,0.18),_transparent_45%)]"
        />
        <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
          <HouzzatProWordmark size="lg" className="text-white" />
          <p className="mt-8 text-[11px] font-semibold tracking-[0.2em] text-emerald-300/90 uppercase">
            Secure payment
          </p>
          <h1 className="mt-3 max-w-xl font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            {PRIVATE_OFFER_CHECKOUT_PAGE_TITLE}
          </h1>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-slate-300 sm:text-base">
            {PRIVATE_OFFER_CHECKOUT_PAGE_BODY}
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        {error ? (
          <p className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </p>
        ) : null}

        {!publishableConfigured ? (
          <p className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            Checkout is temporarily unavailable. Please contact support.
          </p>
        ) : null}

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <div className="rounded-[1.35rem] border border-slate-200/90 bg-[#f4f6f5] p-2 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.35)] sm:p-3">
            {publishableConfigured ? (
              <div className="stripe-embedded-checkout min-h-[520px] overflow-hidden rounded-[1.1rem] bg-[#f4f6f5]">
                <EmbeddedCheckoutProvider
                  stripe={getStripePromise()}
                  options={options}
                >
                  <EmbeddedCheckout className="bg-[#f4f6f5]" />
                </EmbeddedCheckoutProvider>
              </div>
            ) : (
              <div className="flex min-h-[240px] items-center justify-center rounded-[1.1rem] bg-white px-6 text-center text-sm text-slate-500">
                Payment form unavailable until Stripe is configured.
              </div>
            )}
          </div>

          <aside className="lg:sticky lg:top-8 space-y-4">
            <div className="rounded-[1.35rem] border border-slate-200/90 bg-white p-6 shadow-[0_16px_40px_-28px_rgba(15,23,42,0.35)]">
              <h2 className="font-display text-lg font-semibold tracking-tight text-slate-900">
                Order summary
              </h2>
              {summary.preparedFor.contactName ||
              summary.preparedFor.companyName ? (
                <p className="mt-2 text-sm text-slate-500">
                  {summary.preparedFor.contactName}
                  {summary.preparedFor.contactName &&
                  summary.preparedFor.companyName
                    ? " · "
                    : ""}
                  {summary.preparedFor.companyName}
                </p>
              ) : null}
              <dl className="mt-5 space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Plan</dt>
                  <dd className="font-semibold text-slate-900">
                    {summary.planCode}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Billing</dt>
                  <dd className="font-semibold text-slate-900">
                    {cadenceLabel(summary.billingCadence)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 border-t border-slate-100 pt-3">
                  <dt className="text-slate-500">Recurring</dt>
                  <dd className="font-semibold text-slate-900">
                    {formatCad(summary.recurringTotalCents)}
                    <span className="font-normal text-slate-400">
                      {" "}
                      / {summary.billingCadence === "ANNUAL" ? "yr" : "mo"}
                    </span>
                  </dd>
                </div>
                {summary.oneTimeTotalCents > 0 ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">One-time</dt>
                    <dd className="font-semibold text-slate-900">
                      {formatCad(summary.oneTimeTotalCents)}
                    </dd>
                  </div>
                ) : null}
              </dl>
              <p className="mt-5 text-xs leading-relaxed text-slate-400">
                Card details are encrypted and processed by Stripe. HouzzatPRO
                never stores your full card number.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href={offerHref}
                className="inline-flex rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                {PRIVATE_OFFER_CHECKOUT_BACK_LABEL}
              </Link>
              <Link
                href={support.href}
                className="inline-flex rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-100"
              >
                {PRIVATE_OFFER_CTA_SUPPORT_LABEL}
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
