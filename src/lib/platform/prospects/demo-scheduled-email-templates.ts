/**
 * HouzzatPRO customer emails after Admin schedules / reschedules a demo.
 * Tenant/workspace branding must never be applied.
 */

import { PLATFORM_PRODUCT_NAME } from "@/lib/constants";
import { escapeAttr, escapeHtml } from "@/lib/email/layout";
import type { RenderedEmail } from "@/lib/email/templates";
import { formatHouzzatProZonedDateTime } from "@/lib/platform/datetime";
import {
  BOOK_DEMO_EMAIL_TAGLINE,
  HOUZZATPRO_PUBLIC_ORIGIN,
  houzzatProEmailDetailRow,
  houzzatProEmailLayout,
} from "@/lib/platform/public/book-demo-email-templates";

export type DemoScheduledEmailVariant = "scheduled" | "rescheduled";

export type DemoScheduledEmailFields = {
  contactName: string;
  scheduledAt: Date | string;
  timeZoneId?: string;
  timeZoneLabel?: string;
};

const LOOK_FORWARD =
  "We look forward to showing you how HouzzatPRO can help you build and grow your real estate business.";

function greeting(contactName: string): string {
  const name = contactName.trim();
  return name ? `Hi ${name},` : "Hi there,";
}

function appointmentParts(input: DemoScheduledEmailFields) {
  const parts = formatHouzzatProZonedDateTime(input.scheduledAt, {
    timeZoneId: input.timeZoneId,
    timeZoneLabel: input.timeZoneLabel,
    dateMonth: "long",
  });
  if (!parts) {
    throw new Error("A valid scheduledAt is required to render the demo email");
  }
  return parts;
}

function appointmentRows(parts: {
  date: string;
  time: string;
  timeZoneLabel: string;
}): Array<[string, string]> {
  return [
    ["Date", parts.date],
    ["Time", parts.time],
    ["Time Zone", parts.timeZoneLabel],
  ];
}

function renderDemoAppointmentEmail(input: {
  variant: DemoScheduledEmailVariant;
  fields: DemoScheduledEmailFields;
}): RenderedEmail {
  const parts = appointmentParts(input.fields);
  const greet = greeting(input.fields.contactName);
  const rows = appointmentRows(parts);
  const scheduled = input.variant === "scheduled";
  const subject = scheduled
    ? "Your HouzzatPRO Demo is Scheduled"
    : "Your HouzzatPRO Demo Has Been Rescheduled";
  const intro = scheduled
    ? "Your HouzzatPRO demo has been scheduled."
    : "Your HouzzatPRO demo has been rescheduled.";
  const preheader = scheduled
    ? `Your HouzzatPRO demo is scheduled for ${parts.date} at ${parts.time} ${parts.timeZoneLabel}`
    : `Your HouzzatPRO demo has been rescheduled to ${parts.date} at ${parts.time} ${parts.timeZoneLabel}`;

  const text = [
    greet,
    "",
    intro,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    LOOK_FORWARD,
    "",
    PLATFORM_PRODUCT_NAME,
    BOOK_DEMO_EMAIL_TAGLINE,
    HOUZZATPRO_PUBLIC_ORIGIN,
  ].join("\n");

  const html = houzzatProEmailLayout({
    preheader,
    title: subject,
    subtitle: BOOK_DEMO_EMAIL_TAGLINE,
    bodyHtml: `
      <p style="margin:0 0 12px">${escapeHtml(greet)}</p>
      <p style="margin:0 0 16px">${escapeHtml(intro)}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin:0 0 16px">
        ${rows.map(([k, v]) => houzzatProEmailDetailRow(k, v)).join("")}
      </table>
      <p style="margin:0 0 12px">${escapeHtml(LOOK_FORWARD)}</p>
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
    kind: scheduled
      ? "houzzatpro_demo_scheduled"
      : "houzzatpro_demo_rescheduled",
  };
}

export function renderDemoScheduledEmail(
  fields: DemoScheduledEmailFields,
): RenderedEmail {
  return renderDemoAppointmentEmail({ variant: "scheduled", fields });
}

export function renderDemoRescheduledEmail(
  fields: DemoScheduledEmailFields,
): RenderedEmail {
  return renderDemoAppointmentEmail({ variant: "rescheduled", fields });
}
