"use client";

import { createContext, useContext, useMemo } from "react";
import type { MarketingPresentationBrand } from "@/lib/tenancy/marketing-presentation-brand";

const TenantBrandContext = createContext<MarketingPresentationBrand | null>(
  null,
);

export function TenantBrandProvider({
  brand,
  children,
}: {
  brand: MarketingPresentationBrand;
  children: React.ReactNode;
}) {
  const value = useMemo(() => brand, [brand]);
  return (
    <TenantBrandContext.Provider value={value}>
      {children}
    </TenantBrandContext.Provider>
  );
}

export function useTenantBrand(): MarketingPresentationBrand | null {
  return useContext(TenantBrandContext);
}

export function useTenantDisplayName(fallback = "Real Estate"): string {
  return useContext(TenantBrandContext)?.displayName ?? fallback;
}
