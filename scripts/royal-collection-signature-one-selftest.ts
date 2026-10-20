/**
 * Royal Collection — Signature One stays unassigned and preview-only in development.
 * Run: pnpm exec tsx scripts/royal-collection-signature-one-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  isHighOctaneRoyalPreview,
  resolveRoyalCollectionView,
} from "../src/lib/tenancy/templates/resolve-royal-collection-view";
import { takeRoyalFeaturedListings } from "../src/components/templates/royal-collection-one/royal-featured-listings";
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
assert.equal(fixtureView.bio, null);
assert.equal(fixtureView.logoUrl, null);
assert.equal(fixtureView.footerLegalText, null);
assert.equal(fixtureView.posterUrl, null);
assert.equal(fixtureView.scenes.length, 3);
assert.ok(fixtureView.scenes.every((scene) => scene.src === "" && scene.poster === null));
assert.equal(fixtureView.scenes.some((scene) => scene.title === "Niagara Falls"), true);
assert.equal(fixtureView.navCommunities.some((place) => place.name === "Niagara-on-the-Lake"), true);
assert.equal(fixtureView.navCommunities.some((place) => place.name === "Fonthill / Pelham"), true);
assert.equal(JSON.stringify(fixtureView).includes("Ali Syed"), false);
assert.equal(JSON.stringify(fixtureView).includes("hero-canadian-homes"), false);

process.env.NODE_ENV = "production";
assert.equal(isHighOctaneRoyalPreview(tenantBrand), false);
const liveView = resolveRoyalCollectionView(tenantBrand);
assert.equal(liveView.agentName, "Ali Syed");
assert.equal(liveView.displayFixtureId, null);
assert.equal(liveView.actionsDisabled, false);

process.env.NODE_ENV = "development";
const ordinary = resolveRoyalCollectionView({
  ...tenantBrand,
  templatePreview: null,
});
assert.equal(ordinary.agentName, "Ali Syed");
assert.equal(isHighOctaneRoyalPreview({ ...tenantBrand, templatePreview: null }), false);
assert.equal(ordinary.actionsDisabled, false);
process.env.NODE_ENV = previousNode;

const layout = read("src/app/(marketing)/layout.tsx");
assert.ok(layout.includes("HIGH OCTANE Real Estate — Design Preview"));
assert.ok(layout.includes("isHighOctaneRoyalPreview"));
assert.ok(layout.includes("index: false"));
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

console.log("royal-collection-signature-one-selftest: ok");
