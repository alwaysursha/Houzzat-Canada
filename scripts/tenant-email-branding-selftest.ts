/**
 * Phase 1 — tenant email branding isolation / safety selftest.
 * Run: pnpm tenant-email-branding:selftest
 *
 * No real sends. No DB. Injected deps + template HTML assertions.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  WorkspaceBranding,
  WorkspaceEmailIdentity,
} from "@prisma/client";
import { evaluateOptionalEmailSuppression } from "../src/lib/communications/send-enforcement";
import {
  memoryEmailSuppressionStore,
  applyEmailSuppression,
} from "../src/lib/communications/suppression";
import {
  renderAgentMessageEmail,
  renderPriceReductionEmail,
  renderSavedSearchDigestEmail,
} from "../src/lib/email/templates";
import {
  absoluteEmailAssetUrl,
  assembleTenantEmailBrand,
  isTenantEmailBrandingEnabled,
  isValidReplyToEmail,
  resolveTenantEmailBrand,
  toEmailBrandChrome,
  type TenantEmailAgentIdentity,
  type TenantEmailBrandDeps,
} from "../src/lib/email/tenant-email-brand";
import {
  TENANT_B_TEST_BRANDING_ROW,
  TENANT_B_TEST_DISPLAY_NAME,
  TENANT_B_TEST_PRIMARY_COLOR,
  TENANT_B_TEST_WORKSPACE_ID,
} from "../src/lib/tenancy/test-fixtures/tenant-b-brand";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const HOUZZAT_WS = "ws_houzzat_fixture";
const CANARY_WS = TENANT_B_TEST_WORKSPACE_ID;

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function houzzatBrandingRow(): WorkspaceBranding {
  return {
    workspaceId: HOUZZAT_WS,
    tier: "FULL_BRANDED",
    displayName: "Houzzat",
    tagline: "GTA Real Estate — Just a click away.",
    logoUrl: "/images/houzzat-app-icon-512.png",
    brokerageLogoUrl: null,
    faviconUrl: null,
    agentProfilePhotoUrl: null,
    primaryColor: "#0F6B4C",
    secondaryColor: "#0A4D38",
    accentColor: "#1F7A8C",
    themeId: null,
    contactEmail: "hello@houzzat.com",
    contactPhone: "647-221-4949",
    footerLegalText: "Ali Syed · Royal LePage",
    poweredByHouzzatPro: true,
    seoDescription: "Houzzat",
    ogImageUrl: null,
    version: 1,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
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

function makeDeps(input: {
  brandingByWs: Map<string, WorkspaceBranding | null>;
  identityByWs: Map<string, WorkspaceEmailIdentity | null>;
  agentsByWs: Map<string, TenantEmailAgentIdentity>;
  membership: Set<string>;
  brokerageByWs?: Map<string, string | null>;
}): TenantEmailBrandDeps {
  return {
    loadBranding: async (workspaceId) =>
      input.brandingByWs.has(workspaceId)
        ? (input.brandingByWs.get(workspaceId) ?? null)
        : null,
    loadEmailIdentity: async (workspaceId) =>
      input.identityByWs.get(workspaceId) ?? null,
    loadProfessionalIdentity: async (workspaceId) => ({
      brokerageRegisteredName: input.brokerageByWs?.get(workspaceId) ?? null,
    }),
    loadAgentInWorkspace: async (workspaceId, userId) => {
      if (!input.membership.has(`${workspaceId}:${userId}`)) return null;
      const agent = input.agentsByWs.get(`${workspaceId}:${userId}`);
      return agent ?? null;
    },
    loadAssignedAgentForLead: async (workspaceId, leadId) => {
      const agent = input.agentsByWs.get(`lead:${workspaceId}:${leadId}`);
      if (!agent) return null;
      if (!input.membership.has(`${workspaceId}:${agent.userId}`)) return null;
      return agent;
    },
    loadAssignedAgentForCustomer: async (workspaceId, customerId) => {
      const agent = input.agentsByWs.get(`customer:${workspaceId}:${customerId}`);
      if (!agent) return null;
      if (!input.membership.has(`${workspaceId}:${agent.userId}`)) return null;
      return agent;
    },
    loadAgentEmailHeadshotAssociation: async () => null,
    resolveWebsiteUrl: async (workspaceId) => {
      if (workspaceId === CANARY_WS) return "https://tenant-canary.houzzatpro.com";
      if (workspaceId === HOUZZAT_WS) return "https://houzzat.com";
      return `https://${workspaceId}.example.test`;
    },
  };
}

function testFlagDefaultsOff() {
  assert.equal(isTenantEmailBrandingEnabled({}), false);
  assert.equal(isTenantEmailBrandingEnabled({ TENANT_EMAIL_BRANDING: "" }), false);
  assert.equal(
    isTenantEmailBrandingEnabled({ TENANT_EMAIL_BRANDING: "off" }),
    false,
  );
  assert.equal(
    isTenantEmailBrandingEnabled({ TENANT_EMAIL_BRANDING: "on" }),
    true,
  );
}

async function testFlagOffReturnsNull() {
  const deps = makeDeps({
    brandingByWs: new Map([[CANARY_WS, TENANT_B_TEST_BRANDING_ROW]]),
    identityByWs: new Map(),
    agentsByWs: new Map(),
    membership: new Set(),
  });
  const brand = await resolveTenantEmailBrand(
    { workspaceId: CANARY_WS },
    deps,
    { TENANT_EMAIL_BRANDING: "off" },
  );
  assert.equal(brand, null);
}

async function testHouzzatVsCanaryIsolation() {
  const houzzatAgent: TenantEmailAgentIdentity = {
    userId: "agent_houzzat",
    name: "Houzzat Agent",
    email: "agent@houzzat.com",
    phone: "647-000-0001",
  };
  const canaryAgent: TenantEmailAgentIdentity = {
    userId: "agent_canary",
    name: "Canary Agent",
    email: "agent@canary.test",
    phone: "647-000-0002",
  };
  const deps = makeDeps({
    brandingByWs: new Map([
      [HOUZZAT_WS, houzzatBrandingRow()],
      [CANARY_WS, TENANT_B_TEST_BRANDING_ROW],
    ]),
    identityByWs: new Map([
      [
        HOUZZAT_WS,
        identity(HOUZZAT_WS, { replyToEmail: "desk@houzzat.com" }),
      ],
      [
        CANARY_WS,
        identity(CANARY_WS, {
          replyToEmail: "desk@canary.test",
          senderDisplayName: "Tenant Canary Desk",
        }),
      ],
    ]),
    agentsByWs: new Map([
      [`${HOUZZAT_WS}:agent_houzzat`, houzzatAgent],
      [`${CANARY_WS}:agent_canary`, canaryAgent],
      [`customer:${HOUZZAT_WS}:cust_h`, houzzatAgent],
      [`customer:${CANARY_WS}:cust_c`, canaryAgent],
    ]),
    membership: new Set([
      `${HOUZZAT_WS}:agent_houzzat`,
      `${CANARY_WS}:agent_canary`,
    ]),
  });

  const brandingOnBoth = {
    TENANT_EMAIL_BRANDING: "on",
    TENANT_EMAIL_BRANDING_WORKSPACE_IDS: `${HOUZZAT_WS},${CANARY_WS}`,
  } as NodeJS.ProcessEnv;
  const houzzat = await resolveTenantEmailBrand(
    { workspaceId: HOUZZAT_WS, customerId: "cust_h" },
    deps,
    brandingOnBoth,
  );
  const canary = await resolveTenantEmailBrand(
    { workspaceId: CANARY_WS, customerId: "cust_c" },
    deps,
    brandingOnBoth,
  );
  assert.ok(houzzat && canary);
  assert.equal(houzzat.displayName, "Houzzat");
  assert.equal(canary.displayName, TENANT_B_TEST_DISPLAY_NAME);
  assert.equal(canary.primaryColor, TENANT_B_TEST_PRIMARY_COLOR);
  assert.notEqual(houzzat.primaryColor, canary.primaryColor);
  assert.equal(houzzat.agent?.userId, "agent_houzzat");
  assert.equal(canary.agent?.userId, "agent_canary");
  assert.equal(houzzat.replyTo, "agent@houzzat.com");
  assert.equal(canary.replyTo, "agent@canary.test");
  assert.equal(houzzat.fromOverride, null);
  assert.equal(canary.fromOverride, null);

  const houzzatHtml = renderPriceReductionEmail({
    addressLine: "1 Main St",
    city: "Toronto",
    mlsNumber: "X1",
    oldPrice: 900_000,
    newPrice: 850_000,
    listingUrl: "https://houzzat.com/listing/X1",
    ...toEmailBrandChrome(houzzat),
  }).html;
  const canaryHtml = renderPriceReductionEmail({
    addressLine: "2 Main St",
    city: "Mississauga",
    mlsNumber: "Y1",
    oldPrice: 800_000,
    newPrice: 775_000,
    listingUrl: "https://tenant-canary.houzzatpro.com/listing/Y1",
    ...toEmailBrandChrome(canary),
  }).html;

  assert.match(houzzatHtml, /Houzzat/);
  assert.match(houzzatHtml, /Houzzat Agent/);
  assert.doesNotMatch(houzzatHtml, /Tenant Canary/);
  assert.doesNotMatch(houzzatHtml, /Canary Agent/);

  assert.match(canaryHtml, /Tenant Canary/);
  assert.match(canaryHtml, /Canary Agent/);
  assert.match(canaryHtml, new RegExp(TENANT_B_TEST_PRIMARY_COLOR, "i"));
  assert.doesNotMatch(canaryHtml, />Houzzat</);
  assert.doesNotMatch(canaryHtml, /Houzzat Agent/);
  assert.doesNotMatch(canaryHtml, /agent@houzzat\.com/);
}

async function testMissingBrandingNeutralFallback() {
  const deps = makeDeps({
    brandingByWs: new Map([["ws_empty", null]]),
    identityByWs: new Map([
      [
        "ws_empty",
        identity("ws_empty", {
          senderDisplayName: "Empty Brokerage Desk",
          contactEmail: "desk@empty.test",
          replyToEmail: "replies@empty.test",
        }),
      ],
    ]),
    agentsByWs: new Map(),
    membership: new Set(),
  });
  const brand = await resolveTenantEmailBrand(
    { workspaceId: "ws_empty" },
    deps,
    {
      TENANT_EMAIL_BRANDING: "on",
      TENANT_EMAIL_BRANDING_WORKSPACE_IDS: "ws_empty",
    },
  );
  assert.ok(brand);
  assert.equal(brand.displayName, "Real Estate");
  assert.notEqual(brand.displayName, "Houzzat");
  assert.equal(brand.agent, null);
  assert.match(brand.signatureText, /Empty Brokerage Desk/);
  assert.equal(brand.replyTo, "replies@empty.test");
  assert.equal(brand.fromOverride, null);
}

async function testCrossTenantAgentRejected() {
  const foreignAgent: TenantEmailAgentIdentity = {
    userId: "agent_houzzat",
    name: "Foreign Agent",
    email: "spy@houzzat.com",
    phone: null,
  };
  const deps = makeDeps({
    brandingByWs: new Map([[CANARY_WS, TENANT_B_TEST_BRANDING_ROW]]),
    identityByWs: new Map([
      [CANARY_WS, identity(CANARY_WS, { replyToEmail: "desk@canary.test" })],
    ]),
    agentsByWs: new Map([
      // Preferred agent id exists on Houzzat only — not a Canary member.
      [`${HOUZZAT_WS}:agent_houzzat`, foreignAgent],
    ]),
    membership: new Set([`${HOUZZAT_WS}:agent_houzzat`]),
  });
  const brand = await resolveTenantEmailBrand(
    {
      workspaceId: CANARY_WS,
      preferredAgentUserId: "agent_houzzat",
    },
    deps,
    {
      TENANT_EMAIL_BRANDING: "on",
      TENANT_EMAIL_BRANDING_WORKSPACE_IDS: CANARY_WS,
    },
  );
  assert.ok(brand);
  assert.equal(brand.agent, null);
  assert.equal(brand.replyTo, "desk@canary.test");
  assert.doesNotMatch(brand.signatureText, /Foreign Agent/);
  assert.doesNotMatch(brand.signatureHtml, /spy@houzzat\.com/);
}

function testInvalidReplyToAndNoFromOverride() {
  assert.equal(isValidReplyToEmail("not-an-email"), false);
  assert.equal(isValidReplyToEmail("ok@example.com"), true);
  const brand = assembleTenantEmailBrand({
    workspaceId: CANARY_WS,
    branding: {
      ...TENANT_B_TEST_BRANDING_ROW,
      contactEmail: "not-valid",
    },
    identity: identity(CANARY_WS, {
      replyToEmail: "also-bad",
      contactEmail: "still-bad",
      domainStatus: "NONE",
      customDomain: "mail.canary.test",
      fallbackFrom: "spoof@canary.test",
    }),
    agent: null,
    websiteUrl: "https://tenant-canary.houzzatpro.com",
  });
  assert.equal(brand.replyTo, null);
  assert.equal(brand.fromOverride, null);
  // Unverified domain must never surface as From.
  assert.equal(brand.fromOverride, null);
}

async function testSuppressionStillBlocks() {
  const store = memoryEmailSuppressionStore();
  await applyEmailSuppression(store, {
    workspaceId: CANARY_WS,
    userId: "user_blocked",
    emailNormalized: "blocked@example.com",
    reason: "HARD_BOUNCE",
    source: "resend",
    providerId: "re_test",
    leadEmailLogId: null,
    meta: null,
  });
  const result = await evaluateOptionalEmailSuppression({
    to: "blocked@example.com",
    kind: "price_reduction",
    workspaceId: CANARY_WS,
    store,
  });
  assert.equal(result.blocked, true);

  const otherTenant = await evaluateOptionalEmailSuppression({
    to: "blocked@example.com",
    kind: "price_reduction",
    workspaceId: HOUZZAT_WS,
    store,
  });
  // MAILBOX suppressions are workspace-scoped — no cross-tenant leakage.
  assert.equal(otherTenant.blocked, false);
}

function testAbsoluteAssetUrl() {
  assert.equal(
    absoluteEmailAssetUrl("/logo.png", "https://canary.example"),
    "https://canary.example/logo.png",
  );
  assert.equal(
    absoluteEmailAssetUrl("https://cdn.example/a.png", "https://canary.example"),
    "https://cdn.example/a.png",
  );
}

function testAgentMessageSubtitleNotHardcodedWhenBranded() {
  const brand = assembleTenantEmailBrand({
    workspaceId: CANARY_WS,
    branding: TENANT_B_TEST_BRANDING_ROW,
    identity: identity(CANARY_WS),
    agent: {
      userId: "a1",
      name: "Canary Agent",
      email: "a@canary.test",
      phone: null,
    },
    websiteUrl: "https://tenant-canary.houzzatpro.com",
  });
  const rendered = renderAgentMessageEmail({
    subject: "Hello",
    body: "Checking in.",
    ...toEmailBrandChrome(brand),
  });
  assert.match(rendered.html, /A message from Canary Agent/);
  assert.doesNotMatch(rendered.html, /your Houzzat agent/);
  assert.match(rendered.html, /Tenant Canary/);
}

function testDigestChromeIsolation() {
  const brand = assembleTenantEmailBrand({
    workspaceId: CANARY_WS,
    branding: TENANT_B_TEST_BRANDING_ROW,
    identity: identity(CANARY_WS),
    agent: null,
    websiteUrl: "https://tenant-canary.houzzatpro.com",
  });
  const rendered = renderSavedSearchDigestEmail({
    searchName: "Condos",
    listings: [
      {
        mlsNumber: "Z1",
        addressLine: "9 Queen",
        city: "Toronto",
        priceLabel: "$700,000",
        listingUrl: "https://tenant-canary.houzzatpro.com/listing/Z1",
      },
    ],
    searchUrl: "https://tenant-canary.houzzatpro.com/search",
    ...toEmailBrandChrome(brand),
  });
  assert.match(rendered.html, /Tenant Canary/);
  assert.match(rendered.html, /tenant-canary\.houzzatpro\.com/);
  assert.doesNotMatch(rendered.html, />Houzzat</);
}

function testWiringAndNoDuplicateSendPaths() {
  const monitors = read("src/lib/account/monitors.ts");
  assert.match(monitors, /resolveTenantEmailBrand/);
  assert.match(monitors, /toEmailBrandChrome/);
  // Still a single send path per branch (no second campaign sender).
  const sendCount = (monitors.match(/sendAndLogClientEmail\(/g) ?? []).length;
  assert.equal(sendCount, 2, "createAlert should keep exactly two send sites");

  const buyer = read("src/lib/email/digests/buyer.ts");
  const seller = read("src/lib/email/digests/seller.ts");
  const agentRoute = read("src/app/api/agent/email/route.ts");
  const shortlist = read("src/lib/agent/send-shortlist-email.ts");
  const cma = read("src/lib/cma/send-cma-email.ts");
  const mobile = read(
    "src/app/api/mobile/v2/leads/[leadId]/conversations/route.ts",
  );
  for (const [name, src] of [
    ["buyer", buyer],
    ["seller", seller],
    ["agent", agentRoute],
    ["shortlist", shortlist],
    ["cma", cma],
    ["mobile", mobile],
  ] as const) {
    assert.match(src, /resolveTenantEmailBrand/, `${name} missing brand resolve`);
  }

  const sendTs = read("src/lib/email/send.ts");
  assert.match(sendTs, /fromForStream/);
  // Branding module must not invent From overrides in send path wiring.
  const brandMod = read("src/lib/email/tenant-email-brand.ts");
  assert.match(brandMod, /fromOverride: null/);
  assert.match(brandMod, /TENANT_EMAIL_BRANDING/);
}

async function main() {
  testFlagDefaultsOff();
  await testFlagOffReturnsNull();
  await testHouzzatVsCanaryIsolation();
  await testMissingBrandingNeutralFallback();
  await testCrossTenantAgentRejected();
  testInvalidReplyToAndNoFromOverride();
  await testSuppressionStillBlocks();
  testAbsoluteAssetUrl();
  testAgentMessageSubtitleNotHardcodedWhenBranded();
  testDigestChromeIsolation();
  testWiringAndNoDuplicateSendPaths();
  console.log("tenant-email-branding-selftest: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
