/**
 * Stage 3K.4.2 — branding tier capabilities (custom domain on all plans).
 */
import type { BrandingTier } from "@prisma/client";

export type BrandTierCapabilities = {
  /** Custom domains allowed on every tier — not premium-gated. */
  customDomain: true;
  /** Product invariant — never hideable by tier or tenant API. */
  poweredByHouzzatPro: true;
  displayName: true;
  colors: true;
  contactInfo: true;
  tenantLogo: boolean;
  brokerageLogo: boolean;
  favicon: boolean;
  brandedAuthAdminShell: boolean;
  richerEmailIdentity: boolean;
  homepageContentBranding: boolean;
  seoOgCustomization: boolean;
  transactionalSurfaceBranding: boolean;
};

const ALL_TIERS_CUSTOM_DOMAIN = true as const;
const ALL_TIERS_POWERED_BY = true as const;

export function capabilitiesForTier(tier: BrandingTier): BrandTierCapabilities {
  switch (tier) {
    case "GENERIC":
      return {
        customDomain: ALL_TIERS_CUSTOM_DOMAIN,
        poweredByHouzzatPro: ALL_TIERS_POWERED_BY,
        displayName: true,
        colors: true,
        contactInfo: true,
        tenantLogo: false,
        brokerageLogo: false,
        favicon: false,
        brandedAuthAdminShell: false,
        richerEmailIdentity: false,
        homepageContentBranding: false,
        seoOgCustomization: false,
        transactionalSurfaceBranding: false,
      };
    case "SEMI_BRANDED":
      return {
        customDomain: ALL_TIERS_CUSTOM_DOMAIN,
        poweredByHouzzatPro: ALL_TIERS_POWERED_BY,
        displayName: true,
        colors: true,
        contactInfo: true,
        tenantLogo: true,
        brokerageLogo: true,
        favicon: true,
        brandedAuthAdminShell: true,
        richerEmailIdentity: true,
        homepageContentBranding: false,
        seoOgCustomization: false,
        transactionalSurfaceBranding: false,
      };
    case "FULL_BRANDED":
      return {
        customDomain: ALL_TIERS_CUSTOM_DOMAIN,
        poweredByHouzzatPro: ALL_TIERS_POWERED_BY,
        displayName: true,
        colors: true,
        contactInfo: true,
        tenantLogo: true,
        brokerageLogo: true,
        favicon: true,
        brandedAuthAdminShell: true,
        richerEmailIdentity: true,
        homepageContentBranding: true,
        seoOgCustomization: true,
        transactionalSurfaceBranding: true,
      };
    default: {
      const _exhaustive: never = tier;
      return _exhaustive;
    }
  }
}

/** DB column may exist but product always forces visible platform credit. */
export function enforcePoweredByHouzzatPro(_stored?: boolean | null): true {
  return true;
}
