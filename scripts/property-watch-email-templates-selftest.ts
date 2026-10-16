/**
 * Phase 2C-1 — PROPERTY_WATCH published template integration.
 * Run: pnpm property-watch-email-templates:selftest
 *
 * No real sends. No prod env changes. Memory store + renderer assertions.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderPriceReductionEmail,
  renderPropertyUpdateEmail,
  renderSoldAlertEmail,
} from "../src/lib/email/templates";
import { isTenantEmailTemplatesEnabled } from "../src/lib/email/workspace-templates/feature-flag";
import {
  fillPublishedPropertyWatchTemplate,
  loadPublishedPropertyWatchOverride,
} from "../src/lib/email/workspace-templates/property-watch";
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

function baselinePriceReduction() {
  return renderPriceReductionEmail({
    name: "Alex",
    addressLine: "10 King St",
    city: "Toronto",
    mlsNumber: "X123",
    oldPrice: 900_000,
    newPrice: 850_000,
    listingUrl: "https://example.com/listing/X123",
    preferencesManageUrl: "https://example.com/prefs",
    unsubscribeIntentUrl: "https://example.com/unsub",
    brandLabel: "Houzzat",
    brandPrimaryColor: "#0F6B4C",
    agentSignatureHtml: "<strong>Agent A</strong>",
    agentSignatureText: "Agent A",
  });
}

async function publishFor(
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
    templateType: "PROPERTY_WATCH",
    draft,
    store,
  });
  assert.equal(saved.ok, true);
  const published = await publishWorkspaceEmailTemplate({
    workspaceId,
    role: "OWNER",
    actorUserId: `actor_${workspaceId}`,
    templateType: "PROPERTY_WATCH",
    store,
  });
  assert.equal(published.ok, true);
}

function testFeatureFlagDefaultOff() {
  assert.equal(isTenantEmailTemplatesEnabled({}), false);
  assert.equal(isTenantEmailTemplatesEnabled({ TENANT_EMAIL_TEMPLATES: "" }), false);
  assert.equal(
    isTenantEmailTemplatesEnabled({ TENANT_EMAIL_TEMPLATES: "off" }),
    false,
  );
  assert.equal(
    isTenantEmailTemplatesEnabled({ TENANT_EMAIL_TEMPLATES: "on" }),
    true,
  );
}

async function testIsolationPublishedOverride() {
  const store = memoryWorkspaceEmailTemplateStore();
  await publishFor(store, HOUZZAT_WS, {
    subject: "Houzzat watch · {{addressLine}}",
    introText: "Houzzat intro for {{recipientName}}",
    ctaText: "Open Houzzat listing",
    bodySections: { paragraphs: [`Only for Houzzat · ${HOUZZAT_WS}`] },
    style: { primaryColor: "#0F6B4C" },
  });
  await publishFor(store, CANARY_WS, {
    subject: `${TENANT_B_TEST_DISPLAY_NAME} watch · {{addressLine}}`,
    introText: "Canary intro for {{recipientName}}",
    ctaText: "Open Canary listing",
    bodySections: { paragraphs: [`Only for Canary · ${CANARY_WS}`] },
    style: { primaryColor: "#7C3AED" },
  });

  const houzzat = await loadPublishedPropertyWatchOverride({
    workspaceId: HOUZZAT_WS,
    store,
    env: ENV_ON,
  });
  const canary = await loadPublishedPropertyWatchOverride({
    workspaceId: CANARY_WS,
    store,
    env: ENV_ON,
  });
  assert.ok(houzzat);
  assert.ok(canary);
  assert.match(houzzat!.subject ?? "", /Houzzat watch/);
  assert.match(canary!.subject ?? "", new RegExp(TENANT_B_TEST_DISPLAY_NAME));
  assert.doesNotMatch(houzzat!.subject ?? "", new RegExp(TENANT_B_TEST_DISPLAY_NAME));
  assert.doesNotMatch(canary!.subject ?? "", /Houzzat watch/);
  assert.match(
    (houzzat!.bodySections.paragraphs ?? []).join(" "),
    new RegExp(HOUZZAT_WS),
  );
  assert.match(
    (canary!.bodySections.paragraphs ?? []).join(" "),
    new RegExp(CANARY_WS),
  );
  assert.doesNotMatch(
    (houzzat!.bodySections.paragraphs ?? []).join(" "),
    new RegExp(CANARY_WS),
  );

  const houzzatMail = renderPriceReductionEmail({
    name: "Pat",
    addressLine: "22 Queen St",
    city: "Toronto",
    mlsNumber: "H1",
    oldPrice: 800_000,
    newPrice: 775_000,
    listingUrl: "https://example.com/H1",
    brandLabel: "Houzzat",
    publishedTemplate: houzzat,
  });
  const canaryMail = renderPriceReductionEmail({
    name: "Sam",
    addressLine: "88 Bay St",
    city: "Toronto",
    mlsNumber: "C1",
    oldPrice: 800_000,
    newPrice: 775_000,
    listingUrl: "https://example.com/C1",
    brandLabel: TENANT_B_TEST_DISPLAY_NAME,
    publishedTemplate: canary,
  });

  assert.match(houzzatMail.subject, /Houzzat watch · 22 Queen St/);
  assert.match(houzzatMail.html, /Houzzat intro for Pat/);
  assert.match(houzzatMail.html, /Open Houzzat listing/);
  assert.match(houzzatMail.html, /Only for Houzzat/);
  assert.doesNotMatch(houzzatMail.html, /Only for Canary/);
  assert.doesNotMatch(houzzatMail.html, /Open Canary listing/);

  assert.match(canaryMail.subject, new RegExp(`${TENANT_B_TEST_DISPLAY_NAME} watch`));
  assert.match(canaryMail.html, /Canary intro for Sam/);
  assert.match(canaryMail.html, /Open Canary listing/);
  assert.match(canaryMail.html, /Only for Canary/);
  assert.doesNotMatch(canaryMail.html, /Only for Houzzat/);
}

async function testDraftIgnored() {
  const store = memoryWorkspaceEmailTemplateStore();
  const draft = await saveWorkspaceEmailTemplateDraft({
    workspaceId: HOUZZAT_WS,
    role: "OWNER",
    actorUserId: "actor_h",
    templateType: "PROPERTY_WATCH",
    draft: {
      subject: "DRAFT ONLY SUBJECT {{addressLine}}",
      introText: "Draft intro must never send",
      ctaText: "Draft CTA",
    },
    store,
  });
  assert.equal(draft.ok, true);

  const loaded = await loadPublishedPropertyWatchOverride({
    workspaceId: HOUZZAT_WS,
    store,
    env: ENV_ON,
  });
  assert.equal(loaded, null);

  const mail = renderPriceReductionEmail({
    name: "Alex",
    addressLine: "10 King St",
    city: "Toronto",
    mlsNumber: "X123",
    oldPrice: 900_000,
    newPrice: 850_000,
    listingUrl: "https://example.com/listing/X123",
    publishedTemplate: loaded,
  });
  const baseline = baselinePriceReduction();
  assert.equal(mail.subject, baseline.subject);
  assert.doesNotMatch(mail.html, /DRAFT ONLY/);
  assert.doesNotMatch(mail.html, /Draft intro/);
  assert.doesNotMatch(mail.text, /Draft CTA/);
}

async function testMissingOverrideFallback() {
  const store = memoryWorkspaceEmailTemplateStore();
  const loaded = await loadPublishedPropertyWatchOverride({
    workspaceId: "ws_empty",
    store,
    env: ENV_ON,
  });
  assert.equal(loaded, null);
  const mail = renderPriceReductionEmail({
    name: "Alex",
    addressLine: "10 King St",
    city: "Toronto",
    mlsNumber: "X123",
    oldPrice: 900_000,
    newPrice: 850_000,
    listingUrl: "https://example.com/listing/X123",
    publishedTemplate: loaded,
  });
  const baseline = baselinePriceReduction();
  assert.equal(mail.subject, baseline.subject);
  assert.equal(mail.kind, "price_reduction");
  assert.match(mail.html, /Price drop/);
  assert.match(mail.html, /View listing/);
}

async function testInvalidOverrideFallback() {
  const store = memoryWorkspaceEmailTemplateStore();
  await publishFor(store, HOUZZAT_WS, {
    subject: "Valid subject",
    introText: "Valid intro",
    ctaText: "Valid CTA",
  });
  const row = await store.findTemplate(HOUZZAT_WS, "PROPERTY_WATCH");
  assert.ok(row?.published);
  if (row?.published) {
    // Corrupt after publish — unknown variables fail closed to system.
    row.published.subject = "Steal {{ssn}} at {{addressLine}}";
  }

  const loaded = await loadPublishedPropertyWatchOverride({
    workspaceId: HOUZZAT_WS,
    store,
    env: ENV_ON,
  });
  assert.equal(loaded, null);

  const mail = renderPriceReductionEmail({
    name: "Alex",
    addressLine: "10 King St",
    city: "Toronto",
    mlsNumber: "X123",
    oldPrice: 900_000,
    newPrice: 850_000,
    listingUrl: "https://example.com/listing/X123",
    publishedTemplate: loaded,
  });
  assert.equal(mail.subject, baselinePriceReduction().subject);
  assert.doesNotMatch(mail.subject, /ssn|Steal/);
  assert.doesNotMatch(mail.html, /Steal/);
}

async function testFeatureFlagOffIgnoresPublished() {
  const store = memoryWorkspaceEmailTemplateStore();
  await publishFor(store, HOUZZAT_WS, {
    subject: "Flagged off subject {{addressLine}}",
    introText: "Should not appear",
    ctaText: "No send CTA",
  });
  const loaded = await loadPublishedPropertyWatchOverride({
    workspaceId: HOUZZAT_WS,
    store,
    env: ENV_OFF,
  });
  assert.equal(loaded, null);
  const mail = renderPriceReductionEmail({
    name: "Alex",
    addressLine: "10 King St",
    city: "Toronto",
    mlsNumber: "X123",
    oldPrice: 900_000,
    newPrice: 850_000,
    listingUrl: "https://example.com/listing/X123",
    publishedTemplate: loaded,
  });
  assert.equal(mail.subject, "Price reduced · 10 King St");
  assert.doesNotMatch(mail.html, /Flagged off subject/);
  assert.doesNotMatch(mail.html, /Should not appear/);
}

function testHtmlEscapingAndProtectedElements() {
  const published = {
    subject: "Alert for {{recipientName}} at {{addressLine}}",
    introText: 'Hello {{recipientName}} & team — see "notes"',
    bodySections: {
      paragraphs: ["City {{city}} · MLS {{mlsNumber}}"],
    },
    ctaText: "View {{addressLine}}",
    style: { primaryColor: "#123456" },
  };

  const filled = fillPublishedPropertyWatchTemplate(published, {
    recipientName: 'Sam <script> & "Co"',
    addressLine: "1 A&B St",
    city: "Toronto",
    mlsNumber: "X&1",
    tenantName: "Acme",
    agentName: "Jordan",
  });
  assert.match(filled.subject, /Sam <script>/);
  assert.match(filled.introText, /&/);

  const mail = renderPriceReductionEmail({
    name: 'Sam <script> & "Co"',
    addressLine: "1 A&B St",
    city: "Toronto",
    mlsNumber: "X&1",
    oldPrice: 500_000,
    newPrice: 480_000,
    listingUrl: "https://example.com/listing/X1",
    preferencesManageUrl: "https://example.com/prefs",
    unsubscribeIntentUrl: "https://example.com/unsub",
    brandLabel: "Acme",
    agentSignatureHtml: "<strong>Jordan</strong>",
    agentSignatureText: "Jordan",
    publishedTemplate: published,
  });

  assert.match(mail.html, /Sam &lt;script&gt;/);
  assert.match(mail.html, /&amp;/);
  assert.doesNotMatch(mail.html, /<script>alert/i);
  // Protected listing card + legal/unsub chrome remain.
  assert.match(mail.html, /1 A&amp;B St|1 A&B St/);
  assert.match(mail.html, /Price drop/);
  assert.match(mail.html, /Manage email preferences|Unsubscribe/i);
  assert.match(mail.html, /Jordan/);
  assert.match(mail.html, /#123456/);
  assert.equal(mail.kind, "price_reduction");
}

function testExistingBehaviorPreservedWithoutOverride() {
  const a = baselinePriceReduction();
  const b = renderPriceReductionEmail({
    name: "Alex",
    addressLine: "10 King St",
    city: "Toronto",
    mlsNumber: "X123",
    oldPrice: 900_000,
    newPrice: 850_000,
    listingUrl: "https://example.com/listing/X123",
    preferencesManageUrl: "https://example.com/prefs",
    unsubscribeIntentUrl: "https://example.com/unsub",
    brandLabel: "Houzzat",
    brandPrimaryColor: "#0F6B4C",
    agentSignatureHtml: "<strong>Agent A</strong>",
    agentSignatureText: "Agent A",
    publishedTemplate: null,
  });
  assert.equal(a.subject, b.subject);
  assert.equal(a.kind, b.kind);
  assert.match(b.html, /A property on your watch list just reduced its price/);
  assert.match(b.html, /View listing/);
  assert.match(b.text, /A home you’re watching dropped in price/);

  const sold = renderSoldAlertEmail({
    name: "Alex",
    addressLine: "10 King St",
    city: "Toronto",
    mlsNumber: "X123",
    statusLabel: "Sold",
    priceLabel: "$850,000",
    listingUrl: "https://example.com/listing/X123",
    publishedTemplate: null,
  });
  assert.equal(sold.subject, "Sold · 10 King St");
  assert.match(sold.html, /A property you’re watching changed status/);
  assert.match(sold.html, /View details/);

  const update = renderPropertyUpdateEmail({
    name: "Alex",
    title: "Beds updated on 10 King St",
    addressLine: "10 King St",
    city: "Toronto",
    mlsNumber: "X123",
    changes: ["Beds: 3 → 4"],
    listingUrl: "https://example.com/listing/X123",
    publishedTemplate: null,
  });
  assert.equal(update.subject, "Beds updated on 10 King St");
  assert.match(update.html, /There’s an update on a home you’re watching/);
  assert.match(update.html, /View listing/);
}

/**
 * Partial published customization: only explicit fields override.
 * Empty/null published fields keep per-event legacy wording — never registry defaults.
 */
