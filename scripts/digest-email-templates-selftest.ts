/**
 * Phase 2C-3 — buyer/seller digest published template integration.
 * Run: pnpm digest-email-templates:selftest
 *
 * No real sends. No prod env changes. Memory store + renderer assertions.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderNeighborhoodWeeklyEmail,
  renderSavedSearchDigestEmail,
  type DigestListingLine,
} from "../src/lib/email/templates";
import { isTenantEmailTemplatesEnabled } from "../src/lib/email/workspace-templates/feature-flag";
import {
  fillPublishedSavedSearchDigestTemplate,
  fillPublishedSellerNeighbourhoodDigestTemplate,
  loadPublishedSavedSearchDigestOverride,
  loadPublishedSellerNeighbourhoodDigestOverride,
} from "../src/lib/email/workspace-templates/digest-templates";
import {
  memoryWorkspaceEmailTemplateStore,
  publishWorkspaceEmailTemplate,
  saveWorkspaceEmailTemplateDraft,
} from "../src/lib/email/workspace-templates";
import type { WorkspaceEmailTemplateStore } from "../src/lib/email/workspace-templates/store";
import type {
  EmailTemplateContentFields,
  WorkspaceEmailTemplateType,
} from "../src/lib/email/workspace-templates/types";
import {
  TENANT_B_TEST_DISPLAY_NAME,
  TENANT_B_TEST_WORKSPACE_ID,
} from "../src/lib/tenancy/test-fixtures/tenant-b-brand";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOUZZAT_WS = "ws_houzzat_fixture";
const CANARY_WS = TENANT_B_TEST_WORKSPACE_ID;
const ENV_ON = { TENANT_EMAIL_TEMPLATES: "on" } as NodeJS.ProcessEnv;
const ENV_OFF = { TENANT_EMAIL_TEMPLATES: "off" } as NodeJS.ProcessEnv;

const SAMPLE_LISTING: DigestListingLine = {
  mlsNumber: "X123",
  addressLine: "10 King St",
  city: "Toronto",
  priceLabel: "$850,000",
  listingUrl: "https://example.com/listing/X123",
  imageUrl: "https://example.com/img.jpg",
  bedsLabel: "3",
  bathsLabel: "2",
  sqftLabel: "1,200",
  isNew: true,
};

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

async function publishDigest(
  store: ReturnType<typeof memoryWorkspaceEmailTemplateStore>,
  workspaceId: string,
  templateType: WorkspaceEmailTemplateType,
  draft: {
    subject?: string | null;
    introText?: string | null;
    bodySections?: { paragraphs?: string[] } | null;
    ctaText?: string | null;
    style?: { primaryColor?: string | null } | null;
  },
) {
  const saved = await saveWorkspaceEmailTemplateDraft({
    workspaceId,
    role: "OWNER",
    actorUserId: `actor_${workspaceId}`,
    templateType,
    draft,
    store,
  });
  assert.equal(saved.ok, true);
  const published = await publishWorkspaceEmailTemplate({
    workspaceId,
    role: "OWNER",
    actorUserId: `actor_${workspaceId}`,
    templateType,
    store,
  });
  assert.equal(published.ok, true);
}

function testFeatureFlagDefaultOff() {
  assert.equal(isTenantEmailTemplatesEnabled({}), false);
  assert.equal(
    isTenantEmailTemplatesEnabled({ TENANT_EMAIL_TEMPLATES: "on" }),
    true,
  );
}

async function testIsolationPublishedOverride() {
  const store = memoryWorkspaceEmailTemplateStore();
  await publishDigest(store, HOUZZAT_WS, "SAVED_SEARCH_DIGEST", {
    subject: "Houzzat buyer · {{searchName}}",
    introText: "Houzzat buyer intro for {{recipientName}}",
    ctaText: "Open Houzzat matches",
    bodySections: { paragraphs: [`Only Houzzat buyer · ${HOUZZAT_WS}`] },
    style: { primaryColor: "#0F6B4C" },
  });
  await publishDigest(store, CANARY_WS, "SAVED_SEARCH_DIGEST", {
    subject: `${TENANT_B_TEST_DISPLAY_NAME} buyer · {{searchName}}`,
    introText: "Canary buyer intro for {{recipientName}}",
    ctaText: "Open Canary matches",
    bodySections: { paragraphs: [`Only Canary buyer · ${CANARY_WS}`] },
    style: { primaryColor: "#7C3AED" },
  });
  await publishDigest(store, HOUZZAT_WS, "SELLER_NEIGHBOURHOOD_DIGEST", {
    subject: "Houzzat seller · {{homeLabel}}",
    introText: "Houzzat seller intro near {{homeLabel}}",
    ctaText: "Open Houzzat seller tools",
    bodySections: { paragraphs: [`Only Houzzat seller · ${HOUZZAT_WS}`] },
  });
  await publishDigest(store, CANARY_WS, "SELLER_NEIGHBOURHOOD_DIGEST", {
    subject: `${TENANT_B_TEST_DISPLAY_NAME} seller · {{homeLabel}}`,
    introText: "Canary seller intro near {{homeLabel}}",
    ctaText: "Open Canary seller tools",
    bodySections: { paragraphs: [`Only Canary seller · ${CANARY_WS}`] },
  });

  const houzzatBuyer = await loadPublishedSavedSearchDigestOverride({
    workspaceId: HOUZZAT_WS,
    store,
    env: ENV_ON,
  });
  const canaryBuyer = await loadPublishedSavedSearchDigestOverride({
    workspaceId: CANARY_WS,
    store,
    env: ENV_ON,
  });
  const houzzatSeller = await loadPublishedSellerNeighbourhoodDigestOverride({
    workspaceId: HOUZZAT_WS,
    store,
    env: ENV_ON,
  });
  const canarySeller = await loadPublishedSellerNeighbourhoodDigestOverride({
    workspaceId: CANARY_WS,
    store,
    env: ENV_ON,
  });
  assert.ok(houzzatBuyer);
  assert.ok(canaryBuyer);
  assert.ok(houzzatSeller);
  assert.ok(canarySeller);
  assert.match(houzzatBuyer!.subject ?? "", /Houzzat buyer/);
  assert.match(canaryBuyer!.subject ?? "", new RegExp(TENANT_B_TEST_DISPLAY_NAME));
  assert.doesNotMatch(
    houzzatBuyer!.subject ?? "",
    new RegExp(TENANT_B_TEST_DISPLAY_NAME),
  );

  const houzzatMail = renderSavedSearchDigestEmail({
    name: "Pat",
    searchName: "Leslieville under 1M",
    listings: [SAMPLE_LISTING],
    searchUrl: "https://example.com/search",
    brandLabel: "Houzzat",
    publishedSavedSearchDigestTemplate: houzzatBuyer,
  });
  const canaryMail = renderSavedSearchDigestEmail({
    name: "Sam",
    searchName: "Beach condos",
    listings: [SAMPLE_LISTING],
    searchUrl: "https://example.com/search",
    brandLabel: TENANT_B_TEST_DISPLAY_NAME,
    publishedSavedSearchDigestTemplate: canaryBuyer,
  });

  assert.match(houzzatMail.subject, /Houzzat buyer · Leslieville under 1M/);
  assert.match(houzzatMail.html, /Houzzat buyer intro for Pat/);
  assert.match(houzzatMail.html, /Open Houzzat matches/);
  assert.match(houzzatMail.html, /Only Houzzat buyer/);
  assert.doesNotMatch(houzzatMail.html, /Only Canary buyer|Only Houzzat seller/);

  assert.match(
    canaryMail.subject,
    new RegExp(`${TENANT_B_TEST_DISPLAY_NAME} buyer`),
  );
  assert.match(canaryMail.html, /Canary buyer intro for Sam/);
  assert.doesNotMatch(canaryMail.html, /Only Houzzat buyer/);

  const houzzatSellerMail = renderNeighborhoodWeeklyEmail({
    name: "Pat",
    homeLabel: "12 Queen St",
    radiusKm: 2,
    newCount: 1,
    soldCount: 2,
    medianSoldLabel: "$900,000",
    newListings: [SAMPLE_LISTING],
    soldListings: [SAMPLE_LISTING],
    ctaUrl: "https://example.com/owner",
    brandLabel: "Houzzat",
    publishedSellerNeighbourhoodDigestTemplate: houzzatSeller,
  });
  assert.match(houzzatSellerMail.subject, /Houzzat seller · 12 Queen St/);
  assert.match(houzzatSellerMail.html, /Houzzat seller intro near 12 Queen St/);
  assert.match(houzzatSellerMail.html, /Only Houzzat seller/);
  assert.doesNotMatch(houzzatSellerMail.html, /Only Canary seller|Only Houzzat buyer/);

  const canarySellerMail = renderNeighborhoodWeeklyEmail({
    name: "Sam",
    homeLabel: "88 Bay St",
    radiusKm: 2,
    newCount: 3,
    soldCount: 1,
    newListings: [SAMPLE_LISTING],
    soldListings: [],
    ctaUrl: "https://example.com/owner",
    brandLabel: TENANT_B_TEST_DISPLAY_NAME,
    publishedSellerNeighbourhoodDigestTemplate: canarySeller,
  });
  assert.match(
    canarySellerMail.subject,
    new RegExp(`${TENANT_B_TEST_DISPLAY_NAME} seller`),
  );
  assert.doesNotMatch(canarySellerMail.html, /Only Houzzat seller/);
}

async function testBuyerSellerSeparation() {
  const store = memoryWorkspaceEmailTemplateStore();
  await publishDigest(store, HOUZZAT_WS, "SAVED_SEARCH_DIGEST", {
    subject: "BUYER ONLY {{searchName}}",
    introText: "Buyer-only intro",
    ctaText: "Buyer-only CTA",
  });
  await publishDigest(store, HOUZZAT_WS, "SELLER_NEIGHBOURHOOD_DIGEST", {
    subject: "SELLER ONLY {{homeLabel}}",
    introText: "Seller-only intro",
    ctaText: "Seller-only CTA",
  });

  const buyer = await loadPublishedSavedSearchDigestOverride({
    workspaceId: HOUZZAT_WS,
    store,
    env: ENV_ON,
  });
  const seller = await loadPublishedSellerNeighbourhoodDigestOverride({
    workspaceId: HOUZZAT_WS,
    store,
    env: ENV_ON,
  });
  assert.match(buyer?.subject ?? "", /BUYER ONLY/);
  assert.match(seller?.subject ?? "", /SELLER ONLY/);
  assert.doesNotMatch(buyer?.subject ?? "", /SELLER ONLY/);
  assert.doesNotMatch(seller?.subject ?? "", /BUYER ONLY/);

  const buyerMail = renderSavedSearchDigestEmail({
    name: "Alex",
    searchName: "Riverdale",
    listings: [SAMPLE_LISTING],
    searchUrl: "https://example.com/search",
    publishedSavedSearchDigestTemplate: buyer,
    // Seller template must not affect buyer renderer even if passed incorrectly —
    // buyer renderer only reads publishedSavedSearchDigestTemplate.
  });
  assert.match(buyerMail.subject, /BUYER ONLY/);
  assert.doesNotMatch(buyerMail.subject, /SELLER ONLY/);
  assert.match(buyerMail.html, /Buyer-only CTA/);

  const sellerMail = renderNeighborhoodWeeklyEmail({
    name: "Alex",
    homeLabel: "10 King St",
    radiusKm: 2,
    newCount: 1,
    soldCount: 0,
    newListings: [SAMPLE_LISTING],
    soldListings: [],
    ctaUrl: "https://example.com/owner",
    publishedSellerNeighbourhoodDigestTemplate: seller,
  });
  assert.match(sellerMail.subject, /SELLER ONLY/);
  assert.doesNotMatch(sellerMail.subject, /BUYER ONLY/);
  assert.match(sellerMail.html, /Seller-only CTA/);

  const buyerSrc = read("src/lib/email/digests/buyer.ts");
  const sellerSrc = read("src/lib/email/digests/seller.ts");
  assert.match(buyerSrc, /loadPublishedSavedSearchDigestOverride/);
  assert.doesNotMatch(buyerSrc, /loadPublishedSellerNeighbourhoodDigestOverride/);
  assert.match(sellerSrc, /loadPublishedSellerNeighbourhoodDigestOverride/);
  assert.doesNotMatch(sellerSrc, /loadPublishedSavedSearchDigestOverride/);
}

async function testDraftIgnored() {
  const store = memoryWorkspaceEmailTemplateStore();
  const draft = await saveWorkspaceEmailTemplateDraft({
    workspaceId: HOUZZAT_WS,
    role: "OWNER",
    actorUserId: "actor_h",
    templateType: "SAVED_SEARCH_DIGEST",
    draft: {
      subject: "DRAFT BUYER {{searchName}}",
      introText: "Draft buyer intro must never send",
      ctaText: "Draft buyer CTA",
    },
    store,
  });
  assert.equal(draft.ok, true);

  const loaded = await loadPublishedSavedSearchDigestOverride({
    workspaceId: HOUZZAT_WS,
    store,
    env: ENV_ON,
  });
  assert.equal(loaded, null);

  const mail = renderSavedSearchDigestEmail({
    name: "Alex",
    searchName: "Riverdale",
    listings: [SAMPLE_LISTING],
    searchUrl: "https://example.com/search",
    publishedSavedSearchDigestTemplate: loaded,
  });
  assert.equal(mail.subject, "New listing alert · 10 King St");
  assert.doesNotMatch(mail.html, /DRAFT BUYER/);
  assert.doesNotMatch(mail.html, /Draft buyer intro/);
}

async function testMissingAndInvalidFallback() {
  const store = memoryWorkspaceEmailTemplateStore();
  assert.equal(
    await loadPublishedSavedSearchDigestOverride({
      workspaceId: "ws_empty",
      store,
      env: ENV_ON,
    }),
    null,
  );

  await publishDigest(store, HOUZZAT_WS, "SAVED_SEARCH_DIGEST", {
    subject: "Valid buyer subject",
    introText: "Valid buyer intro",
    ctaText: "Valid buyer CTA",
  });
  const row = await store.findTemplate(HOUZZAT_WS, "SAVED_SEARCH_DIGEST");
  assert.ok(row?.published);
  if (row?.published) {
    row.published.subject = "Steal {{ssn}} in {{searchName}}";
  }
  assert.equal(
    await loadPublishedSavedSearchDigestOverride({
      workspaceId: HOUZZAT_WS,
      store,
      env: ENV_ON,
    }),
    null,
  );

  const mail = renderSavedSearchDigestEmail({
    name: "Alex",
    searchName: "Riverdale",
    listings: [SAMPLE_LISTING],
    searchUrl: "https://example.com/search",
    publishedSavedSearchDigestTemplate: null,
  });
  assert.equal(mail.subject, "New listing alert · 10 King St");
  assert.match(mail.html, /Browse all matching homes/);
  assert.doesNotMatch(mail.html, /Steal|ssn/);
}

async function testFeatureFlagOff() {
  const store = memoryWorkspaceEmailTemplateStore();
  await publishDigest(store, HOUZZAT_WS, "SAVED_SEARCH_DIGEST", {
    subject: "Flagged off buyer {{searchName}}",
    introText: "Should not appear",
    ctaText: "No buyer CTA",
  });
  await publishDigest(store, HOUZZAT_WS, "SELLER_NEIGHBOURHOOD_DIGEST", {
    subject: "Flagged off seller {{homeLabel}}",
    introText: "Should not appear seller",
    ctaText: "No seller CTA",
  });

  assert.equal(
    await loadPublishedSavedSearchDigestOverride({
      workspaceId: HOUZZAT_WS,
      store,
      env: ENV_OFF,
    }),
    null,
  );
  assert.equal(
    await loadPublishedSellerNeighbourhoodDigestOverride({
      workspaceId: HOUZZAT_WS,
      store,
      env: ENV_OFF,
    }),
    null,
  );

  let finds = 0;
  const throwingStore: WorkspaceEmailTemplateStore = {
    async findTemplate() {
      finds += 1;
      throw new Error("store must not be queried when flag is OFF");
    },
    async listTemplates() {
      return [];
    },
    async upsertDraft() {
      throw new Error("unused");
    },
    async publishDraft() {
      throw new Error("unused");
    },
    async clearPublished() {
      return null;
    },
    async listVersions() {
      return [];
    },
  };
  assert.equal(
    await loadPublishedSavedSearchDigestOverride({
      workspaceId: HOUZZAT_WS,
      store: throwingStore,
      env: ENV_OFF,
    }),
    null,
  );
  assert.equal(
    await loadPublishedSellerNeighbourhoodDigestOverride({
      workspaceId: HOUZZAT_WS,
      store: throwingStore,
      env: ENV_OFF,
    }),
    null,
  );
  assert.equal(finds, 0);
}

async function testPartialOverrideRetainsLegacy() {
  const store = memoryWorkspaceEmailTemplateStore();
  await publishDigest(store, HOUZZAT_WS, "SAVED_SEARCH_DIGEST", {
    ctaText: "See {{listingCount}} matches for {{searchName}}",
    bodySections: {
      paragraphs: ["Note for {{searchName}} · {{listingCount}} homes"],
    },
  });
  const partial = await loadPublishedSavedSearchDigestOverride({
    workspaceId: HOUZZAT_WS,
    store,
    env: ENV_ON,
  });
  assert.ok(partial);
  assert.equal(partial!.subject, null);
  assert.equal(partial!.introText, null);

  const buyer = renderSavedSearchDigestEmail({
    name: "Alex",
    searchName: "Riverdale",
    listings: [SAMPLE_LISTING, { ...SAMPLE_LISTING, mlsNumber: "X124" }],
    searchUrl: "https://example.com/search",
    publishedSavedSearchDigestTemplate: partial,
  });
  assert.equal(buyer.subject, "2 new homes matching your search");
  assert.match(buyer.html, /are 2 fresh matches/);
  assert.match(buyer.html, /Riverdale/);
  assert.match(buyer.html, /See 2 matches for Riverdale/);
  assert.match(buyer.html, /Note for Riverdale · 2 homes/);
  assert.match(buyer.html, /10 King St/);
  assert.doesNotMatch(buyer.subject, /New homes matching your search$/);

  await publishDigest(store, HOUZZAT_WS, "SELLER_NEIGHBOURHOOD_DIGEST", {
    ctaText: "Seller CTA {{newCount}}/{{soldCount}}",
  });
  const sellerPartial = await loadPublishedSellerNeighbourhoodDigestOverride({
    workspaceId: HOUZZAT_WS,
    store,
    env: ENV_ON,
  });
  const seller = renderNeighborhoodWeeklyEmail({
    name: "Alex",
    homeLabel: "10 King St",
    radiusKm: 2,
    newCount: 4,
    soldCount: 3,
    medianSoldLabel: "$875,000",
    newListings: [SAMPLE_LISTING],
    soldListings: [SAMPLE_LISTING],
    ctaUrl: "https://example.com/owner",
    publishedSellerNeighbourhoodDigestTemplate: sellerPartial,
  });
  assert.equal(seller.subject, "Neighborhood weekly · 10 King St");
  assert.match(seller.html, /Here’s what happened near/);
  assert.match(seller.html, /Seller CTA 4\/3/);
  assert.match(seller.html, /<strong>4<\/strong> new · <strong>3<\/strong> sold/);
  assert.match(seller.html, /\$875,000/);
}

function testHtmlEscapingAndProtectedElements() {
  const publishedBuyer: EmailTemplateContentFields = {
    subject: "Buyer for {{recipientName}} · {{searchName}}",
    introText: 'Hello {{recipientName}} & team for {{searchName}}',
    bodySections: { paragraphs: ["Count {{listingCount}}"] },
    ctaText: "Open {{searchName}}",
    style: { primaryColor: "#123456" },
  };

  const filled = fillPublishedSavedSearchDigestTemplate(publishedBuyer, {
    recipientName: 'Sam <script> & "Co"',
    searchName: "A&B Search",
    listingCount: 2,
  });
  assert.match(filled.subject, /Sam <script>/);

  const buyerMail = renderSavedSearchDigestEmail({
    name: 'Sam <script> & "Co"',
    searchName: "A&B Search",
    listings: [SAMPLE_LISTING],
    searchUrl: "https://example.com/search",
    preferencesManageUrl: "https://example.com/prefs",
    unsubscribeIntentUrl: "https://example.com/unsub",
    brandLabel: "Acme",
    agentSignatureHtml: "<strong>Jordan</strong>",
    agentSignatureText: "Jordan",
    publishedSavedSearchDigestTemplate: publishedBuyer,
  });

  assert.match(buyerMail.html, /Sam &lt;script&gt;/);
  assert.match(buyerMail.html, /&amp;/);
  assert.doesNotMatch(buyerMail.html, /<script>alert/i);
  assert.match(buyerMail.html, /10 King St/);
  assert.match(buyerMail.html, /\$850,000/);
  assert.match(buyerMail.html, /Manage email preferences|Unsubscribe/i);
  assert.match(buyerMail.html, /Jordan/);
  assert.match(buyerMail.html, /#123456/);
  assert.equal(buyerMail.kind, "saved_search_digest");

  const publishedSeller: EmailTemplateContentFields = {
    subject: "Seller {{homeLabel}}",
    introText: "Near {{homeLabel}} for {{recipientName}}",
    bodySections: { paragraphs: ["Stats stay protected"] },
    ctaText: "Tools",
    style: {},
  };
  fillPublishedSellerNeighbourhoodDigestTemplate(publishedSeller, {
    recipientName: "Pat",
    homeLabel: "1 A&B St",
    newCount: 2,
    soldCount: 1,
  });

  const sellerMail = renderNeighborhoodWeeklyEmail({
    name: "Pat",
    homeLabel: "1 A&B St",
    radiusKm: 2,
    newCount: 2,
    soldCount: 1,
    medianSoldLabel: "$900,000",
    newListings: [SAMPLE_LISTING],
    soldListings: [SAMPLE_LISTING],
    ctaUrl: "https://example.com/owner",
    preferencesManageUrl: "https://example.com/prefs",
    unsubscribeIntentUrl: "https://example.com/unsub",
    agentSignatureHtml: "<strong>Jordan</strong>",
    publishedSellerNeighbourhoodDigestTemplate: publishedSeller,
  });
  assert.match(sellerMail.html, /1 A&amp;B St|1 A&B St/);
  assert.match(sellerMail.html, /<strong>2<\/strong> new · <strong>1<\/strong> sold/);
  assert.match(sellerMail.html, /\$900,000/);
  assert.match(sellerMail.html, /10 King St/);
  assert.match(sellerMail.html, /Stats stay protected/);
  assert.match(sellerMail.html, /Manage email preferences|Unsubscribe/i);
  assert.equal(sellerMail.kind, "neighborhood_weekly");
}

function testLegacyPreservedAndNoDuplicateSends() {
  const buyer = renderSavedSearchDigestEmail({
    name: "Alex",
    searchName: "Riverdale",
    listings: [SAMPLE_LISTING],
    searchUrl: "https://example.com/search",
    preferencesManageUrl: "https://example.com/prefs",
    unsubscribeIntentUrl: "https://example.com/unsub",
    publishedSavedSearchDigestTemplate: null,
  });
  assert.equal(buyer.subject, "New listing alert · 10 King St");
  assert.match(buyer.html, /is a fresh match/);
  assert.match(buyer.html, /Browse all matching homes/);
  assert.match(buyer.text, /New listings matched/);
  assert.match(
    buyer.html,
    /We've found new homes that match your criteria/,
  );

  const multi = renderSavedSearchDigestEmail({
    name: "Alex",
    searchName: "Riverdale",
    listings: [SAMPLE_LISTING, { ...SAMPLE_LISTING, mlsNumber: "Y1" }],
    searchUrl: "https://example.com/search",
  });
  assert.equal(multi.subject, "2 new homes matching your search");

  const seller = renderNeighborhoodWeeklyEmail({
    name: "Alex",
    homeLabel: "10 King St",
    radiusKm: 2,
    newCount: 1,
    soldCount: 2,
    medianSoldLabel: "$800,000",
    newListings: [SAMPLE_LISTING],
    soldListings: [SAMPLE_LISTING],
    ctaUrl: "https://example.com/owner",
    publishedSellerNeighbourhoodDigestTemplate: null,
  });
  assert.equal(seller.subject, "Neighborhood weekly · 10 King St");
  assert.match(seller.html, /Here’s what happened near/);
  assert.match(seller.html, /View seller tools/);
  assert.match(seller.text, /This week near 10 King St/);

  const buyerSrc = read("src/lib/email/digests/buyer.ts");
  const sellerSrc = read("src/lib/email/digests/seller.ts");
  assert.equal((buyerSrc.match(/sendAndLogClientEmail\(/g) ?? []).length, 1);
  assert.equal((sellerSrc.match(/sendAndLogClientEmail\(/g) ?? []).length, 1);
  assert.match(buyerSrc, /loadPublishedSavedSearchDigestOverride/);
  assert.match(sellerSrc, /loadPublishedSellerNeighbourhoodDigestOverride/);
  assert.match(
    read("src/lib/email/workspace-templates/digest-templates.ts"),
    /TENANT_EMAIL_TEMPLATES|isTenantEmailTemplatesEnabled/,
  );
  assert.doesNotMatch(
    buyerSrc,
    /loadPublishedPropertyWatchOverride|loadPublishedAreaWatchOverride/,
  );
  assert.doesNotMatch(
    sellerSrc,
    /loadPublishedPropertyWatchOverride|loadPublishedAreaWatchOverride/,
  );
}

async function testPublishedOverrideApplication() {
  const explicit: EmailTemplateContentFields = {
    subject: "Digest ping · {{searchName}} ({{listingCount}})",
    introText: "Hello {{recipientName}} — {{listingCount}} for {{searchName}}",
    bodySections: {},
    ctaText: null,
    style: {},
  };
  const mail = renderSavedSearchDigestEmail({
    name: "Pat",
    searchName: "The Beach",
    listings: [SAMPLE_LISTING],
    searchUrl: "https://example.com/search",
    publishedSavedSearchDigestTemplate: explicit,
  });
  assert.equal(mail.subject, "Digest ping · The Beach (1)");
  assert.match(mail.html, /Hello Pat — 1 for The Beach/);
  assert.match(mail.html, /Browse all matching homes/);
}

async function main() {
  testFeatureFlagDefaultOff();
  await testIsolationPublishedOverride();
  await testBuyerSellerSeparation();
  await testDraftIgnored();
  await testMissingAndInvalidFallback();
  await testFeatureFlagOff();
  await testPartialOverrideRetainsLegacy();
  testHtmlEscapingAndProtectedElements();
  testLegacyPreservedAndNoDuplicateSends();
  await testPublishedOverrideApplication();
  console.log("digest-email-templates-selftest: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
