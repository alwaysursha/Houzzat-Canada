/**
 * Royal Collection — Signature One stays unassigned and preview-only in development.
 * Run: pnpm exec tsx scripts/royal-collection-signature-one-selftest.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EMPTY_PUBLIC_PROFESSIONAL_IDENTITY } from "../src/lib/tenancy/professional-identity/types";
import type { MarketingPresentationBrand } from "../src/lib/tenancy/marketing-presentation-brand";
import {
  DEFAULT_TEMPLATE_ID,
  ROYAL_COLLECTION_ONE_TEMPLATE_ID,
  getTemplate,
  listSelectableTemplates,
  requireValidPreviewableThemeId,
  requireValidSelectableThemeId,
  resolveTemplateIdFromThemeId,
} from "../src/lib/tenancy/templates";
import { resolveDevOnlyTemplatePreviewThemeId } from "../src/lib/tenancy/template-preview";
import {
  HIGH_OCTANE_APPROVED_AGENT_PORTRAIT_URL,
  isHighOctaneRoyalPreview,
  resolveRoyalCollectionView,
} from "../src/lib/tenancy/templates/resolve-royal-collection-view";
import { takeRoyalFeaturedListings } from "../src/components/templates/royal-collection-one/royal-featured-listings";
import {
  LISTING_SOURCE_SWITCH_INVALIDATION,
  resolveHighOctaneDevelopmentListingSource,
  resolveTenantListingSourceAssignment,
} from "../src/lib/tenancy/templates/high-octane-listing-source";
import {
  evaluateHighOctaneStagingEnvironment,
  planHighOctaneStagingWorkspace,
  resolveHighOctaneStagingTemplateId,
} from "../src/lib/tenancy/templates/high-octane-staging";
import { highOctaneStagingPropertyConceptAllowed } from "../src/lib/tenancy/templates/high-octane-staging-property-concept";
import type { ListingCard } from "../src/lib/listings/types";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const royal = getTemplate(ROYAL_COLLECTION_ONE_TEMPLATE_ID);
assert.ok(royal);
assert.equal(royal.selectable, false);
assert.equal(royal.presentationReady, false);
assert.equal(royal.themes[0]?.id, "royal-collection-one:signature");
assert.equal(
  resolveTemplateIdFromThemeId(royal.themes[0]?.id),
  DEFAULT_TEMPLATE_ID,
);
assert.equal(
  listSelectableTemplates().some((template) => template.id === royal.id),
  false,
);
assert.throws(() => requireValidSelectableThemeId(royal.themes[0]?.id));
assert.throws(() => requireValidPreviewableThemeId(royal.themes[0]?.id));

const previous = process.env.NODE_ENV;
process.env.NODE_ENV = "production";
assert.equal(
  resolveDevOnlyTemplatePreviewThemeId(
    "http://preview.local/?previewTemplate=royal-collection-one",
  ),
  null,
);
process.env.NODE_ENV = "development";
assert.equal(
  resolveDevOnlyTemplatePreviewThemeId(
    "http://preview.local/?previewTemplate=royal-collection-one",
  ),
  "royal-collection-one:signature",
);
process.env.NODE_ENV = previous;

const home = read(
  "src/components/templates/royal-collection-one/RoyalCollectionHome.tsx",
);
const hero = read(
  "src/components/templates/royal-collection-one/RoyalCollectionHero.tsx",
);
const about = read(
  "src/components/templates/royal-collection-one/RoyalCollectionAbout.tsx",
);
const featured = read(
  "src/components/templates/royal-collection-one/RoyalCollectionFeatured.tsx",
);
assert.equal(home.includes("Our Team"), false);
assert.equal(about.includes("Meet Our Team"), false);
assert.ok(about.includes("About ${view.agentName}"));
assert.ok(featured.includes("Featured Listings"));
assert.ok(featured.includes("Concept"));
assert.ok(featured.includes("Not an MLS listing"));
assert.ok(featured.includes("/api/listings/home-rails"));
assert.equal(featured.includes("minPrice"), false);
assert.equal(featured.includes("Display preview"), false);
assert.equal(featured.includes("Waterfront residence"), false);
assert.equal(featured.includes("Rykert"), false);
assert.equal(featured.includes("Niagara River Parkway"), false);
assert.equal(featured.includes("Queen Street"), false);
const sampleCard = (mlsNumber: string) => ({ mlsNumber }) as ListingCard;
assert.deepEqual(
  takeRoyalFeaturedListings([
    sampleCard("a"),
    sampleCard("b"),
    sampleCard("c"),
    sampleCard("d"),
  ]).map((item) => item.mlsNumber),
  ["a", "b", "c"],
);
assert.ok(hero.includes("prefers-reduced-motion"));
assert.ok(hero.includes('href="/search"'));
assert.ok(hero.includes('href="/home-valuation"'));
assert.equal(hero.includes("davidsdelaat"), false);

const header = read(
  "src/components/templates/royal-collection-one/RoyalCollectionHeader.tsx",
);
const css = read(
  "src/components/templates/royal-collection-one/royal-collection.module.css",
);
const previewBar = read("src/components/templates/OwnerTemplatePreviewBar.tsx");
assert.equal(header.includes('top: "2.4rem"'), false);
assert.ok(header.includes("data-owner-preview-bar"));
assert.ok(header.includes("ResizeObserver"));
assert.ok(css.includes("--rc-preview-bar"));
assert.ok(css.includes("--mobile-bottom-nav"));
assert.ok(css.includes(".drawerOpen"));
assert.ok(previewBar.includes("shrink-0"));
assert.ok(previewBar.includes("Exit Preview"));

const page = read("src/app/(marketing)/page.tsx");
assert.ok(page.includes("isRoyalCollectionOneTemplateId"));
assert.ok(page.includes("<RoyalCollectionHome"));

const tenantBrand = {
  displayName: "Houzzat",
  tagline: "Houzzat tagline",
  workspaceSlug: "houzzat",
  workspaceId: "ws",
  poweredByHouzzatPro: true,
  isHouzzatWorkspace: true,
  logoUrl: "/images/houzzat-house-mark.png",
  brokerageLogoUrl: null,
  faviconUrl: null,
  ogImageUrl: null,
  colors: {
    primary: "#0F6B4C",
    secondary: "#0A4D38",
    accent: "#1F7A8C",
    surface: "#FFFFFF",
    ink: "#14201C",
  },
  contact: { email: "ali@example.com", phone: "647-000-0000" },
  footerLegalText: "Ali Syed legal line",
  seoDescription: "",
  version: 1,
  publicOrigin: "http://127.0.0.1:3000",
  canonicalOrigin: "http://127.0.0.1:3000",
  templateId: ROYAL_COLLECTION_ONE_TEMPLATE_ID,
  agent: {
    name: "Ali Syed",
    title: "Sales Representative",
    phone: "647-000-0000",
    email: "ali@example.com",
    bio: "Ali biography",
    markets: ["Kitchener–Waterloo"],
    photoUrl: "/ali.jpg",
    brokerageName: "Royal Lepage",
  },
  professionalIdentity: {
    ...EMPTY_PUBLIC_PROFESSIONAL_IDENTITY,
    agent: {
      name: "Ali Syed",
      designation: "Sales Representative",
      cellPhone: "647-000-0000",
      photoUrl: "/ali.jpg",
    },
  },
  teamRoster: null,
  templatePreview: {
    active: true,
    themeId: "royal-collection-one:signature",
    displayLabel: "Royal Collection — Signature One",
    source: "dev_only",
  },
} as MarketingPresentationBrand;

const previousNode = process.env.NODE_ENV;
process.env.NODE_ENV = "development";
assert.equal(isHighOctaneRoyalPreview(tenantBrand), true);
const fixtureView = resolveRoyalCollectionView(tenantBrand);
assert.equal(fixtureView.agentName, "Saad Qureshi");
assert.equal(fixtureView.brandName, "HIGH OCTANE Real Estate");
assert.equal(fixtureView.brokerage.name, "Right at Home Realty Brokerage");
assert.equal(fixtureView.phone, "289-501-7755");
assert.equal(fixtureView.email, "saad@highoctaneniagara.ca");
assert.equal(fixtureView.actionsDisabled, true);
assert.equal(fixtureView.photoUrl, null);
assert.equal(fixtureView.resolvedAgentPortraitUrl, null);
assert.equal(fixtureView.heroPortrait, null);
assert.equal(fixtureView.bio, null);
assert.equal(fixtureView.logoUrl, null);
assert.equal(fixtureView.footerLegalText, null);
assert.equal(fixtureView.posterUrl, null);
assert.ok(fixtureView.storyMainUrl);
assert.ok(fixtureView.storyInsetUrl);
assert.equal(
  String(fixtureView.storyMainUrl).includes("/media/royal-collection/high-octane/"),
  false,
);
assert.equal(fixtureView.scenes.length, 3);
assert.ok(fixtureView.scenes.every((scene) => scene.src === "" && scene.poster === null));
assert.equal(fixtureView.scenes.some((scene) => scene.title === "Niagara Falls"), true);
assert.equal(
  fixtureView.scenes.some((scene) => scene.id === "niagara-falls" && scene.conceptStill),
  true,
);
assert.equal(
  fixtureView.scenes.some((scene) => scene.id === "niagara-on-the-lake" && scene.conceptStill),
  true,
);
const highOctaneWorkspace = resolveRoyalCollectionView({
  ...tenantBrand,
  displayName: "HIGH OCTANE Real Estate",
  workspaceSlug: "high-octane-real-estate",
  isHouzzatWorkspace: false,
  templatePreview: null,
  agent: { ...tenantBrand.agent!, photoUrl: null },
  professionalIdentity: {
    ...tenantBrand.professionalIdentity,
    agent: { ...tenantBrand.professionalIdentity.agent, photoUrl: null },
  },
});
assert.equal(highOctaneWorkspace.displayFixtureId, null);
assert.equal(highOctaneWorkspace.heroPortrait?.name, "Saad Qureshi");
assert.equal(highOctaneWorkspace.heroPortrait?.role, "Real Estate Agent");
assert.equal(highOctaneWorkspace.heroPortrait?.phone, "(289) 501-7755");
assert.equal(highOctaneWorkspace.heroPortrait?.phoneHref, "tel:+12895017755");
assert.equal(highOctaneWorkspace.heroPortrait?.team, "Niagara Real Estate Team");
assert.equal(highOctaneWorkspace.photoUrl, null);
assert.equal(
  highOctaneWorkspace.resolvedAgentPortraitUrl,
  HIGH_OCTANE_APPROVED_AGENT_PORTRAIT_URL,
);
assert.equal(
  highOctaneWorkspace.heroPortrait?.imageUrl,
  highOctaneWorkspace.resolvedAgentPortraitUrl,
);
assert.equal(
  existsSync(
    join(
      root,
      "public",
      HIGH_OCTANE_APPROVED_AGENT_PORTRAIT_URL.replace(/^\//, "").replace(/\?.*$/, ""),
    ),
  ),
  true,
);
assert.equal(highOctaneWorkspace.actionsDisabled, false);
assert.equal(
  highOctaneWorkspace.storyMainUrl,
  "/media/royal-collection/high-octane/notl-house.webp",
);
assert.equal(
  highOctaneWorkspace.storyInsetUrl,
  "/media/royal-collection/high-octane/niagara-falls-inset.webp",
);
assert.equal(highOctaneWorkspace.collectionCards, null);
for (const rel of [
  highOctaneWorkspace.storyMainUrl,
  highOctaneWorkspace.storyInsetUrl,
]) {
  const file = rel.slice(1);
  assert.equal(existsSync(join(root, "public", file)), true, rel);
}
assert.deepEqual(
  highOctaneWorkspace.scenes.map((scene) => scene.id),
  ["niagara-falls", "luxury-exterior", "luxury-interior"],
);
assert.equal(
  highOctaneWorkspace.scenes.some((scene) => scene.id === "niagara-on-the-lake"),
  false,
);
assert.equal(JSON.stringify(highOctaneWorkspace).includes("CityXcape"), false);
for (const scene of highOctaneWorkspace.scenes) {
  assert.equal(scene.conceptStill ?? null, null);
  assert.ok(scene.src.includes("-desktop.mp4"));
  assert.ok(scene.srcMobile?.includes("-mobile.mp4"));
  assert.ok(scene.poster?.includes("-poster.jpg"));
  assert.ok((scene.durationMs ?? 0) >= 9500);
  assert.ok((scene.durationMs ?? 0) <= 13510);
  for (const rel of [scene.src, scene.srcMobile, scene.poster]) {
    const file = rel!.slice(1).split("?")[0] ?? "";
    assert.equal(existsSync(join(root, "public", file)), true, rel);
  }
}
const houzzatWorkspace = resolveRoyalCollectionView({
  ...tenantBrand,
  templatePreview: null,
});
assert.equal(houzzatWorkspace.heroPortrait, null);
assert.equal(houzzatWorkspace.scenes.length, 0);
assert.equal(houzzatWorkspace.storyMainUrl, null);
assert.equal(houzzatWorkspace.storyInsetUrl, null);
assert.equal(houzzatWorkspace.collectionCards, null);
assert.equal(
  read("src/components/templates/royal-collection-one/RoyalCollectionFooter.tsx").includes(
    "CityXcape",
  ),
  false,
);
assert.equal(
  read("src/components/templates/royal-collection-one/RoyalCollectionHero.tsx").includes(
    "CityXcape",
  ),
  false,
);
assert.equal(fixtureView.navCommunities.some((place) => place.name === "Niagara-on-the-Lake"), true);
assert.equal(fixtureView.navCommunities.some((place) => place.name === "Fonthill / Pelham"), true);
assert.equal(JSON.stringify(fixtureView).includes("Ali Syed"), false);
assert.equal(JSON.stringify(fixtureView).includes("hero-canadian-homes"), false);

process.env.NODE_ENV = "production";
assert.equal(isHighOctaneRoyalPreview(tenantBrand), false);
const liveView = resolveRoyalCollectionView(tenantBrand);
assert.equal(liveView.heroPortrait, null);
assert.equal(liveView.agentName, "Ali Syed");
assert.equal(liveView.displayFixtureId, null);
assert.equal(liveView.actionsDisabled, false);

process.env.NODE_ENV = "development";
const ordinary = resolveRoyalCollectionView({
  ...tenantBrand,
  templatePreview: null,
});
assert.equal(ordinary.heroPortrait, null);
assert.equal(ordinary.resolvedAgentPortraitUrl, "/ali.jpg");
assert.equal(ordinary.agentName, "Ali Syed");
assert.equal(ordinary.storyMainUrl, null);
assert.equal(ordinary.storyInsetUrl, null);
assert.equal(ordinary.collectionCards, null);
assert.equal(isHighOctaneRoyalPreview({ ...tenantBrand, templatePreview: null }), false);
assert.equal(
  read("src/components/templates/royal-collection-one/RoyalCollectionStory.tsx").includes(
    "niagara-on-the-lake",
  ),
  false,
);
assert.equal(ordinary.actionsDisabled, false);
assert.equal(hero.includes("Saad Qureshi"), false);
assert.equal(hero.includes("view.heroPortrait"), true);
process.env.NODE_ENV = previousNode;

const layout = read("src/app/(marketing)/layout.tsx");
assert.ok(layout.includes("HIGH OCTANE Real Estate — Design Preview"));
assert.ok(layout.includes("isHighOctaneConceptFixture"));
assert.ok(layout.includes("index: false"));
const previewJsonLdGate = layout.indexOf(
  "isHighOctaneConceptFixture(chromeBrand) ? null",
);
const organizationJsonLd = layout.indexOf("<JsonLd");
assert.ok(previewJsonLdGate > 0);
assert.ok(organizationJsonLd > previewJsonLdGate);
assert.ok(layout.includes("organizationJsonLdForTenancy"));
assert.ok(layout.includes("royalCollectionView?.displayFixtureId"));
assert.ok(layout.includes("<CustomerChatFab />"));
const guard = read(
  "src/components/templates/royal-collection-one/RoyalCollectionPreviewGuard.tsx",
);
assert.ok(
  read(
    "src/components/templates/royal-collection-one/preview-action-note.ts",
  ).includes("Design Preview — Actions Disabled"),
);
assert.ok(guard.includes("ROYAL_COLLECTION_PREVIEW_ACTION_NOTE"));
assert.ok(guard.includes('addEventListener("submit", block, true)'));
assert.equal(
  read("src/components/home/HomeHeroSearch.tsx").includes("actionsDisabled"),
  false,
);
const royalHomeSearch = read(
  "src/components/templates/royal-collection-one/RoyalCollectionSearch.tsx",
);
assert.ok(royalHomeSearch.includes('surface="royal"'));
assert.equal(royalHomeSearch.includes('surface="agent"'), false);
const heroSearch = read("src/components/home/HomeHeroSearch.tsx");
assert.ok(heroSearch.includes('surface === "royal"'));
assert.ok(heroSearch.includes("routeFreeTextInventorySearch"));
assert.ok(heroSearch.includes("onSearchSubmit"));
assert.ok(heroSearch.includes("Buy a Home"));
assert.ok(heroSearch.includes("Rent a Home"));
assert.ok(heroSearch.includes("Sell a Home"));
assert.ok(
  heroSearch.includes("Search by MLS® #, address, city or neighbourhood"),
);
assert.ok(heroSearch.includes("Search by address, city or MLS® #"));
assert.ok(heroSearch.includes('surface === "agent"'));
assert.ok(
  read(
    "src/components/templates/agent-signature/AgentSignatureSearchSection.tsx",
  ).includes('surface="agent"'),
);

const searchPage = read("src/app/(marketing)/search/page.tsx");
const searchDemo = read(
  "src/components/templates/royal-collection-one/RoyalCollectionSearchDemonstration.tsx",
);
assert.ok(searchPage.includes("isHighOctaneConceptFixture"));
assert.ok(searchPage.includes("<RoyalCollectionSearchDemonstration"));
assert.equal(searchPage.includes("SearchExperience"), false);
assert.ok(searchPage.includes('await import("./search-operational")'));
assert.ok(
  read("src/app/(marketing)/search/search-operational.tsx").includes(
    "<SearchExperience",
  ),
);
assert.equal(searchDemo.includes("SearchExperience"), false);
assert.equal(searchDemo.includes("SearchMap"), false);
assert.equal(searchDemo.includes("/api/listings"), false);
assert.equal(searchDemo.includes("fetch("), false);
assert.ok(searchDemo.includes("Not an MLS listing"));
assert.ok(searchDemo.includes("Concept"));
assert.ok(searchDemo.includes("ROYAL_COLLECTION_PREVIEW_ACTION_NOTE"));
assert.equal(searchDemo.includes("unsplash"), false);
assert.equal(searchDemo.includes("wikimedia"), false);
assert.equal(searchDemo.includes("$"), false);
assert.ok(searchDemo.includes("data-rc-allow"));
assert.ok(searchDemo.includes("Concept map"));
assert.ok(
  read("src/components/listings/SearchExperience.tsx").includes(
    "useRoyalCollectionSearchSkin",
  ),
);
assert.equal(
  read("src/app/(admin)/admin/search/page.tsx").includes(
    "useRoyalCollectionSearchSkin",
  ),
  false,
);
assert.equal(
  read("src/app/(agent)/agent/search/page.tsx").includes(
    "useRoyalCollectionSearchSkin",
  ),
  false,
);

const listingPage = read("src/app/(marketing)/listing/[...parts]/page.tsx");
const listingOperational = read(
  "src/app/(marketing)/listing/[...parts]/listing-operational.tsx",
);
const propertyDemo = read(
  "src/components/templates/royal-collection-one/RoyalCollectionPropertyDemonstration.tsx",
);
assert.ok(listingPage.includes("isHighOctaneConceptFixture"));
assert.ok(listingPage.includes("<RoyalCollectionPropertyDemonstration"));
assert.ok(listingPage.includes('await import("./listing-operational")'));
assert.ok(
  listingPage.indexOf("isHighOctaneConceptFixture") <
    listingPage.indexOf('await import("./listing-operational")'),
);
assert.equal(listingPage.includes("previewTemplate"), false);
assert.equal(listingPage.includes("ListingDetailView"), false);
assert.equal(listingPage.includes("ListingAccessGate"), false);
assert.equal(listingPage.includes("loadListingForDetailPage"), false);
assert.equal(listingPage.includes("listingView"), false);
assert.equal(listingPage.includes("application/ld+json"), false);
assert.equal(listingPage.includes("/api/listings"), false);
assert.ok(listingOperational.includes("loadListingForDetailPage"));
assert.ok(listingOperational.includes("prisma.listingView.create"));
assert.ok(listingOperational.includes("<ListingDetailView"));
assert.ok(listingOperational.includes("permanentRedirect"));
assert.ok(listingOperational.includes("serializeListingDetailClientModel"));
assert.equal(propertyDemo.includes("Design Concept — Not an MLS Listing"), true);
assert.ok(propertyDemo.includes("Concept"));
assert.ok(propertyDemo.includes("ROYAL_COLLECTION_PREVIEW_ACTION_NOTE"));
assert.ok(propertyDemo.includes("disabled"));
assert.equal(propertyDemo.includes("data-rc-allow"), false);
assert.equal(propertyDemo.includes("ListingDetailView"), false);
assert.equal(propertyDemo.includes("ListingAccessGate"), false);
assert.equal(propertyDemo.includes("LeadRequestForm"), false);
assert.equal(propertyDemo.includes("ViewingRequestPanel"), false);
assert.equal(propertyDemo.includes("ViewingBookingModal"), false);
assert.equal(propertyDemo.includes("ListingGallery"), false);
assert.equal(propertyDemo.includes("openAuth"), false);
assert.equal(propertyDemo.includes("VIEW_LISTING"), false);
assert.equal(propertyDemo.includes("fetch("), false);
assert.equal(propertyDemo.includes("/api/listings"), false);
assert.equal(propertyDemo.includes("/api/leads"), false);
assert.equal(propertyDemo.includes("application/ld+json"), false);
assert.equal(propertyDemo.includes("unsplash"), false);
assert.equal(propertyDemo.includes("wikimedia"), false);
assert.equal(propertyDemo.includes("$"), false);
const propertyGallery = read(
  "src/components/templates/royal-collection-one/RoyalCollectionPropertyGallery.tsx",
);
assert.equal(propertyGallery.includes("/api/listings"), false);
assert.equal(propertyGallery.includes("fetch("), false);
assert.equal(propertyGallery.includes("unsplash"), false);
assert.equal(propertyGallery.includes("X12935628"), false);
assert.equal(propertyGallery.includes("X13744972"), false);
assert.ok(propertyGallery.includes("data-rc-allow"));
assert.ok(propertyDemo.includes("No street address"));
assert.ok(propertyDemo.includes("Not stated"));
assert.equal(propertyDemo.includes("saad@highoctaneniagara.ca"), false);
assert.ok(propertyDemo.includes("fixture.email"));

const footer = read(
  "src/components/templates/royal-collection-one/RoyalCollectionFooter.tsx",
);
const attribution = read(
  "src/components/templates/royal-collection-one/RoyalCollectionPlatformAttribution.tsx",
);
assert.ok(footer.includes("RoyalCollectionPlatformAttribution"));
assert.ok(footer.includes("MlsDisclaimer"));
assert.ok(attribution.includes("Powered by"));
assert.ok(attribution.includes("https://houzzatpro.com"));
assert.ok(attribution.includes("HouzzatPRO.com"));
assert.equal(
  read("src/components/site/SiteFooter.tsx").includes(
    "RoyalCollectionPlatformAttribution",
  ),
  false,
);
assert.ok(guard.includes('href === "https://houzzatpro.com"'));

const houzzatOwner = {
  nodeEnv: "development",
  hostIsHouzzatWorkspace: true,
  hostWorkspaceId: "houzzat-workspace",
  ownerSessionForHostWorkspace: true,
  activatedByQueryOrEnvOnly: false,
};
assert.equal(
  resolveHighOctaneDevelopmentListingSource(houzzatOwner).listingSource,
  "none",
);
assert.equal(
  resolveHighOctaneDevelopmentListingSource(houzzatOwner).reason,
  "fixture_is_not_a_workspace",
);
assert.equal(
  resolveHighOctaneDevelopmentListingSource(houzzatOwner).sourceWorkspaceId,
  null,
);
assert.equal(
  resolveHighOctaneDevelopmentListingSource({
    ...houzzatOwner,
    nodeEnv: "production",
  }).reason,
  "production",
);
assert.equal(
  resolveHighOctaneDevelopmentListingSource({
    ...houzzatOwner,
    activatedByQueryOrEnvOnly: true,
    ownerSessionForHostWorkspace: false,
  }).reason,
  "query_or_env_only",
);
assert.equal(
  resolveHighOctaneDevelopmentListingSource({
    ...houzzatOwner,
    hostIsHouzzatWorkspace: false,
  }).reason,
  "not_houzzat_host",
);
assert.equal(
  resolveHighOctaneDevelopmentListingSource({
    ...houzzatOwner,
    ownerSessionForHostWorkspace: false,
  }).reason,
  "owner_session_required",
);
assert.ok(LISTING_SOURCE_SWITCH_INVALIDATION.length >= 6);
assert.equal(
  resolveTenantListingSourceAssignment({
    tenantWorkspaceId: "high-octane-workspace",
    sourceWorkspaceId: "houzzat-workspace",
    authorizedByQuery: false,
    connectionCount: 1,
  }).reason,
  "cross_tenant",
);
assert.equal(
  resolveTenantListingSourceAssignment({
    tenantWorkspaceId: "high-octane-workspace",
    sourceWorkspaceId: "high-octane-workspace",
    authorizedByQuery: true,
    connectionCount: 1,
  }).reason,
  "query_authorization",
);
assert.equal(
  resolveTenantListingSourceAssignment({
    tenantWorkspaceId: "high-octane-workspace",
    sourceWorkspaceId: "high-octane-workspace",
    authorizedByQuery: false,
    connectionCount: 0,
  }).reason,
  "no_connection",
);
const ownSource = resolveTenantListingSourceAssignment({
  tenantWorkspaceId: "high-octane-workspace",
  sourceWorkspaceId: "high-octane-workspace",
  authorizedByQuery: false,
  connectionCount: 1,
});
assert.equal(ownSource.listingSource, "workspace_connection");
assert.equal(ownSource.sourceWorkspaceId, "high-octane-workspace");

const stagingPlan = planHighOctaneStagingWorkspace();
assert.equal(stagingPlan.displayName, "HIGH OCTANE Real Estate");
assert.equal(stagingPlan.agentName, "Saad Qureshi");
assert.equal(stagingPlan.slug, "high-octane-real-estate");
assert.equal(stagingPlan.provisioned, false);
assert.equal(stagingPlan.billing, "not_activated");
assert.equal(stagingPlan.listingSource, "none");
assert.equal(stagingPlan.selectable, false);
assert.equal(stagingPlan.presentationReady, false);
assert.equal(
  evaluateHighOctaneStagingEnvironment({ NODE_ENV: "development" }).ready,
  false,
);
assert.equal(
  evaluateHighOctaneStagingEnvironment({
    NODE_ENV: "production",
    STAGING_DATABASE_URL: "postgresql://staging.example/neondb",
    DATABASE_URL: "postgresql://production.example/neondb",
    HIGH_OCTANE_STAGING: "1",
    HIGH_OCTANE_STAGING_ACCESS: "authenticated",
  }).ready,
  false,
);
assert.equal(
  evaluateHighOctaneStagingEnvironment({
    NODE_ENV: "development",
    STAGING_DATABASE_URL: "postgresql://same.example/neondb",
    DATABASE_URL: "postgresql://same.example/neondb",
    HIGH_OCTANE_STAGING: "1",
    HIGH_OCTANE_STAGING_ACCESS: "authenticated",
  }).ready,
  false,
);
const stagingReady = {
  NODE_ENV: "development",
  STAGING_DATABASE_URL: "postgresql://staging.example/neondb",
  DATABASE_URL: "postgresql://production.example/neondb",
  HIGH_OCTANE_STAGING: "1",
  HIGH_OCTANE_STAGING_ACCESS: "authenticated",
};
assert.equal(evaluateHighOctaneStagingEnvironment(stagingReady).ready, true);
assert.equal(
  resolveHighOctaneStagingTemplateId({
    workspaceSlug: "houzzat",
    env: stagingReady,
  }),
  null,
);
assert.equal(
  resolveHighOctaneStagingTemplateId({
    workspaceSlug: stagingPlan.slug,
    env: stagingReady,
  }),
  "royal-collection-one",
);
assert.equal(
  resolveHighOctaneStagingTemplateId({
    workspaceSlug: stagingPlan.slug,
    env: { NODE_ENV: "development" },
  }),
  null,
);
assert.equal(
  read("src/lib/tenancy/templates/high-octane-staging.ts").includes("prisma"),
  false,
);
const royalViewSource = read(
  "src/lib/tenancy/templates/resolve-royal-collection-view.ts",
);
assert.equal(
  royalViewSource.includes('from "@/lib/tenancy/templates/high-octane-staging"'),
  false,
);
assert.equal(royalViewSource.includes("node:punycode"), false);
assert.ok(
  royalViewSource.includes(
    'from "@/lib/tenancy/templates/high-octane-staging-slug"',
  ),
);
const stagingSlugSource = read(
  "src/lib/tenancy/templates/high-octane-staging-slug.ts",
);
assert.equal(stagingSlugSource.includes("node:punycode"), false);
assert.equal(stagingSlugSource.includes("DATABASE_URL"), false);
assert.equal(stagingSlugSource.includes("prisma"), false);
assert.ok(
  read("src/lib/tenancy/templates/high-octane-staging.ts").includes(
    "slugifyWorkspaceName",
  ),
);
assert.ok(
  read("src/app/(marketing)/listing/[...parts]/page.tsx").includes(
    "<RoyalCollectionPropertyDemonstration",
  ),
);

assert.equal(
  highOctaneStagingPropertyConceptAllowed({
    workspaceSlug: stagingPlan.slug,
    env: stagingReady,
  }),
  true,
);
assert.equal(
  highOctaneStagingPropertyConceptAllowed({
    workspaceSlug: "houzzat",
    env: stagingReady,
  }),
  false,
);
assert.equal(
  highOctaneStagingPropertyConceptAllowed({
    workspaceSlug: stagingPlan.slug,
    env: { ...stagingReady, NODE_ENV: "production" },
  }),
  false,
);
assert.equal(
  highOctaneStagingPropertyConceptAllowed({
    workspaceSlug: stagingPlan.slug,
    env: { ...stagingReady, HIGH_OCTANE_STAGING: undefined },
  }),
  false,
);
assert.equal(
  highOctaneStagingPropertyConceptAllowed({
    workspaceSlug: null,
    env: stagingReady,
  }),
  false,
);
const conceptRoute = read("src/app/(marketing)/design/property/page.tsx");
assert.ok(conceptRoute.includes("highOctaneStagingPropertyConceptAllowed"));
assert.ok(conceptRoute.includes("RoyalCollectionPropertyDemonstration"));
assert.ok(conceptRoute.includes("notFound"));
assert.equal(conceptRoute.includes("searchParams"), false);
assert.equal(conceptRoute.includes("previewTemplate"), false);
assert.equal(conceptRoute.includes("loadListingForDetailPage"), false);
assert.equal(conceptRoute.includes("prisma"), false);
assert.equal(conceptRoute.includes("/api/listings"), false);
assert.equal(conceptRoute.includes("/api/leads"), false);

console.log("royal-collection-signature-one-selftest: ok");
