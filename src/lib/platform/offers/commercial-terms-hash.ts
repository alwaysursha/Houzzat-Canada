/**
 * Stage 6.8A — deterministic commercialTermsHash for OfferAcceptance.
 * SHA-256 over canonical JSON of persisted commercial authority only.
 */

import { createHash } from "node:crypto";

export type CommercialTermsHashLineItem = {
  kind: string;
  code: string;
  description: string;
  amountCents: number;
  isRecurring: boolean;
  quantity: number;
  sortOrder: number;
};

export type CommercialTermsHashInput = {
  offerId: string;
  version: number;
  planCode: string;
  billingCadence: string;
  currency: string;
  negotiatedRecurringAmountCents: number;
  setupFeeCents: number;
  includedSeats: number;
  additionalSeats: number;
  trialDays: number | null;
  proposedStartDate: string | null;
  expiresAt: string | null;
  lineItems: CommercialTermsHashLineItem[];
};

function stableStringify(value: unknown): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "number" || t === "boolean") return JSON.stringify(value);
  if (t === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  if (t === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys
      .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(String(value));
}

function dateToIsoOrNull(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Build the canonical payload object used for hashing.
 * Excludes UI formatting, tokens, notes, audits, and client payloads.
 */
export function buildCommercialTermsCanonicalPayload(
  input: CommercialTermsHashInput,
): Record<string, unknown> {
  const lineItems = [...input.lineItems]
    .map((item) => ({
      kind: item.kind,
      code: item.code,
      description: item.description,
      amountCents: item.amountCents,
      isRecurring: Boolean(item.isRecurring),
      quantity: item.quantity > 0 ? item.quantity : 1,
      sortOrder: item.sortOrder,
    }))
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.code.localeCompare(b.code) || a.description.localeCompare(b.description);
    });

  return {
    additionalSeats: input.additionalSeats,
    billingCadence: input.billingCadence,
    currency: input.currency,
    expiresAt: input.expiresAt,
    includedSeats: input.includedSeats,
    lineItems,
    negotiatedRecurringAmountCents: input.negotiatedRecurringAmountCents,
    offerId: input.offerId,
    planCode: input.planCode,
    proposedStartDate: input.proposedStartDate,
    setupFeeCents: input.setupFeeCents,
    trialDays: input.trialDays,
    version: input.version,
  };
}

export function hashCommercialTermsPayload(
  payload: Record<string, unknown>,
): string {
  const canonical = stableStringify(payload);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function computeCommercialTermsHash(
  input: CommercialTermsHashInput,
): string {
  return hashCommercialTermsPayload(buildCommercialTermsCanonicalPayload(input));
}

export function commercialTermsHashFromOfferRow(offer: {
  id: string;
  version: number;
  planCode: string;
  billingCadence: string;
  currency: string;
  negotiatedRecurringAmountCents: number;
  setupFeeCents: number;
  includedSeats: number;
  additionalSeats: number;
  trialDays: number | null;
  proposedStartDate: Date | string | null;
  expiresAt: Date | string | null;
  lineItems: Array<{
    kind: string;
    code: string;
    description: string;
    amountCents: number;
    isRecurring: boolean;
    quantity: number;
    sortOrder: number;
  }>;
}): string {
  return computeCommercialTermsHash({
    offerId: offer.id,
    version: offer.version,
    planCode: offer.planCode,
    billingCadence: offer.billingCadence,
    currency: offer.currency,
    negotiatedRecurringAmountCents: offer.negotiatedRecurringAmountCents,
    setupFeeCents: offer.setupFeeCents,
    includedSeats: offer.includedSeats,
    additionalSeats: offer.additionalSeats,
    trialDays: offer.trialDays,
    proposedStartDate: dateToIsoOrNull(offer.proposedStartDate),
    expiresAt: dateToIsoOrNull(offer.expiresAt),
    lineItems: offer.lineItems,
  });
}

export function fingerprintCommercialTermsHash(hash: string): string {
  if (hash.length < 12) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-4)}`;
}
