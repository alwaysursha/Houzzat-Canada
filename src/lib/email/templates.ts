import { SITE_NAME, SITE_URL } from "@/lib/constants";
import {
  ctaButton,
  emailLayout,
  escapeAttr,
  escapeHtml,
  infoCard,
  EMAIL_MINT_GRADIENT,
} from "@/lib/email/layout";
import {
  appendAgentSignatureHtml,
  appendAgentSignatureText,
  type EmailBrandChrome,
} from "@/lib/email/tenant-email-brand";
import {
  fillPublishedAreaWatchTemplate,
  type AreaWatchTemplateVars,
} from "@/lib/email/workspace-templates/area-watch";
import {
  fillPublishedSavedSearchDigestTemplate,
  fillPublishedSellerNeighbourhoodDigestTemplate,
  type SavedSearchDigestTemplateVars,
  type SellerNeighbourhoodDigestTemplateVars,
} from "@/lib/email/workspace-templates/digest-templates";
import {
  fillPublishedPropertyWatchTemplate,
  type PropertyWatchTemplateVars,
} from "@/lib/email/workspace-templates/property-watch";
import type { EmailTemplateContentFields } from "@/lib/email/workspace-templates/types";

export type RenderedEmail = {
  subject: string;
  text: string;
  html: string;
  kind: string;
};

/** Optional published PROPERTY_WATCH override (Phase 2C-1). Drafts never pass here. */
export type PropertyWatchPublishedTemplateInput = {
  publishedTemplate?: EmailTemplateContentFields | null;
};

/** Optional published AREA_WATCH override (Phase 2C-2). Drafts never pass here. */
export type AreaWatchPublishedTemplateInput = {
  publishedAreaWatchTemplate?: EmailTemplateContentFields | null;
};

/** Optional published SAVED_SEARCH_DIGEST override (Phase 2C-3). Drafts never pass here. */
export type SavedSearchDigestPublishedTemplateInput = {
  publishedSavedSearchDigestTemplate?: EmailTemplateContentFields | null;
};

/** Optional published SELLER_NEIGHBOURHOOD_DIGEST override (Phase 2C-3). Drafts never pass here. */
export type SellerNeighbourhoodDigestPublishedTemplateInput = {
  publishedSellerNeighbourhoodDigestTemplate?: EmailTemplateContentFields | null;
};

function layoutBrandProps(brand?: EmailBrandChrome | null) {
  if (!brand) return {};
  return {
    brandLabel: brand.brandLabel ?? undefined,
    brandLogoUrl: brand.brandLogoUrl ?? undefined,
    brandPrimaryColor: brand.brandPrimaryColor ?? undefined,
    brandWebsiteUrl: brand.brandWebsiteUrl ?? undefined,
    footerNote: brand.footerNote ?? undefined,
  };
}

type WatchOverrideFallback = {
  subject: string;
  introHtml: string;
  introText: string;
  cta: string;
};

type WatchOverrideCopy = {
  subject: string;
  introHtml: string;
  introText: string;
  cta: string;
  paragraphsHtml: string;
  paragraphsText: string;
  brandProps: ReturnType<typeof layoutBrandProps>;
};

function applyFilledWatchOverride(
  filled: {
    subject: string;
    introText: string;
    ctaText: string;
    paragraphs: string[];
    primaryColor: string | null;
  } | null,
  fallback: WatchOverrideFallback,
  brand: EmailBrandChrome | null | undefined,
): WatchOverrideCopy {
  if (!filled) {
    return {
      subject: fallback.subject,
      introHtml: fallback.introHtml,
      introText: fallback.introText,
      cta: fallback.cta,
      paragraphsHtml: "",
      paragraphsText: "",
      brandProps: layoutBrandProps(brand),
    };
  }

  // Empty published fields keep event-specific legacy wording (not registry defaults).
  const subject = filled.subject || fallback.subject;
  const introText = filled.introText || fallback.introText;
  const introHtml = filled.introText
    ? escapeHtml(filled.introText)
    : fallback.introHtml;
  const cta = filled.ctaText || fallback.cta;
  const paragraphsHtml = filled.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 12px;color:#115e59;white-space:pre-wrap">${escapeHtml(p)}</p>`,
    )
    .join("");
  const paragraphsText = filled.paragraphs.length
    ? `\n${filled.paragraphs.join("\n\n")}\n`
    : "";

  return {
    subject,
    introHtml,
    introText,
    cta,
    paragraphsHtml,
    paragraphsText,
    brandProps: layoutBrandProps({
      ...brand,
      brandPrimaryColor:
        filled.primaryColor || brand?.brandPrimaryColor || undefined,
    }),
  };
}

function propertyWatchOverrideCopy(
  published: EmailTemplateContentFields | null | undefined,
  vars: PropertyWatchTemplateVars,
  fallback: WatchOverrideFallback,
  brand: EmailBrandChrome | null | undefined,
): WatchOverrideCopy {
  if (!published) return applyFilledWatchOverride(null, fallback, brand);
  return applyFilledWatchOverride(
    fillPublishedPropertyWatchTemplate(published, vars),
    fallback,
    brand,
  );
}

function areaWatchOverrideCopy(
  published: EmailTemplateContentFields | null | undefined,
  vars: AreaWatchTemplateVars,
  fallback: WatchOverrideFallback,
  brand: EmailBrandChrome | null | undefined,
): WatchOverrideCopy {
  if (!published) return applyFilledWatchOverride(null, fallback, brand);
  return applyFilledWatchOverride(
    fillPublishedAreaWatchTemplate(published, vars),
    fallback,
    brand,
  );
}

function savedSearchDigestOverrideCopy(
  published: EmailTemplateContentFields | null | undefined,
  vars: SavedSearchDigestTemplateVars,
  fallback: WatchOverrideFallback,
  brand: EmailBrandChrome | null | undefined,
): WatchOverrideCopy {
  if (!published) return applyFilledWatchOverride(null, fallback, brand);
  return applyFilledWatchOverride(
    fillPublishedSavedSearchDigestTemplate(published, vars),
    fallback,
    brand,
  );
}

function sellerNeighbourhoodDigestOverrideCopy(
  published: EmailTemplateContentFields | null | undefined,
  vars: SellerNeighbourhoodDigestTemplateVars,
  fallback: WatchOverrideFallback,
  brand: EmailBrandChrome | null | undefined,
): WatchOverrideCopy {
  if (!published) return applyFilledWatchOverride(null, fallback, brand);
  return applyFilledWatchOverride(
    fillPublishedSellerNeighbourhoodDigestTemplate(published, vars),
    fallback,
    brand,
  );
}

function money(n: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(n);
}

