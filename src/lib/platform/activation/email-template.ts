/**
 * Stage 6.10A — HouzzatPRO owner activation email (platform branding).
 */

import { PLATFORM_PRODUCT_NAME } from "@/lib/constants";
import { HOUZZATPRO_TECHNICAL_SUPPORT_URL } from "@/lib/platform/status/support";
import type { RenderedEmail } from "@/lib/email/templates";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderOwnerActivationEmail(input: {
  ownerName?: string | null;
  workspaceName: string;
  activationUrl: string;
  expiresAt: Date;
}): RenderedEmail {
  const greet = input.ownerName?.trim()
    ? `Hi ${input.ownerName.trim()},`
    : "Hi there,";
  const workspace = input.workspaceName.trim() || "your workspace";
  const expireLabel = input.expiresAt.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const subject = `Activate your ${PLATFORM_PRODUCT_NAME} account`;
  const text = [
    greet,
    "",
    `Your ${PLATFORM_PRODUCT_NAME} workspace "${workspace}" is ready.`,
    "Create your password using this secure link:",
    input.activationUrl,
    "",
    `This link expires on ${expireLabel}.`,
    "",
    `Support: ${HOUZZATPRO_TECHNICAL_SUPPORT_URL}`,
    "",
    "If you did not expect this email, you can ignore it.",
  ].join("\n");

  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f6f5;font-family:system-ui,-apple-system,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f5;padding:32px 16px">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;padding:28px 24px;border:1px solid #e2e8f0">
          <tr><td style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#059669;font-weight:700">${escapeHtml(PLATFORM_PRODUCT_NAME)}</td></tr>
          <tr><td style="padding-top:12px;font-size:22px;font-weight:700;color:#07111f">Activate your account</td></tr>
          <tr><td style="padding-top:12px;font-size:15px;line-height:1.55;color:#334155">${escapeHtml(greet)}</td></tr>
          <tr><td style="padding-top:12px;font-size:15px;line-height:1.55;color:#334155">Your workspace <strong>${escapeHtml(workspace)}</strong> has been provisioned. Create a password to sign in and finish setup.</td></tr>
          <tr><td style="padding-top:24px" align="center">
            <a href="${escapeHtml(input.activationUrl)}" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px">Activate account</a>
          </td></tr>
          <tr><td style="padding-top:20px;font-size:13px;line-height:1.5;color:#64748b">This secure link expires on ${escapeHtml(expireLabel)}. It can be used once.</td></tr>
          <tr><td style="padding-top:12px;font-size:13px;line-height:1.5;color:#64748b">Need help? <a href="${escapeHtml(HOUZZATPRO_TECHNICAL_SUPPORT_URL)}" style="color:#059669">Contact support</a></td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  return {
    subject,
    text,
    html,
    kind: "owner_activation",
  };
}
