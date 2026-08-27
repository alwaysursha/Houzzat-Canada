/**
 * Stage 3K.5.5 — full tenant presentation brand for marketing/public surfaces.
 */
import { SITE_DESCRIPTION } from "@/lib/constants";
import type { WorkspaceBrandPublic } from "@/lib/tenancy/brand-dto";
import type { RequestTenancySuccess } from "@/lib/tenancy/resolve-request-tenancy";

export type MarketingPresentationBrand = {
  displayName: string;
  tagline: string;
  workspaceSlug: string;
  workspaceId: string;
  poweredByHouzzatPro: true;
  isHouzzatWorkspace: boolean;
  logoUrl: string | null;
  brokerageLogoUrl: string | null;
  faviconUrl: string | null;
  ogImageUrl: string | null;
  colors: WorkspaceBrandPublic["colors"];
  contact: WorkspaceBrandPublic["contact"];
  footerLegalText: string | null;
  seoDescription: string;
  version: number;
  publicOrigin: string;
  canonicalOrigin: string;
};

export function toMarketingPresentationBrand(
  tenancy: RequestTenancySuccess,
  canonicalOrigin: string,
): MarketingPresentationBrand {
  const brand = tenancy.brand;
  return {
    displayName: brand.displayName,
    tagline: brand.tagline || SITE_DESCRIPTION,
    workspaceSlug: tenancy.workspaceSlug,
    workspaceId: tenancy.workspaceId,
    poweredByHouzzatPro: true,
    isHouzzatWorkspace: tenancy.workspaceSlug === "houzzat",
    logoUrl: brand.logoUrl,
    brokerageLogoUrl: brand.brokerageLogoUrl,
    faviconUrl: brand.faviconUrl,
    ogImageUrl: brand.ogImageUrl,
    colors: brand.colors,
    contact: brand.contact,
    footerLegalText: brand.footerLegalText,
    seoDescription: brand.seoDescription,
    version: brand.version,
    publicOrigin: tenancy.origin,
    canonicalOrigin,
  };
}

/** Client-safe account label — never "Your Houzzat" on tenant hosts. */
export function tenantAccountLabel(brand: Pick<MarketingPresentationBrand, "displayName" | "isHouzzatWorkspace">): string {
  if (brand.isHouzzatWorkspace) return "Your Houzzat";
  return `Your ${brand.displayName}`;
}
