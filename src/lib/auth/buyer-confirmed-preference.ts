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

export function formatPricePreferenceLabel(input: {
  minPrice?: number | null;
  maxPrice?: number | null;
}): string | null {
  const max = input.maxPrice;
  const min = input.minPrice;
  if (max != null && min == null) {
    return `under $${Math.round(max / 1000)}K`.replace("000K", "M");
  }
  if (max != null && max >= 1_000_000 && min == null) {
    const millions = max / 1_000_000;
    const label =
      Number.isInteger(millions) ? `${millions}` : millions.toFixed(1);
    return `under $${label}M`;
  }
  if (max != null && min == null) {
    return `up to $${max.toLocaleString("en-CA")}`;
  }
  if (min != null && max != null) {
    return `$${min.toLocaleString("en-CA")} – $${max.toLocaleString("en-CA")}`;
  }
  if (min != null) {
    return `from $${min.toLocaleString("en-CA")}`;
  }
  return null;
}

/** Prefer under-$X wording for round million ceilings. */
export function describeObservedBudget(maxPrice: number | null | undefined): string | null {
  if (maxPrice == null || !Number.isFinite(maxPrice)) return null;
  if (maxPrice >= 1_000_000 && maxPrice % 100_000 === 0) {
    const millions = maxPrice / 1_000_000;
    const label =
      Number.isInteger(millions) ? String(millions) : millions.toFixed(1);
    return `under $${label}M`;
  }
  if (maxPrice >= 1000) {
    return `under $${Math.round(maxPrice).toLocaleString("en-CA")}`;
  }
  return `up to $${maxPrice}`;
}
