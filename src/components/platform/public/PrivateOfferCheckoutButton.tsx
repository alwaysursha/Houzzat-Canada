"use client";

import { useRouter } from "next/navigation";
import {
  PRIVATE_OFFER_CHECKOUT_CTA,
  PRIVATE_OFFER_CHECKOUT_SUBMITTING,
} from "@/lib/platform/offers/private-offer-copy";
import { PRIVATE_OFFER_PATH_PREFIX } from "@/lib/platform/offers/constants";
import { useState } from "react";

/**
 * Navigates to the on-site Embedded Checkout page.
 * Does not redirect to checkout.stripe.com.
 */
export function PrivateOfferCheckoutButton({
  rawToken,
}: {
  rawToken: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  function onClick() {
    setSubmitting(true);
    router.push(
      `${PRIVATE_OFFER_PATH_PREFIX}/${encodeURIComponent(rawToken)}/checkout`,
    );
  }

  return (
    <div className="mt-8">
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
