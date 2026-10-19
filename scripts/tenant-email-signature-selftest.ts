/**
 * Phase 3B — premium tenant email agent signature selftest.
 * Run: pnpm tenant-email-signature:selftest
 *
 * Hermetic. No DB. No real sends.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  WorkspaceBranding,
  WorkspaceEmailIdentity,
} from "@prisma/client";
import {
  formatEmailFooterNoteHtml,
  EMAIL_LAYOUT_DEFAULT_FOOTER_NOTE,
} from "@/lib/email/layout";
import {
  appendAgentSignatureHtml,
  appendAgentSignatureText,
  appendEmailFooterText,
  assembleTenantEmailBrand,
  buildAgentEmailSignature,
  buildTelHref,
  normalizeTenantEmailFooterLegalText,
  resolveTenantEmailBrand,
  toEmailBrandChrome,
  type TenantEmailAgentIdentity,
  type TenantEmailBrandDeps,
} from "@/lib/email/tenant-email-brand";
import {
  renderAgentMessageEmail,
  renderCmaEmail,
  renderJustListedEmail,
  renderNeighborhoodWeeklyEmail,
  renderPriceReductionEmail,
  renderPropertyUpdateEmail,
  renderSavedSearchDigestEmail,
  renderShortlistEmail,
  renderSoldAlertEmail,
} from "@/lib/email/templates";
import {
  TENANT_B_TEST_BRANDING_ROW,
  TENANT_B_TEST_WORKSPACE_ID,
} from "@/lib/tenancy/test-fixtures/tenant-b-brand";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS = TENANT_B_TEST_WORKSPACE_ID;
const WS_B = "ws_other_tenant";
const AGENT_A = "agent_a";
const AGENT_B = "agent_b";
const PHOTO_A =
  "https://branding-assets.houzzatpro.com/workspaces/ws_a/agent-user/agent_a.jpg";
const PHOTO_B =
  "https://branding-assets.houzzatpro.com/workspaces/ws_a/agent-user/agent_b.jpg";
const BROKERAGE = "Royal LePage Signature Realty";

function section(name: string) {
  console.log(`  ✓ ${name}`);
}

function identity(
  workspaceId: string,
  overrides: Partial<WorkspaceEmailIdentity> = {},
): WorkspaceEmailIdentity {
  return {
    workspaceId,
    contactEmail: null,
    replyToEmail: null,
    senderDisplayName: null,
    customDomain: null,
    domainStatus: "NONE",
    dnsRecordsJson: null,
    fallbackFrom: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function agentA(overrides: Partial<TenantEmailAgentIdentity> = {}): TenantEmailAgentIdentity {
  return {
    userId: AGENT_A,
    name: "Ali Syed",
    email: "ali@example.com",
    phone: "647-221-4949",
    image: PHOTO_A,
    designation: null,
    ...overrides,
  };
}

function agentB(): TenantEmailAgentIdentity {
  return {
    userId: AGENT_B,
    name: "Blake Other",
    email: "blake@example.com",
    phone: "416-555-0100",
    image: PHOTO_B,
    designation: null,
  };
}

function makeDeps(input: {
  agentsByKey: Map<string, TenantEmailAgentIdentity>;
  membership: Set<string>;
  /** userIds whose AgentProfile.active === false (or missing). */
  inactiveProfiles?: Set<string>;
  branding?: WorkspaceBranding | null;
  brokerage?: string | null;
  senderDisplayName?: string | null;
}): TenantEmailBrandDeps {
  const profileOk = (userId: string) =>
    !input.inactiveProfiles?.has(userId);

  return {
    loadBranding: async () => input.branding ?? TENANT_B_TEST_BRANDING_ROW,
    loadEmailIdentity: async () =>
      identity(WS, {
        senderDisplayName: input.senderDisplayName ?? null,
        replyToEmail: "desk@canary.test",
      }),
    loadProfessionalIdentity: async () => ({
      brokerageRegisteredName: input.brokerage ?? BROKERAGE,
    }),
    loadAgentInWorkspace: async (workspaceId, userId) => {
      if (!input.membership.has(`${workspaceId}:${userId}`)) return null;
      if (!profileOk(userId)) return null;
      return input.agentsByKey.get(`${workspaceId}:${userId}`) ?? null;
    },
    loadAssignedAgentForLead: async (workspaceId, leadId) => {
      const agent = input.agentsByKey.get(`lead:${workspaceId}:${leadId}`);
      if (!agent) return null;
      if (!input.membership.has(`${workspaceId}:${agent.userId}`)) return null;
      if (!profileOk(agent.userId)) return null;
      return agent;
    },
    loadAssignedAgentForCustomer: async (workspaceId, customerId) => {
      const agent = input.agentsByKey.get(
        `customer:${workspaceId}:${customerId}`,
      );
      if (!agent) return null;
      if (!input.membership.has(`${workspaceId}:${agent.userId}`)) return null;
      if (!profileOk(agent.userId)) return null;
      return agent;
    },
    loadAgentEmailHeadshotAssociation: async () => null,
    resolveWebsiteUrl: async () => "https://tenant-canary.houzzatpro.com",
  };
}