async function testEventSpecificFallbackForPartialPublish() {
  const store = memoryWorkspaceEmailTemplateStore();
  // Publish CTA + body only — subject/intro intentionally omitted.
  await publishFor(store, HOUZZAT_WS, {
    ctaText: "See this home",
    bodySections: { paragraphs: ["Custom note for {{addressLine}}"] },
  });
  const partial = await loadPublishedPropertyWatchOverride({
    workspaceId: HOUZZAT_WS,
    store,
    env: ENV_ON,
  });
  assert.ok(partial);
  assert.equal(partial!.subject, null);
  assert.equal(partial!.introText, null);
  assert.equal(partial!.ctaText, "See this home");
  // Must not silently carry registry default subject.
  assert.doesNotMatch(partial!.subject ?? "", /Update on a home/i);

  const price = renderPriceReductionEmail({
    name: "Alex",
    addressLine: "10 King St",
    city: "Toronto",
    mlsNumber: "X123",
    oldPrice: 900_000,
    newPrice: 850_000,
    listingUrl: "https://example.com/listing/X123",
    publishedTemplate: partial,
  });
  assert.equal(price.subject, "Price reduced · 10 King St");
  assert.match(
    price.html,
    /A property on your watch list just reduced its price/,
  );
  assert.match(price.text, /A home you’re watching dropped in price/);
  assert.match(price.html, /See this home/);
  assert.match(price.html, /Custom note for 10 King St/);
  assert.doesNotMatch(price.subject, /Update on a home you’re watching/);
  assert.match(price.html, /Price drop/);

  const sold = renderSoldAlertEmail({
    name: "Alex",
    addressLine: "10 King St",
    city: "Toronto",
    mlsNumber: "X123",
    statusLabel: "Sold",
    priceLabel: "$850,000",
    listingUrl: "https://example.com/listing/X123",
    publishedTemplate: partial,
  });
  assert.equal(sold.subject, "Sold · 10 King St");
  assert.match(sold.html, /A property you’re watching changed status/);
  assert.match(sold.text, /A watched home is now sold/);
  assert.match(sold.html, /See this home/);
  assert.match(sold.html, /Custom note for 10 King St/);
  assert.doesNotMatch(sold.subject, /Update on a home/);

  const update = renderPropertyUpdateEmail({
    name: "Alex",
    title: "Beds updated on 10 King St",
    addressLine: "10 King St",
    city: "Toronto",
    mlsNumber: "X123",
    changes: ["Beds: 3 → 4"],
    listingUrl: "https://example.com/listing/X123",
    publishedTemplate: partial,
  });
  assert.equal(update.subject, "Beds updated on 10 King St");
  assert.match(update.html, /There’s an update on a home you’re watching/);
  assert.match(update.html, /See this home/);
  assert.match(update.html, /Custom note for 10 King St/);
  assert.doesNotMatch(update.subject, /Update on a home you’re watching$/);

  // Explicit subject customization still wins for every event type.
  const explicit: EmailTemplateContentFields = {
    subject: "Team alert · {{addressLine}}",
    introText: "Custom intro for {{recipientName}}",
    bodySections: {},
    ctaText: null,
    style: {},
  };
  const priceExplicit = renderPriceReductionEmail({
    name: "Pat",
    addressLine: "22 Queen St",
    city: "Toronto",
    mlsNumber: "H1",
    oldPrice: 800_000,
    newPrice: 775_000,
    listingUrl: "https://example.com/H1",
    publishedTemplate: explicit,
  });
  assert.equal(priceExplicit.subject, "Team alert · 22 Queen St");
  assert.match(priceExplicit.html, /Custom intro for Pat/);
  assert.match(priceExplicit.html, /View listing/); // CTA falls back

  const soldExplicit = renderSoldAlertEmail({
    name: "Pat",
    addressLine: "22 Queen St",
    city: "Toronto",
    mlsNumber: "H1",
    statusLabel: "Sold",
    priceLabel: "$775,000",
    listingUrl: "https://example.com/H1",
    publishedTemplate: explicit,
  });
  assert.equal(soldExplicit.subject, "Team alert · 22 Queen St");
  assert.match(soldExplicit.html, /Custom intro for Pat/);
  assert.match(soldExplicit.html, /View details/);

  const updateExplicit = renderPropertyUpdateEmail({
    name: "Pat",
    title: "Status note",
    addressLine: "22 Queen St",
    city: "Toronto",
    mlsNumber: "H1",
    changes: ["Status changed"],
    listingUrl: "https://example.com/H1",
    publishedTemplate: explicit,
  });
  assert.equal(updateExplicit.subject, "Team alert · 22 Queen St");
  assert.match(updateExplicit.html, /Custom intro for Pat/);
  assert.match(updateExplicit.html, /View listing/);
}

