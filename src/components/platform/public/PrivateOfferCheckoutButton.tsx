"use client";

import { useState } from "react";
import {
  PRIVATE_OFFER_CHECKOUT_CTA,
  PRIVATE_OFFER_CHECKOUT_SUBMITTING,
} from "@/lib/platform/offers/private-offer-copy";

export function PrivateOfferCheckoutButton({
  rawToken,
}: {
  rawToken: string;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(
        `/api/platform/public/offers/${encodeURIComponent(rawToken)}/checkout`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        },
      );
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
        data?: { checkoutUrl?: string };
      } | null;
      if (!response.ok || !payload?.ok || !payload.data?.checkoutUrl) {
        setError(
          payload?.message ||
            "Unable to start Checkout right now. Please try again.",
        );
        return;
      }
      window.location.assign(payload.data.checkoutUrl);
    } catch {
      setError("Unable to start Checkout right now. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-8">
      {error ? (
        <p className="mb-3 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={onClick}
        disabled={submitting}
        className="inline-flex rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting
          ? PRIVATE_OFFER_CHECKOUT_SUBMITTING
          : PRIVATE_OFFER_CHECKOUT_CTA}
      </button>
    </div>
  );
}
