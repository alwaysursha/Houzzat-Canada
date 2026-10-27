/**
 * Personal-agent presentation for Royal Collection — Signature One.
 * Live tenants use their own identity. The HIGH OCTANE fixture is display-only
 * during an explicit development preview and never replaces workspace records.
 */
import type { MarketingPresentationBrand } from "@/lib/tenancy/marketing-presentation-brand";
import type { PublicBrokerageIdentity } from "@/lib/tenancy/professional-identity";
import { HIGH_OCTANE_HERO_SCENES } from "@/lib/tenancy/templates/high-octane-hero-media";
import { HIGH_OCTANE_PREVIEW_FIXTURE } from "@/lib/tenancy/templates/high-octane-preview-fixture";
import type { RoyalCollectionScene } from "@/lib/tenancy/templates/royal-collection-media";
import {
  HIGH_OCTANE_STAGING_FEATURED_CITIES,
  HIGH_OCTANE_STAGING_MARKET_LABEL,
  HIGH_OCTANE_STAGING_OWNER_EMAIL,
  HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
} from "@/lib/tenancy/templates/high-octane-staging-slug";
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

/** Board copy only when this tenant has an authorized listing source. */
export type RoyalCollectionListingDisclosure =
  | "preview"
  | "unconnected"
  | "snapshot"
  | "authorized";

export type RoyalCollectionHeroPortrait = {
  imageUrl: string;
  name: string;
  role: string;
  phone: string;
  phoneHref: string;
  team: string;
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
  /** Uploaded primary-agent photo, before the HIGH OCTANE approved-cutout fallback. */
  photoUrl: string | null;
  /**
   * The one portrait URL for hero, about, property, concierge, and viewing.
   * An upload replaces the approved cutout. Null keeps each placement's empty state.
   */
  resolvedAgentPortraitUrl: string | null;
  phone: string | null;
  email: string | null;
  markets: string[];
  brokerage: PublicBrokerageIdentity;
  footerLegalText: string | null;
  listingDisclosure: RoyalCollectionListingDisclosure;
  searchHeading: string;
  valuationHeading: string;
  featuredCities: string[] | null;
  posterUrl: string | null;
  /** Null unless this workspace owns a portrait cutout. */
  heroPortrait: RoyalCollectionHeroPortrait | null;
  scenes: readonly RoyalCollectionScene[];
  /**
   * Story collage stills. Independent of hero scenes and `conceptStill`.
   * Null keeps the colour empty state until a licensed file is selected.
   */
  storyMainUrl: string | null;
  storyInsetUrl: string | null;
  editorialCommunities: readonly RoyalCollectionCommunityLink[] | null;
  navCommunities: readonly RoyalCollectionCommunityLink[];
  collectionCards: readonly RoyalCollectionCollectionCard[] | null;
};

/**
 * Licensed place photography for the genuine HIGH OCTANE workspace only.
 * Unpublished: the page does not render photographer credits.
 * Unsplash License and Pexels License both allow commercial website use.
 */
const HIGH_OCTANE_PLACE_PHOTOGRAPHY = {
  storyMain: {
    file: "/media/royal-collection/high-octane/notl-house.webp",
    photographer: "Ed Vázquez",
    sourceUrl: "https://unsplash.com/photos/brown-and-white-roof-during-daytime-nrhF_gi8E2Q",
    license: "Unsplash License",
    licenseUrl: "https://unsplash.com/license",
  },
  storyInset: {
    file: "/media/royal-collection/high-octane/niagara-falls-inset.webp",
    photographer: "Hashim Gaad",
    sourceUrl: "https://www.pexels.com/photo/niagara-falls-ontario-canada-14436921/",
    license: "Pexels License",
    licenseUrl: "https://www.pexels.com/license/",
  },
  niagaraFalls: {
    file: "/media/royal-collection/high-octane/niagara-falls-community.webp",
    photographer: "Eva Bronzini",
    sourceUrl: "https://www.pexels.com/photo/a-view-of-the-niagara-falls-6076099/",
    license: "Pexels License",
    licenseUrl: "https://www.pexels.com/license/",
  },
  niagaraOnTheLake: {
    file: "/media/royal-collection/high-octane/notl-hotel.webp",
    photographer: "Juju",
    subject: "Prince of Wales Hotel",
    sourceUrl: "https://www.pexels.com/photo/charming-historic-hotel-in-niagara-on-the-lake-39337955/",
    license: "Pexels License",
    licenseUrl: "https://www.pexels.com/license/",
  },
  stCatharines: {
    file: "/media/royal-collection/high-octane/port-dalhousie-lighthouse.webp",
    photographer: "Shilpa Gujaran",
    subject: "Port Dalhousie Lighthouse",
    sourceUrl: "https://www.pexels.com/photo/port-dalhousie-lighthouse-with-blue-sky-34247050/",
    license: "Pexels License",
    licenseUrl: "https://www.pexels.com/license/",
  },
} as const;

