/**
 * Focused selftest: smart inbox preheader resolution + hidden HTML.
 * Run: pnpm exec tsx scripts/email-preheader-selftest.ts
 */
import assert from "node:assert/strict";
import {
  emailLayout,
  escapeHtml,
} from "../src/lib/email/layout";
import {
  EMAIL_PREHEADER_MAX_CHARS,
  formatHiddenEmailPreheaderHtml,
  resolveEmailPreheader,
  stripHtmlToEmailPreviewText,
} from "../src/lib/email/preheader";
import {
  renderAgentMessageEmail,
  renderCmaEmail,
  renderNeighborhoodWeeklyEmail,
  renderPriceReductionEmail,
  renderSavedSearchDigestEmail,
  renderShortlistEmail,
  renderJustListedEmail,
  renderSoldAlertEmail,
} from "../src/lib/email/templates";

function extractHiddenPreheader(html: string): string {
  const match = html.match(
    /display:none[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  );
  assert.ok(match, "expected hidden preheader div");
  return (match[1] ?? "")
    .replace(/&nbsp;|\u00A0|\u200C/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function assertNoVisiblePreheaderLeak(html: string) {
  assert.match(
    html,
    /display:none\s*!important/i,
    "preheader must be display:none !important",
  );
  assert.match(html, /max-height:\s*0/i);
  assert.match(html, /opacity:\s*0/i);
  assert.match(html, /mso-hide:\s*all/i);
  // Visible hero still present after preheader.
  assert.match(html, /<h1[\s\S]*?<\/h1>/i);
  assert.match(html, /data-houzzat-email-footer-signature="1"/);
}

console.log("email-preheader-selftest…");

// --- Pure resolver ---
{
  const subject = "HouzzatPRO – Premium Email Signature Test";
  const body =
    "We're checking the updated email design, agent headshot and contact details.";
  const preview = resolveEmailPreheader({
    explicit: subject,
    subject,
    title: subject,
    brandLabel: "HOUZZAT",
    bodyText: body,
    footerNote: "Ali Syed\nSales Representative\nBrampton, ON",
  });
  assert.equal(preview, body);
  assert.ok(preview.length >= 70 && preview.length <= EMAIL_PREHEADER_MAX_CHARS);
}

{
  const explicit = "123 King St W is now $1,299,000";
  const preview = resolveEmailPreheader({
    explicit,
    subject: "Price reduced · 123 King St W",
    title: "Price reduced",
    bodyText: "A home you’re watching dropped in price.",
  });
  assert.equal(preview, explicit);
}

{
  const preview = resolveEmailPreheader({
    explicit: "Price reduced",
    subject: "Price reduced · 123 King St W",
    title: "Price reduced",
    bodyHtml: "<p>Hi Omer,</p><p>A home you’re watching dropped in price.</p>",
  });
  assert.match(preview, /dropped in price/i);
  assert.doesNotMatch(preview, /^hi\b/i);
}

{
  const html =
    "<p>Hi there,</p><p>Update:&nbsp;beds &amp; baths changed on &lt;listed&gt; home.</p>";
  assert.equal(
    stripHtmlToEmailPreviewText(html).replace(/\s+/g, " ").trim(),
    "Hi there, Update: beds & baths changed on <listed> home.",
  );
  const preview = resolveEmailPreheader({
    subject: "Property update",
    title: "Property update",
    bodyHtml: html,
  });
  assert.match(preview, /beds & baths changed/i);
  assert.doesNotMatch(preview, /&amp;|&nbsp;|<p>/i);
}

{
  const long =
    "This is a deliberately long agent message that keeps going with useful details about the listing tour times, parking notes, and school catchment so the inbox preview must truncate cleanly at a word boundary without cutting mid-word unnecessarily.";
  const preview = resolveEmailPreheader({
    subject: "Tour details",
    title: "Tour details",
    bodyText: long,
  });
  assert.ok(preview.length <= EMAIL_PREHEADER_MAX_CHARS);
  assert.ok(preview.length >= 70);
  assert.ok(!preview.endsWith(" "));
  assert.ok(long.startsWith(preview) || long.startsWith(preview.replace(/\.$/, "")));
}

{
  const preview = resolveEmailPreheader({
    subject: "Empty body mail",
    title: "Empty body mail",
    bodyText: "   ",
    bodyHtml: "",
    subtitle: "A message from Ali Syed.",
    brandLabel: "HOUZZAT",
  });
  assert.equal(preview, "A message from Ali Syed.");
}

{
  const preview = resolveEmailPreheader({
    subject: "Only footer",
    title: "Only footer",
    bodyText: "Ali Syed",
    footerNote: "Ali Syed\nSales Representative",
    brandLabel: "HOUZZAT",
    subtitle: "A message from your Houzzat agent.",
  });
  assert.match(preview, /message from/i);
}

{
  const hidden = formatHiddenEmailPreheaderHtml(
    "We're checking the updated email design.",
    escapeHtml,
  );
  assert.match(hidden, /We&#39;re checking the updated email design\.|We're checking the updated email design\./);
  assert.match(hidden, /\u200C/);
  assert.equal(formatHiddenEmailPreheaderHtml("  ", escapeHtml), "");
}

// --- Agent message (canary shape) ---
{
  const subject = "HouzzatPRO – Premium Email Signature Test";
  const body =
    "We're checking the updated email design, agent headshot and contact details.";
  const rendered = renderAgentMessageEmail({
    name: "Omer",
    subject,
    body,
    brandLabel: "HOUZZAT",
    brandLogoUrl: "https://houzzat.com/images/houzzat-house-mark-dark-green.png",
    brandPrimaryColor: "#047857",
    brandWebsiteUrl: "https://houzzat.com",
    footerNote:
      "Ali Syed\nSales Representative\nRoyal LePage Credit Valley Real Estate\nDirect: 647 - 221 - 4949\nOffice: 905 - 793 - 5000\n1-10045 Hurontario St.\nBrampton, ON, L6Z 0E6",
    footerAgentPhotoUrl:
      "https://branding-assets.houzzatpro.com/workspaces/x/agents/y/profile/z-email-240.png",
    footerAgentPhotoAlt: "Photo of Ali Syed",
    agentFromLabel: "Ali Syed",
    preferencesManageUrl: "https://houzzat.com/account/email-preferences",
    unsubscribeIntentUrl: "https://houzzat.com/unsubscribe",
  });
  assert.equal(rendered.subject, subject);
  const preview = extractHiddenPreheader(rendered.html);
  assert.equal(preview, body);
  assert.notEqual(preview, subject);
  assertNoVisiblePreheaderLeak(rendered.html);
  assert.match(rendered.html, /houzzat-house-mark-dark-green\.png/);
  assert.match(rendered.html, /border-radius:50%/);
  assert.match(rendered.html, /Manage email preferences/);
  assert.match(rendered.html, /Brampton, ON, L6Z 0E6/);
  // Body content preserved.
  assert.match(rendered.html, /updated email design/);
}

// Branding OFF — still gets body-derived preview; no tenant chrome.
{
  const rendered = renderAgentMessageEmail({
    name: "Omer",
    subject: "Quick update",
    body: "Here are the three homes we discussed yesterday afternoon.",
  });
  const preview = extractHiddenPreheader(rendered.html);
  assert.match(preview, /three homes we discussed/i);
  assert.notEqual(preview, "Quick update");
  assert.doesNotMatch(rendered.html, /border-radius:50%/);
  assert.doesNotMatch(rendered.html, /houzzat-house-mark-dark-green/);
}

// --- Other branded types keep meaningful explicit previews ---
{
  const price = renderPriceReductionEmail({
    name: "Omer",
    addressLine: "10 Queen St",
    city: "Toronto",
    mlsNumber: "X123",
    oldPrice: 1_000_000,
    newPrice: 950_000,
    listingUrl: "https://houzzat.com/listings/X123",
    brandLabel: "HOUZZAT",
  });
  const preview = extractHiddenPreheader(price.html);
  assert.match(preview, /10 Queen St/i);
  assert.match(preview, /950/);
  assert.notEqual(preview, price.subject);
}

{
  const sold = renderSoldAlertEmail({
    name: "Omer",
    addressLine: "10 Queen St",
    city: "Toronto",
    mlsNumber: "X123",
    statusLabel: "Sold",
    priceLabel: "$950,000",
    listingUrl: "https://houzzat.com/listings/X123",
    brandLabel: "HOUZZAT",
  });
  assert.match(extractHiddenPreheader(sold.html), /10 Queen St/i);
}

{
  const listed = renderJustListedEmail({
    name: "Omer",
    addressLine: "10 Queen St",
    city: "Toronto",
    mlsNumber: "X123",
    price: 950_000,
    areaName: "Liberty Village",
    listingUrl: "https://houzzat.com/listings/X123",
    brandLabel: "HOUZZAT",
  });
  assert.match(extractHiddenPreheader(listed.html), /10 Queen St/i);
}

{
  const digest = renderSavedSearchDigestEmail({
    name: "Omer",
    searchName: "Condo under 800k",
    listings: [
      {
        mlsNumber: "X1",
        addressLine: "1 Main",
        city: "Toronto",
        priceLabel: "$700,000",
        listingUrl: "https://houzzat.com/listings/X1",
      },
    ],
    searchUrl: "https://houzzat.com/search",
    brandLabel: "HOUZZAT",
  });
  assert.match(extractHiddenPreheader(digest.html), /Condo under 800k/i);
}

{
  const weekly = renderNeighborhoodWeeklyEmail({
    name: "Omer",
    homeLabel: "William Halton Parkway East",
    radiusKm: 1,
    newCount: 2,
    soldCount: 1,
    newListings: [],
    soldListings: [],
    ctaUrl: "https://houzzat.com/seller",
    brandLabel: "HOUZZAT",
  });
  assert.match(extractHiddenPreheader(weekly.html), /William Halton/i);
}

{
  const shortlist = renderShortlistEmail({
    name: "Omer",
    agentName: "Ali Syed",
    shareUrl: "https://houzzat.com/shortlist/abc",
    note: "These three feel closest to your budget and commute.",
    listings: [],
    brandLabel: "HOUZZAT",
  });
  assert.match(extractHiddenPreheader(shortlist.html), /Ali Syed shared a shortlist/i);
}

{
  const cma = renderCmaEmail({
    recipientName: "Omer",
    agentName: "Ali Syed",
    tenantDisplayName: "HOUZZAT",
    subjectAddress: "10 Queen St",
    subjectCity: "Toronto",
    cmaUrl: "https://houzzat.com/cma/1",
    brandLabel: "HOUZZAT",
  });
  assert.match(extractHiddenPreheader(cma.html), /CMA for 10 Queen St/i);
}

// Layout: empty resolve → no preheader div; body/footer unchanged structure.
{
  const html = emailLayout({
    title: "X",
    subject: "X",
    bodyHtml: "<p>Hi</p>",
  });
  // "Hi" alone is too short after salutation strip → may be empty.
  assert.match(html, /<h1[^>]*>X<\/h1>/);
  assert.match(html, /data-houzzat-email-footer-signature="1"/);
}

console.log("email-preheader-selftest: OK");
