/**
 * Stage 3K.5.4 — request-scoped marketing tenancy (server components only).
 *
 * Uses React.cache() for per-request dedupe — NOT a cross-request global tenant.
 */
import { cache } from "react";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/constants";
import type { WorkspaceBrandPublic } from "@/lib/tenancy/brand-dto";
import { buildSyntheticRequestFromHeaders } from "@/lib/tenancy/auth-origin";
import {
  resolveRequestTenancy,
  type RequestTenancySuccess,
} from "@/lib/tenancy/resolve-request-tenancy";
import { isTenantDomainScopeWorkspace } from "@/lib/tenancy/tenant-scope-flags";

export type MarketingChromeBrand = {
  displayName: string;
  tagline: string;
  workspaceSlug: string;
  workspaceId: string;
  poweredByHouzzatPro: true;
};

export function toMarketingChromeBrand(
  tenancy: RequestTenancySuccess,
): MarketingChromeBrand {
  return {
    displayName: tenancy.brand.displayName,
    tagline: tenancy.brand.tagline || SITE_DESCRIPTION,
    workspaceSlug: tenancy.workspaceSlug,
    workspaceId: tenancy.workspaceId,
    poweredByHouzzatPro: true,
  };
}

export function legacyMarketingChromeBrand(
  brand?: WorkspaceBrandPublic,
): MarketingChromeBrand {
  return {
    displayName: brand?.displayName ?? SITE_NAME,
    tagline: brand?.tagline ?? SITE_DESCRIPTION,
    workspaceSlug: "houzzat",
    workspaceId: brand?.workspaceId ?? "legacy",
    poweredByHouzzatPro: true,
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
  const tenancy = await resolveMarketingTenancy();
  if (!tenancy) return null;
  return toMarketingChromeBrand(tenancy);
}
