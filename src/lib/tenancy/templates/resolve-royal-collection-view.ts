/**
 * Personal-agent presentation for Royal Collection — Signature One.
 * Live tenants use their own identity. The HIGH OCTANE fixture is display-only
 * during an explicit development preview and never replaces workspace records.
 */
import type { MarketingPresentationBrand } from "@/lib/tenancy/marketing-presentation-brand";
import type { PublicBrokerageIdentity } from "@/lib/tenancy/professional-identity";
import { HIGH_OCTANE_PREVIEW_FIXTURE } from "@/lib/tenancy/templates/high-octane-preview-fixture";
import type { RoyalCollectionScene } from "@/lib/tenancy/templates/royal-collection-media";
import { ROYAL_COLLECTION_ONE_TEMPLATE_ID } from "@/lib/tenancy/templates/types";

export type RoyalCollectionCommunityLink = {
  name: string;
  city: string;
  href: string;
};

export type RoyalCollectionCollectionCard = {
  name: string;
  href: string;
  kicker: string;
  caption: string;
  imageUrl: string | null;
};

export type RoyalCollectionView = {
  brandName: string;
  logoUrl: string | null;
  provisionalWordmark: boolean;
  wordmarkMark: string | null;
  wordmarkSub: string | null;
  displayFixtureId: string | null;
  /** True only for the development display fixture. Live tenants keep actions. */
  actionsDisabled: boolean;
  agentName: string | null;
  firstName: string | null;
  title: string | null;
  tagline: string | null;
  bio: string | null;
  photoUrl: string | null;
  phone: string | null;
  email: string | null;
  markets: string[];
  brokerage: PublicBrokerageIdentity;
  footerLegalText: string | null;
  searchHeading: string;
  valuationHeading: string;
  featuredCities: string[] | null;
  posterUrl: string | null;
  scenes: readonly RoyalCollectionScene[];
  editorialCommunities: readonly RoyalCollectionCommunityLink[] | null;
  navCommunities: readonly RoyalCollectionCommunityLink[];
  collectionCards: readonly RoyalCollectionCollectionCard[] | null;
};

function firstNameFrom(name: string): string {
  const part = name.trim().split(/\s+/)[0];
  return part || name;
}

/** Display fixture only. Production and ordinary requests stay on tenant identity. */
export function isHighOctaneRoyalPreview(
  brand: MarketingPresentationBrand,
): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    brand.templateId === ROYAL_COLLECTION_ONE_TEMPLATE_ID &&
    brand.templatePreview?.active === true &&
    brand.templatePreview.source === "dev_only"
  );
}

function highOctaneView(): RoyalCollectionView {
  const fixture = HIGH_OCTANE_PREVIEW_FIXTURE;
  return {
    brandName: fixture.brandName,
    logoUrl: null,
    provisionalWordmark: true,
    wordmarkMark: "HIGH OCTANE",
    wordmarkSub: fixture.wordmarkSub,
    displayFixtureId: fixture.id,
    actionsDisabled: true,
    agentName: fixture.agentName,
    firstName: fixture.firstName,
    title: null,
    tagline: fixture.tagline,
    bio: null,
    photoUrl: null,
    phone: fixture.phone,
    email: fixture.email,
    markets: [fixture.marketLabel],
    brokerage: {
      name: fixture.brokerageName,
      address: null,
      phone: null,
      fax: null,
      logoUrl: null,
    },
    footerLegalText: null,
    searchHeading: fixture.searchHeading,
    valuationHeading: fixture.valuationHeading,
    featuredCities: [...fixture.featuredCities],
    posterUrl: null,
    scenes: fixture.scenes,
    editorialCommunities: fixture.editorialCommunities,
    navCommunities: fixture.navCommunities,
    collectionCards: fixture.collectionCards,
  };
}

export function resolveRoyalCollectionView(
  brand: MarketingPresentationBrand,
): RoyalCollectionView {
  if (isHighOctaneRoyalPreview(brand)) return highOctaneView();

  const professional = brand.professionalIdentity;
  const agentName =
    professional.agent.name?.trim() || brand.agent?.name?.trim() || null;
  const brandName = brand.displayName?.trim() || agentName || "Real Estate";
  const brokerage: PublicBrokerageIdentity = {
    name: professional.brokerage.name ?? brand.agent?.brokerageName ?? null,
    address: professional.brokerage.address,
    phone: professional.brokerage.phone,
    fax: professional.brokerage.fax,
    logoUrl: professional.brokerage.logoUrl ?? brand.brokerageLogoUrl ?? null,
  };

  return {
    brandName,
    logoUrl: brand.logoUrl,
    provisionalWordmark: false,
    wordmarkMark: null,
    wordmarkSub: null,
    displayFixtureId: null,
    actionsDisabled: false,
    agentName,
    firstName: agentName ? firstNameFrom(agentName) : null,
    title: professional.agent.designation ?? brand.agent?.title ?? null,
    tagline: brand.tagline?.trim() || null,
    bio: brand.agent?.bio?.trim() || null,
    photoUrl: professional.agent.photoUrl ?? null,
    phone: professional.agent.cellPhone ?? brand.agent?.phone ?? null,
    email: brand.agent?.email ?? brand.contact.email,
    markets: brand.agent?.markets ?? [],
    brokerage,
    footerLegalText: brand.footerLegalText,
    searchHeading: "Find a home",
    valuationHeading: "Discover your home's value",
    featuredCities: null,
    posterUrl: null,
    scenes: [],
    editorialCommunities: null,
    navCommunities: [
      { name: "Explore communities", city: "", href: "/areas" },
    ],
    collectionCards: null,
  };
}
