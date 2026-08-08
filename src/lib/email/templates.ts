import { SITE_NAME, SITE_URL } from "@/lib/constants";
import {
  ctaButton,
  emailLayout,
  escapeAttr,
  escapeHtml,
} from "@/lib/email/layout";

export type RenderedEmail = {
  subject: string;
  text: string;
  html: string;
  kind: string;
};

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
    preheader: `Confirm your ${SITE_NAME} account`,
    bodyHtml: `
      <p style="margin:0 0 12px">${escapeHtml(greet)}</p>
      <p style="margin:0 0 12px">Please verify your email address to keep full access to ${escapeHtml(SITE_NAME)} — saved homes, alerts, and client tools.</p>
      ${ctaButton(input.verifyUrl, "Verify email")}
      <p style="margin:16px 0 0;font-size:13px;color:#64748b">This link expires in 7 days. If you didn’t create an account, you can ignore this message.</p>
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
    preheader: `Your ${SITE_NAME} account is ready`,
    bodyHtml: `
      <p style="margin:0 0 12px">Thanks for joining ${escapeHtml(SITE_NAME)}. Search the GTA, save homes you love, and get notified when prices change or new listings match what you’re watching.</p>
      ${ctaButton(searchUrl, "Browse homes")}
      <p style="margin:16px 0 0;font-size:13px;color:#64748b">Tip: turn on email alerts in your account so you never miss a price drop on a watched home.</p>
    `,
  });
  return { subject, text, html, kind: "welcome" };
}

export function renderPasswordResetEmail(input: {
  name?: string | null;
  resetUrl: string;
}): RenderedEmail {
  const greet = input.name?.trim() ? `Hi ${input.name.trim()},` : "Hi there,";
  const subject = `Reset your ${SITE_NAME} password`;
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
    preheader: "Password reset link inside",
    bodyHtml: `
      <p style="margin:0 0 12px">${escapeHtml(greet)}</p>
      <p style="margin:0 0 12px">We received a request to reset your ${escapeHtml(SITE_NAME)} password.</p>
      ${ctaButton(input.resetUrl, "Reset password")}
      <p style="margin:16px 0 0;font-size:13px;color:#64748b">If you didn’t ask for this, you can safely ignore this email.</p>
    `,
  });
  return { subject, text, html, kind: "password_reset" };
}

export function renderPriceReductionEmail(input: {
  name?: string | null;
  addressLine: string;
  city: string;
  mlsNumber: string;
  oldPrice: number;
  newPrice: number;
  listingUrl: string;
  unsubscribeUrl?: string | null;
}): RenderedEmail {
  const greet = input.name?.trim() ? `Hi ${input.name.trim()},` : "Hi there,";
  const subject = `Price reduced · ${input.addressLine}`;
  const drop = input.oldPrice - input.newPrice;
  const text = [
    greet,
    "",
    `A home you’re watching dropped in price.`,
    `${input.addressLine}, ${input.city} (${input.mlsNumber})`,
    `${money(input.oldPrice)} → ${money(input.newPrice)} (−${money(drop)})`,
    "",
    input.listingUrl,
  ].join("\n");
  const html = emailLayout({
    title: "Price reduced",
    preheader: `${input.addressLine} is now ${money(input.newPrice)}`,
    unsubscribeUrl: input.unsubscribeUrl,
    bodyHtml: `
      <p style="margin:0 0 12px">${escapeHtml(greet)}</p>
      <p style="margin:0 0 12px">A property on your watch list just reduced its price.</p>
      <div style="margin:16px 0;padding:16px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0">
        <p style="margin:0;font-weight:700;color:#0f172a">${escapeHtml(input.addressLine)}</p>
        <p style="margin:4px 0 0;color:#64748b;font-size:13px">${escapeHtml(input.city)} · MLS® ${escapeHtml(input.mlsNumber)}</p>
        <p style="margin:12px 0 0;font-size:18px;font-weight:700;color:#0d9488">
          <span style="text-decoration:line-through;color:#94a3b8;font-size:14px;font-weight:600">${escapeHtml(money(input.oldPrice))}</span>
          &nbsp;→&nbsp;${escapeHtml(money(input.newPrice))}
        </p>
        <p style="margin:6px 0 0;font-size:13px;color:#b45309">Down ${escapeHtml(money(drop))}</p>
      </div>
      ${ctaButton(input.listingUrl, "View listing")}
    `,
  });
  return { subject, text, html, kind: "price_reduction" };
}

export function renderSoldAlertEmail(input: {
  name?: string | null;
  addressLine: string;
  city: string;
  mlsNumber: string;
  statusLabel: string;
  priceLabel: string;
  listingUrl: string;
  unsubscribeUrl?: string | null;
}): RenderedEmail {
  const greet = input.name?.trim() ? `Hi ${input.name.trim()},` : "Hi there,";
  const subject = `${input.statusLabel} · ${input.addressLine}`;
  const text = [
    greet,
    "",
    `A watched home is now ${input.statusLabel.toLowerCase()}.`,
    `${input.addressLine}, ${input.city} (${input.mlsNumber})`,
    input.priceLabel,
    "",
    input.listingUrl,
  ].join("\n");
  const html = emailLayout({
    title: input.statusLabel,
    preheader: `${input.addressLine} · ${input.statusLabel}`,
    unsubscribeUrl: input.unsubscribeUrl,
    bodyHtml: `
      <p style="margin:0 0 12px">${escapeHtml(greet)}</p>
      <p style="margin:0 0 12px">A property you’re watching changed status.</p>
      <div style="margin:16px 0;padding:16px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0">
        <p style="margin:0;font-weight:700">${escapeHtml(input.addressLine)}</p>
        <p style="margin:4px 0 0;color:#64748b;font-size:13px">${escapeHtml(input.city)} · MLS® ${escapeHtml(input.mlsNumber)}</p>
        <p style="margin:12px 0 0;font-size:15px"><strong>${escapeHtml(input.statusLabel)}</strong> · ${escapeHtml(input.priceLabel)}</p>
      </div>
      ${ctaButton(input.listingUrl, "View details")}
    `,
  });
  return { subject, text, html, kind: "sold_alert" };
}

export function renderJustListedEmail(input: {
  name?: string | null;
  areaName: string;
  addressLine: string;
  city: string;
  mlsNumber: string;
  price: number;
  listingUrl: string;
  unsubscribeUrl?: string | null;
}): RenderedEmail {
  const greet = input.name?.trim() ? `Hi ${input.name.trim()},` : "Hi there,";
  const subject = `Just listed in ${input.areaName}`;
  const text = [
    greet,
    "",
    `New listing in ${input.areaName}:`,
    `${input.addressLine}, ${input.city} · ${money(input.price)} (${input.mlsNumber})`,
    "",
    input.listingUrl,
  ].join("\n");
  const html = emailLayout({
    title: `Just listed · ${input.areaName}`,
    preheader: `${input.addressLine} · ${money(input.price)}`,
    unsubscribeUrl: input.unsubscribeUrl,
    bodyHtml: `
      <p style="margin:0 0 12px">${escapeHtml(greet)}</p>
      <p style="margin:0 0 12px">A new home matched your area alert for <strong>${escapeHtml(input.areaName)}</strong>.</p>
      <div style="margin:16px 0;padding:16px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0">
        <p style="margin:0;font-weight:700">${escapeHtml(input.addressLine)}</p>
        <p style="margin:4px 0 0;color:#64748b;font-size:13px">${escapeHtml(input.city)} · MLS® ${escapeHtml(input.mlsNumber)}</p>
        <p style="margin:12px 0 0;font-size:18px;font-weight:700;color:#0d9488">${escapeHtml(money(input.price))}</p>
      </div>
      ${ctaButton(input.listingUrl, "View listing")}
    `,
  });
  return { subject, text, html, kind: "just_listed" };
}

export function renderPropertyUpdateEmail(input: {
  name?: string | null;
  title: string;
  addressLine: string;
  city: string;
  mlsNumber: string;
  changes: string[];
  listingUrl: string;
  unsubscribeUrl?: string | null;
}): RenderedEmail {
  const greet = input.name?.trim() ? `Hi ${input.name.trim()},` : "Hi there,";
  const subject = input.title;
  const text = [
    greet,
    "",
    input.title,
    `${input.addressLine}, ${input.city} (${input.mlsNumber})`,
    ...input.changes,
    "",
    input.listingUrl,
  ].join("\n");
  const html = emailLayout({
    title: "Property update",
    preheader: input.title,
    unsubscribeUrl: input.unsubscribeUrl,
    bodyHtml: `
      <p style="margin:0 0 12px">${escapeHtml(greet)}</p>
      <p style="margin:0 0 12px">There’s an update on a home you’re watching.</p>
      <div style="margin:16px 0;padding:16px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0">
        <p style="margin:0;font-weight:700">${escapeHtml(input.addressLine)}</p>
        <p style="margin:4px 0 12px;color:#64748b;font-size:13px">${escapeHtml(input.city)} · MLS® ${escapeHtml(input.mlsNumber)}</p>
        <ul style="margin:0;padding-left:18px;color:#334155">
          ${input.changes.map((c) => `<li style="margin:0 0 6px">${escapeHtml(c)}</li>`).join("")}
        </ul>
      </div>
      ${ctaButton(input.listingUrl, "View listing")}
    `,
  });
  return { subject, text, html, kind: "property_update" };
}

export function renderShortlistEmail(input: {
  name?: string | null;
  agentName: string;
  shareUrl: string;
  note?: string | null;
  listingLines: string[];
}): RenderedEmail {
  const greet = input.name?.trim() ? `Hi ${input.name.trim()},` : "Hi there,";
  const subject = `${input.listingLines.length} home${input.listingLines.length === 1 ? "" : "s"} for you`;
  const text = [
    greet,
    "",
    `${input.agentName} put together a shortlist for you.`,
    input.note ? `\n${input.note}\n` : "",
    `View all: ${input.shareUrl}`,
    "",
    ...input.listingLines,
  ].join("\n");
  const html = emailLayout({
    title: "Homes selected for you",
    preheader: `${input.agentName} shared a shortlist`,
    bodyHtml: `
      <p style="margin:0 0 12px">${escapeHtml(greet)}</p>
      <p style="margin:0 0 12px"><strong>${escapeHtml(input.agentName)}</strong> put together a shortlist of homes that match what you’ve been looking at.</p>
      ${input.note ? `<p style="margin:0 0 12px;padding:12px 14px;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0;color:#334155">${escapeHtml(input.note)}</p>` : ""}
      ${ctaButton(input.shareUrl, "View shortlist")}
      <p style="margin:20px 0 8px;font-size:13px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em">Included</p>
      <ol style="margin:0;padding-left:18px;color:#334155">
        ${input.listingLines.map((line) => `<li style="margin:0 0 8px">${escapeHtml(line)}</li>`).join("")}
      </ol>
    `,
  });
  return { subject, text, html, kind: "shortlist" };
}

export function renderAgentMessageEmail(input: {
  name?: string | null;
  subject: string;
  body: string;
}): RenderedEmail {
  const greet = input.name?.trim() ? `Hi ${input.name.trim()},` : "Hi there,";
  const paragraphs = input.body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const html = emailLayout({
    title: input.subject,
    preheader: input.subject,
    bodyHtml: `
      <p style="margin:0 0 12px">${escapeHtml(greet)}</p>
      ${paragraphs.map((p) => `<p style="margin:0 0 12px;white-space:pre-wrap">${escapeHtml(p)}</p>`).join("")}
    `,
  });
  return {
    subject: input.subject,
    text: `${greet}\n\n${input.body}`,
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
    preheader: input.subject,
    unsubscribeUrl: input.unsubscribeUrl,
    bodyHtml: `
      <p style="margin:0 0 12px">${escapeHtml(greet)}</p>
      ${input.bodyHtml}
      ${input.ctaUrl && input.ctaLabel ? ctaButton(input.ctaUrl, input.ctaLabel) : ""}
    `,
  });
  return { subject: input.subject, text, html, kind: "newsletter" };
}

export type DigestListingLine = {
  mlsNumber: string;
  addressLine: string;
  city: string;
  priceLabel: string;
  metaLabel?: string | null;
  listingUrl: string;
  imageUrl?: string | null;
  bedsLabel?: string | null;
  bathsLabel?: string | null;
  sqftLabel?: string | null;
  isNew?: boolean;
};

const DIGEST_MINT =
  "linear-gradient(160deg,#ecfdf5 0%,#a7f3d0 48%,#6ee7b7 100%)";

function digestSpecChip(label: string) {
  return `<td style="padding:0 14px 0 0;font-size:14px;line-height:1.3;color:#047857;white-space:nowrap">${escapeHtml(label)}</td>`;
}

function renderDigestListingCard(listing: DigestListingLine) {
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
    sqft ? digestSpecChip(sqft) : "",
    beds ? digestSpecChip(`${beds} bed`) : "",
    baths ? digestSpecChip(`${baths} bath`) : "",
  ]
    .filter(Boolean)
    .join("");

  const imageBlock = listing.imageUrl
    ? `<img src="${escapeAttr(listing.imageUrl)}" alt="${escapeAttr(listing.addressLine)}" width="220" height="176" style="display:block;width:220px;height:176px;object-fit:cover;border:0" />`
    : `<div style="width:220px;height:176px;background:${DIGEST_MINT}"></div>`;

  // Pill tag above the price — email-safe (absolute overlays break in Gmail).
  const newTag = listing.isNew
    ? `<p style="margin:0 0 10px"><span style="display:inline-block;background:#f59e0b;color:#ffffff;font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;padding:6px 11px;border-radius:999px;line-height:1">New listing</span></p>`
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
                        ${newTag}
                        <p style="margin:0;font-size:26px;line-height:1.15;font-weight:800;color:#064e3b;letter-spacing:-0.02em">${escapeHtml(listing.priceLabel)}</p>
                        <p style="margin:10px 0 0;font-size:17px;line-height:1.35;color:#115e59;font-weight:600">${escapeHtml(listing.addressLine)}</p>
                        <p style="margin:5px 0 0;font-size:15px;line-height:1.3;color:#047857">${escapeHtml(listing.city)}</p>
                        ${
                          specs
                            ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px 0 0;width:100%"><tr><td style="padding-top:12px;border-top:1px solid #d1fae5"><table role="presentation" cellpadding="0" cellspacing="0"><tr>${specs}</tr></table></td></tr></table>`
                            : ""
                        }
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

