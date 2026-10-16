/**
 * Phase 2C-2 — AREA_WATCH published template integration.
 * Run: pnpm area-watch-email-templates:selftest
 *
 * No real sends. No prod env changes. Memory store + renderer assertions.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderJustListedEmail,
  renderPriceReductionEmail,
  renderSoldAlertEmail,
} from "../src/lib/email/templates";
import { isTenantEmailTemplatesEnabled } from "../src/lib/email/workspace-templates/feature-flag";
import {
  fillPublishedAreaWatchTemplate,
  loadPublishedAreaWatchOverride,
} from "../src/lib/email/workspace-templates/area-watch";
import { loadPublishedPropertyWatchOverride } from "../src/lib/email/workspace-templates/property-watch";
import {
  memoryWorkspaceEmailTemplateStore,
  publishWorkspaceEmailTemplate,
  saveWorkspaceEmailTemplateDraft,
} from "../src/lib/email/workspace-templates";
import type { WorkspaceEmailTemplateStore } from "../src/lib/email/workspace-templates/store";
import type { EmailTemplateContentFields } from "../src/lib/email/workspace-templates/types";
import {
  TENANT_B_TEST_DISPLAY_NAME,
  TENANT_B_TEST_WORKSPACE_ID,
} from "../src/lib/tenancy/test-fixtures/tenant-b-brand";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOUZZAT_WS = "ws_houzzat_fixture";
const CANARY_WS = TENANT_B_TEST_WORKSPACE_ID;
const ENV_ON = { TENANT_EMAIL_TEMPLATES: "on" } as NodeJS.ProcessEnv;
const ENV_OFF = { TENANT_EMAIL_TEMPLATES: "off" } as NodeJS.ProcessEnv;

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

async function publishArea(
  store: ReturnType<typeof memoryWorkspaceEmailTemplateStore>,
  workspaceId: string,
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
    templateType: "AREA_WATCH",
    draft,
    store,
  });
  assert.equal(saved.ok, true);
  const published = await publishWorkspaceEmailTemplate({
    workspaceId,
    role: "OWNER",
    actorUserId: `actor_${workspaceId}`,
    templateType: "AREA_WATCH",
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
  await publishArea(store, HOUZZAT_WS, {
    subject: "Houzzat area · {{areaName}}",
    introText: "Houzzat area intro for {{recipientName}}",
    ctaText: "Open Houzzat area listing",
    bodySections: { paragraphs: [`Only Houzzat area · ${HOUZZAT_WS}`] },
    style: { primaryColor: "#0F6B4C" },
  });
  await publishArea(store, CANARY_WS, {
    subject: `${TENANT_B_TEST_DISPLAY_NAME} area · {{areaName}}`,
    introText: "Canary area intro for {{recipientName}}",
    ctaText: "Open Canary area listing",
    bodySections: { paragraphs: [`Only Canary area · ${CANARY_WS}`] },
    style: { primaryColor: "#7C3AED" },
  });

  const houzzat = await loadPublishedAreaWatchOverride({
    workspaceId: HOUZZAT_WS,
    store,
    env: ENV_ON,
  });
  const canary = await loadPublishedAreaWatchOverride({
    workspaceId: CANARY_WS,
    store,
    env: ENV_ON,
  });
  assert.ok(houzzat);
  assert.ok(canary);
  assert.match(houzzat!.subject ?? "", /Houzzat area/);
  assert.match(canary!.subject ?? "", new RegExp(TENANT_B_TEST_DISPLAY_NAME));
  assert.doesNotMatch(houzzat!.subject ?? "", new RegExp(TENANT_B_TEST_DISPLAY_NAME));

  const houzzatMail = renderJustListedEmail({
    name: "Pat",
    areaName: "Leslieville",
    addressLine: "22 Queen St",
    city: "Toronto",
    mlsNumber: "H1",
    price: 775_000,
    listingUrl: "https://example.com/H1",
    brandLabel: "Houzzat",
    publishedAreaWatchTemplate: houzzat,
  });
  const canaryMail = renderJustListedEmail({
    name: "Sam",
    areaName: "The Beach",
    addressLine: "88 Bay St",
    city: "Toronto",
    mlsNumber: "C1",
    price: 775_000,
    listingUrl: "https://example.com/C1",
    brandLabel: TENANT_B_TEST_DISPLAY_NAME,
    publishedAreaWatchTemplate: canary,
  });

  assert.match(houzzatMail.subject, /Houzzat area · Leslieville/);
  assert.match(houzzatMail.html, /Houzzat area intro for Pat/);
  assert.match(houzzatMail.html, /Open Houzzat area listing/);
  assert.match(houzzatMail.html, /Only Houzzat area/);
  assert.doesNotMatch(houzzatMail.html, /Only Canary area/);

  assert.match(canaryMail.subject, new RegExp(`${TENANT_B_TEST_DISPLAY_NAME} area`));
  assert.match(canaryMail.html, /Canary area intro for Sam/);
  assert.match(canaryMail.html, /Open Canary area listing/);
  assert.doesNotMatch(canaryMail.html, /Only Houzzat area/);
}

async function testDraftIgnored() {
  const store = memoryWorkspaceEmailTemplateStore();
  const draft = await saveWorkspaceEmailTemplateDraft({
    workspaceId: HOUZZAT_WS,
    role: "OWNER",
    actorUserId: "actor_h",
    templateType: "AREA_WATCH",
    draft: {
      subject: "DRAFT AREA {{areaName}}",
      introText: "Draft area intro must never send",
      ctaText: "Draft area CTA",
    },
    store,
  });
  assert.equal(draft.ok, true);

  const loaded = await loadPublishedAreaWatchOverride({
    workspaceId: HOUZZAT_WS,
    store,
    env: ENV_ON,
  });
  assert.equal(loaded, null);

  const mail = renderJustListedEmail({
    name: "Alex",
    areaName: "Riverdale",
    addressLine: "10 King St",
    city: "Toronto",
    mlsNumber: "X123",
    price: 850_000,
    listingUrl: "https://example.com/listing/X123",
    publishedAreaWatchTemplate: loaded,
  });
  assert.equal(mail.subject, "Just listed in Riverdale");
  assert.doesNotMatch(mail.html, /DRAFT AREA/);
  assert.doesNotMatch(mail.html, /Draft area intro/);
}

async function testMissingAndInvalidFallback() {
  const store = memoryWorkspaceEmailTemplateStore();
  assert.equal(
    await loadPublishedAreaWatchOverride({
      workspaceId: "ws_empty",
      store,
      env: ENV_ON,
    }),
    null,
  );

  await publishArea(store, HOUZZAT_WS, {
    subject: "Valid area subject",
    introText: "Valid area intro",
    ctaText: "Valid area CTA",
  });
  const row = await store.findTemplate(HOUZZAT_WS, "AREA_WATCH");
  assert.ok(row?.published);
  if (row?.published) {
    row.published.subject = "Steal {{ssn}} in {{areaName}}";
  }
  assert.equal(
    await loadPublishedAreaWatchOverride({
      workspaceId: HOUZZAT_WS,
      store,
      env: ENV_ON,
    }),
    null,
  );

  const mail = renderJustListedEmail({
    name: "Alex",
    areaName: "Riverdale",
    addressLine: "10 King St",
    city: "Toronto",
    mlsNumber: "X123",
    price: 850_000,
    listingUrl: "https://example.com/listing/X123",
    publishedAreaWatchTemplate: null,
  });
  assert.equal(mail.subject, "Just listed in Riverdale");
  assert.match(mail.html, /View listing/);
  assert.doesNotMatch(mail.html, /Steal|ssn/);
}

async function testFeatureFlagOff() {
  const store = memoryWorkspaceEmailTemplateStore();
  await publishArea(store, HOUZZAT_WS, {
    subject: "Flagged off area {{areaName}}",
    introText: "Should not appear",
    ctaText: "No area CTA",
  });
  const loaded = await loadPublishedAreaWatchOverride({
    workspaceId: HOUZZAT_WS,
    store,
    env: ENV_OFF,
  });
  assert.equal(loaded, null);

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
    await loadPublishedAreaWatchOverride({
      workspaceId: HOUZZAT_WS,
      store: throwingStore,
      env: ENV_OFF,
    }),
    null,
  );
  assert.equal(finds, 0);
}

async function testEventSpecificFallbackPartialPublish() {
  const store = memoryWorkspaceEmailTemplateStore();
  await publishArea(store, HOUZZAT_WS, {
    ctaText: "Browse this area home",
    bodySections: { paragraphs: ["Note for {{areaName}} · {{addressLine}}"] },
  });
  const partial = await loadPublishedAreaWatchOverride({
    workspaceId: HOUZZAT_WS,
    store,
    env: ENV_ON,
  });
  assert.ok(partial);
  assert.equal(partial!.subject, null);
  assert.equal(partial!.introText, null);
  assert.doesNotMatch(partial!.subject ?? "", /New activity in your watched area/i);

  const justListed = renderJustListedEmail({
    name: "Alex",
    areaName: "Riverdale",
    addressLine: "10 King St",
    city: "Toronto",
    mlsNumber: "X123",
    price: 850_000,
    listingUrl: "https://example.com/listing/X123",
    publishedAreaWatchTemplate: partial,
  });
  assert.equal(justListed.subject, "Just listed in Riverdale");
  assert.match(justListed.html, /A new home matched your area alert for/);
  assert.match(justListed.text, /New listing in Riverdale:/);
  assert.match(justListed.html, /Browse this area home/);
  assert.match(justListed.html, /Note for Riverdale · 10 King St/);
  assert.match(justListed.html, /New listing/);
  assert.doesNotMatch(justListed.subject, /New activity in your watched area/);

  const sold = renderSoldAlertEmail({
    name: "Alex",
    addressLine: "10 King St",
    city: "Toronto",
    mlsNumber: "X123",
    statusLabel: "Sold",
    priceLabel: "$850,000",
    areaName: "Riverdale",
    listingUrl: "https://example.com/listing/X123",
    publishedAreaWatchTemplate: partial,
  });
  assert.equal(sold.subject, "Sold · 10 King St");
  assert.match(sold.html, /A property you’re watching changed status/);
  assert.match(sold.html, /Browse this area home/);
  assert.match(sold.html, /Note for Riverdale · 10 King St/);
  assert.match(sold.html, /View details|Browse this area home/);

  const explicit: EmailTemplateContentFields = {
    subject: "Area ping · {{areaName}}",
    introText: "Hello {{recipientName}} in {{areaName}}",
    bodySections: {},
    ctaText: null,
    style: {},
  };
  const justExplicit = renderJustListedEmail({
    name: "Pat",
    areaName: "The Beach",
    addressLine: "22 Queen St",
    city: "Toronto",
    mlsNumber: "H1",
    price: 700_000,
    listingUrl: "https://example.com/H1",
    publishedAreaWatchTemplate: explicit,
  });
  assert.equal(justExplicit.subject, "Area ping · The Beach");
  assert.match(justExplicit.html, /Hello Pat in The Beach/);
  assert.match(justExplicit.html, /View listing/);

  const soldExplicit = renderSoldAlertEmail({
    name: "Pat",
    addressLine: "22 Queen St",
    city: "Toronto",
    mlsNumber: "H1",
    statusLabel: "Sold",
    priceLabel: "$700,000",
    areaName: "The Beach",
    listingUrl: "https://example.com/H1",
    publishedAreaWatchTemplate: explicit,
  });
  assert.equal(soldExplicit.subject, "Area ping · The Beach");
  assert.match(soldExplicit.html, /Hello Pat in The Beach/);
  assert.match(soldExplicit.html, /View details/);
}

function testHtmlEscapingAndProtectedElements() {
  const published = {
    subject: "Area for {{recipientName}} · {{areaName}}",
    introText: 'Hello {{recipientName}} & team in {{areaName}}',
    bodySections: { paragraphs: ["MLS {{mlsNumber}}"] },
    ctaText: "Open {{addressLine}}",
    style: { primaryColor: "#123456" },
  };

  const filled = fillPublishedAreaWatchTemplate(published, {
    recipientName: 'Sam <script> & "Co"',
    areaName: "A&B Neighbourhood",
    addressLine: "1 A&B St",
    city: "Toronto",
    mlsNumber: "X&1",
  });
  assert.match(filled.subject, /Sam <script>/);

  const mail = renderJustListedEmail({
    name: 'Sam <script> & "Co"',
    areaName: "A&B Neighbourhood",
    addressLine: "1 A&B St",
    city: "Toronto",
    mlsNumber: "X&1",
    price: 480_000,
    listingUrl: "https://example.com/listing/X1",
    preferencesManageUrl: "https://example.com/prefs",
    unsubscribeIntentUrl: "https://example.com/unsub",
    brandLabel: "Acme",
    agentSignatureHtml: "<strong>Jordan</strong>",
    agentSignatureText: "Jordan",
    publishedAreaWatchTemplate: published,
  });

  assert.match(mail.html, /Sam &lt;script&gt;/);
  assert.match(mail.html, /&amp;/);
  assert.doesNotMatch(mail.html, /<script>alert/i);
  assert.match(mail.html, /New listing/);
  assert.match(mail.html, /Manage email preferences|Unsubscribe/i);
  assert.match(mail.html, /Jordan/);
  assert.match(mail.html, /#123456/);
  assert.equal(mail.kind, "just_listed");
}

async function testPropertyWatchUnaffected() {
  const store = memoryWorkspaceEmailTemplateStore();
  await publishArea(store, HOUZZAT_WS, {
    subject: "AREA ONLY {{areaName}}",
    introText: "Area-only intro",
    ctaText: "Area-only CTA",
  });
  await saveWorkspaceEmailTemplateDraft({
    workspaceId: HOUZZAT_WS,
    role: "OWNER",
    actorUserId: "actor_h",
    templateType: "PROPERTY_WATCH",
    draft: {
      subject: "PROPERTY ONLY {{addressLine}}",
      introText: "Property-only intro",
      ctaText: "Property-only CTA",
    },
    store,
  });
  await publishWorkspaceEmailTemplate({
    workspaceId: HOUZZAT_WS,
    role: "OWNER",
    actorUserId: "actor_h",
    templateType: "PROPERTY_WATCH",
    store,
  });

  const area = await loadPublishedAreaWatchOverride({
    workspaceId: HOUZZAT_WS,
    store,
    env: ENV_ON,
  });
  const property = await loadPublishedPropertyWatchOverride({
    workspaceId: HOUZZAT_WS,
    store,
    env: ENV_ON,
  });
  assert.match(area?.subject ?? "", /AREA ONLY/);
  assert.match(property?.subject ?? "", /PROPERTY ONLY/);
  assert.doesNotMatch(area?.subject ?? "", /PROPERTY ONLY/);
  assert.doesNotMatch(property?.subject ?? "", /AREA ONLY/);

  const propertyOnlySold = renderSoldAlertEmail({
    name: "Alex",
    addressLine: "10 King St",
    city: "Toronto",
    mlsNumber: "X123",
    statusLabel: "Sold",
    priceLabel: "$850,000",
    listingUrl: "https://example.com/listing/X123",
    publishedTemplate: property,
    publishedAreaWatchTemplate: null,
  });
  assert.match(propertyOnlySold.subject, /PROPERTY ONLY/);
  assert.doesNotMatch(propertyOnlySold.subject, /AREA ONLY/);

  // Both provided → fail closed to legacy (never mix categories).
  const mixed = renderSoldAlertEmail({
    name: "Alex",
    addressLine: "10 King St",
    city: "Toronto",
    mlsNumber: "X123",
    statusLabel: "Sold",
    priceLabel: "$850,000",
    listingUrl: "https://example.com/listing/X123",
    publishedTemplate: property,
    publishedAreaWatchTemplate: area,
  });
  assert.equal(mixed.subject, "Sold · 10 King St");
  assert.doesNotMatch(mixed.subject, /PROPERTY ONLY|AREA ONLY/);

  const price = renderPriceReductionEmail({
    name: "Alex",
    addressLine: "10 King St",
    city: "Toronto",
    mlsNumber: "X123",
    oldPrice: 900_000,
    newPrice: 850_000,
    listingUrl: "https://example.com/listing/X123",
    publishedTemplate: property,
  });
  assert.match(price.subject, /PROPERTY ONLY/);
  assert.doesNotMatch(price.html, /AREA ONLY|Area-only/);

  const monitors = read("src/lib/account/monitors.ts");
  assert.match(
    monitors,
    /Category isolation: property vs area published templates never cross/,
  );
}

function testLegacyPreservedAndNoDuplicateSends() {
  const just = renderJustListedEmail({
    name: "Alex",
    areaName: "Riverdale",
    addressLine: "10 King St",
    city: "Toronto",
    mlsNumber: "X123",
    price: 850_000,
    listingUrl: "https://example.com/listing/X123",
    preferencesManageUrl: "https://example.com/prefs",
    unsubscribeIntentUrl: "https://example.com/unsub",
    publishedAreaWatchTemplate: null,
  });
  assert.equal(just.subject, "Just listed in Riverdale");
  assert.match(just.html, /A new home matched your area alert for/);
  assert.match(just.html, /View listing/);
  assert.match(just.text, /New listing in Riverdale:/);

  const monitors = read("src/lib/account/monitors.ts");
  const sendCount = (monitors.match(/sendAndLogClientEmail\(/g) ?? []).length;
  assert.equal(sendCount, 2);
  assert.match(monitors, /loadPublishedAreaWatchOverride/);
  assert.match(monitors, /loadPublishedPropertyWatchOverride/);
  assert.match(monitors, /publishedAreaWatchTemplate: publishedAreaWatch/);
  assert.match(monitors, /watchCategory === "area_watch"/);
  assert.match(
    read("src/lib/email/workspace-templates/area-watch.ts"),
    /TENANT_EMAIL_TEMPLATES|isTenantEmailTemplatesEnabled/,
  );
}

async function main() {
  testFeatureFlagDefaultOff();
  await testIsolationPublishedOverride();
  await testDraftIgnored();
  await testMissingAndInvalidFallback();
  await testFeatureFlagOff();
  await testEventSpecificFallbackPartialPublish();
  testHtmlEscapingAndProtectedElements();
  await testPropertyWatchUnaffected();
  testLegacyPreservedAndNoDuplicateSends();
  console.log("area-watch-email-templates-selftest: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
