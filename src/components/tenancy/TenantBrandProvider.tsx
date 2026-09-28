"use client";

import { createContext, useContext, useEffect, useMemo } from "react";
import { publishPresentedTenantBrand } from "@/components/tenancy/presented-tenant-brand";
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

  useEffect(() => {
    publishPresentedTenantBrand(brand);
    return () => publishPresentedTenantBrand(null);
  }, [brand]);

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
