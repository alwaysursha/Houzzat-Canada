/**
 * HIGH OCTANE staging presentation regressions. No database connection.
 * Run: pnpm exec tsx scripts/high-octane-staging-presentation-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MLS_DISCLAIMER_TEXT } from "../src/components/compliance/MlsDisclaimer";
import {
  royalCollectionSnapshotDisclosure,
  royalCollectionUnconnectedDisclosure,
} from "../src/components/templates/royal-collection-one/unconnected-disclosure";
import { writeFunnelEvent } from "../src/lib/funnel/ingest";
import { buildLegacyHouzzatBrand } from "../src/lib/tenancy/legacy-houzzat-brand";
import type { MarketingPresentationBrand } from "../src/lib/tenancy/marketing-presentation-brand";
import { EMPTY_PUBLIC_PROFESSIONAL_IDENTITY } from "../src/lib/tenancy/professional-identity/types";
import {
  buildMarketingRootMetadata,
  organizationJsonLdForTenancy,
} from "../src/lib/tenancy/tenant-seo";
import { isHighOctaneStagingAnalyticsSuppressed } from "../src/lib/tenancy/templates/high-octane-staging-analytics";
import { HIGH_OCTANE_COMMUNITY_GUIDES } from "../src/lib/tenancy/templates/high-octane-community-guides";
import {
  HIGH_OCTANE_STAGING_FEATURED_CITIES,
  HIGH_OCTANE_STAGING_OWNER_EMAIL,
  HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
} from "../src/lib/tenancy/templates/high-octane-staging-slug";
import {
  HIGH_OCTANE_APPROVED_AGENT_PORTRAIT_URL,
  resolveRoyalCollectionView,
} from "../src/lib/tenancy/templates/resolve-royal-collection-view";
import { ROYAL_COLLECTION_ONE_TEMPLATE_ID } from "../src/lib/tenancy/templates/types";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const stagingEnv = {
  NODE_ENV: "development",
  HIGH_OCTANE_STAGING: "1",
  HIGH_OCTANE_STAGING_ACCESS: "authenticated",
  STAGING_DATABASE_URL:
    "postgresql://staging:secret@ep-red-credit-axp65p8a-pooler.c-4.us-east-2.aws.neon.tech/neondb",
  DATABASE_URL:
    "postgresql://prod:secret@ep-snowy-river-axfgwomo-pooler.c-4.us-east-2.aws.neon.tech/neondb",
  FUNNEL_EVENTS_ENABLED: "1",
} as NodeJS.ProcessEnv;

function brand(overrides: Partial<MarketingPresentationBrand> = {}): MarketingPresentationBrand {
  return {
    displayName: "HIGH OCTANE Real Estate",
    tagline: "Niagara",
    workspaceSlug: HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
    workspaceId: "ws-high-octane",
    poweredByHouzzatPro: true,
    isHouzzatWorkspace: false,
    logoUrl: null,
    brokerageLogoUrl: null,
    faviconUrl: null,
    ogImageUrl: null,
    colors: {
      primary: "#0B1F33",
      secondary: "#10283F",
      accent: "#C6A15B",
      surface: "#FFFFFF",
      ink: "#14201C",
    },
    contact: { email: "saad@highoctaneniagara.ca", phone: "289-501-7755" },
    footerLegalText: null,
    seoDescription: "Niagara homes",
    version: 1,
    publicOrigin: "http://localhost:3010",
    canonicalOrigin: "http://localhost:3010",
    templateId: ROYAL_COLLECTION_ONE_TEMPLATE_ID,
    agent: {
      name: "HIGH OCTANE Staging Owner",
      title: null,
      photoUrl: null,
      bio: null,
      brokerageName: "Wrong Brokerage",
      brokerageLogoUrl: null,
      brokeragePhone: null,
      phone: "000-000-0000",
      email: HIGH_OCTANE_STAGING_OWNER_EMAIL,
      markets: [],
    },
    professionalIdentity: {
      ...EMPTY_PUBLIC_PROFESSIONAL_IDENTITY,
      agent: {
        name: "Saad Qureshi",
        designation: null,
        cellPhone: "289-501-7755",
        photoUrl: null,
      },
      brokerage: {
        ...EMPTY_PUBLIC_PROFESSIONAL_IDENTITY.brokerage,
        name: "Right at Home Realty Brokerage",
      },
    },
    teamRoster: null,
    templatePreview: null,
    ...overrides,
  };
}

const stagingView = resolveRoyalCollectionView(brand());
assert.equal(stagingView.email, "saad@highoctaneniagara.ca");
assert.equal(stagingView.agentName, "Saad Qureshi");
assert.equal(stagingView.phone, "289-501-7755");
assert.equal(stagingView.brokerage.name, "Right at Home Realty Brokerage");
assert.equal(stagingView.brokerage.address, "5111 New St.\nBurlington, ON, L7L1V2");
assert.equal(
  stagingView.brokerage.logoUrl,
  "/media/royal-collection/high-octane/right-at-home-brokerage.png",
);
assert.equal(JSON.stringify(stagingView).includes(HIGH_OCTANE_STAGING_OWNER_EMAIL), false);
assert.equal(stagingView.listingDisclosure, "unconnected");
assert.equal(stagingView.featuredCities?.includes("Mississauga"), false);
assert.deepEqual(stagingView.featuredCities, [...HIGH_OCTANE_STAGING_FEATURED_CITIES]);
assert.equal(stagingView.markets[0], "Niagara Region");
assert.equal(stagingView.navCommunities.some((place) => place.name === "Niagara-on-the-Lake"), true);
assert.equal(stagingView.photoUrl, null);
assert.equal(stagingView.resolvedAgentPortraitUrl, HIGH_OCTANE_APPROVED_AGENT_PORTRAIT_URL);
assert.equal(stagingView.heroPortrait?.imageUrl, stagingView.resolvedAgentPortraitUrl);
const replacedPortrait = resolveRoyalCollectionView({
  ...brand(),
  professionalIdentity: {
    ...brand().professionalIdentity,
    agent: {
      ...brand().professionalIdentity.agent,
      photoUrl: "https://cdn.example/saad-next.jpg",
    },
  },
});
assert.equal(replacedPortrait.photoUrl, "https://cdn.example/saad-next.jpg");
assert.equal(replacedPortrait.resolvedAgentPortraitUrl, replacedPortrait.photoUrl);
assert.equal(replacedPortrait.heroPortrait?.imageUrl, replacedPortrait.resolvedAgentPortraitUrl);
assert.equal(
  replacedPortrait.resolvedAgentPortraitUrl === HIGH_OCTANE_APPROVED_AGENT_PORTRAIT_URL,
  false,
);
assert.equal(stagingView.heroPortrait?.name, "Saad Qureshi");
assert.equal(
  stagingView.storyMainUrl,
  "/media/royal-collection/high-octane/notl-house.webp",
);
assert.equal(
  stagingView.storyInsetUrl,
  "/media/royal-collection/high-octane/niagara-falls-inset.webp",
);
assert.equal(
  stagingView.valuationImageUrl,
  "/media/royal-collection/high-octane/itso-demo-1001/01-exterior.webp",
);
assert.equal(
  stagingView.mobileAboutPortraitUrl,
  "/media/royal-collection/high-octane/saad-qureshi-portrait-full.png",
);
assert.deepEqual(
  stagingView.collectionCards?.map((card) => ({
    name: card.name,
    kicker: card.kicker,
    caption: card.caption,
    imageUrl: card.imageUrl,
  })),
  [
    {
      name: "Niagara Falls",
      kicker: "01",
      caption: "",
      imageUrl: "/media/royal-collection/high-octane/niagara-falls-community.webp",
    },
    {
      name: "Niagara-on-the-Lake",
      kicker: "02",
      caption: "",
      imageUrl: "/media/royal-collection/high-octane/notl-hotel.webp",
    },
    {
      name: "St. Catharines",
      kicker: "03",
      caption: "",
      imageUrl: "/media/royal-collection/high-octane/port-dalhousie-lighthouse.webp",
    },
  ],
);
assert.deepEqual(
  stagingView.mobileCommunityCards?.map((card) => card.name),
  ["Niagara Falls", "Niagara-on-the-Lake", "St. Catharines", "Grimsby"],
);
assert.equal(
  stagingView.mobileCommunityCards?.every((card) => card.imageUrl?.startsWith("/media/royal-collection/high-octane/")),
  true,
);

const persistedMarket = resolveRoyalCollectionView(
  brand({
    agent: {
      ...brand().agent!,
      markets: ["Welland"],
    },
  }),
);
assert.deepEqual(persistedMarket.featuredCities, ["Welland"]);
assert.deepEqual(persistedMarket.markets, ["Welland"]);
assert.equal(persistedMarket.collectionCards, null);
assert.deepEqual(
  persistedMarket.mobileCommunityCards?.map((card) => card.name),
  ["Niagara Falls", "Niagara-on-the-Lake", "St. Catharines", "Grimsby"],
);
assert.equal(
  persistedMarket.storyMainUrl,
  "/media/royal-collection/high-octane/notl-house.webp",
);
assert.equal(
  persistedMarket.storyInsetUrl,
  "/media/royal-collection/high-octane/niagara-falls-inset.webp",
);

const loginOnly = resolveRoyalCollectionView(
  brand({ contact: { email: null, phone: "289-501-7755" } }),
);
assert.equal(loginOnly.email, null);

const connected = resolveRoyalCollectionView(brand({ authorizedListingSource: true }));
assert.equal(connected.listingDisclosure, "authorized");

const snapshotAttribution = resolveRoyalCollectionView(
  brand({ stagingSnapshotAttribution: true }),
);
assert.equal(snapshotAttribution.listingDisclosure, "snapshot");
const snapshotCopy = royalCollectionSnapshotDisclosure("Right at Home Realty Brokerage");
assert.equal(snapshotCopy.includes("Right at Home Realty Brokerage"), true);
assert.equal(snapshotCopy.includes("original listing brokerage"), true);
assert.equal(snapshotCopy.includes("not permission to redistribute"), true);
assert.equal(snapshotCopy.includes(MLS_DISCLAIMER_TEXT.slice(0, 24)), false);
assert.equal(
  resolveRoyalCollectionView(
    brand({ authorizedListingSource: true, stagingSnapshotAttribution: true }),
  ).listingDisclosure,
  "authorized",
);
assert.equal(
  resolveRoyalCollectionView(
    brand({
      workspaceSlug: "houzzat",
      isHouzzatWorkspace: true,
      stagingSnapshotAttribution: true,
    }),
  ).listingDisclosure,
  "unconnected",
);

const houzzat = resolveRoyalCollectionView(
  brand({
    displayName: "Houzzat",
    workspaceSlug: "houzzat",
    isHouzzatWorkspace: true,
    contact: { email: "hello@houzzat.com", phone: "647-000-0000" },
    agent: {
      ...brand().agent!,
      name: "Ali Syed",
      email: "ali@houzzat.com",
      markets: ["Mississauga"],
    },
    professionalIdentity: {
      ...EMPTY_PUBLIC_PROFESSIONAL_IDENTITY,
      agent: {
        name: "Ali Syed",
        designation: null,
        cellPhone: "647-000-0000",
        photoUrl: null,
      },
    },
  }),
);
assert.equal(houzzat.email, "hello@houzzat.com");
assert.equal(houzzat.listingDisclosure, "unconnected");
assert.equal(houzzat.featuredCities, null);
assert.equal(houzzat.collectionCards, null);
assert.equal(houzzat.mobileCommunityCards, null);
assert.equal(houzzat.communityGuides, false);
assert.equal(stagingView.communityGuides, true);
assert.deepEqual(
  HIGH_OCTANE_COMMUNITY_GUIDES.map((guide) => guide.slug),
  [
    "niagara-falls",
    "niagara-on-the-lake",
    "st-catharines",
    "welland",
    "thorold",
    "grimsby",
    "fort-erie",
    "lincoln",
    "fonthill-pelham",
  ],
);
assert.equal(
  HIGH_OCTANE_COMMUNITY_GUIDES.every(
    (guide) => guide.history.length > 40 && guide.attractions.length >= 4 && guide.highlights.length >= 4,
  ),
  true,
);
assert.equal(houzzat.heroPortrait, null);
assert.equal(houzzat.resolvedAgentPortraitUrl, null);
assert.equal(houzzat.storyMainUrl, null);
assert.equal(houzzat.storyInsetUrl, null);
assert.equal(houzzat.valuationImageUrl, null);
assert.equal(houzzat.mobileAboutPortraitUrl, null);
assert.equal(JSON.stringify(houzzat.markets), JSON.stringify(["Mississauga"]));
assert.equal(JSON.stringify(houzzat).includes("/media/royal-collection/high-octane/"), false);
assert.equal(
  read("src/components/templates/royal-collection-one/RoyalCollectionAbout.tsx").includes(
    "Portrait placeholder",
  ),
  false,
);
assert.equal(
  read("src/components/templates/royal-collection-one/RoyalCollectionStory.tsx").includes(
    "conceptStill",
  ),
  false,
);

const disclosure = royalCollectionUnconnectedDisclosure("Right at Home Realty Brokerage");
assert.match(disclosure, /Right at Home Realty Brokerage/);
assert.doesNotMatch(disclosure, /Houzzat clients|TRREB|VOW/i);
assert.match(MLS_DISCLAIMER_TEXT, /Houzzat clients/);
assert.match(MLS_DISCLAIMER_TEXT, /TRREB Virtual Office Website \(VOW\)/);

const footer = read("src/components/templates/royal-collection-one/RoyalCollectionFooter.tsx");
const siteFooter = read("src/components/site/SiteFooter.tsx");
const attribution = read(
  "src/components/templates/royal-collection-one/RoyalCollectionPlatformAttribution.tsx",
);
assert.ok(footer.includes("MlsDisclaimer"));
assert.ok(footer.includes("royalCollectionUnconnectedDisclosure"));
assert.ok(attribution.includes("Powered by"));
assert.ok(attribution.includes("https://houzzatpro.com"));
assert.match(siteFooter, /registered Houzzat clients only \(VOW\)/);

function tenancy(slug: string, displayName: string) {
  const legacy = buildLegacyHouzzatBrand("ws");
  return {
    ok: true as const,
    hostname: slug === "houzzat" ? "houzzat.com" : "localhost",
    origin: slug === "houzzat" ? "https://houzzat.com" : "http://localhost:3010",
    workspaceId: "ws",
    workspaceSlug: slug,
    verifiedHostname: true,
    brand: { ...legacy, displayName, seoDescription: legacy.seoDescription },
    resolutionMode: "workspace" as const,
  };
}

const stagingMeta = buildMarketingRootMetadata(
  tenancy(HIGH_OCTANE_STAGING_WORKSPACE_SLUG, "HIGH OCTANE Real Estate"),
  "http://localhost:3010",
);
const stagingTitle =
  typeof stagingMeta.title === "string" ? stagingMeta.title : stagingMeta.title?.default ?? "";
assert.match(stagingTitle, /Niagara Homes for Sale & Open Houses/);
assert.doesNotMatch(stagingTitle, /GTA Homes/);

const houzzatMeta = buildMarketingRootMetadata(
  tenancy("houzzat", "Houzzat"),
  "https://houzzat.com",
);
const houzzatTitle =
  typeof houzzatMeta.title === "string" ? houzzatMeta.title : houzzatMeta.title?.default ?? "";
assert.match(houzzatTitle, /GTA Homes for Sale & Open Houses/);
assert.doesNotMatch(houzzatTitle, /Niagara Homes/);

const stagingJson = organizationJsonLdForTenancy(
  tenancy(HIGH_OCTANE_STAGING_WORKSPACE_SLUG, "HIGH OCTANE Real Estate"),
  "http://localhost:3010",
);
assert.match(JSON.stringify(stagingJson.areaServed), /Niagara Region/);
assert.doesNotMatch(JSON.stringify(stagingJson.areaServed), /Greater Toronto Area/);

const houzzatJson = organizationJsonLdForTenancy(tenancy("houzzat", "Houzzat"), "https://houzzat.com");
assert.match(JSON.stringify(houzzatJson.areaServed), /Greater Toronto Area/);

assert.equal(
  isHighOctaneStagingAnalyticsSuppressed({
    env: stagingEnv,
    workspaceSlug: HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
  }),
  true,
);
assert.equal(
  isHighOctaneStagingAnalyticsSuppressed({ env: stagingEnv, workspaceSlug: null }),
  true,
);
assert.equal(
  isHighOctaneStagingAnalyticsSuppressed({ env: stagingEnv, workspaceSlug: "houzzat" }),
  false,
);
assert.equal(
  isHighOctaneStagingAnalyticsSuppressed({
    env: { ...stagingEnv, HIGH_OCTANE_STAGING: undefined },
    workspaceSlug: HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
  }),
  false,
);
assert.equal(
  isHighOctaneStagingAnalyticsSuppressed({
    env: { NODE_ENV: "production", FUNNEL_EVENTS_ENABLED: "1" },
    workspaceSlug: "houzzat",
  }),
  false,
);

async function main() {
let funnelWrites = 0;
const funnelDb = {
  funnelEvent: {
    create: async () => {
      funnelWrites += 1;
      return { id: "event-1" };
    },
  },
};
const suppressed = await writeFunnelEvent(
  {
    workspaceId: "ws-high-octane",
    eventName: "visitor_session_started",
    occurredAt: new Date(),
    visitorKey: "visitor",
    sessionKey: "session",
    dedupeKey: "dedupe-staging",
  },
  funnelDb,
  stagingEnv,
);
assert.equal(suppressed.status, "disabled");
assert.equal(funnelWrites, 0);

const written = await writeFunnelEvent(
  {
    workspaceId: "ws-houzzat",
    eventName: "visitor_session_started",
    occurredAt: new Date(),
    visitorKey: "visitor",
    sessionKey: "session",
    dedupeKey: "dedupe-houzzat",
  },
  funnelDb,
  { FUNNEL_EVENTS_ENABLED: "1", NODE_ENV: "production" },
);
assert.equal(written.status, "written");
assert.equal(funnelWrites, 1);

const beacon = read("src/app/api/analytics/beacon/route.ts");
const funnelRoute = read("src/app/api/analytics/funnel/route.ts");
const agentIdentity = read("src/lib/tenancy/resolve-public-agent-identity.ts");
assert.ok(beacon.indexOf("isHighOctaneStagingAnalyticsSuppressed") < beacon.indexOf("ingestActivityBeacon(body"));
assert.ok(funnelRoute.includes("isHighOctaneStagingAnalyticsSuppressed"));
assert.ok(agentIdentity.includes("firstNonEmpty(agent?.email, workspace.branding?.contactEmail)"));
assert.equal(read("src/components/compliance/MlsDisclaimer.tsx").includes(MLS_DISCLAIMER_TEXT.slice(0, 40)), true);
assert.equal(
  read("src/lib/tenancy/templates/resolve-royal-collection-view.ts").includes(
    'from "@/lib/tenancy/templates/high-octane-staging"',
  ),
  false,
);

console.log("high-octane staging presentation selftest: PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