export function renderVerifyEmail(input: {
  name?: string | null;
  verifyUrl: string;
}): RenderedEmail {
  const greet = input.name?.trim() ? `Hi ${input.name.trim()},` : "Hi there,";
  const subject = `Verify your email for ${SITE_NAME}`;
  const text = [
    greet,
    "",
    `Please verify your email to keep full access to ${SITE_NAME}.`,
    "",
    `Verify (valid 7 days): ${input.verifyUrl}`,
    "",
    "If you did not create this account, you can ignore this email.",
  ].join("\n");
  const html = emailLayout({
    title: "Verify your email",
    subtitle: "Confirm your address to unlock the full Houzzat experience.",
    preheader: `Confirm your ${SITE_NAME} account`,
    bodyHtml: `
      <p style="margin:0 0 12px;color:#115e59">${escapeHtml(greet)}</p>
      <p style="margin:0 0 12px;color:#115e59">Please verify your email address to keep full access to ${escapeHtml(SITE_NAME)} — saved homes, alerts, and client tools.</p>
      ${ctaButton(input.verifyUrl, "Verify email")}
      <p style="margin:16px 0 0;font-size:13px;color:#047857">This link expires in 7 days. If you didn’t create an account, you can ignore this message.</p>
    `,
  });
  return { subject, text, html, kind: "verify_email" };
}

export function renderWelcomeEmail(input: {
  name?: string | null;
}): RenderedEmail {
  const greet = input.name?.trim() ? `Welcome, ${input.name.trim()}` : "Welcome";
  const subject = `Welcome to ${SITE_NAME}`;
  const searchUrl = `${SITE_URL}/search`;
  const text = [
    `${greet},`,
    "",
    `Thanks for joining ${SITE_NAME}. You can search homes, save favourites, and get alerts when the market moves.`,
    "",
    `Start searching: ${searchUrl}`,
  ].join("\n");
  const html = emailLayout({
    title: greet,
    subtitle: "Your account is ready — start exploring GTA homes.",
    preheader: `Your ${SITE_NAME} account is ready`,
    bodyHtml: `
      <p style="margin:0 0 12px;color:#115e59">Thanks for joining ${escapeHtml(SITE_NAME)}. Search the GTA, save homes you love, and get notified when prices change or new listings match what you’re watching.</p>
      ${ctaButton(searchUrl, "Browse homes")}
      <p style="margin:16px 0 0;font-size:13px;color:#047857">Tip: turn on email alerts in your account so you never miss a price drop on a watched home.</p>
    `,
  });
  return { subject, text, html, kind: "welcome" };
}

export function renderContactUpdateRequestEmail(input: {
  name?: string | null;
  channel: "email" | "phone";
  accountUrl: string;
  preferencesManageUrl?: string | null;
  unsubscribeIntentUrl?: string | null;
}): RenderedEmail {
  const greet = input.name?.trim() ? `Hi ${input.name.trim()},` : "Hi there,";
  const field = input.channel === "phone" ? "phone number" : "email address";
  const subject = `Please confirm your ${field}`;
  const text = [
    greet,
    "",
    `Your agent asked you to confirm the ${field} on your ${SITE_NAME} account so they can reach you about showings and updates.`,
    "",
    `Update your details: ${input.accountUrl}`,
  ].join("\n");
  const html = emailLayout({
    title: "Please confirm your contact details",
    subtitle: `Your agent needs the right ${field} to reach you.`,
    preheader: `Confirm your ${field} on ${SITE_NAME}`,
    bodyHtml: `
      <p style="margin:0 0 12px;color:#115e59">${escapeHtml(greet)}</p>
      <p style="margin:0 0 12px;color:#115e59">Your agent asked you to confirm the ${escapeHtml(field)} on your ${escapeHtml(SITE_NAME)} account. This helps them contact you about showings, offers, and listing updates.</p>
      ${ctaButton(input.accountUrl, "Update contact details")}
      <p style="margin:16px 0 0;font-size:13px;color:#047857">It only takes a moment. You can also update this the next time you visit ${escapeHtml(SITE_NAME)}.</p>
    `,
    preferencesManageUrl: input.preferencesManageUrl,
    unsubscribeIntentUrl: input.unsubscribeIntentUrl,
  });
  return { subject, text, html, kind: "contact_update_request" };
}

export function renderLeadInfoUpdatedEmail(input: {
  clientLabel: string;
  changeLabels: string[];
  leadUrl: string;
}): RenderedEmail {
  const summary = input.changeLabels.filter(Boolean).join(", ");
  const subject = summary
    ? `${input.clientLabel} updated their lead information: ${summary}`
    : `${input.clientLabel} updated their lead information`;
  const text = [
    subject,
    "",
    "Open the lead in HouzzatPRO for details. This notice lists what changed, not the new values.",
    "",
    `Open in HouzzatPRO: ${input.leadUrl}`,
  ].join("\n");
  const html = emailLayout({
    title: "Lead information updated",
    subtitle: subject,
    preheader: subject,
    bodyHtml: `
      <p style="margin:0 0 12px;color:#115e59">${escapeHtml(input.clientLabel)} updated their lead information${
        summary ? `: ${escapeHtml(summary)}` : ""
      }.</p>
      ${infoCard("This notice identifies what changed. Open the lead for the current details.")}
      ${ctaButton(input.leadUrl, "Open lead in HouzzatPRO")}
    `,
  });
  return { subject, text, html, kind: "lead_info_updated" };
}

export function renderCustomerAlertOffStaffEmail(input: {
  clientLabel: string;
  leadUrl: string;
}): RenderedEmail {
  const subject = "Customer turned off email alerts";
  const text = [
    `${input.clientLabel} turned off optional email alerts.`,
    "",
    "This customer will no longer receive optional listing and alert emails.",
    "",
    `Open the lead in HouzzatPRO: ${input.leadUrl}`,
  ].join("\n");
  const html = emailLayout({
    title: "Customer turned off email alerts",
    subtitle: `${input.clientLabel} disabled optional email alerts.`,
    preheader: subject,
    bodyHtml: `
      <p style="margin:0 0 12px;color:#115e59">${escapeHtml(input.clientLabel)} turned off optional email alerts.</p>
      ${infoCard("This customer will no longer receive optional listing and alert emails.")}
      ${ctaButton(input.leadUrl, "Open lead in HouzzatPRO")}
    `,
  });
  return { subject, text, html, kind: "customer_alert_change" };
}

export function renderStaffContactUpdatedEmail(input: {
  clientLabel: string;
  fields: Array<"email" | "phone">;
  email?: string | null;
  phone?: string | null;
  leadUrl: string;
}): RenderedEmail {
  const fieldLabel =
    input.fields.length === 2
      ? "email and phone number"
      : input.fields[0] === "phone"
        ? "phone number"
        : "email address";
  const subject = `${input.clientLabel} updated their ${fieldLabel}`;
  const detailLines = [
    input.fields.includes("email") && input.email
      ? `Email: ${input.email}`
      : null,
    input.fields.includes("phone") && input.phone
      ? `Phone: ${input.phone}`
      : null,
  ].filter((line): line is string => Boolean(line));
  const text = [
    subject,
    "",
    ...detailLines,
    "",
    `Open in HouzzatPRO: ${input.leadUrl}`,
  ].join("\n");
  const html = emailLayout({
    title: "Contact details updated",
    subtitle: `${input.clientLabel} confirmed their ${fieldLabel}.`,
    preheader: subject,
    bodyHtml: `
      <p style="margin:0 0 12px;color:#115e59">${escapeHtml(input.clientLabel)} updated the ${escapeHtml(fieldLabel)} on their ${escapeHtml(SITE_NAME)} account.</p>
      ${
        detailLines.length
          ? infoCard(detailLines.map((line) => escapeHtml(line)).join("<br/>"))
          : ""
      }
      ${ctaButton(input.leadUrl, "Open lead in HouzzatPRO")}
    `,
  });
  return { subject, text, html, kind: "staff_contact_updated" };
}

