/**
 * Stage 3K.5.5 / 6.11B / 6.11D — full tenant presentation brand for marketing/public surfaces.
 */
import { SITE_DESCRIPTION } from "@/lib/constants";
import type { WorkspaceBrandPublic } from "@/lib/tenancy/brand-dto";
import {
  EMPTY_PUBLIC_PROFESSIONAL_IDENTITY,
  type PublicProfessionalIdentity,
} from "@/lib/tenancy/professional-identity/types";
import type { PublicAgentIdentity } from "@/lib/tenancy/resolve-public-agent-identity";
import type { RequestTenancySuccess } from "@/lib/tenancy/resolve-request-tenancy";
import type { PublicTeamRosterPresentation } from "@/lib/tenancy/team-roster/public";
import {
  DEFAULT_TEMPLATE_ID,
  type ImplementedTemplateId,
} from "@/lib/tenancy/templates";

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
  /** Stage 6.11B — resolved website template (Default unless agent-signature). */
  templateId: ImplementedTemplateId;
  /** Stage 6.11B — primary agent identity when available (never invented). */
  agent: PublicAgentIdentity | null;
  /**
   * Stage 6.11D — canonical professional + brokerage identity (all templates).
   * Not duplicated per template; presentation may vary.
   */
  professionalIdentity: PublicProfessionalIdentity;
  /**
   * Stage 6.11E.7 — published Team roster for Team Signature (null when unused).
   */
  teamRoster: PublicTeamRosterPresentation | null;
  /** Stage 6.11B.1 — OWNER secure preview overlay (null when not previewing). */
  templatePreview: {
    active: true;
    themeId: string;
    displayLabel: string;
    source: "owner_cookie" | "dev_only";
  } | null;
  /**
   * HIGH OCTANE staging only. True when listing entitlement has an authority.
   * Absent for every other tenant, including Houzzat.
   */
  authorizedListingSource?: boolean;
  /**
   * HIGH OCTANE staging only, and only while no real listing source is connected.
   * Selects the snapshot attribution sentence. Never a board or VOW claim.
   */
  stagingSnapshotAttribution?: boolean;
};

export function toMarketingPresentationBrand(
  tenancy: RequestTenancySuccess,
  canonicalOrigin: string,
  extras?: {
    templateId?: ImplementedTemplateId;
    agent?: PublicAgentIdentity | null;
    professionalIdentity?: PublicProfessionalIdentity;
    teamRoster?: PublicTeamRosterPresentation | null;
    templatePreview?: MarketingPresentationBrand["templatePreview"];
    authorizedListingSource?: boolean;
    stagingSnapshotAttribution?: boolean;
  },
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
    templateId: extras?.templateId ?? DEFAULT_TEMPLATE_ID,
    agent: extras?.agent ?? null,
    professionalIdentity:
      extras?.professionalIdentity ?? EMPTY_PUBLIC_PROFESSIONAL_IDENTITY,
    teamRoster: extras?.teamRoster ?? null,
    templatePreview: extras?.templatePreview ?? null,
    authorizedListingSource: extras?.authorizedListingSource,
    stagingSnapshotAttribution: extras?.stagingSnapshotAttribution,
  };
}

/** Client-safe account label — never "Your Houzzat" on tenant hosts. */
export function tenantAccountLabel(brand: Pick<MarketingPresentationBrand, "displayName" | "isHouzzatWorkspace">): string {
  if (brand.isHouzzatWorkspace) return "Your Houzzat";
  return `Your ${brand.displayName}`;
}
