/**
 * GST/HST on tax-exclusive HouzzatPRO commercial amounts.
 *
 * Place of supply for these services follows the customer's Canadian billing
 * province. Participating provinces are charged that province's HST. Other
 * provinces are charged 5% GST only. Provincial PST, RST, and QST are not
 * added here: those require a separate registration.
 *
 * Callers must pass the discounted net amounts. Catalog prices are not taxed,
 * and tax is never folded back into the net amount.
 */

export const CANADIAN_BILLING_REGIONS = [
  { code: "AB", name: "Alberta" },
  { code: "BC", name: "British Columbia" },
  { code: "MB", name: "Manitoba" },
  { code: "NB", name: "New Brunswick" },
  { code: "NL", name: "Newfoundland and Labrador" },
  { code: "NS", name: "Nova Scotia" },
  { code: "NT", name: "Northwest Territories" },
  { code: "NU", name: "Nunavut" },
  { code: "ON", name: "Ontario" },
  { code: "PE", name: "Prince Edward Island" },
  { code: "QC", name: "Quebec" },
  { code: "SK", name: "Saskatchewan" },
  { code: "YT", name: "Yukon" },
] as const;

export type CanadianBillingRegion =
  (typeof CANADIAN_BILLING_REGIONS)[number]["code"];

export type CommercialTaxTreatment =
  | "taxable"
  | "zero_rated"
  | "exempt"
  | "location_required";

export type CommercialTaxQuote = {
  status: "estimated";
  treatment: CommercialTaxTreatment;
  country: string | null;
  region: string | null;
  label: "GST" | "HST" | "Tax";
  rateBps: number;
  recurringNetCents: number;
  oneTimeNetCents: number;
  recurringTaxCents: number;
  oneTimeTaxCents: number;
  taxCents: number;
  subtotalCents: number;
  firstGrossCents: number;
  recurringGrossCents: number;
  note: string | null;
};

const REGION_SET = new Set<string>(
  CANADIAN_BILLING_REGIONS.map((region) => region.code),
);

export function isCanadianBillingRegion(
  value: string,
): value is CanadianBillingRegion {
  return REGION_SET.has(value);
}

/** Basis points. Nova Scotia HST is 14% from 1 April 2025. */
export function canadianGstHstRateBps(region: CanadianBillingRegion): {
  label: "GST" | "HST";
  rateBps: number;
} {
  switch (region) {
    case "ON":
      return { label: "HST", rateBps: 1_300 };
    case "NS":
      return { label: "HST", rateBps: 1_400 };
    case "NB":
    case "NL":
    case "PE":
      return { label: "HST", rateBps: 1_500 };
    case "AB":
    case "BC":
    case "MB":
    case "NT":
    case "NU":
    case "QC":
    case "SK":
    case "YT":
      return { label: "GST", rateBps: 500 };
    default: {
      const _exhaustive: never = region;
      return _exhaustive;
    }
  }
}

export function taxCentsOnExclusiveAmount(
  netCents: number,
  rateBps: number,
): number {
  if (!Number.isInteger(netCents) || netCents < 0) {
    throw new Error("Taxable amount must be a non-negative integer (cents).");
  }
  if (!Number.isInteger(rateBps) || rateBps < 0) {
    throw new Error("Tax rate must be a non-negative integer (basis points).");
  }
  return Math.round((netCents * rateBps) / 10_000);
}

function provincialNote(region: CanadianBillingRegion | null): string | null {
  switch (region) {
    case "QC":
      return "Quebec QST is not included. This quote collects GST only.";
    case "BC":
      return "British Columbia PST is not included. This quote collects GST only.";
    case "MB":
      return "Manitoba RST is not included. This quote collects GST only.";
    case "SK":
      return "Saskatchewan PST is not included. This quote collects GST only.";
    case "AB":
    case "NB":
    case "NL":
    case "NS":
    case "NT":
    case "NU":
    case "ON":
    case "PE":
    case "YT":
    case null:
      return null;
    default: {
      const _exhaustive: never = region;
      return _exhaustive;
    }
  }
}

