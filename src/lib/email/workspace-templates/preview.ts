/**
 * Phase 2B — branded preview HTML for the tenant Email Templates manager.
 * Uses only sample data — never real leads from any workspace.
 */

import {
  ctaButton,
  emailLayout,
  escapeHtml,
  infoCard,
} from "@/lib/email/layout";
import {
  applyAllowedTemplateVariables,
  mergeWithSystemDefaults,
} from "@/lib/email/workspace-templates/validation";
import type { WorkspaceEmailTemplateType } from "@prisma/client";
import type { EmailTemplateContentFields } from "@/lib/email/workspace-templates/types";

/** Explicitly synthetic — never loaded from CRM / other tenants. */
export const EMAIL_TEMPLATE_PREVIEW_SAMPLE = {
  recipientName: "Alex Sample",
  agentName: "Jordan Sample",
  tenantName: "Sample Brokerage",
  addressLine: "123 Sample Street",
  city: "Toronto",
  mlsNumber: "SAMPLE123",
  areaName: "Sample Neighbourhood",
  searchName: "Sample saved search",
  listingCount: "3",
  homeLabel: "123 Sample Street",
  newCount: "2",
  soldCount: "1",
  subjectAddress: "123 Sample Street",
  subjectCity: "Toronto",
  headline: "Sample market notes",
  notice: "Sample preview data — not a real lead or listing",
} as const;

export type EmailTemplatePreviewBrand = {
  displayName: string;
  logoUrl: string | null;
  primaryColor: string;
  websiteUrl: string;
  footerNote?: string | null;
};

export type EmailTemplatePreviewMode = "desktop" | "mobile";

function sampleValues(brand: EmailTemplatePreviewBrand) {
  return {
    ...EMAIL_TEMPLATE_PREVIEW_SAMPLE,
    tenantName: brand.displayName || EMAIL_TEMPLATE_PREVIEW_SAMPLE.tenantName,
  };
}

function fill(
  type: WorkspaceEmailTemplateType,
  text: string | null | undefined,
  values: Record<string, string>,
  fallback: string,
): string {
  const raw = text?.trim() || fallback;
  return applyAllowedTemplateVariables(type, raw, values);
}

/**
 * Build escaped preview HTML. Safe for iframe srcDoc.
 * Never includes live lead PII.
 */
export function buildEmailTemplatePreviewHtml(input: {
  templateType: WorkspaceEmailTemplateType;
  content: EmailTemplateContentFields | null;
  brand: EmailTemplatePreviewBrand;
  mode?: EmailTemplatePreviewMode;
}): string {
  const merged = mergeWithSystemDefaults(
    input.templateType,
    input.content,
  );
  const values = sampleValues(input.brand);
  const accent =
    merged.style.primaryColor?.trim() || input.brand.primaryColor || "#0F766E";

  const subject = fill(
    input.templateType,
    merged.subject,
    values,
    "Email preview",
  );
  const intro = fill(
    input.templateType,
    merged.introText,
    values,
    "Introductory text appears here.",
  );
  const cta = fill(
    input.templateType,
    merged.ctaText,
    values,
    "View details",
  );
  const paragraphs = (merged.bodySections.paragraphs ?? []).map((p) =>
    fill(input.templateType, p, values, ""),
  );

  const sampleCard = infoCard(`
    <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#047857;font-weight:700">Sample listing</p>
    <p style="margin:0;font-size:16px;color:#064e3b;font-weight:700">${escapeHtml(values.addressLine)}</p>
    <p style="margin:6px 0 0;font-size:14px;color:#115e59">${escapeHtml(values.city)} · MLS® ${escapeHtml(values.mlsNumber)}</p>
    <p style="margin:10px 0 0;font-size:12px;color:#047857">${escapeHtml(EMAIL_TEMPLATE_PREVIEW_SAMPLE.notice)}</p>
  `);

  const bodyParagraphs = paragraphs
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 12px;color:#115e59;white-space:pre-wrap">${escapeHtml(p)}</p>`,
    )
    .join("");

  const signature = `
    <div style="margin:24px 0 0;padding-top:16px;border-top:1px solid #a7f3d0;font-size:13px;line-height:1.5;color:#115e59">
      <strong style="color:#064e3b">${escapeHtml(values.agentName)}</strong><br/>
      ${escapeHtml(values.tenantName)}<br/>
      <span style="color:#047857">Sample agent signature</span>
    </div>`;

  const width = input.mode === "mobile" ? "390px" : "680px";
  const inner = emailLayout({
    title: subject,
    subtitle: intro,
    preheader: subject,
    brandLabel: input.brand.displayName,
    brandLogoUrl: input.brand.logoUrl,
    brandPrimaryColor: accent,
    brandWebsiteUrl: input.brand.websiteUrl,
    footerNote:
      input.brand.footerNote?.trim() ||
      `${input.brand.displayName} — Powered by HouzzatPRO`,
    preferencesManageUrl: "#sample-preferences",
    unsubscribeIntentUrl: "#sample-unsubscribe",
    bodyHtml: `
      <p style="margin:0 0 10px;padding:8px 10px;border-radius:8px;background:#ecfdf5;border:1px solid #a7f3d0;font-size:12px;color:#047857;font-weight:600">
        ${escapeHtml(EMAIL_TEMPLATE_PREVIEW_SAMPLE.notice)}
      </p>
      <p style="margin:0 0 12px;color:#115e59">Hi ${escapeHtml(values.recipientName)},</p>
      <p style="margin:0 0 12px;color:#115e59">${escapeHtml(intro)}</p>
      ${bodyParagraphs}
      ${sampleCard}
      ${cta ? ctaButton("#sample-cta", cta) : ""}
      ${signature}
    `,
  });

  // Constrain preview frame width for desktop/mobile toggle.
  return inner.replace(
    "max-width:680px",
    `max-width:${width}`,
  );
}
