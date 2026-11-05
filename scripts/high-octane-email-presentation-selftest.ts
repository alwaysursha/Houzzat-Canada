/**
 * HIGH OCTANE email presentation. Does not send mail.
 */
import assert from "node:assert/strict";
import { emailLayout } from "@/lib/email/layout";
import { localHighOctaneEmailPreviewAllowed } from "@/lib/email/high-octane/local-preview-access";
import {
  assembleTenantEmailBrand,
  resolveLeadCustomerEmailChrome,
  toEmailBrandChrome,
  type TenantEmailAgentIdentity,
  type TenantEmailBrandDeps,
} from "@/lib/email/tenant-email-brand";
import { renderPriceReductionEmail, renderVerifyEmail } from "@/lib/email/templates";
import {
  HIGH_OCTANE_EMAIL_PREVIEW_GAPS,
  listHighOctaneEmailPreviews,
} from "@/lib/email/high-octane/preview-catalog";
import { renderOwnerActivationEmail } from "@/lib/platform/activation/email-template";

const mint = emailLayout({
  title: "Hello",
  bodyHtml: "<p>Houzzat body</p>",
  brandLabel: "Canary Realty",
});
assert.match(mint, /background:#e8f5f0/);
assert.equal(mint.includes('data-email-presentation="high-octane"'), false);
assert.equal(mint.includes("#071629"), false);

const royal = emailLayout({
  title: "Hello",
  bodyHtml: `<p style="color:#115e59">Sample &lt;script&gt;</p>`,
  presentation: "high-octane",
  brandLabel: "HIGH OCTANE",
  brandWebsiteUrl: "https://high-octane-real-estate.houzzatpro.com",
});
assert.match(royal, /data-email-presentation="high-octane"/);
assert.match(royal, /#071629/);
assert.match(royal, /#C8A66A/);
assert.match(royal, /#F4EFE6/);
assert.match(royal, /border-radius:0/);
assert.equal(royal.includes("border-radius:20px"), false);
assert.match(royal, /Powered by HouzzatPRO\.com/);
assert.match(royal, /high-octane-real-estate\.houzzatpro\.com/);

const escaped = renderVerifyEmail({
  name: `<img src=x onerror=alert(1)>`,
  verifyUrl: "https://high-octane-real-estate.houzzatpro.com/auth/verify-email?token=preview-invalid",
  chrome: {
    presentation: "high-octane",
    brandLabel: "HIGH OCTANE",
    brandWebsiteUrl: "https://high-octane-real-estate.houzzatpro.com",
  },
});
assert.equal(escaped.html.includes("<img src=x"), false);
assert.match(escaped.html, /&lt;img/);
assert.equal(escaped.subject.includes("HIGH OCTANE"), true);
assert.equal(escaped.html.includes("Houzzat experience"), false);

const otherTenant = renderVerifyEmail({
  name: "Alex",
  verifyUrl: "https://example.com/verify",
});
assert.match(otherTenant.html, /background:#e8f5f0/);
assert.match(otherTenant.subject, /Houzzat/);
assert.equal(otherTenant.html.includes("#071629"), false);

const platformOwner = renderOwnerActivationEmail({
  workspaceName: "Canary Realty",
  activationUrl: "https://example.com/activate",
  expiresAt: new Date("2026-12-01T00:00:00.000Z"),
});
assert.match(platformOwner.html, /border-radius:12px/);
assert.equal(platformOwner.html.includes('data-email-presentation="high-octane"'), false);

const otherBrand = assembleTenantEmailBrand({
  workspaceId: "ws_other",
  branding: null,
  identity: null,
  agent: null,
  websiteUrl: "https://example.com",
  workspaceSlug: "canary",
});
assert.equal(otherBrand.presentation, null);
assert.equal(otherBrand.fromOverride, null);

const highOctaneBrand = assembleTenantEmailBrand({
  workspaceId: "ws_high_octane",
  branding: null,
  identity: null,
  agent: null,
  websiteUrl: "https://high-octane-real-estate.houzzatpro.com",
  workspaceSlug: "high-octane-real-estate",
});
assert.equal(highOctaneBrand.presentation, "high-octane");
assert.equal(highOctaneBrand.fromOverride, null);

const previews = listHighOctaneEmailPreviews();
assert.ok(previews.length >= 15);
const joined = previews.map((item) => `${item.subject}\n${item.html}`).join("\n");
assert.equal(joined.includes("saad@"), false);
assert.equal(joined.includes("staging-owner@"), false);
assert.equal(joined.includes("RESEND"), false);
assert.match(joined, /example\.invalid|preview-invalid|Alex Sample/);
for (const item of previews) {
  assert.match(item.html, /data-email-presentation="high-octane"/);
  assert.match(item.html, /max-width:600px/);
}
assert.ok(HIGH_OCTANE_EMAIL_PREVIEW_GAPS.some((gap) => /inquiry confirmation/i.test(gap)));
assert.ok(HIGH_OCTANE_EMAIL_PREVIEW_GAPS.some((gap) => /chat message/i.test(gap)));
assert.ok(HIGH_OCTANE_EMAIL_PREVIEW_GAPS.some((gap) => /payment/i.test(gap)));

const localEnv = {
  NODE_ENV: "development",
  HIGH_OCTANE_STAGING: "1",
} as NodeJS.ProcessEnv;
assert.equal(
  localHighOctaneEmailPreviewAllowed({ env: localEnv, host: "localhost:3010" }),
  true,
);
assert.equal(
  localHighOctaneEmailPreviewAllowed({ env: localEnv, host: "127.0.0.1:3010" }),
  true,
);
assert.equal(
  localHighOctaneEmailPreviewAllowed({
    env: { ...localEnv, VERCEL_ENV: "preview" },
    host: "localhost:3010",
  }),
  false,
);
assert.equal(
  localHighOctaneEmailPreviewAllowed({
    env: { ...localEnv, VERCEL_ENV: "production", VERCEL: "1" },
    host: "localhost:3010",
  }),
  false,
);
assert.equal(
  localHighOctaneEmailPreviewAllowed({
    env: { ...localEnv, NODE_ENV: "production" },
    host: "localhost:3010",
  }),
  false,
);
assert.equal(
  localHighOctaneEmailPreviewAllowed({
    env: { ...localEnv, HIGH_OCTANE_STAGING: "0" },
    host: "localhost:3010",
  }),
  false,
);
assert.equal(
  localHighOctaneEmailPreviewAllowed({ env: localEnv, host: "localhost:3000" }),
  false,
);
assert.equal(
  localHighOctaneEmailPreviewAllowed({
    env: localEnv,
    host: "high-octane-real-estate.houzzatpro.com",
  }),
  false,
);
assert.equal(
  localHighOctaneEmailPreviewAllowed({
    env: localEnv,
    host: "localhost:3010",
    forwardedHost: "high-octane-real-estate.houzzatpro.com",
  }),
  false,
);

function previewAgent(name: string, userId: string): TenantEmailAgentIdentity {
  return {
    userId,
    name,
    email: `${userId}@example.invalid`,
    phone: "(000) 555-0199",
    image: null,
    designation: null,
  };
}

function signatureDeps(
  assignee: TenantEmailAgentIdentity | null,
): TenantEmailBrandDeps {
  return {
    loadBranding: async () => null,
    loadEmailIdentity: async () => null,
    loadProfessionalIdentity: async () => ({
      brokerageRegisteredName: "Right at Home Realty Brokerage",
    }),
    loadAgentInWorkspace: async () => {
      throw new Error("logged-in agent must not be used");
    },
    loadAssignedAgentForLead: async () => assignee,
    loadAssignedAgentForCustomer: async () => null,
    loadAgentEmailHeadshotAssociation: async () => null,
    resolveWebsiteUrl: async () => "https://houzzat.com",
    loadWorkspaceSlug: async () => "houzzat",
  };
}

async function assertAssignedAgentSignatures() {
const agentA = previewAgent("Agent A", "agent-a");
const agentB = previewAgent("Agent B", "agent-b");
const listing = {
  name: "Alex Sample",
  addressLine: "123 Sample Street",
  city: "Toronto",
  mlsNumber: "PREVIEW",
  oldPrice: 900_000,
  newPrice: 850_000,
  listingUrl: "https://houzzat.com/sample/listing/PREVIEW",
};

const houzzatA = await resolveLeadCustomerEmailChrome(
  { workspaceId: "ws-houzzat", leadId: "lead-a" },
  signatureDeps(agentA),
  {},
);
const houzzatB = await resolveLeadCustomerEmailChrome(
  { workspaceId: "ws-houzzat", leadId: "lead-b" },
  signatureDeps(agentB),
  {},
);
const houzzatNone = await resolveLeadCustomerEmailChrome(
  { workspaceId: "ws-houzzat", leadId: "lead-none" },
  signatureDeps(null),
  {},
);
assert.ok(houzzatA && houzzatB && houzzatNone);
assert.equal(houzzatA.chrome.brandLabel, undefined);
assert.equal(houzzatA.chrome.presentation, undefined);
assert.match(houzzatA.chrome.agentSignatureHtml ?? "", /Agent A/);
assert.doesNotMatch(houzzatA.chrome.agentSignatureHtml ?? "", /Agent B/);
assert.match(houzzatB.chrome.agentSignatureHtml ?? "", /Agent B/);
assert.doesNotMatch(houzzatB.chrome.agentSignatureHtml ?? "", /Agent A/);
assert.doesNotMatch(houzzatNone.chrome.agentSignatureHtml ?? "", /Agent A/);
assert.doesNotMatch(houzzatNone.chrome.agentSignatureHtml ?? "", /Agent B/);

const houzzatHtml = renderPriceReductionEmail({
  ...listing,
  ...houzzatA.chrome,
});
assert.match(houzzatHtml.html, /background:#e8f5f0/);
assert.match(houzzatHtml.html, /data-houzzat-agent-signature="1"/);
assert.match(houzzatHtml.html, /Agent A/);
assert.equal(houzzatHtml.html.includes('data-email-presentation="high-octane"'), false);

const saadBrand = assembleTenantEmailBrand({
  workspaceId: "ws-high-octane",
  branding: null,
  identity: null,
  agent: previewAgent("Saad Sample", "saad-sample"),
  websiteUrl: "https://high-octane-real-estate.houzzatpro.com",
  brokerageRegisteredName: "Right at Home Realty Brokerage",
  workspaceSlug: "high-octane-real-estate",
});
const reassigned = assembleTenantEmailBrand({
  workspaceId: "ws-high-octane",
  branding: null,
  identity: null,
  agent: agentB,
  websiteUrl: "https://high-octane-real-estate.houzzatpro.com",
  brokerageRegisteredName: "Right at Home Realty Brokerage",
  workspaceSlug: "high-octane-real-estate",
});
const saadHtml = renderPriceReductionEmail({
  ...listing,
  ...toEmailBrandChrome(saadBrand),
});
const reassignedHtml = renderPriceReductionEmail({
  ...listing,
  ...toEmailBrandChrome(reassigned),
});
assert.match(saadHtml.html, /data-email-presentation="high-octane"/);
assert.match(saadHtml.html, /Saad Sample/);
assert.doesNotMatch(saadHtml.html, /Agent B/);
assert.match(reassignedHtml.html, /data-email-presentation="high-octane"/);
assert.match(reassignedHtml.html, /Agent B/);
assert.doesNotMatch(reassignedHtml.html, /Saad Sample/);
assert.equal(renderVerifyEmail({
  name: "Alex Sample",
  verifyUrl: "https://houzzat.com/verify",
}).html.includes("data-houzzat-agent-signature"), false);

const pricePreview = previews.find((item) => item.id === "price-reduction");
const verifyPreview = previews.find((item) => item.id === "verify");
assert.match(pricePreview?.html ?? "", /Jordan Sample/);
assert.doesNotMatch(pricePreview?.html ?? "", /Alex Owner/);
assert.equal(
  (pricePreview?.html.match(/data-houzzat-agent-signature="1"/g) ?? []).length,
  1,
);
assert.equal(verifyPreview?.personalSignature, false);
assert.equal(
  (verifyPreview?.html ?? "").includes("data-houzzat-agent-signature"),
  false,
);

console.log(`high-octane email presentation selftest ok (${previews.length} previews)`);
}

assertAssignedAgentSignatures();
