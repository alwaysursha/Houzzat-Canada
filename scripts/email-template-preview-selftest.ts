/**
 * Phase 2D-1 — accurate tenant email preview foundation.
 * Run: pnpm email-template-preview:selftest
 *
 * Asserts preview HTML is produced by production renderers + sample data only.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderAgentMessageEmail,
  renderJustListedEmail,
  renderPriceReductionEmail,
  renderSavedSearchDigestEmail,
  renderShortlistEmail,
} from "../src/lib/email/templates";
import {
  contentFieldsFromForm,
  formFromStoredContent,
  formToDraftPayload,
} from "../src/lib/email/workspace-templates/editor-form";
import {
  buildEmailTemplatePreviewHtml,
  defaultEmailTemplatePreviewVariant,
  EMAIL_TEMPLATE_PREVIEW_SAMPLE,
  listEmailTemplatePreviewVariants,
  type EmailTemplatePreviewBrand,
  type EmailTemplatePreviewVariantId,
} from "../src/lib/email/workspace-templates/preview";
import { allWorkspaceEmailTemplateTypes } from "../src/lib/email/workspace-templates/registry";
import type { EmailTemplateContentFields } from "../src/lib/email/workspace-templates/types";
import type { WorkspaceEmailTemplateType } from "@prisma/client";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const BRAND: EmailTemplatePreviewBrand = {
  displayName: "Acme Realty",
  logoUrl: null,
  primaryColor: "#0F766E",
  websiteUrl: "https://acme.example",
  footerNote: "Acme footer",
};

const EMPTY: EmailTemplateContentFields = {
  subject: null,
  introText: null,
  bodySections: {},
  ctaText: null,
  style: {},
};

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function preview(
  type: WorkspaceEmailTemplateType,
  content: EmailTemplateContentFields | null,
  variant?: EmailTemplatePreviewVariantId,
  mode: "desktop" | "mobile" = "desktop",
) {
  return buildEmailTemplatePreviewHtml({
    templateType: type,
    content,
    brand: BRAND,
    mode,
    variant,
  });
}

/** Strip preview-only subject bar + notice comment for live HTML parity checks. */
function stripPreviewChrome(html: string): string {
  return html
    .replace(`<!-- ${EMAIL_TEMPLATE_PREVIEW_SAMPLE.notice} -->\n`, "")
    .replace(
      /<div data-preview-subject="1"[^>]*>[\s\S]*?<\/div>/,
      "",
    );
}

function testVariantCatalog() {
  assert.deepEqual(
    listEmailTemplatePreviewVariants("PROPERTY_WATCH").map((v) => v.id),
    ["price_reduction", "sold", "property_update"],
  );
  assert.deepEqual(
    listEmailTemplatePreviewVariants("AREA_WATCH").map((v) => v.id),
    ["just_listed", "area_sold"],
  );
  assert.equal(defaultEmailTemplatePreviewVariant("AGENT_EMAIL"), "agent_email");
  for (const type of allWorkspaceEmailTemplateTypes()) {
    const variants = listEmailTemplatePreviewVariants(type);
    assert.ok(variants.length >= 1, `${type} needs a preview variant`);
    const html = preview(type, EMPTY, variants[0]!.id);
    assert.match(html, /Alex Sample|Hi there/);
    assert.match(html, /Sample preview data/);
    assert.doesNotMatch(html, /leadId|workspaceId|SELECT\s+FROM/i);
  }
}

