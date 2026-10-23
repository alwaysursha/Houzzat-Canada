/**
 * Production Royal Collection assignment.
 * Run: pnpm exec tsx scripts/high-octane-production-template-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getTemplate,
  listSelectableTemplates,
  requireValidSelectableThemeId,
  resolvePersistedPublicTemplateId,
  resolveTemplateIdFromThemeId,
} from "../src/lib/tenancy/templates";
import { buildHighOctaneProductionProvisionPlan } from "../src/lib/tenancy/templates/high-octane-production-plan";
import {
  deriveWorkspaceDisplayName,
  slugifyWorkspaceName,
} from "../src/lib/platform/provisioning/slug";
import { selectRoyalCollectionOperationalPresentation } from "../src/lib/tenancy/templates/royal-collection-operational-listing";
import {
  resolveRoyalCollectionView,
  usesHighOctaneRoyalCollectionMedia,
} from "../src/lib/tenancy/templates/resolve-royal-collection-view";
import {
  evaluateHighOctaneStagingEnvironment,
  resolveHighOctaneStagingTemplateId,
} from "../src/lib/tenancy/templates/high-octane-staging";
import { HIGH_OCTANE_STAGING_PREVIEW_HOSTNAME } from "../src/lib/tenancy/templates/high-octane-staging-preview";
import { HIGH_OCTANE_STAGING_WORKSPACE_SLUG } from "../src/lib/tenancy/templates/high-octane-staging-slug";
import { ROYAL_COLLECTION_ONE_TEMPLATE_ID } from "../src/lib/tenancy/templates/types";
import type { MarketingPresentationBrand } from "../src/lib/tenancy/marketing-presentation-brand";
import { EMPTY_PUBLIC_PROFESSIONAL_IDENTITY } from "../src/lib/tenancy/professional-identity/types";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const themeId = "royal-collection-one:signature";
const productionEnv = {
  NODE_ENV: "production",
  VERCEL_ENV: "production",
  HIGH_OCTANE_STAGING: "1",
  HIGH_OCTANE_STAGING_ACCESS: "authenticated",
} as NodeJS.ProcessEnv;

const royal = getTemplate(ROYAL_COLLECTION_ONE_TEMPLATE_ID);
assert.ok(royal);
assert.equal(royal.selectable, false);
assert.equal(royal.presentationReady, false);
assert.equal(listSelectableTemplates().some((template) => template.id === royal.id), false);
assert.throws(() => requireValidSelectableThemeId(themeId));
assert.equal(resolveTemplateIdFromThemeId(themeId), "default-signature");
assert.equal(resolvePersistedPublicTemplateId(themeId), ROYAL_COLLECTION_ONE_TEMPLATE_ID);
assert.equal(resolvePersistedPublicTemplateId("royal-collection-one:unassigned"), "default-signature");
assert.equal(resolvePersistedPublicTemplateId("agent-signature:editorial"), "agent-signature");
assert.equal(resolvePersistedPublicTemplateId(null), "default-signature");

assert.equal(
  resolveHighOctaneStagingTemplateId({
    workspaceSlug: HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
    env: productionEnv,
    hostname: HIGH_OCTANE_STAGING_PREVIEW_HOSTNAME,
  }),
  null,
);
assert.equal(evaluateHighOctaneStagingEnvironment(productionEnv).ready, false);
assert.equal(
  selectRoyalCollectionOperationalPresentation({
    workspaceSlug: "houzzat",
    listingFound: true,
    assignedTemplateId: "default-signature",
    env: productionEnv,
  }),
  "standard",
);
assert.equal(
  selectRoyalCollectionOperationalPresentation({
    workspaceSlug: HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
    listingFound: true,
    assignedTemplateId: ROYAL_COLLECTION_ONE_TEMPLATE_ID,
    env: productionEnv,
  }),
  "royal-collection",
);

const brand = {
  displayName: "Harbour & Co.",
  tagline: "A considered practice",
  workspaceSlug: "harbour-and-co",
  workspaceId: "ws_other",
  poweredByHouzzatPro: true,
  isHouzzatWorkspace: false,
  logoUrl: null,
  brokerageLogoUrl: null,
  faviconUrl: null,
  ogImageUrl: null,
  colors: {
    primary: "#102A43",
    secondary: "#243B53",
    accent: "#C4A46A",
    surface: "#F7F4EF",
    ink: "#102A43",
  },
  contact: { email: "hello@harbour.example", phone: "416-000-0000" },
  footerLegalText: null,
  seoDescription: "",
  version: 1,
  publicOrigin: "https://harbour.example",
  canonicalOrigin: "https://harbour.example",
  templateId: ROYAL_COLLECTION_ONE_TEMPLATE_ID,
  agent: {
    name: "Mina Harbour",
    title: "Broker",
    phone: "416-000-0000",
    email: "hello@harbour.example",
    bio: "Mina biography",
    markets: ["Toronto"],
    photoUrl: "/mina.jpg",
    brokerageName: "Harbour Realty",
  },
  professionalIdentity: {
    ...EMPTY_PUBLIC_PROFESSIONAL_IDENTITY,
    agent: {
      name: "Mina Harbour",
      designation: "Broker",
      cellPhone: "416-000-0000",
      photoUrl: "/mina.jpg",
    },
    brokerage: {
      ...EMPTY_PUBLIC_PROFESSIONAL_IDENTITY.brokerage,
      name: "Harbour Realty",
    },
  },
  teamRoster: null,
  templatePreview: null,
} as MarketingPresentationBrand;

const previous = process.env.NODE_ENV;
process.env.NODE_ENV = "production";
const otherTenant = resolveRoyalCollectionView(brand);
assert.equal(usesHighOctaneRoyalCollectionMedia(brand.workspaceSlug), false);
assert.equal(otherTenant.agentName, "Mina Harbour");
assert.equal(otherTenant.brandName, "Harbour & Co.");
assert.equal(otherTenant.scenes.length, 0);
assert.equal(otherTenant.storyMainUrl, null);
assert.equal(JSON.stringify(otherTenant).includes("/media/royal-collection/high-octane/"), false);
assert.equal(JSON.stringify(otherTenant).includes("Saad Qureshi"), false);

const highOctane = resolveRoyalCollectionView({
  ...brand,
  displayName: "HIGH OCTANE Real Estate",
  workspaceSlug: HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
  agent: {
    ...brand.agent!,
    name: "Saad Qureshi",
    email: "saad@highoctaneniagara.ca",
    markets: ["Niagara"],
  },
  professionalIdentity: {
    ...brand.professionalIdentity,
    agent: {
      ...brand.professionalIdentity.agent,
      name: "Saad Qureshi",
    },
  },
});
assert.equal(usesHighOctaneRoyalCollectionMedia(HIGH_OCTANE_STAGING_WORKSPACE_SLUG), true);
assert.equal(highOctane.agentName, "Saad Qureshi");
assert.equal(highOctane.storyMainUrl, "/media/royal-collection/high-octane/notl-house.webp");
assert.equal(highOctane.scenes.length, 3);
process.env.NODE_ENV = previous;

const plan = buildHighOctaneProductionProvisionPlan();
assert.equal(plan.writes, false);
assert.equal(plan.billingActivated, false);
assert.equal(plan.passwordCopied, false);
assert.equal(plan.listingSource, "none");
assert.equal(plan.themeId, themeId);
assert.equal(plan.templateSelectable, false);
assert.equal(plan.ownerEmail, "saad@highoctaneniagara.ca");
assert.equal(plan.platformHostname, "high-octane-real-estate.houzzatpro.com");
assert.equal(plan.planCode, "TEAM");
assert.equal(plan.businessName, "HIGH OCTANE Real Estate");
assert.equal(plan.subscriptionSource, "INTERNAL");
assert.equal(plan.authorization, "APPROVE_COMPLIMENTARY_WORKSPACE");
assert.equal(plan.hostnameWorkspaceStatus, "ACTIVE");
assert.equal(plan.trialPublishesHostname, false);
assert.equal(plan.setupFeeCents, 0);
assert.equal(plan.standardSetupFeeCents, 49900);
assert.equal(
  slugifyWorkspaceName(
    deriveWorkspaceDisplayName({
      planCode: "TEAM",
      businessName: plan.businessName,
      contactName: plan.contactName,
    }),
  ),
  "high-octane-real-estate",
);
assert.equal(
  slugifyWorkspaceName(
    deriveWorkspaceDisplayName({
      planCode: "SOLO",
      businessName: plan.businessName,
      contactName: plan.contactName,
    }),
  ),
  "saad-qureshi",
);
assert.equal(plan.customDomain, null);
assert.equal(plan.forbiddenHostnames.includes("localhost"), true);
assert.equal(plan.forbiddenHostnames.includes(HIGH_OCTANE_STAGING_PREVIEW_HOSTNAME), true);
const serialized = JSON.stringify(plan);
assert.equal(serialized.includes("postgres"), false);
assert.equal(serialized.includes("AUTH_SECRET"), false);
assert.equal(serialized.includes("passwordHash"), false);
assert.equal(serialized.includes("STAGING_DATABASE_URL"), false);

const planSource = readFileSync(
  join(root, "src/lib/tenancy/templates/high-octane-production-plan.ts"),
  "utf8",
);
assert.equal(planSource.includes("prisma"), false);
assert.equal(planSource.includes("bcrypt"), false);

const previewGate = readFileSync(
  join(root, "src/lib/tenancy/templates/high-octane-staging-preview.ts"),
  "utf8",
);
assert.equal(previewGate.includes('env.VERCEL_ENV !== "preview"'), true);
assert.equal(previewGate.includes("HIGH_OCTANE_STAGING_PREVIEW_HOSTNAME"), true);

console.log("high-octane-production-template-selftest: ok");
