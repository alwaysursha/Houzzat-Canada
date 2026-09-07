/**
 * Stage 6.11E.2 / E.7 — Team Signature presentation view (demo preview vs live tenant).
 * Live roster comes from published WorkspaceTeamMember rows (E.7).
 * Demo roster/testimonials ONLY when templatePreview is active.
 */
import type { MarketingPresentationBrand } from "@/lib/tenancy/marketing-presentation-brand";
import type { PublicBrokerageIdentity } from "@/lib/tenancy/professional-identity";
import { TEAM_SIGNATURE_DEMO } from "@/lib/tenancy/templates/team-signature-demo";

export type TeamSignatureMemberPlaceholder = {
  id: string;
  name: string;
  designation: string | null;
  isLeader: boolean;
  cellPhone: string | null;
  email: string | null;
  photoUrl: string | null;
  bio: string | null;
};

export type TeamSignatureTestimonial = {
  quote: string;
  attribution: string;
};

export type TeamSignatureView = {
  /** True only while OWNER/dev template preview is active. */
  isDemoPreview: boolean;
  teamName: string;
  tagline: string;
  serviceArea: string | null;
  logoUrl: string | null;
  /** Workspace / team business phone — not brokerage Phone. */
  phone: string | null;
  /** Workspace / team business email — not agent cell identity. */
  email: string | null;
  markets: string[];
  brokerage: PublicBrokerageIdentity;
  /**
   * Demo preview roster, or live published members.
   * Null when live tenant has zero visible members (empty Meet shell).
   */
  members: readonly TeamSignatureMemberPlaceholder[] | null;
  /** Demo-only sample testimonials; always null for live tenants. */
  testimonials: readonly TeamSignatureTestimonial[] | null;
};

/**
 * Build Team Signature content.
 * Demo roster/testimonials ONLY when templatePreview is active.
 */
export function resolveTeamSignatureView(
  brand: MarketingPresentationBrand,
): TeamSignatureView {
  const isDemoPreview = brand.templatePreview?.active === true;

  if (isDemoPreview) {
    const d = TEAM_SIGNATURE_DEMO;
    return {
      isDemoPreview: true,
      teamName: d.teamName,
      tagline: d.tagline,
      serviceArea: d.serviceArea,
      logoUrl: d.logoUrl,
      phone: d.phone,
      email: d.email,
      markets: [...d.markets],
      brokerage: {
        name: d.brokerageName,
        address: d.brokerageAddress,
        phone: d.brokeragePhone,
        fax: d.brokerageFax,
        logoUrl: d.brokerageLogoUrl,
      },
      members: d.members.map((m) => ({ ...m })),
      testimonials: d.testimonials.map((t) => ({ ...t })),
    };
  }

  const professional = brand.professionalIdentity;
  const roster = brand.teamRoster;
  const rosterMarkets = roster?.serviceAreas ?? [];
  const agentMarkets =
    brand.agent?.markets && brand.agent.markets.length > 0
      ? brand.agent.markets
      : [];
  const markets =
    rosterMarkets.length > 0 ? rosterMarkets : agentMarkets;

  const brokerage: PublicBrokerageIdentity = {
    name:
      professional.brokerage.name ??
      brand.agent?.brokerageName ??
      null,
    address: professional.brokerage.address,
    phone: professional.brokerage.phone,
    fax: professional.brokerage.fax,
    logoUrl:
      professional.brokerage.logoUrl ?? brand.brokerageLogoUrl ?? null,
  };

  const liveMembers =
    roster && roster.members.length > 0
      ? roster.members.map((m) => ({
          id: m.id,
          name: m.name,
          designation: m.designation,
          isLeader: m.isLeader,
          cellPhone: m.cellPhone,
          email: m.email,
          photoUrl: m.photoUrl,
          bio: m.bio,
        }))
      : null;

  return {
    isDemoPreview: false,
    teamName: brand.displayName,
    tagline:
      brand.tagline?.trim() ||
      "A premium real estate team focused on the markets we know best.",
    serviceArea:
      markets.length > 0 ? markets.slice(0, 4).join(" · ") : null,
    logoUrl: brand.logoUrl,
    phone: brand.contact.phone,
    email: brand.contact.email,
    markets,
    brokerage,
    members: liveMembers,
    testimonials: null,
  };
}
