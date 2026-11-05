/**
 * HIGH OCTANE email presentation. Does not send mail.
 */
import assert from "node:assert/strict";
import { emailLayout } from "@/lib/email/layout";
import {
  HIGH_OCTANE_EMAIL_PREVIEW_GAPS,
  listHighOctaneEmailPreviews,
} from "@/lib/email/high-octane/preview-catalog";
import { renderVerifyEmail } from "@/lib/email/templates";
import { renderOwnerActivationEmail } from "@/lib/platform/activation/email-template";
import { assembleTenantEmailBrand } from "@/lib/email/tenant-email-brand";

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

console.log(`high-octane email presentation selftest ok (${previews.length} previews)`);
