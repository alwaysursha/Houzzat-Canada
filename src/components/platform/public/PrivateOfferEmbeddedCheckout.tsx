"use client";

import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import Link from "next/link";
import {
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { HouzzatProWordmark } from "@/components/auth/HouzzatProWordmark";
import {
  PRIVATE_OFFER_CHECKOUT_BACK_LABEL,
  PRIVATE_OFFER_CHECKOUT_PAGE_BODY,
  PRIVATE_OFFER_CHECKOUT_PAGE_TITLE,
  PRIVATE_OFFER_CHECKOUT_UNAVAILABLE,
  PRIVATE_OFFER_CTA_SUPPORT_LABEL,
} from "@/lib/platform/offers/private-offer-copy";
import { PRIVATE_OFFER_PATH_PREFIX } from "@/lib/platform/offers/constants";
import { resolveHouzzatProSupportCta } from "@/lib/platform/status";

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

export function PrivateOfferEmbeddedCheckout({
  rawToken,
}: {
  rawToken: string;
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

  if (!publishableConfigured) {
    return (
      <CheckoutShell
        offerHref={offerHref}
        supportHref={support.href}
        error="Checkout is temporarily unavailable. Please contact support."
      />
    );
  }

  return (
    <CheckoutShell offerHref={offerHref} supportHref={support.href} error={error}>
      <div className="mt-8 min-h-[420px] overflow-hidden rounded-2xl bg-white">
        <EmbeddedCheckoutProvider
          stripe={getStripePromise()}
          options={options}
        >
          <EmbeddedCheckout className="w-full" />
        </EmbeddedCheckoutProvider>
      </div>
    </CheckoutShell>
  );
}

function CheckoutShell({
  children,
  offerHref,
  supportHref,
  error,
}: {
  children?: ReactNode;
  offerHref: string;
  supportHref: string;
  error: string | null;
}) {
  return (
    <div className="min-h-dvh bg-[#07111f] px-4 py-10 text-white sm:px-6 sm:py-14">
      <div className="mx-auto w-full max-w-2xl">
        <HouzzatProWordmark size="lg" className="text-white" />
        <h1 className="mt-10 font-display text-3xl font-semibold tracking-tight">
          {PRIVATE_OFFER_CHECKOUT_PAGE_TITLE}
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-300 sm:text-base">
          {PRIVATE_OFFER_CHECKOUT_PAGE_BODY}
        </p>

        {error ? (
          <p className="mt-6 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
            {error}
          </p>
        ) : null}

        {children}

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href={offerHref}
            className="inline-flex rounded-lg border border-white/15 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-white/30 hover:bg-white/5"
          >
            {PRIVATE_OFFER_CHECKOUT_BACK_LABEL}
          </Link>
          <Link
            href={supportHref}
            className="inline-flex rounded-lg border border-white/15 px-4 py-2.5 text-sm font-semibold text-emerald-200 transition hover:border-emerald-400/40 hover:bg-white/5"
          >
            {PRIVATE_OFFER_CTA_SUPPORT_LABEL}
          </Link>
        </div>
      </div>
    </div>
  );
}