export function renderPasswordResetEmail(input: {
  name?: string | null;
  resetUrl: string;
  siteName?: string | null;
}): RenderedEmail {
  const brand = input.siteName?.trim() || SITE_NAME;
  const greet = input.name?.trim() ? `Hi ${input.name.trim()},` : "Hi there,";
  const subject = `Reset your ${brand} password`;
  const text = [
    greet,
    "",
    `Reset your password using this link (expires soon):`,
    input.resetUrl,
    "",
    "If you didn’t request this, ignore this email.",
  ].join("\n");
  const html = emailLayout({
    title: "Reset your password",
    subtitle: "Use the secure link below to choose a new password.",
    preheader: "Password reset link inside",
    bodyHtml: `
      <p style="margin:0 0 12px;color:#115e59">${escapeHtml(greet)}</p>
      <p style="margin:0 0 12px;color:#115e59">We received a request to reset your ${escapeHtml(brand)} password.</p>
      ${ctaButton(input.resetUrl, "Reset password")}
      <p style="margin:16px 0 0;font-size:13px;color:#047857">If you didn’t ask for this, you can safely ignore this email.</p>
    `,
  });
  return { subject, text, html, kind: "password_reset" };
}

function orgRoleLabel(role: string) {
  if (role === "OWNER") return "Owner";
  if (role === "ADMIN") return "Team admin";
  if (role === "AGENT") return "Agent";
  return role;
}