/** Story collage stills. Independent of hero scenes. */
const HIGH_OCTANE_STORY_IMAGES = {
  mainUrl: HIGH_OCTANE_PLACE_PHOTOGRAPHY.storyMain.file,
  insetUrl: HIGH_OCTANE_PLACE_PHOTOGRAPHY.storyInset.file,
};

/**
 * Approved HIGH OCTANE cutout. The only copy of this path.
 * Another workspace never receives it.
 */
export const HIGH_OCTANE_APPROVED_AGENT_PORTRAIT_URL =
  "/media/royal-collection/high-octane/saad-qureshi-portrait.png?v=2";

const HIGH_OCTANE_HERO_PORTRAIT_COPY = {
  name: "Saad Qureshi",
  role: "Real Estate Agent",
  phone: "(289) 501-7755",
  phoneHref: "tel:+12895017755",
  team: "Niagara Real Estate Team",
} as const;

/**
 * One portrait for every Royal Collection placement.
 * A primary-agent upload replaces the approved cutout.
 * Other workspaces use only their own upload.
 */
export function resolveRoyalCollectionAgentPortraitUrl(input: {
  workspaceSlug: string | null | undefined;
  uploadedPhotoUrl: string | null | undefined;
}): string | null {
  const uploaded = input.uploadedPhotoUrl?.trim() || null;
  if (uploaded) return uploaded;
  if (usesHighOctaneRoyalCollectionMedia(input.workspaceSlug)) {
    return HIGH_OCTANE_APPROVED_AGENT_PORTRAIT_URL;
  }
  return null;
}

export const HIGH_OCTANE_LOGO_URL = "/media/royal-collection/high-octane/logo.svg";
export const HIGH_OCTANE_FAVICON_URL = "/media/royal-collection/high-octane/favicon.svg";

const HIGH_OCTANE_COMMUNITY_IMAGES: Record<string, string | null> = {
  "Niagara Falls": HIGH_OCTANE_PLACE_PHOTOGRAPHY.niagaraFalls.file,
  "Niagara-on-the-Lake": HIGH_OCTANE_PLACE_PHOTOGRAPHY.niagaraOnTheLake.file,
  "St. Catharines": HIGH_OCTANE_PLACE_PHOTOGRAPHY.stCatharines.file,
};

function firstNameFrom(name: string): string {
  const part = name.trim().split(/\s+/)[0];
  return part || name;
}

/**
 * Concept fixture on a host that is not the genuine staging workspace.
 * The staging workspace, once it exists, uses operational pages.
 */
export function isHighOctaneConceptFixture(
  brand: MarketingPresentationBrand,
): boolean {
  return (
    isHighOctaneRoyalPreview(brand) &&
    brand.workspaceSlug !== HIGH_OCTANE_STAGING_WORKSPACE_SLUG
  );
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
    resolvedAgentPortraitUrl: null,
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
    listingDisclosure: "preview",
    searchHeading: fixture.searchHeading,
    valuationHeading: fixture.valuationHeading,
    featuredCities: [...fixture.featuredCities],
    posterUrl: null,
    heroPortrait: null,
    scenes: fixture.scenes,
    storyMainUrl:
      fixture.scenes.find((scene) => scene.id === "niagara-on-the-lake")?.conceptStill ?? null,
    storyInsetUrl:
      fixture.scenes.find((scene) => scene.id === "niagara-falls")?.conceptStill ?? null,
    editorialCommunities: fixture.editorialCommunities,
    navCommunities: fixture.navCommunities,
    collectionCards: fixture.collectionCards,
  };
}

function persistedMarkets(brand: MarketingPresentationBrand): string[] {
  return (brand.agent?.markets ?? []).map((market) => market.trim()).filter(Boolean);
}

/**
 * Workspace branding is the public address. The staging owner login is never shown.
 */
