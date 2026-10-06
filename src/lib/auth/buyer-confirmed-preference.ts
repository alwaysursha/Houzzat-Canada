/**
 * Confirmed buyer search preference from qualification.
 * Must never create/overwrite SavedSearch or drive digests alone.
 */

import type { PrismaClient } from "@prisma/client";

export type ConfirmedPreferenceInput = {
  workspaceId: string;
  userId: string;
  cities?: string[];
  communities?: string[];
  propertyTypes?: string[];
  minPrice?: number | null;
  maxPrice?: number | null;
  minBeds?: number | null;
  transactionType?: string | null;
  source?: "observed" | "confirmed" | "edited";
};

export async function upsertBuyerConfirmedPreference(
  db: Pick<PrismaClient, "buyerConfirmedPreference">,
  input: ConfirmedPreferenceInput,
) {
  const data = {
    workspaceId: input.workspaceId,
    cities: input.cities ?? [],
    communities: input.communities ?? [],
    propertyTypes: input.propertyTypes ?? [],
    minPrice: input.minPrice ?? null,
    maxPrice: input.maxPrice ?? null,
    minBeds: input.minBeds ?? null,
    transactionType: input.transactionType ?? null,
    source: input.source ?? "confirmed",
    confirmedAt: new Date(),
  };

  return db.buyerConfirmedPreference.upsert({
    where: { userId: input.userId },
    create: { userId: input.userId, ...data },
    update: data,
  });
}

/** Compact currency for confirm cards: $800K / $1M / $1.2M */
export function formatCompactPrice(amount: number): string {
  if (!Number.isFinite(amount)) return "";
  const n = Math.round(amount);
  if (n >= 1_000_000 && n % 100_000 === 0) {
    const millions = n / 1_000_000;
    const label = Number.isInteger(millions)
      ? String(millions)
      : millions.toFixed(1);
    return `$${label}M`;
  }
  if (n >= 1000 && n % 1000 === 0) {
    return `$${Math.round(n / 1000)}K`;
  }
  return `$${n.toLocaleString("en-CA")}`;
}

export function formatPriceBand(input: {
  minPrice?: number | null;
  maxPrice?: number | null;
}): string {
  const min = input.minPrice;
  const max = input.maxPrice;
  if (max != null && min == null) return `Up to ${formatCompactPrice(max)}`;
  if (min != null && max == null) return `From ${formatCompactPrice(min)}`;
  if (min != null && max != null) {
    return `${formatCompactPrice(min)} – ${formatCompactPrice(max)}`;
  }
  return "Any price";
}

/**
 * Confirm-search headline: "Hamilton · Up to $800K".
 * Returns null when nothing known (caller shows generic copy).
 */
export function formatConfirmSearchSummary(input: {
  cities?: string[] | null;
  minPrice?: number | null;
  maxPrice?: number | null;
}): string | null {
  const city =
    input.cities?.map((c) => c.trim()).find((c) => c.length > 0) ?? null;
  const hasPrice = input.minPrice != null || input.maxPrice != null;
  if (!city && !hasPrice) return null;
  const price = formatPriceBand({
    minPrice: input.minPrice,
    maxPrice: input.maxPrice,
  });
  if (city) return `${city} · ${price}`;
  return price;
}

export function formatPricePreferenceLabel(input: {
  minPrice?: number | null;
  maxPrice?: number | null;
}): string | null {
  if (input.minPrice == null && input.maxPrice == null) return null;
  return formatPriceBand(input);
}

/** Prefer under-$X wording for round million ceilings. */
export function describeObservedBudget(
  maxPrice: number | null | undefined,
): string | null {
  if (maxPrice == null || !Number.isFinite(maxPrice)) return null;
  return formatPriceBand({ maxPrice });
}

/** Digits-only → number; empty → null. Never stores formatted currency. */
export function parseCurrencyInput(raw: string): number | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

/** Display helper for currency fields: 500000 → "500,000" */
export function formatCurrencyInputDisplay(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "";
  return Math.round(value).toLocaleString("en-CA");
}
