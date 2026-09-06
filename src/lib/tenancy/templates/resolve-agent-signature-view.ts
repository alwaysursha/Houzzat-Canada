/**
 * Stage 6.11B.2 / 6.11D — Agent Signature presentation view (demo preview vs live tenant).
 */
import type { MarketingPresentationBrand } from "@/lib/tenancy/marketing-presentation-brand";
import type { PublicBrokerageIdentity } from "@/lib/tenancy/professional-identity";
import { AGENT_SIGNATURE_DEMO } from "@/lib/tenancy/templates/agent-signature-demo";

export type AgentSignatureMetric = { value: string; label: string };
export type AgentSignatureTestimonial = {
  quote: string;
  attribution: string;
};

export type AgentSignatureView = {
  /** True only while OWNER secure/dev template preview is active. */
  isDemoPreview: boolean;
  name: string;
  firstName: string;
  title: string | null;
  tagline: string;
  serviceArea: string | null;
  brokerageName: string | null;
  phone: string | null;
  email: string | null;
  photoUrl: string | null;
  bio: string | null;
  markets: string[];
  /** Stage 6.11D — canonical brokerage block for footer / lower identity. */
  brokerage: PublicBrokerageIdentity;
  /** Demo-only fabricated metrics; always null for live tenants. */
  metrics: readonly AgentSignatureMetric[] | null;
  /** Demo-only sample testimonials; always null for live tenants. */
  testimonials: readonly AgentSignatureTestimonial[] | null;
};

function firstNameFrom(name: string): string {
  const part = name.trim().split(/\s+/)[0];
  return part || name;
}

/**
 * Build Agent Signature content.
 * Demo identity is allowed ONLY when templatePreview is active.
 * Live selected Agent Signature never receives demo claims.
 */
export function resolveAgentSignatureView(
  brand: MarketingPresentationBrand,
): AgentSignatureView {
  const isDemoPreview = brand.templatePreview?.active === true;

  if (isDemoPreview) {
    const d = AGENT_SIGNATURE_DEMO;
    return {
      isDemoPreview: true,
      name: d.name,
      firstName: d.firstName,
      title: d.title,
      tagline: d.tagline,
      serviceArea: d.serviceArea,
      brokerageName: d.brokerageName,
      phone: d.phone,
      email: d.email,
      photoUrl: d.photoUrl,
      bio: d.bio,
      markets: [...d.markets],
      brokerage: {
        name: d.brokerageName,
        address: d.brokerageAddress,
        phone: d.brokeragePhone,
        fax: d.brokerageFax,
        logoUrl: d.brokerageLogoUrl,
      },
      metrics: d.metrics,
      testimonials: d.testimonials,
    };
  }

  const professional = brand.professionalIdentity;
  const name =
    professional.agent.name?.trim() ||
    brand.agent?.name?.trim() ||
    brand.displayName;

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

  return {
    isDemoPreview: false,
    name,
    firstName: firstNameFrom(name),
    title:
      professional.agent.designation ?? brand.agent?.title ?? null,
    tagline:
      brand.tagline?.trim() ||
      "Personal representation for buying and selling exceptional homes.",
    serviceArea:
      brand.agent?.markets && brand.agent.markets.length > 0
        ? brand.agent.markets.slice(0, 3).join(" · ")
        : null,
    brokerageName: brokerage.name,
    phone:
      professional.agent.cellPhone ??
      brand.agent?.phone ??
      null,
    email: brand.agent?.email ?? brand.contact.email,
    photoUrl:
      professional.agent.photoUrl ?? brand.agent?.photoUrl ?? null,
    bio: brand.agent?.bio ?? null,
    markets: brand.agent?.markets ?? [],
    brokerage,
    metrics: null,
    testimonials: null,
  };
}
