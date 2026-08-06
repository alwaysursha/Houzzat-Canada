import { SITE_NAME, SITE_URL } from "@/lib/constants";

export function emailLayout(input: {
  preheader?: string;
  title: string;
  bodyHtml: string;
  footerNote?: string;
  unsubscribeUrl?: string | null;
}): string {
  const preheader = input.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(input.preheader)}</div>`
    : "";
  const unsub = input.unsubscribeUrl
    ? `<p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#94a3b8">
         <a href="${escapeAttr(input.unsubscribeUrl)}" style="color:#64748b;text-decoration:underline">Unsubscribe / email preferences</a>
       </p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(input.title)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Georgia,'Times New Roman',serif">
  ${preheader}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:28px 12px">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
          <tr>
            <td style="padding:22px 28px 12px;background:linear-gradient(135deg,#0f3d2e 0%,#1a5c45 100%)">
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#a7f3d0">${escapeHtml(SITE_NAME)}</p>
              <h1 style="margin:10px 0 0;font-size:24px;line-height:1.25;font-weight:700;color:#ffffff">${escapeHtml(input.title)}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.55;color:#1e293b">
              ${input.bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#94a3b8">
                ${escapeHtml(input.footerNote ?? `${SITE_NAME} · Greater Toronto Area real estate`)}
              </p>
              <p style="margin:8px 0 0;font-size:12px;line-height:1.5;color:#94a3b8">
                <a href="${escapeAttr(SITE_URL)}" style="color:#0d9488;text-decoration:none">${escapeHtml(SITE_URL.replace(/^https?:\/\//, ""))}</a>
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

export function ctaButton(href: string, label: string) {
  return `<p style="margin:24px 0 8px">
    <a href="${escapeAttr(href)}" style="display:inline-block;background:#0d9488;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:10px">${escapeHtml(label)}</a>
  </p>`;
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
