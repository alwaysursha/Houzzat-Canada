/**
 * Attach one exclusive Stripe tax rate to Checkout line items.
 * automatic_tax stays off so Stripe Tax cannot add a second charge.
 * Collection is refused until a valid GST/HST registration number is configured.
 */

import type Stripe from "stripe";
import {
  gstHstRegistrationNumberIsValid,
  type CommercialTaxQuote,
} from "@/lib/platform/billing/canadian-tax";

export class CommercialTaxConfigError extends Error {
  readonly code: "TAX_REGISTRATION_MISSING" | "BILLING_LOCATION_REQUIRED";

  constructor(
    message: string,
    code: "TAX_REGISTRATION_MISSING" | "BILLING_LOCATION_REQUIRED",
  ) {
    super(message);
    this.name = "CommercialTaxConfigError";
    this.code = code;
  }
}

export function readGstHstRegistrationNumber(): string | null {
  const value = process.env.HOUZZATPRO_GST_HST_REGISTRATION_NUMBER?.trim().toUpperCase() ?? "";
  if (!value || !gstHstRegistrationNumberIsValid(value)) return null;
  return value;
}

export function assertTaxReadyForCheckout(quote: CommercialTaxQuote): string {
  if (quote.treatment === "location_required") {
    throw new CommercialTaxConfigError(
      "Choose the customer's billing province before starting payment.",
      "BILLING_LOCATION_REQUIRED",
    );
  }
  const registration = readGstHstRegistrationNumber();
  if (!registration) {
    throw new CommercialTaxConfigError(
      "GST/HST registration is not configured, so Checkout cannot collect tax.",
      "TAX_REGISTRATION_MISSING",
    );
  }
  return registration;
}

export async function exclusiveStripeTaxRateId(input: {
  stripe: Stripe;
  quote: CommercialTaxQuote;
}): Promise<string | null> {
  if (input.quote.treatment !== "taxable" || input.quote.rateBps <= 0) return null;
  const code = `houzzatpro:CA:${input.quote.region}:${input.quote.rateBps}`;
  const existing = await input.stripe.taxRates.list({ active: true, limit: 100 });
  const found = existing.data.find(
    (rate) =>
      rate.metadata?.houzzatproTaxCode === code &&
      rate.inclusive === false &&
      rate.active,
  );
  if (found) return found.id;
  const created = await input.stripe.taxRates.create({
    display_name: input.quote.label,
    inclusive: false,
    percentage: input.quote.rateBps / 100,
    country: "CA",
    state: input.quote.region ?? undefined,
    jurisdiction: `CA-${input.quote.region}`,
    description: `${input.quote.label} on tax-exclusive HouzzatPRO services`,
    metadata: { houzzatproTaxCode: code },
  });
  return created.id;
}
