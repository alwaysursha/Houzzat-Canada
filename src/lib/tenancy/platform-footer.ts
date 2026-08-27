/**
 * Stage 3K.4.2 — mandatory tenant footer platform credit (product invariant).
 */
import type { WorkspaceBrandPublic } from "@/lib/tenancy/brand-dto";
import { enforcePoweredByHouzzatPro } from "@/lib/tenancy/brand-capabilities";

export const HOUZZATPRO_PLATFORM_URL = "https://houzzatpro.com";
export const POWERED_BY_HOUZZATPRO_LABEL = "Powered by HouzzatPRO";

export type TenantFooterModel = {
  tenantDisplayName: string;
  tenantLegalText: string | null;
  platformCredit: {
    label: typeof POWERED_BY_HOUZZATPRO_LABEL;
    href: typeof HOUZZATPRO_PLATFORM_URL;
    mandatory: true;
  };
};

/** Central footer composition — tenant cannot remove platform credit. */
export function buildTenantFooterModel(
  brand: Pick<WorkspaceBrandPublic, "displayName" | "footerLegalText">,
): TenantFooterModel {
  return {
    tenantDisplayName: brand.displayName,
    tenantLegalText: brand.footerLegalText,
    platformCredit: {
      label: POWERED_BY_HOUZZATPRO_LABEL,
      href: HOUZZATPRO_PLATFORM_URL,
      mandatory: true,
    },
  };
}

/** Apply powered-by invariant before any public/staff brand serialization. */
export function applyPlatformFooterInvariant<
  T extends { poweredByHouzzatPro?: boolean | null },
>(brand: T): T & { poweredByHouzzatPro: true } {
  return {
    ...brand,
    poweredByHouzzatPro: enforcePoweredByHouzzatPro(brand.poweredByHouzzatPro),
  };
}
