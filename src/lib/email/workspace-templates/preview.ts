/**
 * Phase 2D-1 — accurate tenant email preview via production renderers.
 *
 * SERVER-ONLY: imports live email templates which transitively load Prisma.
 * Admin UI must call /api/admin/email-templates/[type]/preview — never import
 * this module from a Client Component.
 *
 * Preview HTML is built by calling the same render* functions used for live
 * sends, with deterministic sample data and sparse draft/published fields.
 * Never loads CRM leads or cross-tenant records.
 *
 * Remaining differences (documented, not redesigned here):
 * - Preview-only subject bar + HTML comment watermark (live subjects live in
 *   the email headers, not the HTML body for most templates).
 * - Desktop/mobile width constraint for the iframe frame.
 * - NEWSLETTER has no live sparse cutover yet — preview fills via defaults +
 *   renderNewsletterEmail (campaign product not wired; no tenant brand chrome).
 * - Sample listing images use a static placeholder URL (not MLS media).
 * - Registry defaults appear only as editor placeholders; blank fields preview
 *   event-specific live fallbacks (same sparse semantics as Save/Publish).
 */

import {
  renderAgentMessageEmail,
  renderCmaEmail,
  renderJustListedEmail,
  renderNeighborhoodWeeklyEmail,
  renderNewsletterEmail,
  renderPriceReductionEmail,
  renderPropertyUpdateEmail,
  renderSavedSearchDigestEmail,
  renderShortlistEmail,
  renderSoldAlertEmail,
  type DigestListingLine,
} from "@/lib/email/templates";
import { escapeHtml } from "@/lib/email/layout";
import { applyAllowedTemplateVariables } from "@/lib/email/workspace-templates/validation";
import {
  defaultEmailTemplatePreviewVariant,
  EMAIL_TEMPLATE_PREVIEW_SAMPLE,
  listEmailTemplatePreviewVariants,
  type EmailTemplatePreviewBrand,
  type EmailTemplatePreviewMode,
  type EmailTemplatePreviewVariantId,
} from "@/lib/email/workspace-templates/preview-catalog";
import type { WorkspaceEmailTemplateType } from "@/lib/email/workspace-templates/types";
import type { EmailTemplateContentFields } from "@/lib/email/workspace-templates/types";

export {
  defaultEmailTemplatePreviewVariant,
  EMAIL_TEMPLATE_PREVIEW_SAMPLE,
  isEmailTemplatePreviewVariantId,
  listEmailTemplatePreviewVariants,
} from "@/lib/email/workspace-templates/preview-catalog";
export type {
  EmailTemplatePreviewBrand,
  EmailTemplatePreviewMode,
  EmailTemplatePreviewVariant,
  EmailTemplatePreviewVariantId,
} from "@/lib/email/workspace-templates/preview-catalog";

function sampleListing(overrides?: Partial<DigestListingLine>): DigestListingLine {
  return {
    mlsNumber: EMAIL_TEMPLATE_PREVIEW_SAMPLE.mlsNumber,
    addressLine: EMAIL_TEMPLATE_PREVIEW_SAMPLE.addressLine,
    city: EMAIL_TEMPLATE_PREVIEW_SAMPLE.city,
    priceLabel: "$849,000",
    listingUrl: EMAIL_TEMPLATE_PREVIEW_SAMPLE.listingUrl,
    imageUrl: EMAIL_TEMPLATE_PREVIEW_SAMPLE.imageUrl,
    bedsLabel: "3",
    bathsLabel: "2",
    sqftLabel: "1,450 sqft",
    isNew: true,
    ...overrides,
  };
}

function brandChrome(brand: EmailTemplatePreviewBrand) {
  const agent = EMAIL_TEMPLATE_PREVIEW_SAMPLE.agentName;
  const tenant =
    brand.displayName?.trim() || EMAIL_TEMPLATE_PREVIEW_SAMPLE.tenantName;
  return {
    brandLabel: tenant,
    brandLogoUrl: brand.logoUrl,
    brandPrimaryColor: brand.primaryColor || "#0F766E",
    brandWebsiteUrl: brand.websiteUrl,
    footerNote:
      brand.footerNote?.trim() || `${tenant} — Powered by HouzzatPRO`,
    agentFromLabel: agent,
    agentSignatureHtml: `<strong style="color:#064e3b">${escapeHtml(agent)}</strong><br/>${escapeHtml(tenant)}<br/><span style="color:#047857">Sample agent signature</span>`,
    agentSignatureText: `${agent}\n${tenant}\nSample agent signature`,
  };
}

function preferenceChrome() {
  return {
    preferencesManageUrl: EMAIL_TEMPLATE_PREVIEW_SAMPLE.preferencesManageUrl,
    unsubscribeIntentUrl: EMAIL_TEMPLATE_PREVIEW_SAMPLE.unsubscribeIntentUrl,
  };
}

/**
 * Preview-only chrome: live renderers often keep the email subject outside
 * the HTML body (inbox header). Surface it here so admins see the real subject.
 */
