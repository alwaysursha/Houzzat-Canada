import { SITE_NAME, SITE_URL } from "@/lib/constants";

export const EMAIL_MINT_GRADIENT =
  "linear-gradient(160deg,#ecfdf5 0%,#a7f3d0 48%,#6ee7b7 100%)";

export function emailLayout(input: {
  preheader?: string;
  title: string;
  /** Optional line under the hero title. */
  subtitle?: string | null;
  bodyHtml: string;
  footerNote?: string;
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
}): string {
  const brandLabel = input.brandLabel?.trim() || SITE_NAME;
  const brandColor = input.brandPrimaryColor?.trim() || "#047857";
  const logo = input.brandLogoUrl?.trim()
    ? `<img src="${escapeAttr(input.brandLogoUrl.trim())}" alt="${escapeHtml(brandLabel)}" width="140" style="display:block;max-width:140px;height:auto;margin:0 0 14px;border:0" />`
    : "";
  const preheader = input.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(input.preheader)}</div>`
    : "";
  const unsub = input.preferencesManageUrl
    ? `<p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#047857">
         <a href="${escapeAttr(input.preferencesManageUrl)}" style="color:#047857;text-decoration:underline">Manage email preferences</a>
         ${
           input.unsubscribeIntentUrl
             ? ` · <a href="${escapeAttr(input.unsubscribeIntentUrl)}" style="color:#047857;text-decoration:underline">Unsubscribe</a>`
             : ""
         }
       </p>`
    : input.unsubscribeUrl
      ? `<p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#047857">
         <a href="${escapeAttr(input.unsubscribeUrl)}" style="color:#047857;text-decoration:underline">Unsubscribe / email preferences</a>
       </p>`
      : "";
  const subtitle = input.subtitle?.trim()
    ? `<p style="margin:12px 0 0;font-size:15px;line-height:1.5;color:#115e59">${escapeHtml(input.subtitle.trim())}</p>`
    : "";

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
            <td style="width:100%;background:#d1fae5;background-image:${EMAIL_MINT_GRADIENT};padding:32px 24px 28px;text-align:left;border-radius:20px 20px 0 0">
              ${logo}
              <p style="margin:0;font-size:11px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;color:${escapeAttr(brandColor)}">${escapeHtml(brandLabel)}</p>
              <h1 style="margin:10px 0 0;font-size:28px;line-height:1.15;font-weight:800;color:#064e3b;letter-spacing:-0.02em">${escapeHtml(input.title)}</h1>
              ${subtitle}
            </td>
          </tr>
          <tr>
            <td style="width:100%;background:rgba(236,253,245,0.92);padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.55;color:#115e59">
              ${input.bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="width:100%;background:#a7f3d0;background-image:linear-gradient(160deg,#a7f3d0 0%,#6ee7b7 100%);padding:22px 24px;border-top:1px solid #6ee7b7;border-radius:0 0 20px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
              <p style="margin:0;font-size:13px;line-height:1.5;font-weight:600;color:#064e3b">
                ${escapeHtml(input.footerNote ?? "GTA Real Estate — Just a click away.")}
              </p>
              <p style="margin:8px 0 0;font-size:12px;line-height:1.5;color:#115e59">
                <a href="${escapeAttr(SITE_URL)}" style="color:#064e3b;text-decoration:none;font-weight:600">${escapeHtml(SITE_URL.replace(/^https?:\/\//, ""))}</a>
              </p>
              ${unsub}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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
