/**
 * Master Admin preview for HIGH OCTANE email presentations.
 * Renders existing templates with sample data. Does not send mail.
 */
import { SITE_URL } from "@/lib/constants";
import {
  HIGH_OCTANE_EMAIL_PREVIEW_ORIGIN,
  highOctaneEmailChrome,
} from "@/lib/email/high-octane/chrome";
import { buildAgentEmailSignature } from "@/lib/email/tenant-email-brand";
import { renderOwnerActivationEmail } from "@/lib/platform/activation/email-template";
import {
  renderAgentMessageEmail,
  renderCmaEmail,
  renderJustListedEmail,
  renderNeighborhoodWeeklyEmail,
  renderNewsletterEmail,
  renderPasswordResetEmail,
  renderPriceReductionEmail,
  renderPropertyUpdateEmail,
  renderSavedSearchDigestEmail,
  renderShortlistEmail,
  renderSoldAlertEmail,
  renderTeamInviteEmail,
  renderVerifyEmail,
  renderWelcomeEmail,
  type EmailPropertyCard,
} from "@/lib/email/templates";

const ORIGIN = HIGH_OCTANE_EMAIL_PREVIEW_ORIGIN;

const chrome = highOctaneEmailChrome({
  brandLabel: "HIGH OCTANE",
  websiteUrl: ORIGIN,
  footerNote: "Right at Home Realty Brokerage\nPowered by HouzzatPRO",
});

/** Sample assignee. Not the workspace owner and not a real address. */
const assignedAgentSignature = buildAgentEmailSignature({
  workspaceId: "high-octane-preview",
  agent: {
    userId: "preview-assigned-agent",
    name: "Jordan Sample",
    email: "preview.agent@example.invalid",
    phone: "(000) 555-0199",
    image: null,
    designation: null,
  },
  displayName: "HIGH OCTANE",
  contactPhone: null,
  senderDisplayName: "Alex Owner",
  brokerageRegisteredName: "Right at Home Realty Brokerage",
  primaryColor: "#071629",
});

const signatureChrome = {
  ...chrome,
  agentSignatureHtml: assignedAgentSignature.html,
  agentSignatureText: assignedAgentSignature.text,
  agentFromLabel: "Jordan Sample",
};

const preferences = {
  preferencesManageUrl: "#sample-preferences",
  unsubscribeIntentUrl: "#sample-unsubscribe",
};

const listing: EmailPropertyCard = {
  mlsNumber: "PREVIEW",
  addressLine: "123 Sample Street",
  city: "Niagara-on-the-Lake",
  priceLabel: "$849,000",
  listingUrl: `${ORIGIN}/sample/listing/PREVIEW`,
  imageUrl: `${ORIGIN}/media/royal-collection/high-octane/logo.svg`,
  bedsLabel: "3 bed",
  bathsLabel: "2 bath",
  sqftLabel: "1,800 sqft",
};

export type HighOctaneEmailPreviewGroup = "transactional" | "operational";

export type HighOctaneEmailPreview = {
  id: string;
  label: string;
  group: HighOctaneEmailPreviewGroup;
  subject: string;
  html: string;
  /** False for account, invitation, and newsletter shells. */
  personalSignature: boolean;
};

export const HIGH_OCTANE_EMAIL_PREVIEW_GAPS = [
  "Customer inquiry confirmation — no customer email is sent when an inquiry is saved.",
  "Private viewing request confirmation — no customer email is sent for a showing request.",
  "Private viewing agent notification — a showing is stored as a lead. There is no separate viewing email.",
  "In-app chat message notification — the assigned agent is notified by push, not email.",
  "In-app chat reply notification — no customer email is sent for a chat reply.",
  "Subscription and payment onboarding — no email template or sender exists.",
] as const;

function card(input: HighOctaneEmailPreview): HighOctaneEmailPreview {
  return input;
}