async function testFlagOffSkipsStoreQueries() {
  let finds = 0;
  const store: WorkspaceEmailTemplateStore = {
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
  const loaded = await loadPublishedPropertyWatchOverride({
    workspaceId: HOUZZAT_WS,
    store,
    env: ENV_OFF,
  });
  assert.equal(loaded, null);
  assert.equal(finds, 0);
}

function testNoDuplicateSendsAndScopedIntegration() {
  const monitors = read("src/lib/account/monitors.ts");
  // Single send path after render (not duplicated for template apply).
  const sendCount = (monitors.match(/sendAndLogClientEmail\(/g) ?? []).length;
  assert.equal(sendCount, 2, "createAlert keeps one send per branch (fallback + main)");
  assert.match(monitors, /loadPublishedPropertyWatchOverride/);
  assert.match(monitors, /publishedTemplate: publishedPropertyWatch/);
  assert.match(
    monitors,
    /Area Watch sold alerts must not consume PROPERTY_WATCH/,
  );

  // just_listed renderer must not accept PROPERTY_WATCH publishedTemplate wiring in monitors.
  assert.doesNotMatch(
    monitors.slice(
      monitors.indexOf('if (t.type === "just_listed")'),
      monitors.indexOf("return renderPropertyUpdateEmail"),
    ),
    /publishedTemplate/,
  );
  assert.match(read("src/lib/email/templates.ts"), /publishedTemplate/);
  assert.match(
    read("src/lib/email/workspace-templates/feature-flag.ts"),
    /TENANT_EMAIL_TEMPLATES/,
  );
  assert.match(
    read("src/lib/email/workspace-templates/property-watch.ts"),
    /event-specific/,
  );
}

async function main() {
  testFeatureFlagDefaultOff();
  await testIsolationPublishedOverride();
  await testDraftIgnored();
  await testMissingOverrideFallback();
  await testInvalidOverrideFallback();
  await testFeatureFlagOffIgnoresPublished();
  testHtmlEscapingAndProtectedElements();
  testExistingBehaviorPreservedWithoutOverride();
  await testEventSpecificFallbackForPartialPublish();
  await testFlagOffSkipsStoreQueries();
  testNoDuplicateSendsAndScopedIntegration();
  console.log("property-watch-email-templates-selftest: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