function testParityPriceReduction() {
  const content: EmailTemplateContentFields = {
    subject: "Preview price · {{addressLine}}",
    introText: "Intro for {{recipientName}}",
    bodySections: { paragraphs: ["Para {{city}}"] },
    ctaText: "Open {{mlsNumber}}",
    style: { primaryColor: "#123456" },
  };
  const live = renderPriceReductionEmail({
    name: EMAIL_TEMPLATE_PREVIEW_SAMPLE.recipientName,
    addressLine: EMAIL_TEMPLATE_PREVIEW_SAMPLE.addressLine,
    city: EMAIL_TEMPLATE_PREVIEW_SAMPLE.city,
    mlsNumber: EMAIL_TEMPLATE_PREVIEW_SAMPLE.mlsNumber,
    oldPrice: EMAIL_TEMPLATE_PREVIEW_SAMPLE.oldPrice,
    newPrice: EMAIL_TEMPLATE_PREVIEW_SAMPLE.newPrice,
    listingUrl: EMAIL_TEMPLATE_PREVIEW_SAMPLE.listingUrl,
    imageUrl: EMAIL_TEMPLATE_PREVIEW_SAMPLE.imageUrl,
    bedsLabel: "3",
    bathsLabel: "2",
    sqftLabel: "1,450 sqft",
    preferencesManageUrl: EMAIL_TEMPLATE_PREVIEW_SAMPLE.preferencesManageUrl,
    unsubscribeIntentUrl: EMAIL_TEMPLATE_PREVIEW_SAMPLE.unsubscribeIntentUrl,
    brandLabel: BRAND.displayName,
    brandPrimaryColor: BRAND.primaryColor,
    brandWebsiteUrl: BRAND.websiteUrl,
    footerNote: BRAND.footerNote,
    agentFromLabel: EMAIL_TEMPLATE_PREVIEW_SAMPLE.agentName,
    agentSignatureHtml: `<strong style="color:#064e3b">Jordan Sample</strong><br/>Acme Realty<br/><span style="color:#047857">Sample agent signature</span>`,
    publishedTemplate: content,
  }).html;
  const built = preview("PROPERTY_WATCH", content, "price_reduction");
  assert.match(built, /Preview price · 123 Sample Street/);
  assert.match(built, /data-preview-subject/);
  assert.match(built, /Intro for Alex Sample/);
  assert.match(built, /Para Toronto/);
  assert.match(built, /Open SAMPLE123/);
  assert.match(built, /Price drop|Was/);
  assert.match(built, /#123456/);
  assert.equal(stripPreviewChrome(built), live);
}

function testEventSpecificFallback() {
  const html = preview("PROPERTY_WATCH", EMPTY, "price_reduction");
  assert.match(html, /Price reduced · 123 Sample Street/);
  assert.match(html, /dropped in price|reduced its price/i);
  assert.match(html, /View listing/);
  assert.doesNotMatch(html, /Update on a home you’re watching/);

  const area = preview("AREA_WATCH", EMPTY, "just_listed");
  assert.match(area, /Just listed in Sample Neighbourhood/);
  assert.match(area, /New listing/);
}

function testDraftPreview() {
  const draft: EmailTemplateContentFields = {
    subject: "DRAFT ONLY {{searchName}}",
    introText: "Draft intro for {{listingCount}}",
    bodySections: { paragraphs: ["Draft body"] },
    ctaText: "Draft CTA",
    style: {},
  };
  const html = preview("SAVED_SEARCH_DIGEST", draft, "buyer_digest");
  assert.match(html, /DRAFT ONLY Sample saved search/);
  assert.match(html, /Draft intro for 3/);
  assert.match(html, /Draft body/);
  assert.match(html, /Draft CTA/);
  assert.match(html, /123 Sample Street/);
}

function testAgentAuthoredPrecedence() {
  const template: EmailTemplateContentFields = {
    subject: "TEMPLATE SUBJECT MUST LOSE",
    introText: "Template subtitle {{recipientName}}",
    bodySections: { paragraphs: ["Template wrapper"] },
    ctaText: "Unused CTA",
    style: {},
  };
  const html = preview("AGENT_EMAIL", template, "agent_email");
  assert.match(html, /Sample agent subject — takes precedence/);
  assert.doesNotMatch(html, /TEMPLATE SUBJECT MUST LOSE/);
  assert.match(html, /sample message composed by your agent/i);
  assert.match(html, /Template subtitle Alex Sample/);
  assert.match(html, /Template wrapper/);

  const live = renderAgentMessageEmail({
    name: EMAIL_TEMPLATE_PREVIEW_SAMPLE.recipientName,
    subject: EMAIL_TEMPLATE_PREVIEW_SAMPLE.agentSubject,
    body: EMAIL_TEMPLATE_PREVIEW_SAMPLE.agentBody,
    brandLabel: BRAND.displayName,
    brandPrimaryColor: BRAND.primaryColor,
    brandWebsiteUrl: BRAND.websiteUrl,
    footerNote: BRAND.footerNote,
    agentFromLabel: EMAIL_TEMPLATE_PREVIEW_SAMPLE.agentName,
    agentSignatureHtml: `<strong style="color:#064e3b">Jordan Sample</strong><br/>Acme Realty<br/><span style="color:#047857">Sample agent signature</span>`,
    preferencesManageUrl: EMAIL_TEMPLATE_PREVIEW_SAMPLE.preferencesManageUrl,
    unsubscribeIntentUrl: EMAIL_TEMPLATE_PREVIEW_SAMPLE.unsubscribeIntentUrl,
    publishedAgentEmailTemplate: template,
  }).html;
  assert.equal(stripPreviewChrome(html), live);
}

function testShortlistAndProtected() {
  const html = preview(
    "SHORTLIST",
    {
      subject: "Shortlist {{listingCount}}",
      introText: null,
      bodySections: {},
      ctaText: "Open shortlist",
      style: {},
    },
    "shortlist",
  );
  assert.match(html, /Shortlist 2/);
  assert.match(html, /Sample personal note from your agent/);
  assert.match(html, /123 Sample Street/);
  assert.match(html, /Open shortlist/);
  assert.match(html, /Manage email preferences|Unsubscribe/i);
  assert.match(html, /Sample agent signature/);

  const live = renderShortlistEmail({
    name: EMAIL_TEMPLATE_PREVIEW_SAMPLE.recipientName,
    agentName: EMAIL_TEMPLATE_PREVIEW_SAMPLE.agentName,
    shareUrl: EMAIL_TEMPLATE_PREVIEW_SAMPLE.shareUrl,
    note: EMAIL_TEMPLATE_PREVIEW_SAMPLE.agentNote,
    listings: [
      {
        mlsNumber: "SAMPLE123",
        addressLine: "123 Sample Street",
        city: "Toronto",
        priceLabel: "$849,000",
        listingUrl: EMAIL_TEMPLATE_PREVIEW_SAMPLE.listingUrl,
        imageUrl: EMAIL_TEMPLATE_PREVIEW_SAMPLE.imageUrl,
        bedsLabel: "3",
        bathsLabel: "2",
        sqftLabel: "1,450 sqft",
        isNew: true,
      },
      {
        mlsNumber: "SAMPLE301",
        addressLine: "18 Sample Lane",
        city: "Toronto",
        priceLabel: "$650,000",
        listingUrl: EMAIL_TEMPLATE_PREVIEW_SAMPLE.listingUrl,
        imageUrl: EMAIL_TEMPLATE_PREVIEW_SAMPLE.imageUrl,
        bedsLabel: "3",
        bathsLabel: "2",
        sqftLabel: "1,450 sqft",
        isNew: true,
      },
    ],
    brandLabel: BRAND.displayName,
    brandPrimaryColor: BRAND.primaryColor,
    brandWebsiteUrl: BRAND.websiteUrl,
    footerNote: BRAND.footerNote,
    agentFromLabel: EMAIL_TEMPLATE_PREVIEW_SAMPLE.agentName,
    agentSignatureHtml: `<strong style="color:#064e3b">Jordan Sample</strong><br/>Acme Realty<br/><span style="color:#047857">Sample agent signature</span>`,
    preferencesManageUrl: EMAIL_TEMPLATE_PREVIEW_SAMPLE.preferencesManageUrl,
    unsubscribeIntentUrl: EMAIL_TEMPLATE_PREVIEW_SAMPLE.unsubscribeIntentUrl,
    publishedShortlistTemplate: {
      subject: "Shortlist {{listingCount}}",
      introText: null,
      bodySections: {},
      ctaText: "Open shortlist",
      style: {},
    },
  }).html;
  assert.equal(stripPreviewChrome(html), live);
}

function testHtmlEscapingAndBranding() {
  const html = preview(
    "AREA_WATCH",
    {
      subject: "Hi {{recipientName}}",
      introText: 'Watching {{areaName}} & "{{addressLine}}"',
      bodySections: { paragraphs: ["<script>alert(1)</script>"] },
      ctaText: "Go",
      style: { primaryColor: "#abcdef" },
    },
    "just_listed",
  );
  assert.match(html, /Acme Realty/);
  assert.match(html, /#abcdef/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>alert/i);
  assert.match(html, /Manage email preferences|Unsubscribe/i);

  const live = renderJustListedEmail({
    name: EMAIL_TEMPLATE_PREVIEW_SAMPLE.recipientName,
    areaName: EMAIL_TEMPLATE_PREVIEW_SAMPLE.areaName,
    addressLine: EMAIL_TEMPLATE_PREVIEW_SAMPLE.addressLine,
    city: EMAIL_TEMPLATE_PREVIEW_SAMPLE.city,
    mlsNumber: EMAIL_TEMPLATE_PREVIEW_SAMPLE.mlsNumber,
    price: EMAIL_TEMPLATE_PREVIEW_SAMPLE.listPrice,
    listingUrl: EMAIL_TEMPLATE_PREVIEW_SAMPLE.listingUrl,
    imageUrl: EMAIL_TEMPLATE_PREVIEW_SAMPLE.imageUrl,
    bedsLabel: "3",
    bathsLabel: "2",
    sqftLabel: "1,450 sqft",
    brandLabel: BRAND.displayName,
    brandPrimaryColor: BRAND.primaryColor,
    brandWebsiteUrl: BRAND.websiteUrl,
    footerNote: BRAND.footerNote,
    agentFromLabel: EMAIL_TEMPLATE_PREVIEW_SAMPLE.agentName,
    agentSignatureHtml: `<strong style="color:#064e3b">Jordan Sample</strong><br/>Acme Realty<br/><span style="color:#047857">Sample agent signature</span>`,
    preferencesManageUrl: EMAIL_TEMPLATE_PREVIEW_SAMPLE.preferencesManageUrl,
    unsubscribeIntentUrl: EMAIL_TEMPLATE_PREVIEW_SAMPLE.unsubscribeIntentUrl,
    publishedAreaWatchTemplate: {
      subject: "Hi {{recipientName}}",
      introText: 'Watching {{areaName}} & "{{addressLine}}"',
      bodySections: { paragraphs: ["<script>alert(1)</script>"] },
      ctaText: "Go",
      style: { primaryColor: "#abcdef" },
    },
  }).html;
  assert.equal(stripPreviewChrome(html), live);
}

function testMobileFrameAndCmaSeller() {
  const mobile = preview("NEWSLETTER", null, "newsletter", "mobile");
  assert.match(mobile, /max-width:390px/);
  assert.match(mobile, /Sample preview data/);

  const cma = preview("CMA_SHARE", EMPTY, "cma_share");
  assert.match(cma, /Comparative Market Analysis|market analysis/i);
  assert.match(cma, /not a formal appraisal/);
  assert.match(cma, /\$875,000|875,000/);
  assert.match(cma, /Jordan Sample/);

  const seller = preview("SELLER_NEIGHBOURHOOD_DIGEST", EMPTY, "seller_digest");
  assert.match(seller, /Neighborhood weekly|neighbourhood|near/i);
  assert.match(seller, /\$875,000|875,000/);
  assert.match(seller, /<strong>2<\/strong> new|<strong>2<\/strong>/);
}

function testBuyerDigestParity() {
  const live = renderSavedSearchDigestEmail({
    name: EMAIL_TEMPLATE_PREVIEW_SAMPLE.recipientName,
    searchName: EMAIL_TEMPLATE_PREVIEW_SAMPLE.searchName,
    listings: [
      {
        mlsNumber: "SAMPLE123",
        addressLine: "123 Sample Street",
        city: "Toronto",
        priceLabel: "$849,000",
        listingUrl: EMAIL_TEMPLATE_PREVIEW_SAMPLE.listingUrl,
        imageUrl: EMAIL_TEMPLATE_PREVIEW_SAMPLE.imageUrl,
        bedsLabel: "3",
        bathsLabel: "2",
        sqftLabel: "1,450 sqft",
        isNew: true,
      },
      {
        mlsNumber: "SAMPLE124",
        addressLine: "45 Sample Avenue",
        city: "Toronto",
        priceLabel: "$725,000",
        listingUrl: "https://example.com/sample/listing/SAMPLE124",
        imageUrl: EMAIL_TEMPLATE_PREVIEW_SAMPLE.imageUrl,
        bedsLabel: "3",
        bathsLabel: "2",
        sqftLabel: "1,450 sqft",
        isNew: true,
      },
      {
        mlsNumber: "SAMPLE125",
        addressLine: "9 Sample Court",
        city: "Toronto",
        priceLabel: "$990,000",
        listingUrl: "https://example.com/sample/listing/SAMPLE125",
        imageUrl: EMAIL_TEMPLATE_PREVIEW_SAMPLE.imageUrl,
        bedsLabel: "3",
        bathsLabel: "2",
        sqftLabel: "1,450 sqft",
        isNew: false,
      },
    ],
    searchUrl: EMAIL_TEMPLATE_PREVIEW_SAMPLE.searchUrl,
    brandLabel: BRAND.displayName,
    brandPrimaryColor: BRAND.primaryColor,
    brandWebsiteUrl: BRAND.websiteUrl,
    footerNote: BRAND.footerNote,
    agentFromLabel: EMAIL_TEMPLATE_PREVIEW_SAMPLE.agentName,
    agentSignatureHtml: `<strong style="color:#064e3b">Jordan Sample</strong><br/>Acme Realty<br/><span style="color:#047857">Sample agent signature</span>`,
    preferencesManageUrl: EMAIL_TEMPLATE_PREVIEW_SAMPLE.preferencesManageUrl,
    unsubscribeIntentUrl: EMAIL_TEMPLATE_PREVIEW_SAMPLE.unsubscribeIntentUrl,
    publishedSavedSearchDigestTemplate: null,
  }).html;
  const built = preview("SAVED_SEARCH_DIGEST", null, "buyer_digest");
  assert.equal(stripPreviewChrome(built), live);
}

function testUiWiring() {
  const client = read("src/components/admin/EmailTemplatesAdminClient.tsx");
  assert.match(client, /listEmailTemplatePreviewVariants/);
  assert.match(client, /previewVariant/);
  assert.match(client, /Live renderer preview/);
  assert.match(client, /sandbox=""/);
  assert.match(client, /Sample data only/);
  assert.match(client, /preview chrome only/);
  assert.match(client, /Illustrative preview only/);
  assert.match(client, /preview-catalog/);
  assert.match(client, /\/preview/);
  assert.doesNotMatch(client, /buildEmailTemplatePreviewHtml/);
  assert.doesNotMatch(
    client,
    /from ["']@\/lib\/email\/workspace-templates\/preview["']/,
  );
  const previewSrc = read("src/lib/email/workspace-templates/preview.ts");
  assert.match(
    previewSrc,
    /renderPriceReductionEmail|renderSavedSearchDigestEmail|renderAgentMessageEmail/,
  );
  assert.doesNotMatch(previewSrc, /mergeWithSystemDefaults/);
  assert.match(previewSrc, /data-preview-chrome="subject"/);
  assert.match(previewSrc, /inbox header only/);
  assert.match(previewSrc, /SERVER-ONLY|server-only|Client Component/i);
  const previewRoute = read(
    "src/app/api/admin/email-templates/[type]/preview/route.ts",
  );
  assert.match(previewRoute, /buildEmailTemplatePreviewHtml/);
  assert.match(previewRoute, /requireTenantEmailTemplateAdmin/);
}

function testDefaultVsExplicitOverrides() {
  // Null stored content must not inject registry defaults into form values.
  const emptyLoaded = formFromStoredContent(null);
  assert.equal(emptyLoaded.subject, "");
  assert.equal(emptyLoaded.introText, "");
  assert.equal(emptyLoaded.ctaText, "");
  assert.equal(emptyLoaded.bodyParagraphs, "");

  const payload = formToDraftPayload(emptyLoaded);
  assert.equal(payload.subject, null);
  assert.equal(payload.introText, null);
  assert.equal(payload.ctaText, null);
  assert.equal(payload.bodySections, null);

  // Explicit stored customizations must round-trip unchanged.
  const stored: EmailTemplateContentFields = {
    subject: "Tenant custom subject",
    introText: "Tenant custom intro",
    bodySections: { paragraphs: ["Custom para"] },
    ctaText: "Tenant CTA",
    style: { primaryColor: "#112233" },
  };
  const loaded = formFromStoredContent(stored);
  assert.equal(loaded.subject, "Tenant custom subject");
  assert.equal(loaded.introText, "Tenant custom intro");
  assert.equal(loaded.ctaText, "Tenant CTA");
  assert.equal(loaded.bodyParagraphs, "Custom para");
  assert.equal(loaded.primaryColor, "#112233");
  assert.deepEqual(formToDraftPayload(loaded), {
    subject: "Tenant custom subject",
    introText: "Tenant custom intro",
    bodySections: { paragraphs: ["Custom para"] },
    ctaText: "Tenant CTA",
    style: { primaryColor: "#112233" },
  });

  // Preview of empty form uses event-specific live wording (not registry default).
  const previewHtml = preview(
    "PROPERTY_WATCH",
    contentFieldsFromForm(emptyLoaded),
    "price_reduction",
  );
  assert.match(previewHtml, /Price reduced · 123 Sample Street/);
  assert.doesNotMatch(previewHtml, /Update on a home you’re watching/);
  assert.match(previewHtml, /Preview subject line/);
  assert.match(previewHtml, /not part of the email body/);
}

function main() {
  testVariantCatalog();
  testParityPriceReduction();
  testEventSpecificFallback();
  testDraftPreview();
  testAgentAuthoredPrecedence();
  testShortlistAndProtected();
  testHtmlEscapingAndBranding();
  testMobileFrameAndCmaSeller();
  testBuyerDigestParity();
  testDefaultVsExplicitOverrides();
  testUiWiring();
  console.log("email-template-preview-selftest: ok");
}

main();
