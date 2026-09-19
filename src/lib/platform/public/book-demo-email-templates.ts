/**
 * Stage 6.6C — HouzzatPRO platform sales email templates (Book a Demo).
 * Tenant/workspace branding must never be applied.
 */

import { PLATFORM_PRODUCT_NAME } from "@/lib/constants";
import { escapeAttr, escapeHtml } from "@/lib/email/layout";
import type { RenderedEmail } from "@/lib/email/templates";

export const BOOK_DEMO_EMAIL_TAGLINE =
  "Your Complete Real Estate Business Platform";

export const HOUZZATPRO_PUBLIC_ORIGIN = "https://houzzatpro.com";

export function houzzatProEmailLayout(input: {
  preheader: string;
  title: string;
  subtitle?: string;
  bodyHtml: string;
  footerNote?: string;
}): string {
  const subtitle = input.subtitle
    ? `<p style="margin:10px 0 0;font-size:14px;line-height:1.5;color:#a7f3d0">${escapeHtml(input.subtitle)}</p>`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(input.title)}</title>
</head>
<body style="margin:0;padding:0;background:#eef2f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;width:100% !important">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(input.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#eef2f1;padding:24px 12px">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;border-radius:16px;overflow:hidden;background:#ffffff;border:1px solid #d8e0dc">
          <tr>
            <td style="background:#07111f;padding:28px 24px;text-align:left">
              <p style="margin:0;font-size:11px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#6ee7b7">${escapeHtml(PLATFORM_PRODUCT_NAME)}</p>
              <h1 style="margin:12px 0 0;font-size:24px;line-height:1.2;font-weight:700;color:#ffffff;letter-spacing:-0.02em">${escapeHtml(input.title)}</h1>
              ${subtitle}
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px;font-size:15px;line-height:1.6;color:#334155">
              ${input.bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:18px 24px 24px;border-top:1px solid #e2e8f0;background:#f8fafc">
              <p style="margin:0;font-size:13px;font-weight:700;color:#07111f">${escapeHtml(PLATFORM_PRODUCT_NAME)}</p>
              <p style="margin:4px 0 0;font-size:12px;color:#64748b">${escapeHtml(BOOK_DEMO_EMAIL_TAGLINE)}</p>
              <p style="margin:10px 0 0;font-size:12px;color:#64748b">
                <a href="${escapeAttr(HOUZZATPRO_PUBLIC_ORIGIN)}" style="color:#047857;text-decoration:none;font-weight:600">houzzatpro.com</a>
              </p>
              ${
                input.footerNote
                  ? `<p style="margin:12px 0 0;font-size:11px;line-height:1.5;color:#94a3b8">${escapeHtml(input.footerNote)}</p>`
                  : ""
              }
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function houzzatProEmailDetailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:8px 0;border-bottom:1px solid #eef2f7;font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#64748b;width:38%;vertical-align:top">${escapeHtml(label)}</td>
    <td style="padding:8px 0;border-bottom:1px solid #eef2f7;font-size:14px;color:#0f172a;vertical-align:top">${escapeHtml(value)}</td>
  </tr>`;
}

export type BookDemoEmailFields = {
  contactName: string;
  email: string;
  phone: string;
  brokerageName: string;
  teamSize: number;
  website: string | null;
  region: string | null;
  message: string | null;
};

export function buildMasterAdminProspectUrl(prospectId: string): string {
  return `${HOUZZATPRO_PUBLIC_ORIGIN}/platform/prospects/${encodeURIComponent(prospectId)}`;
}

export function renderBookDemoInternalNotificationEmail(input: {
  fields: BookDemoEmailFields;
  prospectId: string;
}): RenderedEmail {
  const { fields, prospectId } = input;
  const adminUrl = buildMasterAdminProspectUrl(prospectId);
  const subject = `New HouzzatPRO Demo Request — ${fields.contactName}`;

  const rows: Array<[string, string]> = [
    ["Contact Name", fields.contactName],
    ["Email", fields.email],
    ["Phone", fields.phone],
    ["Brokerage / Company", fields.brokerageName],
    ["Team Size", String(fields.teamSize)],
  ];
  if (fields.region) rows.push(["Region / City", fields.region]);
  if (fields.website) rows.push(["Website", fields.website]);
  if (fields.message) rows.push(["Message", fields.message]);
  rows.push(["Source", "Website Demo Request"]);

  const textLines = [
    "New HouzzatPRO demo request",
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    `View Prospect in Master Admin: ${adminUrl}`,
  ];

  const html = houzzatProEmailLayout({
    preheader: `New demo request from ${fields.contactName}`,
    title: "New demo request",
    subtitle: BOOK_DEMO_EMAIL_TAGLINE,
    bodyHtml: `
      <p style="margin:0 0 16px">A new HouzzatPRO website demo request was received.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse">
        ${rows.map(([k, v]) => houzzatProEmailDetailRow(k, v)).join("")}
      </table>
      <p style="margin:24px 0 0;text-align:center">
        <a href="${escapeAttr(adminUrl)}" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 18px;border-radius:10px">View Prospect in Master Admin</a>
      </p>
    `,
    footerNote: "Internal HouzzatPRO notification — do not forward externally.",
  });

  return {
    subject,
    text: textLines.join("\n"),
    html,
    kind: "houzzatpro_demo_internal",
  };
}

export function renderBookDemoConfirmationEmail(input: {
  contactName: string;
}): RenderedEmail {
  const name = input.contactName.trim();
  const greet = name ? `Hi ${name},` : "Hi there,";
  const subject = "We received your HouzzatPRO demo request";
  const text = [
    greet,
    "",
    "Thank you for your interest in HouzzatPRO.",
    "",
    "We've received your demo request and our team will review the information you provided and contact you regarding the next steps.",
    "",
    `${PLATFORM_PRODUCT_NAME}`,
    BOOK_DEMO_EMAIL_TAGLINE,
    HOUZZATPRO_PUBLIC_ORIGIN,
  ].join("\n");

  const html = houzzatProEmailLayout({
    preheader: "We've received your HouzzatPRO demo request",
    title: "We've received your request",
    subtitle: BOOK_DEMO_EMAIL_TAGLINE,
    bodyHtml: `
      <p style="margin:0 0 12px">${escapeHtml(greet)}</p>
      <p style="margin:0 0 12px">Thank you for your interest in ${escapeHtml(PLATFORM_PRODUCT_NAME)}.</p>
      <p style="margin:0 0 12px">We've received your demo request and our team will review the information you provided and contact you regarding the next steps.</p>
      <p style="margin:20px 0 0;font-size:13px;color:#64748b">
        Learn more at
        <a href="${escapeAttr(HOUZZATPRO_PUBLIC_ORIGIN)}" style="color:#047857;font-weight:600;text-decoration:none">houzzatpro.com</a>.
      </p>
    `,
  });

  return {
    subject,
    text,
    html,
    kind: "houzzatpro_demo_confirmation",
  };
}