function assertCompanyNotPerson(
  brand: NonNullable<Awaited<ReturnType<typeof resolveTenantEmailBrand>>>,
  forbidden: {
    names?: string[];
    photos?: string[];
    phones?: string[];
  },
) {
  assert.equal(brand.agent, null);
  for (const name of forbidden.names ?? []) {
    assert.doesNotMatch(brand.signatureHtml, new RegExp(name));
    assert.doesNotMatch(brand.signatureText, new RegExp(name));
  }
  for (const photo of forbidden.photos ?? []) {
    const re = new RegExp(photo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    assert.doesNotMatch(brand.signatureHtml, re);
  }
  for (const phone of forbidden.phones ?? []) {
    assert.doesNotMatch(brand.signatureHtml, new RegExp(phone));
    assert.doesNotMatch(brand.signatureText, new RegExp(phone));
  }
  assert.doesNotMatch(brand.signatureHtml, /<img /i);
}

const brandingOn = {
  TENANT_EMAIL_BRANDING: "on",
  TENANT_EMAIL_BRANDING_WORKSPACE_IDS: WS,
} as NodeJS.ProcessEnv;

async function testSendingAgentPreferred() {
  const deps = makeDeps({
    agentsByKey: new Map([
      [`${WS}:${AGENT_A}`, agentA()],
      [`lead:${WS}:lead_1`, agentB()],
    ]),
    membership: new Set([`${WS}:${AGENT_A}`, `${WS}:${AGENT_B}`]),
  });
  const brand = await resolveTenantEmailBrand(
    {
      workspaceId: WS,
      preferredAgentUserId: AGENT_A,
      leadId: "lead_1",
    },
    deps,
    brandingOn,
  );
  assert.ok(brand);
  assert.equal(brand.agent?.userId, AGENT_A);
  assert.match(brand.signatureHtml, /Ali Syed/);
  assert.match(brand.signatureHtml, new RegExp(PHOTO_A.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(brand.signatureHtml, /Blake Other/);
  assert.doesNotMatch(brand.signatureHtml, new RegExp(PHOTO_B.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  section("Correct sending agent (preferred over assignee)");
}

async function testAssignedAgent() {
  const deps = makeDeps({
    agentsByKey: new Map([[`lead:${WS}:lead_1`, agentA()]]),
    membership: new Set([`${WS}:${AGENT_A}`]),
  });
  const brand = await resolveTenantEmailBrand(
    { workspaceId: WS, leadId: "lead_1" },
    deps,
    brandingOn,
  );
  assert.ok(brand);
  assert.equal(brand.agent?.userId, AGENT_A);
  assert.match(brand.signatureHtml, /Ali Syed/);
  assert.match(brand.signatureHtml, /Royal LePage Signature Realty/);
  section("Correct assigned agent");
}

async function testNoAssigneeCompanySignature() {
  const deps = makeDeps({
    agentsByKey: new Map(),
    membership: new Set(),
    senderDisplayName: "Canary Desk",
  });
  const brand = await resolveTenantEmailBrand(
    { workspaceId: WS },
    deps,
    brandingOn,
  );
  assert.ok(brand);
  assert.equal(brand.agent, null);
  assert.match(brand.signatureHtml, /Canary Desk/);
  assert.doesNotMatch(brand.signatureHtml, /<img /i);
  assert.doesNotMatch(brand.signatureHtml, /Photo of/);
  assert.match(brand.signatureText, /Canary Desk/);
  section("No assignee → company signature without headshot");
}

async function testCrossTenantRejection() {
  const foreign = agentA({ userId: AGENT_A, name: "Foreign Agent" });
  const deps = makeDeps({
    agentsByKey: new Map([[`${WS_B}:${AGENT_A}`, foreign]]),
    membership: new Set([`${WS_B}:${AGENT_A}`]),
  });
  const brand = await resolveTenantEmailBrand(
    { workspaceId: WS, preferredAgentUserId: AGENT_A },
    deps,
    brandingOn,
  );
  assert.ok(brand);
  assert.equal(brand.agent, null);
  assert.doesNotMatch(brand.signatureHtml, /Foreign Agent/);
  assert.doesNotMatch(brand.signatureHtml, new RegExp(PHOTO_A.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  section("Cross-tenant rejection");
}

async function testInactiveAgentRejection() {
  // Membership set omits agent → loader returns null (ACTIVE gate).
  const deps = makeDeps({
    agentsByKey: new Map([[`${WS}:${AGENT_A}`, agentA()]]),
    membership: new Set(),
  });
  const brand = await resolveTenantEmailBrand(
    { workspaceId: WS, preferredAgentUserId: AGENT_A },
    deps,
    brandingOn,
  );
  assert.ok(brand);
  assert.equal(brand.agent, null);
  assert.doesNotMatch(brand.signatureHtml, /Ali Syed/);
  section("Inactive / non-member agent rejection");
}

async function testInvalidPreferredDoesNotFallThroughToLeadAssignee() {
  const deps = makeDeps({
    agentsByKey: new Map([
      // Preferred not in membership for WS.
      [`${WS_B}:${AGENT_A}`, agentA()],
      [`lead:${WS}:lead_1`, agentB()],
    ]),
    membership: new Set([`${WS_B}:${AGENT_A}`, `${WS}:${AGENT_B}`]),
    senderDisplayName: "Canary Desk",
  });
  const brand = await resolveTenantEmailBrand(
    {
      workspaceId: WS,
      preferredAgentUserId: AGENT_A,
      leadId: "lead_1",
    },
    deps,
    brandingOn,
  );
  assert.ok(brand);
  assertCompanyNotPerson(brand, {
    names: ["Ali Syed", "Blake Other", "Foreign"],
    photos: [PHOTO_A, PHOTO_B],
    phones: ["647-221-4949", "416-555-0100"],
  });
  assert.match(brand.signatureHtml, /Canary Desk/);
  section("Invalid preferred + valid lead assignee → company signature");
}

async function testInactivePreferredDoesNotFallThroughToCustomerAssignee() {
  const deps = makeDeps({
    agentsByKey: new Map([
      [`${WS}:${AGENT_A}`, agentA()],
      [`customer:${WS}:cust_1`, agentB()],
    ]),
    // Preferred is a member but membership status simulated as absent → invalid.
    membership: new Set([`${WS}:${AGENT_B}`]),
    senderDisplayName: "Canary Desk",
  });
  const brand = await resolveTenantEmailBrand(
    {
      workspaceId: WS,
      preferredAgentUserId: AGENT_A,
      customerId: "cust_1",
    },
    deps,
    brandingOn,
  );
  assert.ok(brand);
  assertCompanyNotPerson(brand, {
    names: ["Ali Syed", "Blake Other"],
    photos: [PHOTO_A, PHOTO_B],
    phones: ["647-221-4949", "416-555-0100"],
  });
  section("Inactive preferred + valid customer assignee → company signature");
}

async function testCrossTenantPreferredDoesNotFallThroughToLead() {
  const deps = makeDeps({
    agentsByKey: new Map([
      [`${WS_B}:${AGENT_A}`, agentA({ name: "Foreign Agent" })],
      [`lead:${WS}:lead_1`, agentB()],
    ]),
    membership: new Set([`${WS_B}:${AGENT_A}`, `${WS}:${AGENT_B}`]),
    senderDisplayName: "Canary Desk",
  });
  const brand = await resolveTenantEmailBrand(
    {
      workspaceId: WS,
      preferredAgentUserId: AGENT_A,
      leadId: "lead_1",
    },
    deps,
    brandingOn,
  );
  assert.ok(brand);
  assertCompanyNotPerson(brand, {
    names: ["Foreign Agent", "Blake Other", "Ali Syed"],
    photos: [PHOTO_A, PHOTO_B],
    phones: ["416-555-0100"],
  });
  section("Cross-tenant preferred + valid lead assignee → company signature");
}

async function testMissingPreferredUsesAssignedAgent() {
  const deps = makeDeps({
    agentsByKey: new Map([[`lead:${WS}:lead_1`, agentA()]]),
    membership: new Set([`${WS}:${AGENT_A}`]),
  });
  const brand = await resolveTenantEmailBrand(
    { workspaceId: WS, leadId: "lead_1" },
    deps,
    brandingOn,
  );
  assert.ok(brand);
  assert.equal(brand.agent?.userId, AGENT_A);
  assert.match(brand.signatureHtml, /Ali Syed/);
  section("Missing preferred → valid assigned agent");
}

async function testAgentProfileInactiveCompanySignature() {
  const deps = makeDeps({
    agentsByKey: new Map([
      [`${WS}:${AGENT_A}`, agentA()],
      [`lead:${WS}:lead_1`, agentB()],
    ]),
    membership: new Set([`${WS}:${AGENT_A}`, `${WS}:${AGENT_B}`]),
    inactiveProfiles: new Set([AGENT_A]),
    senderDisplayName: "Canary Desk",
  });
  // Preferred with inactive AgentProfile — company, not lead assignee B.
  const preferred = await resolveTenantEmailBrand(
    {
      workspaceId: WS,
      preferredAgentUserId: AGENT_A,
      leadId: "lead_1",
    },
    deps,
    brandingOn,
  );
  assert.ok(preferred);
  assertCompanyNotPerson(preferred, {
    names: ["Ali Syed", "Blake Other"],
    photos: [PHOTO_A, PHOTO_B],
    phones: ["647-221-4949", "416-555-0100"],
  });

  // Automated path: assigned agent with inactive profile → company.
  const assignedInactive = await resolveTenantEmailBrand(
    { workspaceId: WS, leadId: "lead_1" },
    makeDeps({
      agentsByKey: new Map([[`lead:${WS}:lead_1`, agentB()]]),
      membership: new Set([`${WS}:${AGENT_B}`]),
      inactiveProfiles: new Set([AGENT_B]),
      senderDisplayName: "Canary Desk",
    }),
    brandingOn,
  );
  assert.ok(assignedInactive);
  assertCompanyNotPerson(assignedInactive, {
    names: ["Blake Other"],
    photos: [PHOTO_B],
    phones: ["416-555-0100"],
  });
  section("AgentProfile.active=false → company signature");
}

async function testCmaReportAgentVsLeadAssignee() {
  const reportAgent = agentA({ name: "CMA Author" });
  const leadAssignee = agentB();
  const depsValid = makeDeps({
    agentsByKey: new Map([
      [`${WS}:${AGENT_A}`, reportAgent],
      [`lead:${WS}:lead_1`, leadAssignee],
    ]),
    membership: new Set([`${WS}:${AGENT_A}`, `${WS}:${AGENT_B}`]),
  });
  const valid = await resolveTenantEmailBrand(
    {
      workspaceId: WS,
      preferredAgentUserId: AGENT_A,
      leadId: "lead_1",
    },
    depsValid,
    brandingOn,
  );
  assert.ok(valid);
  assert.equal(valid.agent?.userId, AGENT_A);
  assert.match(valid.signatureHtml, /CMA Author/);
  assert.doesNotMatch(valid.signatureHtml, /Blake Other/);

  const depsInvalid = makeDeps({
    agentsByKey: new Map([
      [`${WS}:${AGENT_A}`, reportAgent],
      [`lead:${WS}:lead_1`, leadAssignee],
    ]),
    membership: new Set([`${WS}:${AGENT_B}`]), // report agent not ACTIVE member
    senderDisplayName: "Canary Desk",
  });
  const invalid = await resolveTenantEmailBrand(
    {
      workspaceId: WS,
      preferredAgentUserId: AGENT_A,
      leadId: "lead_1",
    },
    depsInvalid,
    brandingOn,
  );
  assert.ok(invalid);
  assertCompanyNotPerson(invalid, {
    names: ["CMA Author", "Blake Other"],
    photos: [PHOTO_A, PHOTO_B],
    phones: ["647-221-4949", "416-555-0100"],
  });
  section("CMA report agent vs lead assignee (valid / invalid preferred)");
}

function testAgentANeverGetsAgentBPhoto() {
  const sig = buildAgentEmailSignature({
    workspaceId: WS,
    agent: agentA({ image: PHOTO_A }),
    displayName: "Tenant Canary",
    contactPhone: null,
    senderDisplayName: null,
    brokerageRegisteredName: BROKERAGE,
    primaryColor: "#2563EB",
  });
  assert.match(sig.html, new RegExp(PHOTO_A.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(sig.html, new RegExp(PHOTO_B.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  // Even if someone stuffed B's URL into A's record incorrectly, PERSONAL
  // resolution still only uses the provided userImage for that user — assert
  // we never fall back to branding / other portraits when image missing.
  const missing = buildAgentEmailSignature({
    workspaceId: WS,
    agent: agentA({ image: null }),
    displayName: "Tenant Canary",
    contactPhone: null,
    senderDisplayName: null,
    brokerageRegisteredName: BROKERAGE,
    primaryColor: "#2563EB",
  });
  assert.doesNotMatch(missing.html, /<img /i);
  assert.doesNotMatch(missing.html, new RegExp(PHOTO_B.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  section("Agent A never receives agent B's photo");
}

function testMissingInvalidPhoto() {
  const missing = buildAgentEmailSignature({
    workspaceId: WS,
    agent: agentA({ image: null }),
    displayName: "Tenant Canary",
    contactPhone: null,
    senderDisplayName: null,
    brokerageRegisteredName: BROKERAGE,
    primaryColor: "#2563EB",
  });
  assert.doesNotMatch(missing.html, /<img /i);
  assert.match(missing.html, /Ali Syed/);

  const invalid = buildAgentEmailSignature({
    workspaceId: WS,
    agent: agentA({ image: "javascript:alert(1)" }),
    displayName: "Tenant Canary",
    contactPhone: null,
    senderDisplayName: null,
    brokerageRegisteredName: BROKERAGE,
    primaryColor: "#2563EB",
  });
  assert.doesNotMatch(invalid.html, /javascript:/i);
  assert.doesNotMatch(invalid.html, /<img /i);

  const local = buildAgentEmailSignature({
    workspaceId: WS,
    agent: agentA({ image: "https://127.0.0.1/secret.jpg" }),
    displayName: "Tenant Canary",
    contactPhone: null,
    senderDisplayName: null,
    brokerageRegisteredName: BROKERAGE,
    primaryColor: "#2563EB",
  });
  assert.doesNotMatch(local.html, /127\.0\.0\.1/);
  assert.doesNotMatch(local.html, /<img /i);
  section("Missing / invalid photo omitted safely");
}

function testHtmlEscaping() {
  const sig = buildAgentEmailSignature({
    workspaceId: WS,
    agent: agentA({
      name: `Ali <script>alert(1)</script>`,
      phone: null,
      image: null,
    }),
    displayName: `Tenant <b>X</b>`,
    contactPhone: null,
    senderDisplayName: null,
    brokerageRegisteredName: `Broker & "Co"`,
    primaryColor: "#2563EB",
  });
  assert.doesNotMatch(sig.html, /<script>/i);
  assert.match(sig.html, /&lt;script&gt;/);
  assert.match(sig.html, /Broker &amp; &quot;Co&quot;/);
  section("HTML escaping");
}

function testClickableTelephone() {
  assert.equal(buildTelHref("647-221-4949"), "tel:6472214949");
  assert.equal(buildTelHref("+1 (647) 221-4949"), "tel:+16472214949");
  assert.equal(buildTelHref("short"), null);

  const sig = buildAgentEmailSignature({
    workspaceId: WS,
    agent: agentA({ phone: "647-221-4949", image: null }),
    displayName: "Tenant Canary",
    contactPhone: null,
    senderDisplayName: null,
    brokerageRegisteredName: BROKERAGE,
    primaryColor: "#2563EB",
  });
  assert.match(sig.html, /href="tel:6472214949"/);
  assert.match(sig.html, /647-221-4949/);
  section("Clickable telephone");
}

async function testBrandingOffUnchanged() {
  const deps = makeDeps({
    agentsByKey: new Map([[`${WS}:${AGENT_A}`, agentA()]]),
    membership: new Set([`${WS}:${AGENT_A}`]),
  });
  const brand = await resolveTenantEmailBrand(
    { workspaceId: WS, preferredAgentUserId: AGENT_A },
    deps,
    { TENANT_EMAIL_BRANDING: "off" },
  );
  assert.equal(brand, null);
  section("Branding-off unchanged");
}

function testPlainTextFallback() {
  const sig = buildAgentEmailSignature({
    workspaceId: WS,
    agent: agentA({ image: PHOTO_A, designation: null }),
    displayName: "Tenant Canary",
    contactPhone: null,
    senderDisplayName: null,
    brokerageRegisteredName: BROKERAGE,
    primaryColor: "#2563EB",
  });
  assert.equal(
    sig.text,
    ["Ali Syed", "647-221-4949", BROKERAGE].join("\n"),
  );
  assert.doesNotMatch(sig.text, /ali@example\.com/);
  section("Plain-text fallback");
}

function testNoDuplicateSignature() {
  const sig = buildAgentEmailSignature({
    workspaceId: WS,
    agent: agentA({ image: null }),
    displayName: "Tenant Canary",
    contactPhone: null,
    senderDisplayName: null,
    brokerageRegisteredName: BROKERAGE,
    primaryColor: "#2563EB",
  });
  const once = appendAgentSignatureHtml("<p>Hello</p>", sig.html);
  const twice = appendAgentSignatureHtml(once, sig.html);
  assert.equal(twice, once);
  assert.equal(
    (twice.match(/data-houzzat-agent-signature="1"/g) ?? []).length,
    1,
  );

  const textOnce = appendAgentSignatureText("Hello", sig.text);
  const textTwice = appendAgentSignatureText(textOnce, sig.text);
  assert.equal(textTwice, textOnce);
  section("No duplicate signature");
}

function testNoAgentEmailInSignature() {
  const brand = assembleTenantEmailBrand({
    workspaceId: WS,
    branding: TENANT_B_TEST_BRANDING_ROW,
    identity: identity(WS),
    agent: agentA(),
    websiteUrl: "https://tenant-canary.houzzatpro.com",
    brokerageRegisteredName: BROKERAGE,
  });
  assert.doesNotMatch(brand.signatureHtml, /ali@example\.com/i);
  assert.doesNotMatch(brand.signatureText, /ali@example\.com/i);
  // Reply-To may still use agent email — that is not the visible signature.
  assert.equal(brand.replyTo, "ali@example.com");
  section("No agent email address in signature");
}

const HOUZZAT_STYLE_FOOTER = [
  "Ali Syed",
  "Sales Representative",
  "Royal LePage Credit Valley Real Estate",
  "Direct: 647 - 221 - 4949",
  "Office: 905 - 793 - 5000",
  "1-10045 Hurontario St.",
  "Brampton, ON, L6Z 0E6",
].join("\n");

function testLegalFooterPreserved() {
  const brand = assembleTenantEmailBrand({
    workspaceId: WS,
    branding: {
      ...TENANT_B_TEST_BRANDING_ROW,
      footerLegalText: "Legal Brokerage Line · RECO",
    },
    identity: identity(WS),
    agent: agentA({ image: null }),
    websiteUrl: "https://tenant-canary.houzzatpro.com",
    brokerageRegisteredName: BROKERAGE,
  });
  assert.equal(brand.footerNote, "Legal Brokerage Line · RECO");
  assert.notEqual(brand.footerNote, brand.signatureText);
  const rendered = renderAgentMessageEmail({
    subject: "Hello",
    body: "Checking in.",
    ...toEmailBrandChrome(brand),
  });
  assert.match(rendered.html, /Legal Brokerage Line · RECO/);
  assert.match(rendered.html, /Ali Syed/);
  assert.match(rendered.text, /Legal Brokerage Line · RECO/);
  section("Existing single-line legal footer preserved");
}

function testMultiLineLegalFooterPreserved() {
  assert.equal(
    normalizeTenantEmailFooterLegalText(`\n${HOUZZAT_STYLE_FOOTER}\n\n`),
    HOUZZAT_STYLE_FOOTER,
  );

  const brand = assembleTenantEmailBrand({
    workspaceId: WS,
    branding: {
      ...TENANT_B_TEST_BRANDING_ROW,
      footerLegalText: HOUZZAT_STYLE_FOOTER,
    },
    identity: identity(WS),
    agent: agentA({ image: PHOTO_A, designation: null }),
    websiteUrl: "https://houzzat.com",
    brokerageRegisteredName: "Royal Lepage Credit Valley Real Estate",
  });
  assert.equal(brand.footerNote, HOUZZAT_STYLE_FOOTER);
  assert.match(brand.signatureHtml, /data-houzzat-agent-signature="1"/);
  assert.match(brand.signatureText, /Ali Syed/);
  assert.match(brand.signatureText, /Royal Lepage Credit Valley Real Estate/);
  // Signature must not swallow the chrome footer block.
  assert.notEqual(brand.footerNote, brand.signatureText);

  const rendered = renderAgentMessageEmail({
    subject: "Signature canary",
    body: "Checking branded footer.",
    preferencesManageUrl: "https://houzzat.com/account/email-preferences",
    unsubscribeIntentUrl: "https://houzzat.com/account/unsubscribe-intent",
    ...toEmailBrandChrome(brand),
  });

  for (const line of HOUZZAT_STYLE_FOOTER.split("\n")) {
    assert.match(rendered.html, new RegExp(escapeRegExp(line)));
    assert.match(rendered.text, new RegExp(escapeRegExp(line)));
  }
  assert.match(
    rendered.html,
    /Ali Syed<br \/>\nSales Representative<br \/>\nRoyal LePage Credit Valley Real Estate/,
  );
  assert.match(rendered.html, /data-houzzat-agent-signature="1"/);
  assert.match(rendered.html, /Manage email preferences/);
  assert.match(rendered.html, /Unsubscribe/);
  assert.match(rendered.html, /houzzat\.com/);
  // Plain-text: signature then full footer (not first line only).
  assert.match(
    rendered.text,
    /Ali Syed[\s\S]*Royal Lepage Credit Valley Real Estate[\s\S]*Ali Syed\nSales Representative\nRoyal LePage Credit Valley Real Estate/,
  );
  section("Multi-line Houzzat-style legal footer preserved");
}

function testEmptyFooterFallsBack() {
  assert.equal(normalizeTenantEmailFooterLegalText(""), null);
  assert.equal(normalizeTenantEmailFooterLegalText("\n\n"), null);
  assert.equal(normalizeTenantEmailFooterLegalText(null), null);

  const brand = assembleTenantEmailBrand({
    workspaceId: WS,
    branding: {
      ...TENANT_B_TEST_BRANDING_ROW,
      footerLegalText: "   \n\t\n  ",
      tagline: "Custom tagline fallback",
    },
    identity: identity(WS),
    agent: agentA({ image: null }),
    websiteUrl: "https://tenant-canary.houzzatpro.com",
    brokerageRegisteredName: BROKERAGE,
  });
  assert.equal(brand.footerNote, "Custom tagline fallback");

  const noTagline = assembleTenantEmailBrand({
    workspaceId: WS,
    branding: {
      ...TENANT_B_TEST_BRANDING_ROW,
      footerLegalText: null,
      // Empty string (not null): brand mapper fills null tagline from neutral defaults.
      tagline: "",
      displayName: "Acme Realty",
    },
    identity: identity(WS),
    agent: null,
    websiteUrl: "https://tenant-canary.houzzatpro.com",
    brokerageRegisteredName: null,
  });
  assert.equal(noTagline.footerNote, "Acme Realty — Powered by HouzzatPRO");
  assert.equal(
    formatEmailFooterNoteHtml(null),
    escapeHtmlForTest(EMAIL_LAYOUT_DEFAULT_FOOTER_NOTE),
  );
  section("Empty footer falls back");
}

function testFooterHtmlEscapingAndInjection() {
  const evil =
    'Line one\n<script>alert(1)</script>\nOffice: <img src=x onerror=alert(1)>';
  const brand = assembleTenantEmailBrand({
    workspaceId: WS,
    branding: {
      ...TENANT_B_TEST_BRANDING_ROW,
      footerLegalText: evil,
    },
    identity: identity(WS),
    agent: agentA({ image: null }),
    websiteUrl: "https://tenant-canary.houzzatpro.com",
    brokerageRegisteredName: BROKERAGE,
  });
  const rendered = renderAgentMessageEmail({
    subject: "Escape check",
    body: "Body",
    ...toEmailBrandChrome(brand),
  });
  assert.doesNotMatch(rendered.html, /<script>/i);
  assert.doesNotMatch(rendered.html, /<img\b[^>]*onerror=/i);
  assert.match(rendered.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(
    rendered.html,
    /&lt;img src=x onerror=alert\(1\)&gt;/,
  );
  assert.equal(
    formatEmailFooterNoteHtml("A\nB"),
    "A<br />\nB",
  );
  section("Footer HTML escaping and injection attempts");
}

function assertCompleteLegalFooterOnce(text: string, footer: string) {
  for (const line of footer.split("\n")) {
    assert.match(text, new RegExp(escapeRegExp(line)));
  }
  assert.equal(
    text.split(footer).length - 1,
    1,
    "complete legal footer must appear exactly once in plain text",
  );
  assert.ok(
    text.endsWith(footer),
    "complete legal footer must be the trailing plain-text block",
  );
}

/** Every branded renderer that builds a plain-text alternative. */
function testBrandedPathsPlainTextLegalFooter() {
  const brand = assembleTenantEmailBrand({
    workspaceId: WS,
    branding: {
      ...TENANT_B_TEST_BRANDING_ROW,
      footerLegalText: HOUZZAT_STYLE_FOOTER,
    },
    identity: identity(WS),
    agent: agentA({ image: PHOTO_A }),
    websiteUrl: "https://houzzat.com",
    brokerageRegisteredName: "Royal Lepage Credit Valley Real Estate",
  });
  const chrome = toEmailBrandChrome(brand);
  const listing = {
    addressLine: "10 King St",
    city: "Toronto",
    mlsNumber: "X123",
    listingUrl: "https://example.com/l/X123",
  };

  const branded = [
    renderPriceReductionEmail({
      ...listing,
      oldPrice: 900_000,
      newPrice: 850_000,
      ...chrome,
    }),
    renderSoldAlertEmail({
      ...listing,
      statusLabel: "Sold",
      priceLabel: "$850,000",
      ...chrome,
    }),
    renderJustListedEmail({
      ...listing,
      areaName: "Riverdale",
      price: 850_000,
      ...chrome,
    }),
    renderPropertyUpdateEmail({
      ...listing,
      title: "Status update",
      changes: ["Status → Sold"],
      ...chrome,
    }),
    renderShortlistEmail({
      agentName: "Ali Syed",
      shareUrl: "https://example.com/shortlist/1",
      listingLines: ["10 King St — $850,000"],
      ...chrome,
    }),
    renderAgentMessageEmail({
      subject: "Hello",
      body: "Checking in.",
      ...chrome,
    }),
    renderSavedSearchDigestEmail({
      searchName: "Riverdale under 1M",
      searchUrl: "https://example.com/search",
      listings: [
        {
          ...listing,
          priceLabel: "$850,000",
        },
      ],
      ...chrome,
    }),
    renderNeighborhoodWeeklyEmail({
      homeLabel: "10 King St",
      radiusKm: 1,
      newCount: 1,
      soldCount: 0,
      newListings: [
        {
          ...listing,
          priceLabel: "$850,000",
        },
      ],
      soldListings: [],
      ctaUrl: "https://example.com/seller",
      ...chrome,
    }),
    renderCmaEmail({
      agentName: "Ali Syed",
      tenantDisplayName: "Tenant Canary",
      subjectAddress: "10 King St",
      subjectCity: "Toronto",
      cmaUrl: "https://example.com/cma/1",
      ...chrome,
    }),
  ];

  for (const mail of branded) {
    assertCompleteLegalFooterOnce(mail.text, HOUZZAT_STYLE_FOOTER);
    for (const line of HOUZZAT_STYLE_FOOTER.split("\n")) {
      assert.match(mail.html, new RegExp(escapeRegExp(line)));
    }
  }

  // Branding OFF / no footerNote: plain text must not invent legal lines;
  // CMA keeps its legacy powered-by line.
  const unbrandedCma = renderCmaEmail({
    agentName: "Ali Syed",
    tenantDisplayName: "Tenant Canary",
    subjectAddress: "10 King St",
    subjectCity: "Toronto",
    cmaUrl: "https://example.com/cma/1",
  });
  assert.match(unbrandedCma.text, /Powered by HouzzatPRO/);
  assert.doesNotMatch(unbrandedCma.text, /Sales Representative/);
  assert.doesNotMatch(
    renderPriceReductionEmail({
      ...listing,
      oldPrice: 900_000,
      newPrice: 850_000,
    }).text,
    /Sales Representative/,
  );

  // Idempotent append helper — re-appending the same footer must not duplicate.
  const once = appendEmailFooterText("Body", HOUZZAT_STYLE_FOOTER);
  assert.equal(appendEmailFooterText(once, HOUZZAT_STYLE_FOOTER), once);

  section("Branded paths append complete legal footer once in plain text");
}

function testSignatureAndLegalFooterCoexist() {
  const brand = assembleTenantEmailBrand({
    workspaceId: WS,
    branding: {
      ...TENANT_B_TEST_BRANDING_ROW,
      footerLegalText: HOUZZAT_STYLE_FOOTER,
    },
    identity: identity(WS),
    agent: agentA({ image: PHOTO_A }),
    websiteUrl: "https://houzzat.com",
    brokerageRegisteredName: "Royal Lepage Credit Valley Real Estate",
  });
  const rendered = renderAgentMessageEmail({
    subject: "Coexist",
    body: "Hello",
    ...toEmailBrandChrome(brand),
  });
  const sigIdx = rendered.html.indexOf('data-houzzat-agent-signature="1"');
  const footerIdx = rendered.html.indexOf("Sales Representative<br");
  assert.ok(sigIdx >= 0);
  assert.ok(footerIdx > sigIdx);
  assert.match(rendered.html, /Photo of Ali Syed/);
  assert.equal(
    appendEmailFooterText("Body\n\n— Agent", "Legal line"),
    "Body\n\n— Agent\n\nLegal line",
  );
  section("Signature + complete legal footer coexistence");
}

async function testAllowlistIsolationForFooterBrand() {
  const deps = makeDeps({
    agentsByKey: new Map([[`${WS}:${AGENT_A}`, agentA()]]),
    membership: new Set([`${WS}:${AGENT_A}`]),
    branding: {
      ...TENANT_B_TEST_BRANDING_ROW,
      footerLegalText: HOUZZAT_STYLE_FOOTER,
    },
    brokerage: "Royal Lepage Credit Valley Real Estate",
  });
  const onAllowlist = await resolveTenantEmailBrand(
    { workspaceId: WS, preferredAgentUserId: AGENT_A },
    deps,
    {
      TENANT_EMAIL_BRANDING: "on",
      TENANT_EMAIL_BRANDING_WORKSPACE_IDS: WS,
    },
  );
  assert.ok(onAllowlist);
  assert.equal(onAllowlist.footerNote, HOUZZAT_STYLE_FOOTER);

  const otherTenant = await resolveTenantEmailBrand(
    { workspaceId: WS_B, preferredAgentUserId: AGENT_A },
    deps,
    {
      TENANT_EMAIL_BRANDING: "on",
      TENANT_EMAIL_BRANDING_WORKSPACE_IDS: WS,
    },
  );
  assert.equal(otherTenant, null);

  const emptyAllowlist = await resolveTenantEmailBrand(
    { workspaceId: WS, preferredAgentUserId: AGENT_A },
    deps,
    {
      TENANT_EMAIL_BRANDING: "on",
      TENANT_EMAIL_BRANDING_WORKSPACE_IDS: "",
    },
  );
  assert.equal(emptyAllowlist, null);
  section("Allowlist isolation for branded footer");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtmlForTest(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function testPublishedTemplatesUnaffected() {
  const propertyWatch = read("src/lib/email/workspace-templates/property-watch.ts");
  const areaWatch = read("src/lib/email/workspace-templates/area-watch.ts");
  const agentShare = read(
    "src/lib/email/workspace-templates/agent-share-templates.ts",
  );
  // Signature assembly must not rewrite published template loaders.
  assert.doesNotMatch(propertyWatch, /buildAgentEmailSignature/);
  assert.doesNotMatch(areaWatch, /buildAgentEmailSignature/);
  assert.doesNotMatch(agentShare, /buildAgentEmailSignature/);
  section("Published templates unaffected");
}

function testSecurityTransactionalEmailsUntouched() {
  const brandMod = read("src/lib/email/tenant-email-brand.ts");
  assert.match(brandMod, /renderVerifyEmail/);
  assert.match(brandMod, /password-reset-email/);
  assert.match(brandMod, /renderWelcomeEmail/);

  const verify = read("src/lib/email/templates.ts");
  // Verification / welcome helpers must not pull tenant agent signatures.
  const verifyFn = verify.slice(
    verify.indexOf("export function renderVerifyEmail"),
    verify.indexOf("export function renderVerifyEmail") + 800,
  );
  assert.doesNotMatch(verifyFn, /agentSignatureHtml/);
  assert.doesNotMatch(verifyFn, /resolveTenantEmailBrand/);

  const activation = read("scripts/tenant-email-activation-selftest.ts");
  assert.match(activation, /TENANT_EMAIL_BRANDING/);
  section("No changes to security/transactional email contract");
}

function testDesignationOmittedWithoutPerAgentField() {
  const sig = buildAgentEmailSignature({
    workspaceId: WS,
    agent: agentA({ designation: null }),
    displayName: "Tenant Canary",
    contactPhone: null,
    senderDisplayName: null,
    brokerageRegisteredName: BROKERAGE,
    primaryColor: "#2563EB",
  });
  assert.doesNotMatch(sig.html, /Salesperson|Broker of Record/i);
  // If a future per-agent designation is supplied, it may render — prove path.
  const withDesignation = buildAgentEmailSignature({
    workspaceId: WS,
    agent: agentA({ designation: "Sales Representative", image: null }),
    displayName: "Tenant Canary",
    contactPhone: null,
    senderDisplayName: null,
    brokerageRegisteredName: BROKERAGE,
    primaryColor: "#2563EB",
  });
  assert.match(withDesignation.html, /Sales Representative/);
  section("Designation omitted unless per-agent field provided");
}

async function main() {
  await testSendingAgentPreferred();
  await testAssignedAgent();
  await testNoAssigneeCompanySignature();
  await testCrossTenantRejection();
  await testInactiveAgentRejection();
  await testInvalidPreferredDoesNotFallThroughToLeadAssignee();
  await testInactivePreferredDoesNotFallThroughToCustomerAssignee();
  await testCrossTenantPreferredDoesNotFallThroughToLead();
  await testMissingPreferredUsesAssignedAgent();
  await testAgentProfileInactiveCompanySignature();
  await testCmaReportAgentVsLeadAssignee();
  testAgentANeverGetsAgentBPhoto();
  testMissingInvalidPhoto();
  testHtmlEscaping();
  testClickableTelephone();
  await testBrandingOffUnchanged();
  testPlainTextFallback();
  testNoDuplicateSignature();
  testNoAgentEmailInSignature();
  testLegalFooterPreserved();
  testMultiLineLegalFooterPreserved();
  testEmptyFooterFallsBack();
  testFooterHtmlEscapingAndInjection();
  testBrandedPathsPlainTextLegalFooter();
  testSignatureAndLegalFooterCoexist();
  await testAllowlistIsolationForFooterBrand();
  testPublishedTemplatesUnaffected();
  testSecurityTransactionalEmailsUntouched();
  testDesignationOmittedWithoutPerAgentField();
  console.log("\ntenant-email-signature-selftest: OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
