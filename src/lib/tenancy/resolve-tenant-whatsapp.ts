/**
 * Hostname-bound WhatsApp destination for public surfaces.
 * Env fallback is Houzzat-only — never applied to other tenants.
 */
import { cache } from "react";
import { HOUZZAT_WORKSPACE_SLUG } from "@/lib/crm-ownership";
import { prisma } from "@/lib/prisma";
import type { MarketingPresentationBrand } from "@/lib/tenancy/marketing-presentation-brand";
import { resolveMarketingPresentationBrand } from "@/lib/tenancy/resolve-marketing-tenancy";
import { resolveRequestTenancy } from "@/lib/tenancy/resolve-request-tenancy";
import {
  AGENT_SIGNATURE_TEMPLATE_ID,
  DEFAULT_TEMPLATE_ID,
  TEAM_SIGNATURE_TEMPLATE_ID,
  resolveTemplateIdFromThemeId,
  type ImplementedTemplateId,
} from "@/lib/tenancy/templates";
import {
  normalizeWhatsAppNumber,
  resolveTenantWhatsAppNumber,
  type WhatsAppTemplateKind,
} from "@/lib/whatsapp";

export function whatsappTemplateKind(
  templateId: ImplementedTemplateId,
): WhatsAppTemplateKind {
  switch (templateId) {
    case AGENT_SIGNATURE_TEMPLATE_ID:
      return "AGENT";
    case DEFAULT_TEMPLATE_ID:
    case TEAM_SIGNATURE_TEMPLATE_ID:
      return "OTHER";
    default: {
      const _exhaustive: never = templateId;
      return _exhaustive;
    }
  }
}

/** Houzzat workspace only. Other tenants must not read this. */
export function houzzatOnlyWhatsAppEnvFallback(): string | null {
  return normalizeWhatsAppNumber(
    process.env.NEXT_PUBLIC_WHATSAPP_EXPERT ??
      process.env.NEXT_PUBLIC_WHATSAPP_NUMBER,
  );
}

export function whatsappNumberFromPresentationBrand(
  brand: Pick<
    MarketingPresentationBrand,
    | "templateId"
    | "contact"
    | "professionalIdentity"
    | "isHouzzatWorkspace"
  >,
): string | null {
  return resolveTenantWhatsAppNumber({
    templateKind: whatsappTemplateKind(brand.templateId),
    agentCellPhone: brand.professionalIdentity.agent.cellPhone,
    contactPhone: brand.contact.phone,
    isHouzzatWorkspace: brand.isHouzzatWorkspace,
    houzzatEnvFallback: houzzatOnlyWhatsAppEnvFallback(),
  });
}

export const resolveMarketingWhatsAppNumber = cache(
  async (): Promise<string | null> => {
    const brand = await resolveMarketingPresentationBrand();
    if (!brand) return null;
    return whatsappNumberFromPresentationBrand(brand);
  },
);

/**
 * /api/public-config and other Request-scoped callers.
 * Hostname → workspace → template/identity/branding. No global env for tenants.
 */
export async function resolveWhatsAppNumberForRequest(
  request: Request,
): Promise<string | null> {
  const tenancy = await resolveRequestTenancy(request);
  if (!tenancy.ok) return null;

  const [branding, identity] = await Promise.all([
    prisma.workspaceBranding.findUnique({
      where: { workspaceId: tenancy.workspaceId },
      select: { themeId: true, contactPhone: true },
    }),
    prisma.workspaceProfessionalIdentity.findUnique({
      where: { workspaceId: tenancy.workspaceId },
      select: { agentCellPhone: true },
    }),
  ]);

  return resolveTenantWhatsAppNumber({
    templateKind: whatsappTemplateKind(
      resolveTemplateIdFromThemeId(branding?.themeId),
    ),
    agentCellPhone: identity?.agentCellPhone,
    contactPhone: branding?.contactPhone ?? tenancy.brand.contact.phone,
    isHouzzatWorkspace: tenancy.workspaceSlug === HOUZZAT_WORKSPACE_SLUG,
    houzzatEnvFallback: houzzatOnlyWhatsAppEnvFallback(),
  });
}
