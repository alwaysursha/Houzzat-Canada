/**
 * Stage 3K.5.4 — request-scoped marketing tenancy (server components only).
 *
 * Uses React.cache() for per-request dedupe — NOT a cross-request global tenant.
 */
import { cache } from "react";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/constants";
import type { WorkspaceBrandPublic } from "@/lib/tenancy/brand-dto";
import { buildSyntheticRequestFromHeaders } from "@/lib/tenancy/auth-origin";
import { resolveCanonicalPublicOrigin } from "@/lib/tenancy/canonical-public-origin";
import {
  toMarketingPresentationBrand,
  type MarketingPresentationBrand,
} from "@/lib/tenancy/marketing-presentation-brand";
import {
  resolveRequestTenancy,
  type RequestTenancySuccess,
} from "@/lib/tenancy/resolve-request-tenancy";
import { isTenantDomainScopeWorkspace } from "@/lib/tenancy/tenant-scope-flags";

export type MarketingChromeBrand = MarketingPresentationBrand;

export function toMarketingChromeBrand(
  tenancy: RequestTenancySuccess,
  canonicalOrigin: string,
): MarketingChromeBrand {
  return toMarketingPresentationBrand(tenancy, canonicalOrigin);
}

export function legacyMarketingChromeBrand(
  brand?: WorkspaceBrandPublic,
  origin?: string,
): MarketingChromeBrand {
  const displayName = brand?.displayName ?? SITE_NAME;
  const canonicalOrigin =
    origin ??
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ??
    "http://127.0.0.1:3000";
  return {
    displayName,
    tagline: brand?.tagline ?? SITE_DESCRIPTION,
    workspaceSlug: "houzzat",
    workspaceId: brand?.workspaceId ?? "legacy",
    poweredByHouzzatPro: true,
    isHouzzatWorkspace: true,
    logoUrl: brand?.logoUrl ?? null,
    brokerageLogoUrl: brand?.brokerageLogoUrl ?? null,
    faviconUrl: brand?.faviconUrl ?? null,
    ogImageUrl: brand?.ogImageUrl ?? null,
    colors: brand?.colors ?? {
      primary: "#0F6B4C",
      secondary: "#0A4D38",
      accent: "#1F7A8C",
      surface: "#FFFFFF",
      ink: "#14201C",
    },
    contact: brand?.contact ?? { email: null, phone: null },
    footerLegalText: brand?.footerLegalText ?? null,
    seoDescription: brand?.seoDescription ?? SITE_DESCRIPTION,
    version: brand?.version ?? 0,
    publicOrigin: canonicalOrigin.replace(/\/$/, ""),
    canonicalOrigin: canonicalOrigin.replace(/\/$/, ""),
  };
}

/**
 * Canonical marketing tenancy for hostname-aware chrome.
 * Returns null when workspace scope requires verified hostname and resolution fails.
 */
export const resolveMarketingTenancy = cache(
  async (): Promise<RequestTenancySuccess | null> => {
    let request = await buildSyntheticRequestFromHeaders();
    if (!request && !isTenantDomainScopeWorkspace()) {
      const siteUrl =
        process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://127.0.0.1:3000";
      try {
        request = new Request(siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`);
      } catch {
        request = null;
      }
    }
    if (!request) {
      return isTenantDomainScopeWorkspace() ? null : null;
    }

    const result = await resolveRequestTenancy(request);
    if (!result.ok) {
      return isTenantDomainScopeWorkspace() ? null : null;
    }

    return result;
  },
);

export async function resolveMarketingChromeBrand(): Promise<MarketingChromeBrand | null> {
  return resolveMarketingPresentationBrand();
}

export async function resolveMarketingPresentationBrand(): Promise<MarketingPresentationBrand | null> {
  const tenancy = await resolveMarketingTenancy();
  if (!tenancy) return null;
  const canonicalOrigin = await resolveCanonicalPublicOrigin(
    tenancy.workspaceId,
    tenancy.hostname,
    tenancy.origin.startsWith("http://") ? "http:" : "https:",
  );
  return toMarketingPresentationBrand(tenancy, canonicalOrigin);
}
