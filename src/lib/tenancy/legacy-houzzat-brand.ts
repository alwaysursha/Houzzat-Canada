/**
 * Stage 3K.2 — authoritative legacy Houzzat brand (Tenant #1 today).
 * Used when TENANT_BRANDING_SCOPE=legacy — all workspaces resolve here.
 */
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/constants";
import type { WorkspaceBrandInternal } from "@/lib/tenancy/brand-dto";

/** Current production Houzzat palette from src/app/globals.css :root */
export const LEGACY_HOUZZAT_COLORS = {
  primary: "#0F6B4C",
  secondary: "#0A4D38",
  accent: "#1F7A8C",
  surface: "#FFFFFF",
  ink: "#14201C",
} as const;

/**
 * Official Houzzat app icon. Metadata and structured data use this path.
 * The visible site header stays a text wordmark.
 */
export const HOUZZAT_OFFICIAL_LOGO_PATH = "/images/houzzat-app-icon-512.png";

/** Static assets used on production Houzzat site today. */
export const LEGACY_HOUZZAT_ASSETS = {
  logoUrl: HOUZZAT_OFFICIAL_LOGO_PATH,
  faviconUrl: HOUZZAT_OFFICIAL_LOGO_PATH,
  ogImageUrl: HOUZZAT_OFFICIAL_LOGO_PATH,
  brokerageLogoUrl: "/images/royal-lepage-logo.png",
} as const;

/** Footer agent block from SiteFooter.tsx (production-visible). */
export const LEGACY_HOUZZAT_FOOTER_LEGAL = [
  "Ali Syed",
  "Sales Representative",
  "Royal LePage Credit Valley Real Estate",
  "Direct: 647 - 221 - 4949",
  "Office: 905 - 793 - 5000",
  "1-10045 Hurontario St.",
  "Brampton, ON, L6Z 0E6",
].join("\n");

export function buildLegacyHouzzatBrand(
  workspaceId: string,
): WorkspaceBrandInternal {
  return {
    workspaceId,
    source: "legacy_houzzat",
    tier: "FULL_BRANDED",
    displayName: SITE_NAME,
    staffDisplayName: `${SITE_NAME} Team`,
    tagline: SITE_DESCRIPTION,
    logoUrl: LEGACY_HOUZZAT_ASSETS.logoUrl,
    brokerageLogoUrl: LEGACY_HOUZZAT_ASSETS.brokerageLogoUrl,
    faviconUrl: LEGACY_HOUZZAT_ASSETS.faviconUrl,
    ogImageUrl: LEGACY_HOUZZAT_ASSETS.ogImageUrl,
    colors: { ...LEGACY_HOUZZAT_COLORS },
    contact: {
      email: "notify@houzzat.com",
      phone: "+16472214949",
    },
    footerLegalText: LEGACY_HOUZZAT_FOOTER_LEGAL,
    poweredByHouzzatPro: true,
    seoDescription: SITE_DESCRIPTION,
    version: 0,
  };
}