export function royalCollectionPublicEmail(
  brand: MarketingPresentationBrand,
): string | null {
  const contact = brand.contact.email?.trim() || null;
  const login = brand.agent?.email?.trim() || null;
  const preferred = contact || login;
  if (!preferred) return null;
  if (preferred.toLowerCase() === HIGH_OCTANE_STAGING_OWNER_EMAIL) return null;
  return preferred;
}

/**
 * HIGH OCTANE photography belongs to that workspace slug.
 * Another assigned Royal Collection tenant does not receive it.
 * Staging flags, database hosts, and preview hostnames are not consulted.
 */
export function usesHighOctaneRoyalCollectionMedia(
  workspaceSlug: string | null | undefined,
): boolean {
  return workspaceSlug === HIGH_OCTANE_STAGING_WORKSPACE_SLUG;
}

function listingDisclosureFor(
  brand: MarketingPresentationBrand,
): RoyalCollectionListingDisclosure {
  if (brand.authorizedListingSource === true) return "authorized";
  if (
    brand.workspaceSlug === HIGH_OCTANE_STAGING_WORKSPACE_SLUG &&
    brand.stagingSnapshotAttribution === true
  ) {
    return "snapshot";
  }
  return "unconnected";
}

export function resolveRoyalCollectionView(
  brand: MarketingPresentationBrand,
): RoyalCollectionView {
  if (isHighOctaneConceptFixture(brand)) return highOctaneView();

  const professional = brand.professionalIdentity;
  const markets = persistedMarkets(brand);
  const stagingWorkspace = usesHighOctaneRoyalCollectionMedia(brand.workspaceSlug);
  const stagingDefaultMarket = stagingWorkspace && markets.length === 0;
  const agentName =
    professional.agent.name?.trim() || brand.agent?.name?.trim() || null;
  const uploadedPhotoUrl = professional.agent.photoUrl ?? null;
  const resolvedAgentPortraitUrl = resolveRoyalCollectionAgentPortraitUrl({
    workspaceSlug: brand.workspaceSlug,
    uploadedPhotoUrl,
  });
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
    logoUrl: stagingWorkspace ? HIGH_OCTANE_LOGO_URL : brand.logoUrl,
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
    photoUrl: uploadedPhotoUrl,
    resolvedAgentPortraitUrl,
    phone: professional.agent.cellPhone ?? brand.agent?.phone ?? null,
    email: royalCollectionPublicEmail(brand),
    markets: stagingDefaultMarket ? [HIGH_OCTANE_STAGING_MARKET_LABEL] : markets,
    brokerage,
    footerLegalText: brand.footerLegalText,
    listingDisclosure: listingDisclosureFor(brand),
    searchHeading: stagingDefaultMarket
      ? HIGH_OCTANE_PREVIEW_FIXTURE.searchHeading
      : "Find a home",
    valuationHeading: stagingDefaultMarket
      ? HIGH_OCTANE_PREVIEW_FIXTURE.valuationHeading
      : "Discover your home's value",
    featuredCities: stagingWorkspace
      ? stagingDefaultMarket
        ? [...HIGH_OCTANE_STAGING_FEATURED_CITIES]
        : markets
      : null,
    posterUrl: null,
    heroPortrait:
      stagingWorkspace && resolvedAgentPortraitUrl
        ? { ...HIGH_OCTANE_HERO_PORTRAIT_COPY, imageUrl: resolvedAgentPortraitUrl }
        : null,
    scenes: stagingWorkspace ? HIGH_OCTANE_HERO_SCENES : [],
    storyMainUrl: stagingWorkspace ? HIGH_OCTANE_STORY_IMAGES.mainUrl : null,
    storyInsetUrl: stagingWorkspace ? HIGH_OCTANE_STORY_IMAGES.insetUrl : null,
    editorialCommunities: stagingDefaultMarket
      ? HIGH_OCTANE_PREVIEW_FIXTURE.editorialCommunities
      : null,
    navCommunities: stagingDefaultMarket
      ? HIGH_OCTANE_PREVIEW_FIXTURE.navCommunities
      : [{ name: "Explore communities", city: "", href: "/areas" }],
    collectionCards: stagingDefaultMarket
      ? HIGH_OCTANE_PREVIEW_FIXTURE.editorialCommunities.slice(0, 3).map((place, index) => ({
          name: place.name,
          href: place.href,
          kicker: String(index + 1).padStart(2, "0"),
          caption: "",
          imageUrl: HIGH_OCTANE_COMMUNITY_IMAGES[place.name] ?? null,
        }))
      : null,
  };
}
