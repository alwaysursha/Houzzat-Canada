import { SITE_NAME, SITE_URL } from "@/lib/constants";
import {
  formatHiddenEmailPreheaderHtml,
  resolveEmailPreheader,
} from "@/lib/email/preheader";

export const EMAIL_MINT_GRADIENT =
  "linear-gradient(160deg,#ecfdf5 0%,#a7f3d0 48%,#6ee7b7 100%)";

/** Dark-green house mark — readable on the mint hero (white mark is not). */
export const EMAIL_HERO_HOUSE_MARK_DARK_GREEN_PATH =
  "/images/houzzat-house-mark-dark-green.png" as const;

const FOOTER_PHOTO_PX = 72;
const FOOTER_SIGNATURE_MARKER = 'data-houzzat-email-footer-signature="1"';

/**
 * Prefer the dark-green Houzzat house mark in email heroes.
 * The stock white mark disappears on the mint gradient.
 */
export function resolveEmailHeroLogoUrl(
  logoUrl: string | null | undefined,
): string | null {
  const raw = logoUrl?.trim();
  if (!raw) return null;
  if (/dark-green/i.test(raw)) return raw;
  if (/houzzat-house-mark\.png(\?|#|$)/i.test(raw)) {
    return raw.replace(
      /houzzat-house-mark\.png/i,
      "houzzat-house-mark-dark-green.png",
    );
  }
  return raw;
}

export function emailLayout(input: {
  /**
   * Preferred inbox preview. When missing or an echo of subject/title,
   * a short preview is derived from body text/HTML (then subtitle).
   */
  preheader?: string | null;
  /** Inbox subject — used only to avoid duplicating it in the preview. */
  subject?: string | null;
  /** Optional plain body used before HTML stripping for higher-quality previews. */
  preheaderBodyText?: string | null;
  title: string;
  /** Optional line under the hero title. */
  subtitle?: string | null;
  bodyHtml: string;
  footerNote?: string | null;
  /** Circular agent headshot beside the legal footer (branded mail). */
  footerAgentPhotoUrl?: string | null;
  /** Alt text for footerAgentPhotoUrl. */
  footerAgentPhotoAlt?: string | null;
  unsubscribeUrl?: string | null;
  preferencesManageUrl?: string | null;
  /** Presentation-only GET intent. Must not be a mutating endpoint. */
  unsubscribeIntentUrl?: string | null;
  /** Tenant/workspace brand label for hero (defaults to SITE_NAME). */
  brandLabel?: string | null;
  /** Absolute tenant logo URL when available. */
  brandLogoUrl?: string | null;
  /** Tenant primary accent for hero text (optional). */
  brandPrimaryColor?: string | null;
  /** Tenant public website origin (footer link). Defaults to SITE_URL. */
  brandWebsiteUrl?: string | null;
}): string {
  const brandLabel = input.brandLabel?.trim() || SITE_NAME;
  const brandColor = input.brandPrimaryColor?.trim() || "#047857";
  const websiteUrl = input.brandWebsiteUrl?.trim() || SITE_URL;
  const websiteHost = websiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const heroLogoUrl = resolveEmailHeroLogoUrl(input.brandLogoUrl);
  // Compact mark above the textmark — left-aligned with the headline block.
  const logo = heroLogoUrl
    ? `<img src="${escapeAttr(heroLogoUrl)}" alt="${escapeHtml(brandLabel)}" width="48" height="48" style="display:block;width:48px;height:48px;max-width:48px;margin:0 0 8px;border:0;padding:0" />`
    : "";
  const resolvedPreheader = resolveEmailPreheader({
    explicit: input.preheader,
    subject: input.subject,
    title: input.title,
    subtitle: input.subtitle,
    brandLabel,
    footerNote: input.footerNote,
    bodyText: input.preheaderBodyText,
    bodyHtml: input.bodyHtml,
  });
  const preheader = formatHiddenEmailPreheaderHtml(
    resolvedPreheader,
    escapeHtml,
  );
  const unsub = input.preferencesManageUrl
    ? `<p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:#047857">
         <a href="${escapeAttr(input.preferencesManageUrl)}" style="color:#047857;text-decoration:underline">Manage email preferences</a>
         ${
           input.unsubscribeIntentUrl
             ? ` · <a href="${escapeAttr(input.unsubscribeIntentUrl)}" style="color:#047857;text-decoration:underline">Unsubscribe</a>`
             : ""
         }
       </p>`
    : input.unsubscribeUrl
      ? `<p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:#047857">
         <a href="${escapeAttr(input.unsubscribeUrl)}" style="color:#047857;text-decoration:underline">Unsubscribe / email preferences</a>
       </p>`
      : "";
  const subtitle = input.subtitle?.trim()
    ? `<p style="margin:8px 0 0;font-size:15px;line-height:1.5;color:#115e59">${escapeHtml(input.subtitle.trim())}</p>`
    : "";
  const footerHtml = formatEmailFooterNoteHtml(input.footerNote);
  const footerBlock = formatEmailFooterSignatureHtml({
    footerNoteHtml: footerHtml,
    photoUrl: input.footerAgentPhotoUrl,
    photoAlt: input.footerAgentPhotoAlt,
    websiteUrl,
    websiteHost,
    unsubHtml: unsub,
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(input.title)}</title>
  <!--[if mso]><style>table,td{font-family:Arial,sans-serif!important}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background:#e8f5f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;width:100% !important">
  ${preheader}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#e8f5f0;padding:20px 12px">
    <tr>
      <td align="center" style="padding:0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:680px;border-radius:20px;overflow:hidden;background:#ecfdf5;background-image:${EMAIL_MINT_GRADIENT};border:1px solid #a7f3d0">
          <tr>
            <td align="left" style="width:100%;background:#d1fae5;background-image:${EMAIL_MINT_GRADIENT};padding:20px 24px 16px;text-align:left;border-radius:20px 20px 0 0">
              ${logo}
              <p style="margin:0;font-size:11px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;color:${escapeAttr(brandColor)}">${escapeHtml(brandLabel)}</p>
              <h1 style="margin:8px 0 0;font-size:28px;line-height:1.15;font-weight:800;color:#064e3b;letter-spacing:-0.02em">${escapeHtml(input.title)}</h1>
              ${subtitle}
            </td>
          </tr>
          <tr>
            <td style="width:100%;background:rgba(236,253,245,0.92);padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.55;color:#115e59">
              ${input.bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="width:100%;background:#a7f3d0;background-image:linear-gradient(160deg,#a7f3d0 0%,#6ee7b7 100%);padding:20px 24px;border-top:1px solid #6ee7b7;border-radius:0 0 20px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
              ${footerBlock}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Sole branded signature/footer: optional circular headshot + full legal text,
 * then website + preferences/unsubscribe.
 */
function formatEmailFooterSignatureHtml(input: {
  footerNoteHtml: string;
  photoUrl?: string | null;
  photoAlt?: string | null;
  websiteUrl: string;
  websiteHost: string;
  unsubHtml: string;
}): string {
  const photo = input.photoUrl?.trim();
  const photoAlt = input.photoAlt?.trim() || "Agent photo";
  const legalColumn = `
    <p style="margin:0;font-size:13px;line-height:1.5;font-weight:600;color:#064e3b">
      ${input.footerNoteHtml}
    </p>
    <p style="margin:8px 0 0;font-size:12px;line-height:1.5;color:#115e59">
      <a href="${escapeAttr(input.websiteUrl)}" style="color:#064e3b;text-decoration:none;font-weight:600">${escapeHtml(input.websiteHost)}</a>
    </p>
    ${input.unsubHtml}`;

  if (!photo) {
    return `<div ${FOOTER_SIGNATURE_MARKER}>${legalColumn}</div>`;
  }

  return `<table ${FOOTER_SIGNATURE_MARKER} role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;width:100%">
    <tr>
      <td width="${FOOTER_PHOTO_PX + 14}" valign="top" style="width:${FOOTER_PHOTO_PX + 14}px;padding:0 14px 0 0;vertical-align:top">
        <img src="${escapeAttr(photo)}" width="${FOOTER_PHOTO_PX}" height="${FOOTER_PHOTO_PX}" alt="${escapeAttr(photoAlt)}" style="display:block;width:${FOOTER_PHOTO_PX}px;height:${FOOTER_PHOTO_PX}px;border-radius:50%;border:0" />
      </td>
      <td valign="top" style="padding:0;vertical-align:top">
        ${legalColumn}
      </td>
    </tr>
  </table>`;
}

/** Primary mint CTA (pill). */
export function ctaButton(href: string, label: string) {
  return `<p style="margin:22px 0 8px;text-align:center">
    <a href="${escapeAttr(href)}" style="display:inline-block;background:#ecfdf5;background-image:linear-gradient(135deg,#ecfdf5 0%,#6ee7b7 100%);color:#064e3b;text-decoration:none;font-weight:700;font-size:14px;line-height:1.2;padding:12px 20px;border-radius:999px;border:1.5px solid #34d399;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">${escapeHtml(label)}</a>
  </p>`;
}

/** White card with mint border for listing / detail callouts. */
export function infoCard(innerHtml: string) {
  return `<div style="margin:16px 0;padding:18px 20px;border-radius:12px;background:#ffffff;border:1px solid #a7f3d0">${innerHtml}</div>`;
}

export const EMAIL_LAYOUT_DEFAULT_FOOTER_NOTE =
  "GTA Real Estate — Just a click away." as const;

/**
 * Escape footer copy and preserve line breaks for HTML email clients.
 * Stored legal text is never interpreted as HTML.
 */
export function formatEmailFooterNoteHtml(
  footerNote: string | null | undefined,
): string {
  const normalized = (footerNote ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");
  const text = normalized || EMAIL_LAYOUT_DEFAULT_FOOTER_NOTE;
  return escapeHtml(text).replaceAll("\n", "<br />\n");
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function escapeAttr(value: string) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}