export function quoteCommercialTax(input: {
  country: string | null;
  region: string | null;
  taxExempt?: boolean;
  recurringNetCents: number;
  oneTimeNetCents: number;
}): CommercialTaxQuote {
  const recurringNetCents = input.recurringNetCents;
  const oneTimeNetCents = input.oneTimeNetCents;
  if (
    !Number.isInteger(recurringNetCents) ||
    recurringNetCents < 0 ||
    !Number.isInteger(oneTimeNetCents) ||
    oneTimeNetCents < 0
  ) {
    throw new Error("Net prices must be non-negative integers (cents).");
  }
  const subtotalCents = recurringNetCents + oneTimeNetCents;
  const country = input.country?.trim().toUpperCase() || null;
  const region = input.region?.trim().toUpperCase() || null;

  const base = {
    status: "estimated" as const,
    country,
    region,
    recurringNetCents,
    oneTimeNetCents,
    subtotalCents,
  };

  if (input.taxExempt) {
    return {
      ...base,
      treatment: "exempt",
      label: "Tax",
      rateBps: 0,
      recurringTaxCents: 0,
      oneTimeTaxCents: 0,
      taxCents: 0,
      firstGrossCents: subtotalCents,
      recurringGrossCents: recurringNetCents,
      note: "Marked tax-exempt. No GST/HST is added.",
    };
  }

  if (country && country !== "CA") {
    return {
      ...base,
      treatment: "zero_rated",
      label: "Tax",
      rateBps: 0,
      recurringTaxCents: 0,
      oneTimeTaxCents: 0,
      taxCents: 0,
      firstGrossCents: subtotalCents,
      recurringGrossCents: recurringNetCents,
      note: "A supply to a customer outside Canada is zero-rated. GST/HST is not charged.",
    };
  }

  if (!region || !isCanadianBillingRegion(region)) {
    return {
      ...base,
      treatment: "location_required",
      label: "Tax",
      rateBps: 0,
      recurringTaxCents: 0,
      oneTimeTaxCents: 0,
      taxCents: 0,
      firstGrossCents: subtotalCents,
      recurringGrossCents: recurringNetCents,
      note: "A Canadian billing province is required before GST/HST can be calculated.",
    };
  }

  const rate = canadianGstHstRateBps(region);
  const recurringTaxCents = taxCentsOnExclusiveAmount(
    recurringNetCents,
    rate.rateBps,
  );
  const oneTimeTaxCents = taxCentsOnExclusiveAmount(
    oneTimeNetCents,
    rate.rateBps,
  );
  const taxCents = recurringTaxCents + oneTimeTaxCents;
  return {
    ...base,
    country: "CA",
    region,
    treatment: "taxable",
    label: rate.label,
    rateBps: rate.rateBps,
    recurringTaxCents,
    oneTimeTaxCents,
    taxCents,
    firstGrossCents: subtotalCents + taxCents,
    recurringGrossCents: recurringNetCents + recurringTaxCents,
    note: provincialNote(region),
  };
}

export function refundTaxCents(input: {
  refundCents: number;
  grossCents: number;
  taxCents: number;
}): number {
  const { refundCents, grossCents, taxCents } = input;
  if (
    !Number.isInteger(refundCents) ||
    refundCents <= 0 ||
    !Number.isInteger(grossCents) ||
    grossCents <= 0 ||
    !Number.isInteger(taxCents) ||
    taxCents <= 0
  ) {
    return 0;
  }
  const bounded = Math.min(refundCents, grossCents);
  return Math.min(taxCents, Math.round((bounded * taxCents) / grossCents));
}

export type StoredBillingLocation = {
  country: string | null;
  region: string | null;
  taxExempt: boolean;
  taxExemptReason: string | null;
};

export function billingLocationFromLineItems(
  lineItems: Array<{ code: string; metadata?: unknown }>,
): StoredBillingLocation {
  const plan = lineItems.find((item) => item.code === "PLAN_BASE");
  const metadata =
    plan?.metadata && typeof plan.metadata === "object" && !Array.isArray(plan.metadata)
      ? (plan.metadata as Record<string, unknown>)
      : null;
  const country =
    typeof metadata?.billingCountry === "string" ? metadata.billingCountry : null;
  const region =
    typeof metadata?.billingRegion === "string" ? metadata.billingRegion : null;
  const taxExempt = metadata?.taxTreatment === "exempt";
  const taxExemptReason =
    typeof metadata?.taxExemptReason === "string" && metadata.taxExemptReason.trim()
      ? metadata.taxExemptReason.trim()
      : null;
  return { country, region, taxExempt, taxExemptReason };
}

export function gstHstRegistrationNumberIsValid(value: string): boolean {
  return /^\d{9}RT\d{4}$/.test(value.trim().toUpperCase());
}
