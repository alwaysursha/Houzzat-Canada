import type { AppointmentStatus, AppointmentType } from "@prisma/client";
import { emailLayout, escapeAttr, escapeHtml } from "@/lib/email/layout";
import { sendNotification } from "@/lib/notifications";
import {
  appendAgentSignatureHtml,
  appendAgentSignatureText,
  appendEmailFooterText,
  resolveWorkspaceEmailBrand,
  toEmailBrandChrome,
  type EmailBrandChrome,
  type TenantEmailBrand,
} from "@/lib/email/tenant-email-brand";

/** Ontario tenants, including Niagara, use this zone. Workspaces have no stored zone. */
export const APPOINTMENT_EMAIL_TIME_ZONE = "America/Toronto";

export function appointmentTypeLabel(type: AppointmentType): string {
  switch (type) {
    case "SHOWING":
      return "Showing";
    case "VIRTUAL_VIEWING":
      return "Virtual viewing";
    case "BUYER_SESSION":
      return "Buyer meeting";
    case "VALUATION_CALL":
      return "Valuation call";
    default: {
      const unknown: never = type;
      return unknown;
    }
  }
}

export function appointmentStatusCopy(
  status: AppointmentStatus,
  typeLabel: string,
): { subject: string; heading: string; lead: string; statusLabel: string } {
  switch (status) {
    case "REQUESTED":
      return {
        subject: `We received your ${typeLabel} request`,
        heading: `${typeLabel} request received`,
        lead: "This request is not confirmed yet. Your agent will follow up.",
        statusLabel: "Requested",
      };
    case "CONFIRMED":
      return {
        subject: `Your ${typeLabel} is confirmed`,
        heading: `${typeLabel} confirmed`,
        lead: "Your appointment is confirmed.",
        statusLabel: "Confirmed",
      };
    case "RESCHEDULED":
      return {
        subject: `Your ${typeLabel} was rescheduled`,
        heading: `${typeLabel} rescheduled`,
        lead: "The time for this appointment has changed.",
        statusLabel: "Rescheduled",
      };
    case "CANCELLED":
      return {
        subject: `Your ${typeLabel} was cancelled`,
        heading: `${typeLabel} cancelled`,
        lead: "This appointment is no longer scheduled.",
        statusLabel: "Cancelled",
      };
    case "COMPLETED":
      return {
        subject: `Your ${typeLabel} is complete`,
        heading: `${typeLabel} complete`,
        lead: "This appointment has been completed.",
        statusLabel: "Completed",
      };
    default: {
      const unknown: never = status;
      return unknown;
    }
  }
}

export function customerEmailsForAppointmentStatus(
  status: AppointmentStatus,
): boolean {
  switch (status) {
    case "REQUESTED":
    case "CONFIRMED":
    case "RESCHEDULED":
    case "CANCELLED":
      return true;
    case "COMPLETED":
      return false;
    default: {
      const unknown: never = status;
      return unknown;
    }
  }
}

function formatAppointmentWhen(
  startsAt: Date | null,
  endsAt: Date | null,
  timeZone: string,
): string {
  if (!startsAt || Number.isNaN(startsAt.getTime())) return "Not scheduled yet";
  const zone = timeZone.trim() || APPOINTMENT_EMAIL_TIME_ZONE;
  const start = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(startsAt);
  if (!endsAt || Number.isNaN(endsAt.getTime())) return start;
  const end = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(endsAt);
  return `${start} – ${end}`;
}

function detailRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:8px 12px 8px 0;font-size:13px;line-height:1.4;color:#64748b;vertical-align:top">${escapeHtml(label)}</td>
    <td style="padding:8px 0;font-size:14px;line-height:1.4;color:#0f172a;font-weight:600;vertical-align:top">${escapeHtml(value)}</td>
  </tr>`;
}

function actionButton(href: string, label: string, color: string): string {
  return `<p style="margin:18px 0 0">
    <a href="${escapeAttr(href)}" style="display:inline-block;background:${escapeAttr(color)};color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;line-height:1.2;padding:12px 18px;border-radius:8px">${escapeHtml(label)}</a>
  </p>`;
}

function layoutFromChrome(input: {
  subject: string;
  preheader: string;
  title: string;
  bodyHtml: string;
  chrome: EmailBrandChrome;
}): string {
  return emailLayout({
    subject: input.subject,
    preheader: input.preheader,
    preheaderBodyText: input.preheader,
    title: input.title,
    bodyHtml: input.bodyHtml,
    footerNote: input.chrome.footerNote,
    brandLabel: input.chrome.brandLabel,
    brandLogoUrl: input.chrome.brandLogoUrl,
    brandPrimaryColor: input.chrome.brandPrimaryColor,
    brandWebsiteUrl: input.chrome.brandWebsiteUrl,
    presentation: input.chrome.presentation,
  });
}

export function renderAppointmentCustomerEmail(input: {
  recipientName?: string | null;
  type: AppointmentType;
  status: AppointmentStatus;
  startsAt: Date | null;
  endsAt?: Date | null;
  timeZone?: string | null;
  listingMls?: string | null;
  locationLabel?: string | null;
  videoJoinUrl?: string | null;
  chrome: EmailBrandChrome;
  replyTo?: string | null;
  websiteUrl?: string | null;
}): { subject: string; text: string; html: string } {
  const typeLabel = appointmentTypeLabel(input.type);
  const copy = appointmentStatusCopy(input.status, typeLabel);
  const when = formatAppointmentWhen(
    input.startsAt,
    input.endsAt ?? null,
    input.timeZone?.trim() || APPOINTMENT_EMAIL_TIME_ZONE,
  );
  const location = input.locationLabel?.trim() || null;
  const mls = input.listingMls?.trim() || null;
  const video = input.videoJoinUrl?.trim() || null;
  const greet = input.recipientName?.trim()
    ? `Hi ${input.recipientName.trim()},`
    : "Hi,";
  const accent = input.chrome.brandPrimaryColor?.trim() || "#047857";
  const website = input.websiteUrl?.trim() || input.chrome.brandWebsiteUrl?.trim() || null;
  const accountUrl = website ? `${website.replace(/\/$/, "")}/account` : null;
  const replyTo = input.replyTo?.trim() || null;

  const rows = [
    detailRow("Status", copy.statusLabel),
    detailRow("Appointment", typeLabel),
    detailRow("When", when),
    location ? detailRow("Location", location) : "",
    !location && mls ? detailRow("Listing", `MLS® ${mls}`) : "",
  ].join("");

  const actions = [
    video ? actionButton(video, "Join video", accent) : "",
    accountUrl ? actionButton(accountUrl, "View your account", accent) : "",
    replyTo
      ? `<p style="margin:14px 0 0;font-size:14px;line-height:1.5"><a href="${escapeAttr(`mailto:${replyTo}`)}" style="color:${escapeAttr(accent)};font-weight:600">Contact your agent</a></p>`
      : "",
  ].join("");

  const bodyHtml = appendAgentSignatureHtml(
    `
      <p style="margin:0 0 12px;font-size:16px;line-height:1.5;color:#0f172a">${escapeHtml(greet)}</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#334155">${escapeHtml(copy.lead)}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 8px">
        ${rows}
      </table>
      ${actions}
    `,
    input.chrome.agentSignatureHtml,
  );

  const textLines = [
    greet,
    "",
    copy.lead,
    `Status: ${copy.statusLabel}`,
    `Appointment: ${typeLabel}`,
    `When: ${when}`,
    location ? `Location: ${location}` : null,
    !location && mls ? `Listing: MLS® ${mls}` : null,
    video ? `Join video: ${video}` : null,
    accountUrl ? `Account: ${accountUrl}` : null,
    replyTo ? `Contact: ${replyTo}` : null,
  ].filter((line): line is string => line !== null);

  const text = appendEmailFooterText(
    appendAgentSignatureText(textLines.join("\n"), input.chrome.agentSignatureText),
    input.chrome.footerNote,
  );

  return {
    subject: copy.subject,
    text,
    html: layoutFromChrome({
      subject: copy.subject,
      preheader: copy.lead,
      title: copy.heading,
      bodyHtml,
      chrome: input.chrome,
    }),
  };
}

export function renderLeadRequestAcknowledgement(input: {
  recipientName?: string | null;
  locationLabel?: string | null;
  listingMls?: string | null;
  chrome: EmailBrandChrome;
  replyTo?: string | null;
  websiteUrl?: string | null;
}): { subject: string; text: string; html: string } {
  const greet = input.recipientName?.trim()
    ? `Hi ${input.recipientName.trim()},`
    : "Hi,";
  const location = input.locationLabel?.trim() || null;
  const mls = input.listingMls?.trim() || null;
  const lead = "We received your message. This is not an appointment confirmation.";
  const accent = input.chrome.brandPrimaryColor?.trim() || "#047857";
  const website = input.websiteUrl?.trim() || input.chrome.brandWebsiteUrl?.trim() || null;
  const replyTo = input.replyTo?.trim() || null;
  const subject = "We received your message";
  const rows = [
    location ? detailRow("Property", location) : "",
    mls ? detailRow("Listing", `MLS® ${mls}`) : "",
  ].join("");
  const bodyHtml = appendAgentSignatureHtml(
    `
      <p style="margin:0 0 12px;font-size:16px;line-height:1.5;color:#0f172a">${escapeHtml(greet)}</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#334155">${escapeHtml(lead)}</p>
      ${rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">${rows}</table>` : ""}
      ${replyTo ? `<p style="margin:14px 0 0;font-size:14px;line-height:1.5"><a href="${escapeAttr(`mailto:${replyTo}`)}" style="color:${escapeAttr(accent)};font-weight:600">Contact your agent</a></p>` : ""}
      ${website ? `<p style="margin:8px 0 0;font-size:13px;line-height:1.5"><a href="${escapeAttr(website)}" style="color:${escapeAttr(accent)}">${escapeHtml(website.replace(/^https?:\/\//, ""))}</a></p>` : ""}
    `,
    input.chrome.agentSignatureHtml,
  );
  const text = appendEmailFooterText(
    appendAgentSignatureText(
      [
        greet,
        "",
        lead,
        location ? `Property: ${location}` : null,
        mls ? `Listing: MLS® ${mls}` : null,
        replyTo ? `Contact: ${replyTo}` : null,
        website,
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n"),
      input.chrome.agentSignatureText,
    ),
    input.chrome.footerNote,
  );
  return {
    subject,
    text,
    html: layoutFromChrome({
      subject,
      preheader: lead,
      title: "Message received",
      bodyHtml,
      chrome: input.chrome,
    }),
  };
}

async function loadLeadFacingBrand(input: {
  workspaceId: string;
  agentId?: string | null;
  leadId?: string | null;
  customerId?: string | null;
}): Promise<TenantEmailBrand | null> {
  const agentId = input.agentId?.trim() || null;
  return resolveWorkspaceEmailBrand({
    workspaceId: input.workspaceId,
    preferredAgentUserId: agentId,
    leadId: agentId ? null : input.leadId,
    customerId: agentId ? null : input.customerId,
  });
}

export async function sendAppointmentCustomerEmail(input: {
  workspaceId: string;
  toEmail: string;
  toPhone?: string | null;
  recipientName?: string | null;
  type: AppointmentType;
  status: AppointmentStatus;
  startsAt: Date | null;
  endsAt?: Date | null;
  listingMls?: string | null;
  locationLabel?: string | null;
  videoJoinUrl?: string | null;
  agentId?: string | null;
  leadId?: string | null;
  customerId?: string | null;
}): Promise<void> {
  if (!customerEmailsForAppointmentStatus(input.status)) return;
  const toEmail = input.toEmail.trim();
  if (!toEmail) return;
  const brand = await loadLeadFacingBrand(input);
  if (!brand) return;
  const chrome = toEmailBrandChrome(brand);
  const rendered = renderAppointmentCustomerEmail({
    recipientName: input.recipientName,
    type: input.type,
    status: input.status,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    listingMls: input.listingMls,
    locationLabel: input.locationLabel,
    videoJoinUrl: input.videoJoinUrl,
    chrome,
    replyTo: brand.replyTo,
    websiteUrl: brand.websiteUrl,
  });
  const confirmed = input.status === "CONFIRMED";
  await sendNotification({
    toEmail,
    toPhone: confirmed ? input.toPhone : null,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
    replyTo: brand.replyTo,
    workspaceId: input.workspaceId,
    smsClass: "transactional",
    smsText: confirmed
      ? `Houzzat: ${appointmentTypeLabel(input.type)} confirmed${
          input.startsAt ? ` ${formatAppointmentWhen(input.startsAt, null, APPOINTMENT_EMAIL_TIME_ZONE)}` : ""
        }.`
      : undefined,
  });
}

export async function sendLeadRequestAcknowledgement(input: {
  workspaceId: string;
  toEmail: string;
  recipientName?: string | null;
  locationLabel?: string | null;
  listingMls?: string | null;
  agentId?: string | null;
  leadId?: string | null;
  customerId?: string | null;
}): Promise<void> {
  const toEmail = input.toEmail.trim();
  if (!toEmail) return;
  const brand = await loadLeadFacingBrand(input);
  if (!brand) return;
  const chrome = toEmailBrandChrome(brand);
  const rendered = renderLeadRequestAcknowledgement({
    recipientName: input.recipientName,
    locationLabel: input.locationLabel,
    listingMls: input.listingMls,
    chrome,
    replyTo: brand.replyTo,
    websiteUrl: brand.websiteUrl,
  });
  await sendNotification({
    toEmail,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
    replyTo: brand.replyTo,
    workspaceId: input.workspaceId,
  });
}