export function renderTeamInviteEmail(input: {
  orgName: string;
  role: string;
  inviteUrl: string;
  invitedByName?: string | null;
  /** When true, membership was already created (existing agent). */
  alreadyMember?: boolean;
  /** Existing Houzzat buyer/seller account will convert to agent. */
  convertsConsumerAccount?: boolean;
  consumerLabels?: Array<"buyer" | "seller">;
  expiresAt?: Date | string | null;
  /** Tenant display name (primary brand). Defaults to orgName. */
  tenantDisplayName?: string | null;
  tenantLogoUrl?: string | null;
  tenantPrimaryColor?: string | null;
}): RenderedEmail {
  const roleLabel = orgRoleLabel(input.role);
  const inviter = input.invitedByName?.trim() || null;
  const brand =
    input.tenantDisplayName?.trim() || input.orgName.trim() || "your brokerage";
  const accent = input.tenantPrimaryColor?.trim() || "#0F766E";
  const subject = input.alreadyMember
    ? `You’re on the ${brand} team`
    : `You’re invited to join ${brand}`;
  const expireLabel = input.expiresAt
    ? new Date(input.expiresAt).toLocaleDateString("en-CA", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;
  const labels = input.consumerLabels?.length
    ? input.consumerLabels
    : input.convertsConsumerAccount
      ? (["buyer"] as Array<"buyer" | "seller">)
      : [];
  const consumerText = labels
    .map((l) => (l === "seller" ? "seller (/owner)" : "buyer (/account)"))
    .join(" and ");

  const convertNotice = labels.length
    ? `Important: accepting this invite disables your ${consumerText} profile and activates your agent CRM (/agent).`
    : null;

  const text = input.alreadyMember
    ? [
        `You’ve been added to ${brand} as ${roleLabel}${inviter ? ` by ${inviter}` : ""}.`,
        "",
        `Open your CRM: ${SITE_URL}/agent`,
        "",
        "Powered by HouzzatPRO",
      ].join("\n")
    : [
        `You’ve been invited to join ${brand} as ${roleLabel}${inviter ? ` by ${inviter}` : ""}.`,
        convertNotice ?? "",
        "",
        `Accept your invite (create an account or sign in):`,
        input.inviteUrl,
        expireLabel ? `\nThis invite expires ${expireLabel}.` : "",
        "",
        "Powered by HouzzatPRO",
      ]
        .filter(Boolean)
        .join("\n");

  const html = emailLayout({
    title: input.alreadyMember ? "Welcome to the team" : "You’re invited",
    subtitle: input.alreadyMember
      ? `Your ${brand} CRM seat is ready.`
      : `Join ${brand}.`,
    preheader: subject,
    brandLabel: brand,
    brandLogoUrl: input.tenantLogoUrl,
    brandPrimaryColor: accent,
    footerNote: "Powered by HouzzatPRO",
    bodyHtml: `
      <p style="margin:0 0 12px;color:#115e59">
        ${
          input.alreadyMember
            ? `You’ve been added to <strong style="color:#064e3b">${escapeHtml(brand)}</strong> as <strong style="color:#064e3b">${escapeHtml(roleLabel)}</strong>${inviter ? ` by ${escapeHtml(inviter)}` : ""}.`
            : `${inviter ? `<strong style="color:#064e3b">${escapeHtml(inviter)}</strong> invited you` : "You’ve been invited"} to join <strong style="color:#064e3b">${escapeHtml(brand)}</strong> as <strong style="color:#064e3b">${escapeHtml(roleLabel)}</strong>.`
        }
      </p>
      ${infoCard(`
        <p style="margin:0;font-size:14px;color:#115e59"><strong style="color:#064e3b">Team:</strong> ${escapeHtml(brand)}</p>
        <p style="margin:8px 0 0;font-size:14px;color:#115e59"><strong style="color:#064e3b">Role:</strong> ${escapeHtml(roleLabel)}</p>
        ${expireLabel && !input.alreadyMember ? `<p style="margin:8px 0 0;font-size:13px;color:#047857">Invite expires ${escapeHtml(expireLabel)}</p>` : ""}
      `)}
      ${
        convertNotice && !input.alreadyMember
          ? `<p style="margin:0 0 16px;padding:12px 14px;background:#fff7ed;border:1px solid #fdba74;border-radius:10px;font-size:13px;line-height:1.45;color:#9a3412"><strong>Profile change:</strong> ${escapeHtml(convertNotice)}</p>`
          : ""
      }
      ${
        input.alreadyMember
          ? ctaButton(`${SITE_URL}/agent`, "Open CRM")
          : `${ctaButton(input.inviteUrl, "Accept invite")}
      <p style="margin:16px 0 0;font-size:13px;color:#047857">New here? The link lets you create your agent account with this email. Already have an account? Sign in on that page to join the team.</p>`
      }
    `,
  });
  return { subject, text, html, kind: "team_invite" };
}

type ListingCardExtras = {
  imageUrl?: string | null;
  bedsLabel?: string | null;
  bathsLabel?: string | null;
  sqftLabel?: string | null;
};

export function renderPriceReductionEmail(
  input: {
    name?: string | null;
    addressLine: string;
    city: string;
    mlsNumber: string;
    oldPrice: number;
    newPrice: number;
    listingUrl: string;
    unsubscribeUrl?: string | null;
    preferencesManageUrl?: string | null;
    unsubscribeIntentUrl?: string | null;
  } & ListingCardExtras &
    EmailBrandChrome &
    PropertyWatchPublishedTemplateInput,
): RenderedEmail {
  const greet = input.name?.trim() ? `Hi ${input.name.trim()},` : "Hi there,";
  const drop = input.oldPrice - input.newPrice;
  const override = propertyWatchOverrideCopy(
    input.publishedTemplate,
    {
      recipientName: input.name,
      tenantName: input.brandLabel,
      agentName: input.agentFromLabel,
      addressLine: input.addressLine,
      city: input.city,
      mlsNumber: input.mlsNumber,
    },
    {
      subject: `Price reduced · ${input.addressLine}`,
      introHtml:
        "A property on your watch list just reduced its price.",
      introText: "A home you’re watching dropped in price.",
      cta: "View listing",
    },
    input,
  );
  const subject = override.subject;
  const text = appendAgentSignatureText(
    [
      greet,
      "",
      override.introText,
      override.paragraphsText.trim(),
      `${input.addressLine}, ${input.city} (${input.mlsNumber})`,
      `${money(input.oldPrice)} → ${money(input.newPrice)} (−${money(drop)})`,
      "",
      input.listingUrl,
    ]
      .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
      .join("\n"),
    input.agentSignatureText,
  );
  const html = emailLayout({
    title: "Price reduced",
    subtitle: override.introText,
    preheader: `${input.addressLine} is now ${money(input.newPrice)}`,
    unsubscribeUrl: input.unsubscribeUrl,
    preferencesManageUrl: input.preferencesManageUrl,
    unsubscribeIntentUrl: input.unsubscribeIntentUrl,
    ...override.brandProps,
    bodyHtml: appendAgentSignatureHtml(
      `
      <p style="margin:0 0 12px;color:#115e59">${escapeHtml(greet)}</p>
      <p style="margin:0 0 12px;color:#115e59">${override.introHtml}</p>
      ${override.paragraphsHtml}
      ${renderEmailPropertyCard({
        mlsNumber: input.mlsNumber,
        addressLine: input.addressLine,
        city: input.city,
        priceLabel: money(input.newPrice),
        listingUrl: input.listingUrl,
        imageUrl: input.imageUrl,
        bedsLabel: input.bedsLabel,
        bathsLabel: input.bathsLabel,
        sqftLabel: input.sqftLabel,
        badgeLabel: "Price drop",
        priceNote: `Was ${money(input.oldPrice)} · Down ${money(drop)}`,
      })}
      ${ctaButton(input.listingUrl, override.cta)}
    `,
      input.agentSignatureHtml,
    ),
  });
  return { subject, text, html, kind: "price_reduction" };
}

export function renderSoldAlertEmail(
  input: {
    name?: string | null;
    addressLine: string;
    city: string;
    mlsNumber: string;
    statusLabel: string;
    priceLabel: string;
    listingUrl: string;
    unsubscribeUrl?: string | null;
    preferencesManageUrl?: string | null;
    unsubscribeIntentUrl?: string | null;
    /** Area name when this sold alert originates from Area Watch. */
    areaName?: string | null;
  } & ListingCardExtras &
    EmailBrandChrome &
    PropertyWatchPublishedTemplateInput &
    AreaWatchPublishedTemplateInput,
): RenderedEmail {
  const greet = input.name?.trim() ? `Hi ${input.name.trim()},` : "Hi there,";
  const soldFallback = {
    subject: `${input.statusLabel} · ${input.addressLine}`,
    introHtml: "A property you’re watching changed status.",
    introText: `A watched home is now ${input.statusLabel.toLowerCase()}.`,
    cta: "View details",
  };
  // Category isolation: never mix PROPERTY_WATCH and AREA_WATCH overrides.
  // If both are somehow provided, fall back to legacy event copy.
  const hasProperty = Boolean(input.publishedTemplate);
  const hasArea = Boolean(input.publishedAreaWatchTemplate);
  const override =
    hasProperty && hasArea
      ? applyFilledWatchOverride(null, soldFallback, input)
      : hasArea
        ? areaWatchOverrideCopy(
            input.publishedAreaWatchTemplate,
            {
              recipientName: input.name,
              tenantName: input.brandLabel,
              agentName: input.agentFromLabel,
              areaName: input.areaName,
              addressLine: input.addressLine,
              city: input.city,
              mlsNumber: input.mlsNumber,
            },
            soldFallback,
            input,
          )
        : propertyWatchOverrideCopy(
            input.publishedTemplate,
            {
              recipientName: input.name,
              tenantName: input.brandLabel,
              agentName: input.agentFromLabel,
              addressLine: input.addressLine,
              city: input.city,
              mlsNumber: input.mlsNumber,
            },
            soldFallback,
            input,
          );
  const subject = override.subject;
  const text = appendAgentSignatureText(
    [
      greet,
      "",
      override.introText,
      override.paragraphsText.trim(),
      `${input.addressLine}, ${input.city} (${input.mlsNumber})`,
      input.priceLabel,
      "",
      input.listingUrl,
    ]
      .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
      .join("\n"),
    input.agentSignatureText,
  );
  const html = emailLayout({
    title: input.statusLabel,
    subtitle: override.introText,
    preheader: `${input.addressLine} · ${input.statusLabel}`,
    unsubscribeUrl: input.unsubscribeUrl,
    preferencesManageUrl: input.preferencesManageUrl,
    unsubscribeIntentUrl: input.unsubscribeIntentUrl,
    ...override.brandProps,
    bodyHtml: appendAgentSignatureHtml(
      `
      <p style="margin:0 0 12px;color:#115e59">${escapeHtml(greet)}</p>
      <p style="margin:0 0 12px;color:#115e59">${override.introHtml}</p>
      ${override.paragraphsHtml}
      ${renderEmailPropertyCard({
        mlsNumber: input.mlsNumber,
        addressLine: input.addressLine,
        city: input.city,
        priceLabel: input.priceLabel,
        listingUrl: input.listingUrl,
        imageUrl: input.imageUrl,
        bedsLabel: input.bedsLabel,
        bathsLabel: input.bathsLabel,
        sqftLabel: input.sqftLabel,
        badgeLabel: input.statusLabel,
      })}
      ${ctaButton(input.listingUrl, override.cta)}
    `,
      input.agentSignatureHtml,
    ),
  });
  return { subject, text, html, kind: "sold_alert" };
}

export function renderJustListedEmail(
  input: {
    name?: string | null;
    areaName: string;
    addressLine: string;
    city: string;
    mlsNumber: string;
    price: number;
    listingUrl: string;
    unsubscribeUrl?: string | null;
    preferencesManageUrl?: string | null;
    unsubscribeIntentUrl?: string | null;
  } & ListingCardExtras &
    EmailBrandChrome &
    AreaWatchPublishedTemplateInput,
): RenderedEmail {
  const greet = input.name?.trim() ? `Hi ${input.name.trim()},` : "Hi there,";
  const override = areaWatchOverrideCopy(
    input.publishedAreaWatchTemplate,
    {
      recipientName: input.name,
      tenantName: input.brandLabel,
      agentName: input.agentFromLabel,
      areaName: input.areaName,
      addressLine: input.addressLine,
      city: input.city,
      mlsNumber: input.mlsNumber,
    },
    {
      subject: `Just listed in ${input.areaName}`,
      introHtml: `A new home matched your area alert for <strong style="color:#064e3b">${escapeHtml(input.areaName)}</strong>.`,
      introText: `New listing in ${input.areaName}:`,
      cta: "View listing",
    },
    input,
  );
  const subject = override.subject;
  const text = appendAgentSignatureText(
    [
      greet,
      "",
      override.introText,
      override.paragraphsText.trim(),
      `${input.addressLine}, ${input.city} · ${money(input.price)} (${input.mlsNumber})`,
      "",
      input.listingUrl,
    ]
      .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
      .join("\n"),
    input.agentSignatureText,
  );
  const html = emailLayout({
    title: `Just listed · ${input.areaName}`,
    subtitle: override.introText,
    preheader: `${input.addressLine} · ${money(input.price)}`,
    unsubscribeUrl: input.unsubscribeUrl,
    preferencesManageUrl: input.preferencesManageUrl,
    unsubscribeIntentUrl: input.unsubscribeIntentUrl,
    ...override.brandProps,
    bodyHtml: appendAgentSignatureHtml(
      `
      <p style="margin:0 0 12px;color:#115e59">${escapeHtml(greet)}</p>
      <p style="margin:0 0 12px;color:#115e59">${override.introHtml}</p>
      ${override.paragraphsHtml}
      ${renderEmailPropertyCard({
        mlsNumber: input.mlsNumber,
        addressLine: input.addressLine,
        city: input.city,
        priceLabel: money(input.price),
        listingUrl: input.listingUrl,
        imageUrl: input.imageUrl,
        bedsLabel: input.bedsLabel,
        bathsLabel: input.bathsLabel,
        sqftLabel: input.sqftLabel,
        badgeLabel: "New listing",
      })}
      ${ctaButton(input.listingUrl, override.cta)}
    `,
      input.agentSignatureHtml,
    ),
  });
  return { subject, text, html, kind: "just_listed" };
}

export function renderPropertyUpdateEmail(
  input: {
    name?: string | null;
    title: string;
    addressLine: string;
    city: string;
    mlsNumber: string;
    changes: string[];
    listingUrl: string;
    unsubscribeUrl?: string | null;
    preferencesManageUrl?: string | null;
    unsubscribeIntentUrl?: string | null;
  } & ListingCardExtras &
    EmailBrandChrome &
    PropertyWatchPublishedTemplateInput,
): RenderedEmail {
  const greet = input.name?.trim() ? `Hi ${input.name.trim()},` : "Hi there,";
  const override = propertyWatchOverrideCopy(
    input.publishedTemplate,
    {
      recipientName: input.name,
      tenantName: input.brandLabel,
      agentName: input.agentFromLabel,
      addressLine: input.addressLine,
      city: input.city,
      mlsNumber: input.mlsNumber,
    },
    {
      subject: input.title,
      introHtml: "There’s an update on a home you’re watching.",
      introText: input.title,
      cta: "View listing",
    },
    input,
  );
  const subject = override.subject;
  const text = appendAgentSignatureText(
    [
      greet,
      "",
      override.introText,
      override.paragraphsText.trim(),
      `${input.addressLine}, ${input.city} (${input.mlsNumber})`,
      ...input.changes,
      "",
      input.listingUrl,
    ]
      .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
      .join("\n"),
    input.agentSignatureText,
  );
  const html = emailLayout({
    title: "Property update",
    subtitle: override.introText,
    preheader: input.title,
    unsubscribeUrl: input.unsubscribeUrl,
    preferencesManageUrl: input.preferencesManageUrl,
    unsubscribeIntentUrl: input.unsubscribeIntentUrl,
    ...override.brandProps,
    bodyHtml: appendAgentSignatureHtml(
      `
      <p style="margin:0 0 12px;color:#115e59">${escapeHtml(greet)}</p>
      <p style="margin:0 0 12px;color:#115e59">${override.introHtml}</p>
      ${override.paragraphsHtml}
      ${renderEmailPropertyCard({
        mlsNumber: input.mlsNumber,
        addressLine: input.addressLine,
        city: input.city,
        priceLabel: "Updated listing",
        listingUrl: input.listingUrl,
        imageUrl: input.imageUrl,
        bedsLabel: input.bedsLabel,
        bathsLabel: input.bathsLabel,
        sqftLabel: input.sqftLabel,
        badgeLabel: "Update",
        detailLines: input.changes,
      })}
      ${ctaButton(input.listingUrl, override.cta)}
    `,
      input.agentSignatureHtml,
    ),
  });
  return { subject, text, html, kind: "property_update" };
}

export function renderShortlistEmail(
  input: {
    name?: string | null;
    agentName: string;
    shareUrl: string;
    note?: string | null;
    listings?: EmailPropertyCard[];
    /** Fallback text lines when structured listings are not provided. */
    listingLines?: string[];
    preferencesManageUrl?: string | null;
    unsubscribeIntentUrl?: string | null;
  } & EmailBrandChrome,
): RenderedEmail {
  const greet = input.name?.trim() ? `Hi ${input.name.trim()},` : "Hi there,";
  const cards = input.listings ?? [];
  const count = cards.length || (input.listingLines?.length ?? 0);
  const subject = `${count} home${count === 1 ? "" : "s"} for you`;
  const textLines =
    cards.length > 0
      ? cards.map(
          (l) =>
            `• ${l.addressLine}, ${l.city} · ${l.priceLabel} — ${l.listingUrl}`,
        )
      : (input.listingLines ?? []);
  const text = appendAgentSignatureText(
    [
      greet,
      "",
      `${input.agentName} put together a shortlist for you.`,
      input.note ? `\n${input.note}\n` : "",
      `View all: ${input.shareUrl}`,
      "",
      ...textLines,
    ].join("\n"),
    input.agentSignatureText,
  );
  const html = emailLayout({
    title: "Homes selected for you",
    subtitle: `${input.agentName} put together a shortlist for you.`,
    preheader: `${input.agentName} shared a shortlist`,
    ...layoutBrandProps(input),
    bodyHtml: appendAgentSignatureHtml(
      `
      <p style="margin:0 0 12px;color:#115e59">${escapeHtml(greet)}</p>
      <p style="margin:0 0 12px;color:#115e59"><strong style="color:#064e3b">${escapeHtml(input.agentName)}</strong> put together a shortlist of homes that match what you’ve been looking at.</p>
      ${input.note ? infoCard(`<p style="margin:0;color:#115e59">${escapeHtml(input.note)}</p>`) : ""}
      ${cards.map((l) => renderEmailPropertyCard(l)).join("")}
      ${
        cards.length === 0 && input.listingLines?.length
          ? `<ol style="margin:0;padding-left:18px;color:#115e59">${input.listingLines.map((line) => `<li style="margin:0 0 8px">${escapeHtml(line)}</li>`).join("")}</ol>`
          : ""
      }
      ${ctaButton(input.shareUrl, "View shortlist")}
    `,
      input.agentSignatureHtml,
    ),
    preferencesManageUrl: input.preferencesManageUrl,
    unsubscribeIntentUrl: input.unsubscribeIntentUrl,
  });
  return { subject, text, html, kind: "shortlist" };
}

export function renderAgentMessageEmail(
  input: {
    name?: string | null;
    subject: string;
    body: string;
    listings?: EmailPropertyCard[];
    preferencesManageUrl?: string | null;
    unsubscribeIntentUrl?: string | null;
  } & EmailBrandChrome,
): RenderedEmail {
  const greet = input.name?.trim() ? `Hi ${input.name.trim()},` : "Hi there,";
  const paragraphs = input.body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const cards = input.listings ?? [];
  const fromLabel = input.agentFromLabel?.trim();
  const subtitle = fromLabel
    ? `A message from ${fromLabel}.`
    : "A message from your Houzzat agent.";
  const html = emailLayout({
    title: input.subject,
    subtitle,
    preheader: input.subject,
    ...layoutBrandProps(input),
    bodyHtml: appendAgentSignatureHtml(
      `
      <p style="margin:0 0 12px;color:#115e59">${escapeHtml(greet)}</p>
      ${paragraphs.map((p) => `<p style="margin:0 0 12px;white-space:pre-wrap;color:#115e59">${escapeHtml(p)}</p>`).join("")}
      ${cards.map((l) => renderEmailPropertyCard(l)).join("")}
    `,
      input.agentSignatureHtml,
    ),
    preferencesManageUrl: input.preferencesManageUrl,
    unsubscribeIntentUrl: input.unsubscribeIntentUrl,
  });
  return {
    subject: input.subject,
    text: appendAgentSignatureText(
      `${greet}\n\n${input.body}`,
      input.agentSignatureText,
    ),
    html,
    kind: "agent_message",
  };
}

export function renderNewsletterEmail(input: {
  name?: string | null;
  subject: string;
  headline: string;
  bodyHtml: string;
  ctaUrl?: string | null;
  ctaLabel?: string | null;
  unsubscribeUrl?: string | null;
  preferencesManageUrl?: string | null;
  unsubscribeIntentUrl?: string | null;
}): RenderedEmail {
  const greet = input.name?.trim() ? `Hi ${input.name.trim()},` : "Hi there,";
  const text = [
    greet,
    "",
    input.headline,
    "",
    input.bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    input.ctaUrl ? `\n${input.ctaUrl}` : "",
  ].join("\n");
  const html = emailLayout({
    title: input.headline,
    subtitle: "Fresh market notes from Houzzat.",
    preheader: input.subject,
    unsubscribeUrl: input.unsubscribeUrl,
    preferencesManageUrl: input.preferencesManageUrl,
    unsubscribeIntentUrl: input.unsubscribeIntentUrl,
    bodyHtml: `
      <p style="margin:0 0 12px;color:#115e59">${escapeHtml(greet)}</p>
      <div style="color:#115e59">${input.bodyHtml}</div>
      ${input.ctaUrl && input.ctaLabel ? ctaButton(input.ctaUrl, input.ctaLabel) : ""}
    `,
  });
  return { subject: input.subject, text, html, kind: "newsletter" };
}

/** Shared property card used across alert / digest emails. */
export type EmailPropertyCard = {
  mlsNumber: string;
  addressLine: string;
  city: string;
  priceLabel: string;
  listingUrl: string;
  metaLabel?: string | null;
  imageUrl?: string | null;
  bedsLabel?: string | null;
  bathsLabel?: string | null;
  sqftLabel?: string | null;
  /** Amber pill above the price (e.g. "New listing", "Price drop"). */
  badgeLabel?: string | null;
  /** Optional note under the price (plain text). */
  priceNote?: string | null;
  /** Extra bullets under specs (e.g. property updates). */
  detailLines?: string[];
  /** @deprecated use badgeLabel — kept for digest callers */
  isNew?: boolean;
};

export type DigestListingLine = EmailPropertyCard;

function cardSpecChip(label: string) {
  return `<td style="padding:0 14px 0 0;font-size:14px;line-height:1.3;color:#047857;white-space:nowrap">${escapeHtml(label)}</td>`;
}

export function renderEmailPropertyCard(listing: EmailPropertyCard) {
  const beds =
    listing.bedsLabel ??
    listing.metaLabel?.match(/([\d.+]+)\s*bed/i)?.[1] ??
    null;
  const baths =
    listing.bathsLabel ??
    listing.metaLabel?.match(/([\d.]+)\s*bath/i)?.[1] ??
    null;
  const sqft = listing.sqftLabel;
  const specs = [
    sqft ? cardSpecChip(sqft) : "",
    beds ? cardSpecChip(`${beds} bed`) : "",
    baths ? cardSpecChip(`${baths} bath`) : "",
  ]
    .filter(Boolean)
    .join("");

  const imageBlock = listing.imageUrl
    ? `<img src="${escapeAttr(listing.imageUrl)}" alt="${escapeAttr(listing.addressLine)}" width="220" height="176" style="display:block;width:220px;height:176px;object-fit:cover;border:0" />`
    : `<div style="width:220px;height:176px;background:${EMAIL_MINT_GRADIENT}"></div>`;

  const badgeText =
    listing.badgeLabel?.trim() ||
    (listing.isNew ? "New listing" : null);
  const badge = badgeText
    ? `<p style="margin:0 0 10px"><span style="display:inline-block;background:#f59e0b;color:#ffffff;font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;padding:6px 11px;border-radius:999px;line-height:1">${escapeHtml(badgeText)}</span></p>`
    : "";

  const priceNote = listing.priceNote?.trim()
    ? `<p style="margin:8px 0 0;font-size:14px;font-weight:600;color:#b45309">${escapeHtml(listing.priceNote.trim())}</p>`
    : "";

  const details =
    listing.detailLines && listing.detailLines.length > 0
      ? `<ul style="margin:12px 0 0;padding-left:18px;color:#115e59;font-size:14px">
          ${listing.detailLines.map((line) => `<li style="margin:0 0 4px">${escapeHtml(line)}</li>`).join("")}
        </ul>`
      : "";

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px">
      <tr>
        <td align="center">
          <table role="presentation" width="580" cellpadding="0" cellspacing="0" style="width:580px;max-width:580px;background:#ffffff;border:1px solid #a7f3d0;border-radius:12px;overflow:hidden">
            <tr>
              <td>
                <a href="${escapeAttr(listing.listingUrl)}" style="text-decoration:none;color:#0f172a;display:block">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td width="220" valign="top" style="width:220px;line-height:0">
                        ${imageBlock}
                      </td>
                      <td valign="middle" style="padding:20px 22px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
                        ${badge}
                        <p style="margin:0;font-size:26px;line-height:1.15;font-weight:800;color:#064e3b;letter-spacing:-0.02em">${escapeHtml(listing.priceLabel)}</p>
                        ${priceNote}
                        <p style="margin:10px 0 0;font-size:17px;line-height:1.35;color:#115e59;font-weight:600">${escapeHtml(listing.addressLine)}</p>
                        <p style="margin:5px 0 0;font-size:15px;line-height:1.3;color:#047857">${escapeHtml(listing.city)}</p>
                        ${
                          specs
                            ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px 0 0;width:100%"><tr><td style="padding-top:12px;border-top:1px solid #d1fae5"><table role="presentation" cellpadding="0" cellspacing="0"><tr>${specs}</tr></table></td></tr></table>`
                            : ""
                        }
                        ${details}
                        <p style="margin:14px 0 0;font-size:16px;font-weight:700;color:#059669">View home →</p>
                      </td>
                    </tr>
                  </table>
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

export function renderSavedSearchDigestEmail(
  input: {
    name?: string | null;
    searchName: string;
    listings: DigestListingLine[];
    searchUrl: string;
    unsubscribeUrl?: string | null;
    preferencesManageUrl?: string | null;
    unsubscribeIntentUrl?: string | null;
  } & EmailBrandChrome &
    SavedSearchDigestPublishedTemplateInput,
): RenderedEmail {
  const count = input.listings.length;
  const greet = input.name?.trim() ? `Hi ${input.name.trim()},` : "Hi there,";
  const legacySubject =
    count === 1
      ? `New listing alert · ${input.listings[0]?.addressLine ?? input.searchName}`
      : `${count} new homes matching your search`;
  const legacyIntroHtml = `Here ${count === 1 ? "is a fresh match" : `are ${count} fresh matches`} for <strong style="color:#064e3b">${escapeHtml(input.searchName)}</strong>.`;
  const hasCustomIntro = Boolean(
    input.publishedSavedSearchDigestTemplate?.introText?.trim(),
  );
  const override = savedSearchDigestOverrideCopy(
    input.publishedSavedSearchDigestTemplate,
    {
      recipientName: input.name,
      tenantName: input.brandLabel,
      agentName: input.agentFromLabel,
      searchName: input.searchName,
      listingCount: count,
    },
    {
      subject: legacySubject,
      introHtml: legacyIntroHtml,
      introText: `New listings matched “${input.searchName}”:`,
      cta: "Browse all matching homes →",
    },
    input,
  );
  const subject = override.subject;
  const text = appendAgentSignatureText(
    [
      greet,
      "",
      override.introText,
      override.paragraphsText.trim(),
      ...input.listings.map(
        (l) =>
          `• ${l.addressLine}, ${l.city} · ${l.priceLabel}${l.metaLabel ? ` · ${l.metaLabel}` : ""} — ${l.listingUrl}`,
      ),
      "",
      `Browse all matches: ${input.searchUrl}`,
    ]
      .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
      .join("\n"),
    input.agentSignatureText,
  );

  const cards = input.listings
    .map((l) =>
      renderEmailPropertyCard({
        ...l,
        badgeLabel: l.badgeLabel ?? (l.isNew ? "New listing" : null),
      }),
    )
    .join("");
  const introLine = hasCustomIntro
    ? `${escapeHtml(greet)} ${override.introHtml}`
    : `${escapeHtml(greet)} ${legacyIntroHtml}`;
  const previewNote =
    count > 0 || override.paragraphsHtml
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><p style="margin:0 0 16px;max-width:580px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:16px;line-height:1.45;color:#115e59;text-align:left">${count > 0 || hasCustomIntro ? introLine : ""}</p>${override.paragraphsHtml}</td></tr></table>`
      : "";

  const html = emailLayout({
    title: "New listings found!",
    subtitle: hasCustomIntro
      ? override.introText
      : "We've found new homes that match your criteria—take a look.",
    preheader: `${count} new home${count === 1 ? "" : "s"} for ${input.searchName}`,
    unsubscribeUrl: input.unsubscribeUrl,
    preferencesManageUrl: input.preferencesManageUrl,
    unsubscribeIntentUrl: input.unsubscribeIntentUrl,
    ...override.brandProps,
    bodyHtml: appendAgentSignatureHtml(
      `
      ${previewNote}
      ${cards}
      ${ctaButton(input.searchUrl, override.cta)}
    `,
      input.agentSignatureHtml,
    ),
  });
  return { subject, text, html, kind: "saved_search_digest" };
}

export function renderNeighborhoodWeeklyEmail(
  input: {
    name?: string | null;
    homeLabel: string;
    radiusKm: number;
    newCount: number;
    soldCount: number;
    medianSoldLabel?: string | null;
    newListings: DigestListingLine[];
    soldListings: DigestListingLine[];
    ctaUrl: string;
    unsubscribeUrl?: string | null;
    preferencesManageUrl?: string | null;
    unsubscribeIntentUrl?: string | null;
  } & EmailBrandChrome &
    SellerNeighbourhoodDigestPublishedTemplateInput,
): RenderedEmail {
  const greet = input.name?.trim() ? `Hi ${input.name.trim()},` : "Hi there,";
  const hasCustomIntro = Boolean(
    input.publishedSellerNeighbourhoodDigestTemplate?.introText?.trim(),
  );
  const override = sellerNeighbourhoodDigestOverrideCopy(
    input.publishedSellerNeighbourhoodDigestTemplate,
    {
      recipientName: input.name,
      tenantName: input.brandLabel,
      agentName: input.agentFromLabel,
      homeLabel: input.homeLabel,
      newCount: input.newCount,
      soldCount: input.soldCount,
    },
    {
      subject: `Neighborhood weekly · ${input.homeLabel}`,
      introHtml: `Here’s what happened near <strong style="color:#064e3b">${escapeHtml(input.homeLabel)}</strong> over the past week (≈${input.radiusKm} km).`,
      introText: `This week near ${input.homeLabel} (≈${input.radiusKm} km):`,
      cta: "View seller tools",
    },
    input,
  );
  const subject = override.subject;
  const text = appendAgentSignatureText(
    [
      greet,
      "",
      override.introText,
      override.paragraphsText.trim(),
      `• ${input.newCount} new listing${input.newCount === 1 ? "" : "s"}`,
      `• ${input.soldCount} sold/leased`,
      input.medianSoldLabel ? `• Median sold ${input.medianSoldLabel}` : "",
      "",
      "New:",
      ...input.newListings.map(
        (l) => `• ${l.addressLine} · ${l.priceLabel} — ${l.listingUrl}`,
      ),
      "",
      "Sold / leased:",
      ...input.soldListings.map(
        (l) => `• ${l.addressLine} · ${l.priceLabel} — ${l.listingUrl}`,
      ),
      "",
      input.ctaUrl,
    ]
      .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
      .filter(Boolean)
      .join("\n"),
    input.agentSignatureText,
  );

  const listBlock = (
    title: string,
    items: DigestListingLine[],
    badgeLabel: string,
  ) => {
    if (!items.length) {
      return `<p style="margin:0 0 12px;color:#047857;font-size:14px">No ${title.toLowerCase()} in this window.</p>`;
    }
    return `
      <p style="margin:20px 0 8px;font-size:12px;font-weight:800;color:#047857;text-transform:uppercase;letter-spacing:0.06em">${escapeHtml(title)}</p>
      ${items
        .map((l) =>
          renderEmailPropertyCard({
            ...l,
            badgeLabel: l.badgeLabel ?? badgeLabel,
          }),
        )
        .join("")}`;
  };

  const html = emailLayout({
    title: "Neighborhood weekly report",
    subtitle: hasCustomIntro
      ? override.introText
      : `Here’s what happened near ${input.homeLabel} this week.`,
    preheader: `${input.newCount} new · ${input.soldCount} sold near ${input.homeLabel}`,
    unsubscribeUrl: input.unsubscribeUrl,
    preferencesManageUrl: input.preferencesManageUrl,
    unsubscribeIntentUrl: input.unsubscribeIntentUrl,
    ...override.brandProps,
    bodyHtml: appendAgentSignatureHtml(
      `
      <p style="margin:0 0 12px;color:#115e59">${escapeHtml(greet)}</p>
      <p style="margin:0 0 16px;color:#115e59">${override.introHtml}</p>
      ${override.paragraphsHtml}
      ${infoCard(`
        <p style="margin:0;font-size:16px;color:#064e3b"><strong>${input.newCount}</strong> new · <strong>${input.soldCount}</strong> sold/leased${input.medianSoldLabel ? ` · median sold <strong>${escapeHtml(input.medianSoldLabel)}</strong>` : ""}</p>
      `)}
      ${listBlock("New listings", input.newListings, "New listing")}
      ${listBlock("Sold & leased", input.soldListings, "Sold")}
      ${ctaButton(input.ctaUrl, override.cta)}
    `,
      input.agentSignatureHtml,
    ),
  });
  return { subject, text, html, kind: "neighborhood_weekly" };
}

/** Stage 5.12A — tenant-branded CMA ready email (client-facing). */
export function renderCmaEmail(
  input: {
    recipientName?: string | null;
    agentName: string;
    agentEmail?: string | null;
    agentPhone?: string | null;
    tenantDisplayName: string;
    tenantPrimaryColor?: string | null;
    subjectAddress: string;
    subjectCity: string;
    cmaUrl: string;
    recommendedListPrice?: number | null;
    preferencesManageUrl?: string | null;
    unsubscribeIntentUrl?: string | null;
  } & EmailBrandChrome,
): RenderedEmail {
  const greet = input.recipientName?.trim()
    ? `Hi ${input.recipientName.trim()},`
    : "Hi there,";
  const brand =
    input.brandLabel?.trim() ||
    input.tenantDisplayName.trim() ||
    "your brokerage";
  const accent =
    input.brandPrimaryColor?.trim() ||
    input.tenantPrimaryColor?.trim() ||
    "#0F766E";
  const subject = `Your Comparative Market Analysis is ready`;
  const priceLine =
    input.recommendedListPrice != null
      ? `Recommended list price: ${money(input.recommendedListPrice)}`
      : null;
  const text = appendAgentSignatureText(
    [
      greet,
      "",
      `${input.agentName} at ${brand} prepared a Comparative Market Analysis for ${input.subjectAddress}, ${input.subjectCity}.`,
      "",
      "It reviews recent comparable sales and current competition to help you understand how the property is positioned today.",
      priceLine ? `\n${priceLine}\n` : "",
      `View your CMA: ${input.cmaUrl}`,
      "",
      input.agentName,
      input.agentPhone ? input.agentPhone : "",
      input.agentEmail ? input.agentEmail : "",
      "",
      "Powered by HouzzatPRO",
    ]
      .filter((line) => line !== "")
      .join("\n"),
    // CMA already includes agent contact in-body; skip duplicate signature text
    // unless chrome supplies a distinct fallback-only signature without agent block.
    null,
  );

  const html = emailLayout({
    title: "Your market analysis is ready",
    subtitle: `${brand} · Comparative Market Analysis`,
    preheader: `CMA for ${input.subjectAddress}`,
    footerNote:
      input.footerNote?.trim() ||
      `Prepared by ${input.agentName} · Powered by HouzzatPRO`,
    ...layoutBrandProps({
      ...input,
      brandLabel: brand,
      brandPrimaryColor: accent,
      footerNote:
        input.footerNote?.trim() ||
        `Prepared by ${input.agentName} · Powered by HouzzatPRO`,
    }),
    bodyHtml: `
      <p style="margin:0 0 12px;color:#115e59">${escapeHtml(greet)}</p>
      <p style="margin:0 0 12px;color:#115e59">I've prepared a Comparative Market Analysis for <strong style="color:#064e3b">${escapeHtml(input.subjectAddress)}</strong>${input.subjectCity ? `, ${escapeHtml(input.subjectCity)}` : ""} using recent comparable sales and current competition.</p>
      ${infoCard(`
        <p style="margin:0 0 6px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#047857;font-weight:700">${escapeHtml(brand)}</p>
        <p style="margin:0;font-size:17px;color:#064e3b;font-weight:700">${escapeHtml(input.subjectAddress)}</p>
        ${priceLine ? `<p style="margin:10px 0 0;color:#115e59">${escapeHtml(priceLine)}</p>` : ""}
      `)}
      <p style="margin:16px 0 0;color:#115e59">This is a market analysis for discussion — not a formal appraisal.</p>
      <p style="margin:22px 0 8px;text-align:center">
        <a href="${escapeAttr(input.cmaUrl)}" style="display:inline-block;background:${escapeAttr(accent)};color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;line-height:1.2;padding:12px 22px;border-radius:999px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">View Your CMA</a>
      </p>
      <p style="margin:20px 0 0;color:#115e59">
        <strong style="color:#064e3b">${escapeHtml(input.agentName)}</strong><br/>
        ${input.agentPhone ? `${escapeHtml(input.agentPhone)}<br/>` : ""}
        ${input.agentEmail ? escapeHtml(input.agentEmail) : ""}
      </p>
    `,
    preferencesManageUrl: input.preferencesManageUrl,
    unsubscribeIntentUrl: input.unsubscribeIntentUrl,
  });
  return { subject, text, html, kind: "cma_share" };
}