export function listHighOctaneEmailPreviews(): HighOctaneEmailPreview[] {
  const verify = renderVerifyEmail({
    name: "Alex Sample",
    verifyUrl: `${ORIGIN}/auth/verify-email?token=preview-invalid`,
    chrome,
  });
  const welcome = renderWelcomeEmail({ name: "Alex Sample", chrome });
  const reset = renderPasswordResetEmail({
    name: "Alex Sample",
    resetUrl: `${ORIGIN}/auth/reset-password?token=preview-invalid`,
    chrome,
  });
  const invite = renderTeamInviteEmail({
    orgName: "HIGH OCTANE",
    role: "AGENT",
    inviteUrl: `${SITE_URL.replace(/\/$/, "")}/auth/invite/preview-invalid`,
    invitedByName: "Jordan Sample",
    tenantDisplayName: "HIGH OCTANE",
    tenantLogoUrl: chrome.brandLogoUrl,
    tenantPrimaryColor: "#C8A66A",
    emailPresentation: "high-octane",
    brandWebsiteUrl: ORIGIN,
    expiresAt: new Date("2026-12-01T00:00:00.000Z"),
  });
  const activation = renderOwnerActivationEmail({
    ownerName: "Alex Sample",
    workspaceName: "HIGH OCTANE",
    activationUrl: `${ORIGIN}/sample/activate?token=preview-invalid`,
    expiresAt: new Date("2026-12-01T00:00:00.000Z"),
    presentation: "high-octane",
    websiteUrl: ORIGIN,
  });
  const price = renderPriceReductionEmail({
    name: "Alex Sample",
    addressLine: listing.addressLine,
    city: listing.city,
    mlsNumber: listing.mlsNumber,
    oldPrice: 899_000,
    newPrice: 849_000,
    listingUrl: listing.listingUrl,
    imageUrl: listing.imageUrl,
    bedsLabel: listing.bedsLabel,
    bathsLabel: listing.bathsLabel,
    sqftLabel: listing.sqftLabel,
    ...signatureChrome,
    ...preferences,
  });
  const sold = renderSoldAlertEmail({
    name: "Alex Sample",
    addressLine: listing.addressLine,
    city: listing.city,
    mlsNumber: listing.mlsNumber,
    statusLabel: "Sold",
    priceLabel: "$849,000",
    listingUrl: listing.listingUrl,
    areaName: "Niagara-on-the-Lake",
    imageUrl: listing.imageUrl,
    ...signatureChrome,
    ...preferences,
  });
  const listed = renderJustListedEmail({
    name: "Alex Sample",
    areaName: "Niagara-on-the-Lake",
    addressLine: listing.addressLine,
    city: listing.city,
    mlsNumber: listing.mlsNumber,
    price: 849_000,
    listingUrl: listing.listingUrl,
    imageUrl: listing.imageUrl,
    ...signatureChrome,
    ...preferences,
  });
  const updated = renderPropertyUpdateEmail({
    name: "Alex Sample",
    title: "Listing update",
    addressLine: listing.addressLine,
    city: listing.city,
    mlsNumber: listing.mlsNumber,
    changes: ["Price", "Remarks"],
    listingUrl: listing.listingUrl,
    imageUrl: listing.imageUrl,
    ...signatureChrome,
    ...preferences,
  });
  const digest = renderSavedSearchDigestEmail({
    name: "Alex Sample",
    searchName: "Niagara sample search",
    listings: [listing],
    searchUrl: `${ORIGIN}/sample/search`,
    ...signatureChrome,
    ...preferences,
  });
  const area = renderNeighborhoodWeeklyEmail({
    name: "Alex Sample",
    homeLabel: "123 Sample Street",
    radiusKm: 2,
    newCount: 1,
    soldCount: 1,
    medianSoldLabel: "$860,000",
    newListings: [listing],
    soldListings: [listing],
    ctaUrl: `${ORIGIN}/sample/area`,
    ...signatureChrome,
    ...preferences,
  });
  const agent = renderAgentMessageEmail({
    name: "Alex Sample",
    subject: "A note about 123 Sample Street",
    body: "This is a sample message. It was not sent.",
    listings: [listing],
    ...signatureChrome,
    ...preferences,
  });
  const shortlist = renderShortlistEmail({
    name: "Alex Sample",
    agentName: "Jordan Sample",
    shareUrl: `${ORIGIN}/sample/share/homes`,
    note: "Sample note. Nothing was sent.",
    listings: [listing],
    ...signatureChrome,
    ...preferences,
  });
  const cma = renderCmaEmail({
    recipientName: "Alex Sample",
    agentName: "Jordan Sample",
    agentEmail: "preview.agent@example.invalid",
    agentPhone: "(000) 555-0100",
    tenantDisplayName: "HIGH OCTANE",
    subjectAddress: listing.addressLine,
    subjectCity: listing.city,
    cmaUrl: `${ORIGIN}/sample/cma/preview`,
    recommendedListPrice: 875_000,
    ...signatureChrome,
    ...preferences,
  });
  const newsletter = renderNewsletterEmail({
    name: "Alex Sample",
    subject: "Sample market notes",
    headline: "Sample market notes",
    bodyHtml: "<p style=\"margin:0\">A sample paragraph for the newsletter shell. Nothing was sent.</p>",
    ctaUrl: `${ORIGIN}/sample/notes`,
    ctaLabel: "Read notes",
    ...chrome,
    ...preferences,
  });

  return [
    card({ id: "verify", label: "Account verification", group: "transactional", personalSignature: false, subject: verify.subject, html: verify.html }),
    card({ id: "welcome", label: "Customer welcome", group: "transactional", personalSignature: false, subject: welcome.subject, html: welcome.html }),
    card({ id: "password-reset", label: "Password reset", group: "transactional", personalSignature: false, subject: reset.subject, html: reset.html }),
    card({ id: "team-invite", label: "Workspace team invitation", group: "transactional", personalSignature: false, subject: invite.subject, html: invite.html }),
    card({ id: "owner-activation", label: "Workspace owner invitation", group: "transactional", personalSignature: false, subject: activation.subject, html: activation.html }),
    card({ id: "price-reduction", label: "Property Watch — price reduction", group: "operational", personalSignature: true, subject: price.subject, html: price.html }),
    card({ id: "sold", label: "Property Watch / Area Watch — sold", group: "operational", personalSignature: true, subject: sold.subject, html: sold.html }),
    card({ id: "just-listed", label: "Area Watch — just listed", group: "operational", personalSignature: true, subject: listed.subject, html: listed.html }),
    card({ id: "property-update", label: "Property Watch — listing update", group: "operational", personalSignature: true, subject: updated.subject, html: updated.html }),
    card({ id: "saved-search", label: "Saved search digest", group: "operational", personalSignature: true, subject: digest.subject, html: digest.html }),
    card({ id: "area-digest", label: "Area Watch weekly", group: "operational", personalSignature: true, subject: area.subject, html: area.html }),
    card({ id: "agent-message", label: "Agent email", group: "operational", personalSignature: true, subject: agent.subject, html: agent.html }),
    card({ id: "shortlist", label: "Shortlist", group: "operational", personalSignature: true, subject: shortlist.subject, html: shortlist.html }),
    card({ id: "cma", label: "CMA share", group: "operational", personalSignature: true, subject: cma.subject, html: cma.html }),
    card({ id: "newsletter", label: "Newsletter shell", group: "operational", personalSignature: false, subject: newsletter.subject, html: newsletter.html }),
  ];
}
