"use client";

import { RouteError } from "@/components/feedback/RouteError";
import { useTenantBrand } from "@/components/tenancy/TenantBrandProvider";
import { tenantAccountLabel } from "@/lib/tenancy/marketing-presentation-brand";

export default function AccountError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const brand = useTenantBrand();
  return (
    <RouteError
      error={error}
      reset={reset}
      title={brand ? `${tenantAccountLabel(brand)} couldn’t load` : "Your account couldn’t load"}
    />
  );
}
