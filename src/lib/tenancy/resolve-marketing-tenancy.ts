/**
 * Stage 3K.5.4 / 6.11B — request-scoped marketing tenancy (server components only).
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
import { resolvePublicProfessionalIdentity } from "@/lib/tenancy/professional-identity/resolve";
import { resolvePublicAgentIdentity } from "@/lib/tenancy/resolve-public-agent-identity";
import {
  resolveRequestTenancy,
  type RequestTenancySuccess,
} from "@/lib/tenancy/resolve-request-tenancy";
import { resolveActiveTemplatePreviewForWorkspace } from "@/lib/tenancy/template-preview";
import { resolvePublicTeamRosterForWorkspace } from "@/lib/tenancy/team-roster/public";
import {
  DEFAULT_TEMPLATE_ID,
  isTeamSignatureTemplateId,
  resolveTemplateIdFromThemeId,
  resolveThemePalette,
  type ImplementedTemplateId,
} from "@/lib/tenancy/templates";
import { isTenantDomainScopeWorkspace } from "@/lib/tenancy/tenant-scope-flags";
import { prisma } from "@/lib/prisma";

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
    templateId: DEFAULT_TEMPLATE_ID,
    agent: null,
    professionalIdentity: {
      agent: {
        name: null,
        designation: null,
        cellPhone: null,
        photoUrl: null,
      },
      brokerage: {
        name: null,
        address: null,
        phone: null,
        fax: null,
        logoUrl: null,
      },
    },
    teamRoster: null,
    templatePreview: null,
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

  const activePreview = await resolveActiveTemplatePreviewForWorkspace(
    tenancy.workspaceId,
  );
  const previewThemeId = activePreview?.themeId ?? null;

  let persistedThemeId: string | null = null;
  try {
    const row = await prisma.workspaceBranding.findUnique({
      where: { workspaceId: tenancy.workspaceId },
      select: { themeId: true },
    });
    persistedThemeId = row?.themeId ?? null;
  } catch {
    persistedThemeId = null;
  }

  const effectiveThemeId = previewThemeId ?? persistedThemeId;
  const templateId: ImplementedTemplateId =
    resolveTemplateIdFromThemeId(effectiveThemeId);

  // Preview may swap template colors without writing WorkspaceBranding.
  let presentationTenancy = tenancy;
  if (previewThemeId) {
    const palette = resolveThemePalette(previewThemeId);
    if (palette) {
      const isPremiumPreview =
        resolveTemplateIdFromThemeId(previewThemeId) ===
          "agent-signature" ||
        resolveTemplateIdFromThemeId(previewThemeId) ===
          "team-signature";
      presentationTenancy = {
        ...tenancy,
        brand: {
          ...tenancy.brand,
          colors: {
            ...tenancy.brand.colors,
            primary: palette.primary,
            secondary: palette.secondary,
            accent: palette.accent,
            ...(isPremiumPreview
              ? {
                  surface: palette.surfaceTint,
                  ink: palette.primary,
                }
              : {}),
          },
        },
      };
    }
  }

  // Stage 6.11D — all templates receive canonical professional identity.
  // Stage 6.11E.7 — Team roster only when Team Signature is active.
  const [professionalIdentity, agent, teamRoster] = await Promise.all([
    resolvePublicProfessionalIdentity(tenancy.workspaceId),
    templateId !== DEFAULT_TEMPLATE_ID
      ? resolvePublicAgentIdentity(tenancy.workspaceId)
      : Promise.resolve(null),
    isTeamSignatureTemplateId(templateId)
      ? resolvePublicTeamRosterForWorkspace(tenancy.workspaceId)
      : Promise.resolve(null),
  ]);

  return toMarketingPresentationBrand(presentationTenancy, canonicalOrigin, {
    templateId,
    agent,
    professionalIdentity,
    teamRoster,
    templatePreview: activePreview
      ? {
          active: true,
          themeId: activePreview.themeId,
          displayLabel: activePreview.displayLabel,
          source: activePreview.source,
        }
      : null,
  });
}
