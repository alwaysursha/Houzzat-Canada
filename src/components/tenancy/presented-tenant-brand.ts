"use client";

import type { MarketingPresentationBrand } from "@/lib/tenancy/marketing-presentation-brand";

/**
 * The auth modal renders outside TenantBrandProvider.
 * Layouts that already resolved a brand publish it here so the modal can
 * read display name and logo without resolving tenancy again.
 */
let current: MarketingPresentationBrand | null = null;
const listeners = new Set<() => void>();

export function publishPresentedTenantBrand(
  brand: MarketingPresentationBrand | null,
): void {
  current = brand;
  for (const listener of listeners) listener();
}

export function getPresentedTenantBrand(): MarketingPresentationBrand | null {
  return current;
}

export function getPresentedTenantBrandServerSnapshot(): null {
  return null;
}

export function subscribePresentedTenantBrand(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