function withPreviewChrome(subject: string, html: string): string {
  const subjectBar = `<div data-preview-subject="1" data-preview-chrome="subject" style="margin:0;padding:10px 14px;background:#fffbeb;border-bottom:1px solid #fcd34d;font:12px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#92400e"><strong style="color:#78350f">Preview subject line</strong> <span style="font-weight:500">(inbox header only — not part of the email body)</span><br/><span style="color:#78350f">${escapeHtml(subject)}</span></div>`;
  const marked = html.includes(EMAIL_TEMPLATE_PREVIEW_SAMPLE.notice)
    ? html
    : html.replace(
        "<body",
        `<!-- ${EMAIL_TEMPLATE_PREVIEW_SAMPLE.notice} -->\n<body`,
      );
  return marked.replace(/<body([^>]*)>/i, `<body$1>${subjectBar}`);
}

function applyPreviewFrame(
  subject: string,
  html: string,
  mode?: EmailTemplatePreviewMode,
): string {
  const width = mode === "mobile" ? "390px" : "680px";
  return withPreviewChrome(subject, html).replace(
    "max-width:680px",
    `max-width:${width}`,
  );
}

function resolveVariant(
  templateType: WorkspaceEmailTemplateType,
  variant?: EmailTemplatePreviewVariantId | null,
): EmailTemplatePreviewVariantId {
  const allowed = listEmailTemplatePreviewVariants(templateType);
  if (variant && allowed.some((v) => v.id === variant)) return variant;
  return defaultEmailTemplatePreviewVariant(templateType);
}

/**
 * Build escaped preview HTML from production renderers. Safe for iframe srcDoc.
 * `content` is the current editor draft (sparse) — never writes or publishes.
 */
