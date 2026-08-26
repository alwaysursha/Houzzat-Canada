/**
 * Stage 3K.2 — client-safe workspace brand DTOs.
 */
import type { BrandingTier } from "@prisma/client";
import { enforcePoweredByHouzzatPro } from "@/lib/tenancy/brand-capabilities";

export type WorkspaceBrandColors = {
  primary: string;
  secondary: string;
  accent: string;
  surface: string;
  ink: string;
};

export type WorkspaceBrandContact = {
  email: string | null;
  phone: string | null;
};

/** Public marketing / consumer surfaces. */
export type WorkspaceBrandPublic = {
  workspaceId: string;
  tier: BrandingTier;
  displayName: string;
  tagline: string;
  logoUrl: string | null;
  brokerageLogoUrl: string | null;
  faviconUrl: string | null;
  ogImageUrl: string | null;
  colors: WorkspaceBrandColors;
  contact: WorkspaceBrandContact;
  footerLegalText: string | null;
  poweredByHouzzatPro: boolean;
  seoDescription: string;
  version: number;
};

/** Staff CRM/admin chrome (extends public). */
export type WorkspaceBrandStaff = WorkspaceBrandPublic & {
  staffDisplayName: string;
};

/** Internal resolver metadata — never serialize to client. */
export type WorkspaceBrandInternal = WorkspaceBrandStaff & {
  source: "legacy_houzzat" | "workspace_row" | "neutral_default";
};

export function toWorkspaceBrandPublic(
  brand: WorkspaceBrandStaff | WorkspaceBrandInternal,
): WorkspaceBrandPublic {
  return {
    workspaceId: brand.workspaceId,
    tier: brand.tier,
    displayName: brand.displayName,
    tagline: brand.tagline,
    logoUrl: brand.logoUrl,
    brokerageLogoUrl: brand.brokerageLogoUrl,
    faviconUrl: brand.faviconUrl,
    ogImageUrl: brand.ogImageUrl,
    colors: brand.colors,
    contact: brand.contact,
    footerLegalText: brand.footerLegalText,
    poweredByHouzzatPro: enforcePoweredByHouzzatPro(brand.poweredByHouzzatPro),
    seoDescription: brand.seoDescription,
    version: brand.version,
  };
}
