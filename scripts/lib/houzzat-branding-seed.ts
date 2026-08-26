/**
 * Stage 3K.2 / 3K.4.4 — Houzzat Tenant #1 seed values (production-visible assets).
 */
import { SITE_DESCRIPTION, SITE_NAME } from "../../src/lib/constants";
import {
  LEGACY_HOUZZAT_ASSETS,
  LEGACY_HOUZZAT_COLORS,
  LEGACY_HOUZZAT_FOOTER_LEGAL,
} from "../../src/lib/tenancy/legacy-houzzat-brand";

export const HOUZZAT_BRANDING_SEED = {
  tier: "FULL_BRANDED" as const,
  displayName: SITE_NAME,
  tagline: SITE_DESCRIPTION,
  logoUrl: LEGACY_HOUZZAT_ASSETS.logoUrl,
  brokerageLogoUrl: LEGACY_HOUZZAT_ASSETS.brokerageLogoUrl,
  faviconUrl: LEGACY_HOUZZAT_ASSETS.faviconUrl,
  ogImageUrl: LEGACY_HOUZZAT_ASSETS.ogImageUrl,
  primaryColor: LEGACY_HOUZZAT_COLORS.primary,
  secondaryColor: LEGACY_HOUZZAT_COLORS.secondary,
  accentColor: LEGACY_HOUZZAT_COLORS.accent,
  contactEmail: "notify@houzzat.com",
  contactPhone: "+16472214949",
  footerLegalText: LEGACY_HOUZZAT_FOOTER_LEGAL,
  poweredByHouzzatPro: true,
  seoDescription: SITE_DESCRIPTION,
  version: 1,
};