export function buildEmailTemplatePreviewHtml(input: {
  templateType: WorkspaceEmailTemplateType;
  content: EmailTemplateContentFields | null;
  brand: EmailTemplatePreviewBrand;
  mode?: EmailTemplatePreviewMode;
  variant?: EmailTemplatePreviewVariantId | null;
}): string {
  const variant = resolveVariant(input.templateType, input.variant);
  const chrome = brandChrome(input.brand);
  const prefs = preferenceChrome();
  const sparse = input.content;
  const sample = EMAIL_TEMPLATE_PREVIEW_SAMPLE;
  const name = sample.recipientName;

  let rendered: { subject: string; html: string };

  switch (variant) {
    case "price_reduction": {
      rendered = renderPriceReductionEmail({
        name,
        addressLine: sample.addressLine,
        city: sample.city,
        mlsNumber: sample.mlsNumber,
        oldPrice: sample.oldPrice,
        newPrice: sample.newPrice,
        listingUrl: sample.listingUrl,
        imageUrl: sample.imageUrl,
        bedsLabel: "3",
        bathsLabel: "2",
        sqftLabel: "1,450 sqft",
        ...prefs,
        ...chrome,
        publishedTemplate: sparse,
      });
      break;
    }
    case "sold": {
      rendered = renderSoldAlertEmail({
        name,
        addressLine: sample.addressLine,
        city: sample.city,
        mlsNumber: sample.mlsNumber,
        statusLabel: "Sold",
        priceLabel: "$849,000",
        listingUrl: sample.listingUrl,
        imageUrl: sample.imageUrl,
        bedsLabel: "3",
        bathsLabel: "2",
        sqftLabel: "1,450 sqft",
        ...prefs,
        ...chrome,
        publishedTemplate: sparse,
        publishedAreaWatchTemplate: null,
      });
      break;
    }
    case "property_update": {
      rendered = renderPropertyUpdateEmail({
        name,
        title: "Status / details updated",
        addressLine: sample.addressLine,
        city: sample.city,
        mlsNumber: sample.mlsNumber,
        changes: [
          "Sample change: status updated",
          "Sample change: photos refreshed",
        ],
        listingUrl: sample.listingUrl,
        imageUrl: sample.imageUrl,
        bedsLabel: "3",
        bathsLabel: "2",
        sqftLabel: "1,450 sqft",
        ...prefs,
        ...chrome,
        publishedTemplate: sparse,
      });
      break;
    }
    case "just_listed": {
      rendered = renderJustListedEmail({
        name,
        areaName: sample.areaName,
        addressLine: sample.addressLine,
        city: sample.city,
        mlsNumber: sample.mlsNumber,
        price: sample.listPrice,
        listingUrl: sample.listingUrl,
        imageUrl: sample.imageUrl,
        bedsLabel: "3",
        bathsLabel: "2",
        sqftLabel: "1,450 sqft",
        ...prefs,
        ...chrome,
        publishedAreaWatchTemplate: sparse,
      });
      break;
    }
    case "area_sold": {
      rendered = renderSoldAlertEmail({
        name,
        addressLine: sample.addressLine,
        city: sample.city,
        mlsNumber: sample.mlsNumber,
        statusLabel: "Sold",
        priceLabel: "$849,000",
        listingUrl: sample.listingUrl,
        areaName: sample.areaName,
        imageUrl: sample.imageUrl,
        bedsLabel: "3",
        bathsLabel: "2",
        sqftLabel: "1,450 sqft",
        ...prefs,
        ...chrome,
        publishedTemplate: null,
        publishedAreaWatchTemplate: sparse,
      });
      break;
    }
    case "buyer_digest": {
      rendered = renderSavedSearchDigestEmail({
        name,
        searchName: sample.searchName,
        listings: [
          sampleListing(),
          sampleListing({
            mlsNumber: "SAMPLE124",
            addressLine: "45 Sample Avenue",
            priceLabel: "$725,000",
            listingUrl: "https://example.com/sample/listing/SAMPLE124",
          }),
          sampleListing({
            mlsNumber: "SAMPLE125",
            addressLine: "9 Sample Court",
            priceLabel: "$990,000",
            listingUrl: "https://example.com/sample/listing/SAMPLE125",
            isNew: false,
          }),
        ],
        searchUrl: sample.searchUrl,
        ...prefs,
        ...chrome,
        publishedSavedSearchDigestTemplate: sparse,
      });
      break;
    }
    case "seller_digest": {
      rendered = renderNeighborhoodWeeklyEmail({
        name,
        homeLabel: sample.homeLabel,
        radiusKm: 2,
        newCount: Number(sample.newCount),
        soldCount: Number(sample.soldCount),
        medianSoldLabel: "$875,000",
        newListings: [sampleListing()],
        soldListings: [
          sampleListing({
            mlsNumber: "SAMPLE200",
            addressLine: "77 Sample Road",
            priceLabel: "$875,000",
            badgeLabel: "Sold",
            isNew: false,
          }),
        ],
        ctaUrl: sample.ctaUrl,
        ...prefs,
        ...chrome,
        publishedSellerNeighbourhoodDigestTemplate: sparse,
      });
      break;
    }
    case "agent_email": {
      // Agent-authored subject/body always win — sample demonstrates precedence.
      rendered = renderAgentMessageEmail({
        name,
        subject: sample.agentSubject,
        body: sample.agentBody,
        ...prefs,
        ...chrome,
        publishedAgentEmailTemplate: sparse,
      });
      break;
    }
    case "shortlist": {
      rendered = renderShortlistEmail({
        name,
        agentName: sample.agentName,
        shareUrl: sample.shareUrl,
        note: sample.agentNote,
        listings: [
          sampleListing(),
          sampleListing({
            mlsNumber: "SAMPLE301",
            addressLine: "18 Sample Lane",
            priceLabel: "$650,000",
          }),
        ],
        ...prefs,
        ...chrome,
        publishedShortlistTemplate: sparse,
      });
      break;
    }
    case "cma_share": {
      rendered = renderCmaEmail({
        recipientName: name,
        agentName: sample.agentName,
        agentEmail: sample.agentEmail,
        agentPhone: sample.agentPhone,
        tenantDisplayName: chrome.brandLabel,
        tenantPrimaryColor: chrome.brandPrimaryColor,
        subjectAddress: sample.subjectAddress,
        subjectCity: sample.subjectCity,
        cmaUrl: sample.cmaUrl,
        recommendedListPrice: sample.recommendedListPrice,
        ...prefs,
        ...chrome,
        publishedCmaShareTemplate: sparse,
      });
      break;
    }
    case "newsletter": {
      // No live sparse cutover — fill from content/defaults for preview only.
      const values = {
        recipientName: sample.recipientName,
        tenantName: chrome.brandLabel,
        agentName: sample.agentName,
        headline: sample.headline,
      };
      const fill = (text: string | null | undefined, fallback: string) => {
        const raw = text?.trim() || fallback;
        return applyAllowedTemplateVariables("NEWSLETTER", raw, values);
      };
      const subject = fill(sparse?.subject, "Sample market update");
      const intro = fill(
        sparse?.introText,
        "Fresh market notes from your local team.",
      );
      const cta = fill(sparse?.ctaText, "Read more");
      const paragraphs = (sparse?.bodySections.paragraphs ?? [])
        .map((p) => fill(p, ""))
        .filter(Boolean);
      const bodyHtml = [
        `<p style="margin:0 0 12px;color:#115e59">${escapeHtml(intro)}</p>`,
        ...paragraphs.map(
          (p) =>
            `<p style="margin:0 0 12px;color:#115e59;white-space:pre-wrap">${escapeHtml(p)}</p>`,
        ),
      ].join("");
      rendered = renderNewsletterEmail({
        name,
        subject,
        headline: sample.headline,
        bodyHtml,
        ctaUrl: "#sample-cta",
        ctaLabel: cta,
        ...prefs,
      });
      break;
    }
    default: {
      const _exhaustive: never = variant;
      void _exhaustive;
      rendered = renderAgentMessageEmail({
        name,
        subject: sample.agentSubject,
        body: sample.agentBody,
        ...prefs,
        ...chrome,
      });
      break;
    }
  }

  return applyPreviewFrame(rendered.subject, rendered.html, input.mode);
}
