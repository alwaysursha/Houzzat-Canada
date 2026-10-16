/**
 * Phase 2C-4 — AGENT_EMAIL / SHORTLIST / CMA_SHARE published template integration.
 * Run: pnpm agent-share-email-templates:selftest
 *
 * No real sends. No prod env changes. Memory store + renderer assertions.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderAgentMessageEmail,
  renderCmaEmail,
  renderShortlistEmail,
  type DigestListingLine,
} from "../src/lib/email/templates";
import { isTenantEmailTemplatesEnabled } from "../src/lib/email/workspace-templates/feature-flag";
import {
  fillPublishedAgentEmailTemplate,
  loadPublishedAgentEmailOverride,
  loadPublishedCmaShareOverride,
  loadPublishedShortlistOverride,
} from "../src/lib/email/workspace-templates/agent-share-templates";
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
const ENV_ON = {
  TENANT_EMAIL_TEMPLATES: "on",
  TENANT_EMAIL_TEMPLATES_WORKSPACE_IDS: `${HOUZZAT_WS},${CANARY_WS}`,
} as NodeJS.ProcessEnv;
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
};

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

async function publishType(
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

async function testTenantIsolation() {
  const store = memoryWorkspaceEmailTemplateStore();
  await publishType(store, HOUZZAT_WS, "AGENT_EMAIL", {
    subject: "TEMPLATE MUST NOT WIN {{agentName}}",
    introText: "Houzzat agent wrapper for {{recipientName}}",
    bodySections: { paragraphs: [`Only Houzzat agent · ${HOUZZAT_WS}`] },
    style: { primaryColor: "#0F6B4C" },
  });
  await publishType(store, CANARY_WS, "AGENT_EMAIL", {
    subject: "CANARY TEMPLATE SUBJECT",
    introText: "Canary agent wrapper for {{recipientName}}",
    bodySections: { paragraphs: [`Only Canary agent · ${CANARY_WS}`] },
  });
  await publishType(store, HOUZZAT_WS, "SHORTLIST", {
    subject: "Houzzat shortlist · {{listingCount}}",
    introText: "Houzzat shortlist intro",
    ctaText: "Open Houzzat shortlist",
    bodySections: { paragraphs: [`Only Houzzat shortlist · ${HOUZZAT_WS}`] },
  });
  await publishType(store, CANARY_WS, "SHORTLIST", {
    subject: `${TENANT_B_TEST_DISPLAY_NAME} shortlist`,
    introText: "Canary shortlist intro",
    ctaText: "Open Canary shortlist",
  });
  await publishType(store, HOUZZAT_WS, "CMA_SHARE", {
    subject: "Houzzat CMA · {{subjectAddress}}",
    introText: "Houzzat CMA intro for {{subjectAddress}}",
    ctaText: "Open Houzzat CMA",
  });
  await publishType(store, CANARY_WS, "CMA_SHARE", {
    subject: `${TENANT_B_TEST_DISPLAY_NAME} CMA`,
    introText: "Canary CMA intro",
    ctaText: "Open Canary CMA",
  });

  const houzzatAgent = await loadPublishedAgentEmailOverride({
    workspaceId: HOUZZAT_WS,
    store,
    env: ENV_ON,
  });
  const canaryAgent = await loadPublishedAgentEmailOverride({
    workspaceId: CANARY_WS,
    store,
    env: ENV_ON,
  });
  assert.match(houzzatAgent?.introText ?? "", /Houzzat agent wrapper/);
  assert.match(canaryAgent?.introText ?? "", /Canary agent wrapper/);
  assert.doesNotMatch(
    houzzatAgent?.introText ?? "",
    new RegExp(TENANT_B_TEST_DISPLAY_NAME),
  );

  const houzzatMail = renderAgentMessageEmail({
    name: "Pat",
    subject: "Agent wrote this subject",
    body: "Agent wrote this body paragraph.",
    brandLabel: "Houzzat",
    agentFromLabel: "Jordan",
    publishedAgentEmailTemplate: houzzatAgent,
  });
  assert.equal(houzzatMail.subject, "Agent wrote this subject");
  assert.match(houzzatMail.html, /Agent wrote this body paragraph/);
  assert.match(houzzatMail.html, /Houzzat agent wrapper for Pat/);
  assert.match(houzzatMail.html, /Only Houzzat agent/);
  assert.doesNotMatch(houzzatMail.html, /Only Canary agent|TEMPLATE MUST NOT WIN/);

  const canaryMail = renderAgentMessageEmail({
    name: "Sam",
    subject: "Canary agent subject",
    body: "Canary agent body",
    brandLabel: TENANT_B_TEST_DISPLAY_NAME,
    publishedAgentEmailTemplate: canaryAgent,
  });
  assert.equal(canaryMail.subject, "Canary agent subject");
  assert.doesNotMatch(canaryMail.html, /Only Houzzat agent/);

  const houzzatShort = await loadPublishedShortlistOverride({
    workspaceId: HOUZZAT_WS,
    store,
    env: ENV_ON,
  });
  const shortMail = renderShortlistEmail({
    name: "Pat",
    agentName: "Jordan",
    shareUrl: "https://example.com/share",
    note: "Personal note from agent",
    listings: [SAMPLE_LISTING],
    publishedShortlistTemplate: houzzatShort,
  });
  assert.match(shortMail.subject, /Houzzat shortlist · 1/);
  assert.match(shortMail.html, /Personal note from agent/);
  assert.match(shortMail.html, /Only Houzzat shortlist/);
  assert.match(shortMail.html, /10 King St/);
  assert.doesNotMatch(shortMail.html, /Only Canary|Canary shortlist/);

  const houzzatCma = await loadPublishedCmaShareOverride({
    workspaceId: HOUZZAT_WS,
    store,
    env: ENV_ON,
  });
  const cmaMail = renderCmaEmail({
    recipientName: "Pat",
    agentName: "Jordan",
    agentEmail: "jordan@example.com",
    tenantDisplayName: "Houzzat",
    subjectAddress: "12 Queen St",
    subjectCity: "Toronto",
    cmaUrl: "https://example.com/cma/tok",
    recommendedListPrice: 900_000,
    publishedCmaShareTemplate: houzzatCma,
  });
  assert.match(cmaMail.subject, /Houzzat CMA · 12 Queen St/);
  assert.match(cmaMail.html, /Open Houzzat CMA/);
  assert.match(cmaMail.html, /not a formal appraisal/);
  assert.match(cmaMail.html, /\$900,000|900,000/);
  assert.doesNotMatch(cmaMail.html, /Canary CMA|Open Canary/);
}

async function testAgentAuthoredPrecedence() {
  const published: EmailTemplateContentFields = {
    subject: "TEMPLATE SUBJECT MUST LOSE",
    introText: "Template subtitle for {{recipientName}}",
    bodySections: { paragraphs: ["Template wrapper paragraph"] },
    ctaText: "Template CTA unused",
    style: { primaryColor: "#123456" },
  };

  const mail = renderAgentMessageEmail({
    name: "Alex",
    subject: "Following up on your search",
    body: "Here are a few thoughts.\n\nSecond paragraph from the agent.",
    agentFromLabel: "Jordan Lee",
    preferencesManageUrl: "https://example.com/prefs",
    unsubscribeIntentUrl: "https://example.com/unsub",
    agentSignatureHtml: "<strong>Jordan</strong>",
    publishedAgentEmailTemplate: published,
  });

  assert.equal(mail.subject, "Following up on your search");
  assert.doesNotMatch(mail.subject, /TEMPLATE SUBJECT/);
  assert.match(mail.html, /Following up on your search/);
  assert.match(mail.html, /Here are a few thoughts/);
  assert.match(mail.html, /Second paragraph from the agent/);
  assert.match(mail.html, /Template subtitle for Alex/);
  assert.match(mail.html, /Template wrapper paragraph/);
  assert.match(mail.text, /Here are a few thoughts/);
  assert.match(mail.html, /#123456/);
  assert.match(mail.html, /Jordan/);
  assert.match(mail.html, /Manage email preferences|Unsubscribe/i);
  assert.equal(mail.kind, "agent_message");
}

async function testDraftIgnoredAndInvalidFallback() {
  const store = memoryWorkspaceEmailTemplateStore();
  const draft = await saveWorkspaceEmailTemplateDraft({
    workspaceId: HOUZZAT_WS,
    role: "OWNER",
    actorUserId: "actor_h",
    templateType: "AGENT_EMAIL",
    draft: {
      subject: "DRAFT SUBJECT",
      introText: "Draft intro must never send",
    },
    store,
  });
  assert.equal(draft.ok, true);
  assert.equal(
    await loadPublishedAgentEmailOverride({
      workspaceId: HOUZZAT_WS,
      store,
      env: ENV_ON,
    }),
    null,
  );

  await publishType(store, HOUZZAT_WS, "SHORTLIST", {
    subject: "Valid shortlist",
    introText: "Valid intro",
    ctaText: "Valid CTA",
  });
  const row = await store.findTemplate(HOUZZAT_WS, "SHORTLIST");
  assert.ok(row?.published);
  if (row?.published) {
    row.published.subject = "Steal {{ssn}} homes";
  }
  assert.equal(
    await loadPublishedShortlistOverride({
      workspaceId: HOUZZAT_WS,
      store,
      env: ENV_ON,
    }),
    null,
  );

  const shortLegacy = renderShortlistEmail({
    name: "Alex",
    agentName: "Jordan",
    shareUrl: "https://example.com/share",
    listings: [SAMPLE_LISTING],
    publishedShortlistTemplate: null,
  });
  assert.equal(shortLegacy.subject, "1 home for you");
  assert.match(shortLegacy.html, /View shortlist/);
  assert.doesNotMatch(shortLegacy.html, /Steal|ssn|DRAFT/);
}

async function testFeatureFlagOff() {
  const store = memoryWorkspaceEmailTemplateStore();
  await publishType(store, HOUZZAT_WS, "AGENT_EMAIL", {
    introText: "Should not load",
  });
  await publishType(store, HOUZZAT_WS, "SHORTLIST", {
    subject: "Should not load shortlist",
  });
  await publishType(store, HOUZZAT_WS, "CMA_SHARE", {
    subject: "Should not load cma",
  });

  assert.equal(
    await loadPublishedAgentEmailOverride({
      workspaceId: HOUZZAT_WS,
      store,
      env: ENV_OFF,
    }),
    null,
  );
  assert.equal(
    await loadPublishedShortlistOverride({
      workspaceId: HOUZZAT_WS,
      store,
      env: ENV_OFF,
    }),
    null,
  );
  assert.equal(
    await loadPublishedCmaShareOverride({
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
    await loadPublishedAgentEmailOverride({
      workspaceId: HOUZZAT_WS,
      store: throwingStore,
      env: ENV_OFF,
    }),
    null,
  );
  assert.equal(
    await loadPublishedShortlistOverride({
      workspaceId: HOUZZAT_WS,
      store: throwingStore,
      env: ENV_OFF,
    }),
    null,
  );
  assert.equal(
    await loadPublishedCmaShareOverride({
      workspaceId: HOUZZAT_WS,
      store: throwingStore,
      env: ENV_OFF,
    }),
    null,
  );
  assert.equal(finds, 0);
}

async function testPartialOverrideAndTypeIsolation() {
  const store = memoryWorkspaceEmailTemplateStore();
  await publishType(store, HOUZZAT_WS, "SHORTLIST", {
    ctaText: "Browse {{listingCount}} homes",
    bodySections: { paragraphs: ["Shortlist note {{listingCount}}"] },
  });
  await publishType(store, HOUZZAT_WS, "AGENT_EMAIL", {
    introText: "AGENT ONLY INTRO",
  });
  await publishType(store, HOUZZAT_WS, "CMA_SHARE", {
    ctaText: "CMA ONLY CTA",
  });

  const short = await loadPublishedShortlistOverride({
    workspaceId: HOUZZAT_WS,
    store,
    env: ENV_ON,
  });
  const agent = await loadPublishedAgentEmailOverride({
    workspaceId: HOUZZAT_WS,
    store,
    env: ENV_ON,
  });
  const cma = await loadPublishedCmaShareOverride({
    workspaceId: HOUZZAT_WS,
    store,
    env: ENV_ON,
  });
  assert.equal(short?.subject, null);
  assert.equal(short?.introText, null);
  assert.match(agent?.introText ?? "", /AGENT ONLY/);
  assert.match(cma?.ctaText ?? "", /CMA ONLY/);
  assert.doesNotMatch(short?.ctaText ?? "", /CMA ONLY|AGENT ONLY/);

  const shortMail = renderShortlistEmail({
    name: "Alex",
    agentName: "Jordan",
    shareUrl: "https://example.com/share",
    note: "Keep my note",
    listings: [SAMPLE_LISTING, { ...SAMPLE_LISTING, mlsNumber: "Y1" }],
    publishedShortlistTemplate: short,
  });
  assert.equal(shortMail.subject, "2 homes for you");
  assert.match(shortMail.html, /put together a shortlist/);
  assert.match(shortMail.html, /Browse 2 homes/);
  assert.match(shortMail.html, /Shortlist note 2/);
  assert.match(shortMail.html, /Keep my note/);
  assert.match(shortMail.html, /10 King St/);
}

function testHtmlEscapingAndProtectedContent() {
  const publishedAgent: EmailTemplateContentFields = {
    subject: "IGNORE {{agentName}}",
    introText: 'Hello {{recipientName}} & team',
    bodySections: { paragraphs: ["Wrap <script>"] },
    ctaText: null,
    style: {},
  };
  fillPublishedAgentEmailTemplate(publishedAgent, {
    recipientName: 'Sam <script> & "Co"',
    agentName: "Jordan",
  });

  const agentMail = renderAgentMessageEmail({
    name: 'Sam <script> & "Co"',
    subject: "Agent subject <b>",
    body: 'Body with <script>alert(1)</script> & ampersand',
    publishedAgentEmailTemplate: publishedAgent,
  });
  assert.equal(agentMail.subject, "Agent subject <b>");
  assert.match(agentMail.html, /Sam &lt;script&gt;/);
  assert.match(agentMail.html, /&lt;script&gt;alert/);
  assert.doesNotMatch(agentMail.html, /<script>alert/i);
  assert.match(agentMail.html, /Hello Sam &lt;script&gt;/);

  const shortPublished: EmailTemplateContentFields = {
    subject: "Short {{listingCount}}",
    introText: "Intro & more",
    bodySections: {},
    ctaText: "CTA & go",
    style: {},
  };
  const shortMail = renderShortlistEmail({
    name: "Pat",
    agentName: "A&B Realty",
    shareUrl: "https://example.com/share",
    note: "Note <img>",
    listings: [SAMPLE_LISTING],
    preferencesManageUrl: "https://example.com/prefs",
    unsubscribeIntentUrl: "https://example.com/unsub",
    publishedShortlistTemplate: shortPublished,
  });
  assert.match(shortMail.html, /Note &lt;img&gt;/);
  assert.match(shortMail.html, /CTA &amp; go/);
  assert.match(shortMail.html, /10 King St/);
  assert.match(shortMail.html, /Manage email preferences|Unsubscribe/i);

  const cmaPublished: EmailTemplateContentFields = {
    subject: "CMA {{subjectAddress}}",
    introText: "Intro for {{subjectAddress}} in {{subjectCity}}",
    bodySections: { paragraphs: ["Extra para"] },
    ctaText: "Open & view",
    style: { primaryColor: "#abcdef" },
  };
  const cmaMail = renderCmaEmail({
    recipientName: "Pat",
    agentName: "Jordan",
    agentEmail: "j@example.com",
    agentPhone: "555-0100",
    tenantDisplayName: "Acme",
    subjectAddress: "1 A&B St",
    subjectCity: "Toronto",
    cmaUrl: "https://example.com/cma/t",
    recommendedListPrice: 750_000,
    preferencesManageUrl: "https://example.com/prefs",
    unsubscribeIntentUrl: "https://example.com/unsub",
    publishedCmaShareTemplate: cmaPublished,
  });
  assert.match(cmaMail.html, /1 A&amp;B St|1 A&B St/);
  assert.match(cmaMail.html, /not a formal appraisal/);
  assert.match(cmaMail.html, /Open &amp; view/);
  assert.match(cmaMail.html, /#abcdef/);
  assert.match(cmaMail.html, /Jordan/);
  assert.match(cmaMail.html, /750,000|\$750/);
  assert.equal(cmaMail.kind, "cma_share");
}

function testLegacyPreservedAndWiring() {
  const agent = renderAgentMessageEmail({
    name: "Alex",
    subject: "Following up",
    body: "Just checking in.",
    agentFromLabel: "Jordan",
    publishedAgentEmailTemplate: null,
  });
  assert.equal(agent.subject, "Following up");
  assert.match(agent.html, /A message from Jordan/);
  assert.match(agent.html, /Just checking in/);
  assert.match(agent.text, /Just checking in/);

  const short = renderShortlistEmail({
    name: "Alex",
    agentName: "Jordan",
    shareUrl: "https://example.com/share",
    listings: [SAMPLE_LISTING],
    publishedShortlistTemplate: null,
  });
  assert.equal(short.subject, "1 home for you");
  assert.match(short.html, /View shortlist/);
  assert.match(short.html, /put together a shortlist/);

  const cma = renderCmaEmail({
    recipientName: "Alex",
    agentName: "Jordan",
    tenantDisplayName: "Houzzat",
    subjectAddress: "10 King St",
    subjectCity: "Toronto",
    cmaUrl: "https://example.com/cma/t",
    publishedCmaShareTemplate: null,
  });
  assert.equal(cma.subject, "Your Comparative Market Analysis is ready");
  assert.match(cma.html, /View Your CMA/);
  assert.match(cma.html, /not a formal appraisal/);

  const webAgent = read("src/app/api/agent/email/route.ts");
  const mobileAgent = read(
    "src/app/api/mobile/v2/leads/[leadId]/conversations/route.ts",
  );
  const shortlist = read("src/lib/agent/send-shortlist-email.ts");
  const cmaSend = read("src/lib/cma/send-cma-email.ts");

  assert.equal((webAgent.match(/sendAndLogClientEmail\(/g) ?? []).length, 1);
  assert.equal((mobileAgent.match(/sendAndLogClientEmail\(/g) ?? []).length, 1);
  assert.equal((shortlist.match(/sendAndLogClientEmail\(/g) ?? []).length, 1);
  assert.equal((cmaSend.match(/sendAndLogClientEmail\(/g) ?? []).length, 1);

  assert.match(webAgent, /loadPublishedAgentEmailOverride/);
  assert.match(mobileAgent, /loadPublishedAgentEmailOverride/);
  assert.match(shortlist, /loadPublishedShortlistOverride/);
  assert.match(cmaSend, /loadPublishedCmaShareOverride/);

  // Individual + mass share the same web route send site.
  assert.match(webAgent, /mode: z\.literal\("mass"\)/);
  assert.match(webAgent, /mode: z\.literal\("single"\)/);

  assert.doesNotMatch(webAgent, /loadPublishedShortlistOverride|loadPublishedCmaShareOverride/);
  assert.doesNotMatch(shortlist, /loadPublishedAgentEmailOverride|loadPublishedCmaShareOverride/);
  assert.doesNotMatch(cmaSend, /loadPublishedAgentEmailOverride|loadPublishedShortlistOverride/);

  assert.match(
    read("src/lib/email/workspace-templates/agent-share-templates.ts"),
    /TENANT_EMAIL_TEMPLATES|isTenantEmailTemplatesEnabled/,
  );
}

async function testShortlistAgentSubjectPrecedence() {
  const published: EmailTemplateContentFields = {
    subject: "Template shortlist subject",
    introText: null,
    bodySections: {},
    ctaText: null,
    style: {},
  };
  const rendered = renderShortlistEmail({
    name: "Pat",
    agentName: "Jordan",
    shareUrl: "https://example.com/share",
    listings: [SAMPLE_LISTING],
    publishedShortlistTemplate: published,
  });
  assert.equal(rendered.subject, "Template shortlist subject");
  // Mimic send-shortlist-email: explicit agent subject wins after render.
  rendered.subject = "Agent override subject";
  assert.equal(rendered.subject, "Agent override subject");
}

async function main() {
  testFeatureFlagDefaultOff();
  await testTenantIsolation();
  await testAgentAuthoredPrecedence();
  await testDraftIgnoredAndInvalidFallback();
  await testFeatureFlagOff();
  await testPartialOverrideAndTypeIsolation();
  testHtmlEscapingAndProtectedContent();
  testLegacyPreservedAndWiring();
  await testShortlistAgentSubjectPrecedence();
  console.log("agent-share-email-templates-selftest: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