function digestEmailShell(input: {
  title: string;
  preheader: string;
  heroTitle: string;
  heroSubtitle: string;
  bodyHtml: string;
  unsubscribeUrl?: string | null;
}): string {
  const unsub = input.unsubscribeUrl
    ? `<p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#047857">
         <a href="${escapeAttr(input.unsubscribeUrl)}" style="color:#047857;text-decoration:underline">Unsubscribe / email preferences</a>
       </p>`
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
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(input.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#e8f5f0;padding:20px 12px">
    <tr>
      <td align="center" style="padding:0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:680px;border-radius:20px;overflow:hidden;background:#ecfdf5;background-image:${DIGEST_MINT};border:1px solid #a7f3d0">
          <tr>
            <td style="width:100%;background:#d1fae5;background-image:${DIGEST_MINT};padding:32px 24px 28px;text-align:left;border-radius:20px 20px 0 0">
              <p style="margin:0;font-size:11px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;color:#047857">${escapeHtml(SITE_NAME)}</p>
              <h1 style="margin:10px 0 0;font-size:32px;line-height:1.15;font-weight:800;color:#064e3b;letter-spacing:-0.02em">${escapeHtml(input.heroTitle)}</h1>
              <p style="margin:12px 0 0;font-size:15px;line-height:1.5;color:#115e59">${escapeHtml(input.heroSubtitle)}</p>
            </td>
          </tr>
          <tr>
            <td style="width:100%;background:rgba(236,253,245,0.85);padding:20px 16px 8px">
              ${input.bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="width:100%;background:#a7f3d0;background-image:linear-gradient(160deg,#a7f3d0 0%,#6ee7b7 100%);padding:22px 24px;border-top:1px solid #6ee7b7;border-radius:0 0 20px 20px">
              <p style="margin:0;font-size:13px;line-height:1.5;font-weight:600;color:#064e3b">
                GTA Real Estate — Just a click away.
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

export function renderSavedSearchDigestEmail(input: {
  name?: string | null;
  searchName: string;
  listings: DigestListingLine[];
  searchUrl: string;
  unsubscribeUrl?: string | null;
}): RenderedEmail {
  const count = input.listings.length;
  const greet = input.name?.trim() ? `Hi ${input.name.trim()},` : "Hi there,";
  const subject =
    count === 1
      ? `New listing alert · ${input.listings[0]?.addressLine ?? input.searchName}`
      : `${count} new homes matching your search`;
  const text = [
    greet,
    "",
    `New listings matched “${input.searchName}”:`,
    "",
    ...input.listings.map(
      (l) =>
        `• ${l.addressLine}, ${l.city} · ${l.priceLabel}${l.metaLabel ? ` · ${l.metaLabel}` : ""} — ${l.listingUrl}`,
    ),
    "",
    `Browse all matches: ${input.searchUrl}`,
  ].join("\n");

  const cards = input.listings.map(renderDigestListingCard).join("");
  const previewNote =
    count > 0
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><p style="margin:0 0 16px;max-width:580px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:16px;line-height:1.45;color:#115e59;text-align:left">${escapeHtml(greet)} Here ${count === 1 ? "is a fresh match" : `are ${count} fresh matches`} for <strong style="color:#064e3b">${escapeHtml(input.searchName)}</strong>.</p></td></tr></table>`
      : "";

  const html = digestEmailShell({
    title: subject,
    preheader: `${count} new home${count === 1 ? "" : "s"} for ${input.searchName}`,
    heroTitle: "New listings found!",
    heroSubtitle:
      "We've found new homes that match your criteria—take a look.",
    unsubscribeUrl: input.unsubscribeUrl,
    bodyHtml: `
      ${previewNote}
      ${cards}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin:8px 0 12px">
        <tr>
          <td align="center">
            <a href="${escapeAttr(input.searchUrl)}" style="display:inline-block;background:#ecfdf5;background-image:linear-gradient(135deg,#ecfdf5 0%,#6ee7b7 100%);color:#064e3b;text-decoration:none;font-weight:700;font-size:13px;line-height:1.2;padding:10px 18px;border-radius:999px;border:1.5px solid #34d399;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
              Browse all matching homes →
            </a>
          </td>
        </tr>
      </table>
    `,
  });
  return { subject, text, html, kind: "saved_search_digest" };
}

export function renderNeighborhoodWeeklyEmail(input: {
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
}): RenderedEmail {
  const greet = input.name?.trim() ? `Hi ${input.name.trim()},` : "Hi there,";
  const subject = `Neighborhood weekly · ${input.homeLabel}`;
  const text = [
    greet,
    "",
    `This week near ${input.homeLabel} (≈${input.radiusKm} km):`,
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
    .filter(Boolean)
    .join("\n");

  const listBlock = (title: string, items: DigestListingLine[]) => {
    if (!items.length) {
      return `<p style="margin:0 0 12px;color:#64748b;font-size:14px">No ${title.toLowerCase()} in this window.</p>`;
    }
    return `
      <p style="margin:20px 0 8px;font-size:13px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em">${escapeHtml(title)}</p>
      <ul style="margin:0;padding-left:18px;color:#334155">
        ${items
          .map(
            (l) =>
              `<li style="margin:0 0 8px"><a href="${escapeAttr(l.listingUrl)}" style="color:#0f172a;text-decoration:none"><strong>${escapeHtml(l.addressLine)}</strong></a> · ${escapeHtml(l.priceLabel)}${l.metaLabel ? ` · ${escapeHtml(l.metaLabel)}` : ""}</li>`,
          )
          .join("")}
      </ul>`;
  };

  const html = emailLayout({
    title: "Neighborhood weekly report",
    preheader: `${input.newCount} new · ${input.soldCount} sold near ${input.homeLabel}`,
    unsubscribeUrl: input.unsubscribeUrl,
    bodyHtml: `
      <p style="margin:0 0 12px">${escapeHtml(greet)}</p>
      <p style="margin:0 0 16px">Here’s what happened near <strong>${escapeHtml(input.homeLabel)}</strong> over the past week (≈${input.radiusKm} km).</p>
      <div style="margin:0 0 16px;padding:14px 16px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0">
        <p style="margin:0;font-size:15px"><strong>${input.newCount}</strong> new · <strong>${input.soldCount}</strong> sold/leased${input.medianSoldLabel ? ` · median sold <strong>${escapeHtml(input.medianSoldLabel)}</strong>` : ""}</p>
      </div>
      ${listBlock("New listings", input.newListings)}
      ${listBlock("Sold & leased", input.soldListings)}
      ${ctaButton(input.ctaUrl, "View seller tools")}
    `,
  });
  return { subject, text, html, kind: "neighborhood_weekly" };
}
