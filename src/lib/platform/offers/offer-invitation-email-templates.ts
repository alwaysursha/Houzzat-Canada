/**
 * HouzzatPRO customer email after Admin first-sends a commercial offer.
 * Tenant/workspace branding must never be applied.
 */

import { PLATFORM_PRODUCT_NAME } from "@/lib/constants";
import { escapeAttr, escapeHtml } from "@/lib/email/layout";
import type { RenderedEmail } from "@/lib/email/templates";
import { formatHouzzatProZonedDateTime } from "@/lib/platform/datetime";
import {
  BOOK_DEMO_EMAIL_TAGLINE,
  HOUZZATPRO_PUBLIC_ORIGIN,
  houzzatProEmailLayout,
} from "@/lib/platform/public/book-demo-email-templates";

export const OFFER_INVITATION_SUBJECT = "Your HouzzatPRO Proposal is Ready";
export const OFFER_INVITATION_CTA_LABEL = "Review Your Offer";
export const OFFER_INVITATION_SECURITY_NOTE =
  "This is your private offer link. Please do not share it with others.";

export type OfferInvitationEmailFields = {
  contactName: string;
  offerUrl: string;
  expiresAt?: Date | string | null;
};

function greeting(contactName: string): string {
  const name = contactName.trim();
  return name ? `Hi ${name},` : "Hi there,";
}

function formatExpiry(expiresAt?: Date | string | null): string | null {
  if (!expiresAt) return null;
  const parts = formatHouzzatProZonedDateTime(expiresAt, { dateMonth: "long" });
  return parts?.date ?? null;
}

export function renderOfferInvitationEmail(
  fields: OfferInvitationEmailFields,
): RenderedEmail {
  const greet = greeting(fields.contactName);
  const expiry = formatExpiry(fields.expiresAt);
  const subject = OFFER_INVITATION_SUBJECT;
  const text = [
    greet,
    "",
    "Your personalized HouzzatPRO proposal is ready.",
    "",
    "Review your plan, pricing and setup details using the secure link below.",
    "",
    `${OFFER_INVITATION_CTA_LABEL}: ${fields.offerUrl}`,
    ...(expiry ? ["", `This offer expires on ${expiry}.`] : []),
    "",
    OFFER_INVITATION_SECURITY_NOTE,
    "",
    PLATFORM_PRODUCT_NAME,
    BOOK_DEMO_EMAIL_TAGLINE,
    HOUZZATPRO_PUBLIC_ORIGIN,
  ].join("\n");

  const html = houzzatProEmailLayout({
    preheader: "Your personalized HouzzatPRO proposal is ready.",
    title: subject,
    subtitle: BOOK_DEMO_EMAIL_TAGLINE,
    bodyHtml: `
      <p style="margin:0 0 12px">${escapeHtml(greet)}</p>
      <p style="margin:0 0 12px">Your personalized ${escapeHtml(PLATFORM_PRODUCT_NAME)} proposal is ready.</p>
      <p style="margin:0 0 16px">Review your plan, pricing and setup details using the secure link below.</p>
      <p style="margin:24px 0 0;text-align:center">
        <a href="${escapeAttr(fields.offerUrl)}" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 18px;border-radius:10px">${escapeHtml(OFFER_INVITATION_CTA_LABEL)}</a>
      </p>
      ${
        expiry
          ? `<p style="margin:16px 0 0;font-size:13px;color:#64748b">This offer expires on ${escapeHtml(expiry)}.</p>`
          : ""
      }
      <p style="margin:16px 0 0;font-size:13px;color:#64748b">${escapeHtml(OFFER_INVITATION_SECURITY_NOTE)}</p>
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
    kind: "houzzatpro_offer_invitation",
  };
}
