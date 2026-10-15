/**
 * Premium signup-lead staff email/SMS content + one-shot qualification update.
 * No schema migrations — qualification update dedupe uses SmsAutomationDispatch.
 */

import { purchaseTimeframeLabel } from "@/lib/agent/timeframe";
import { openLeadHandoffHref } from "@/lib/agent/lead-profile-query";
import { SITE_URL } from "@/lib/constants";
import {
  ctaButton,
  emailLayout,
  escapeHtml,
  infoCard,
} from "@/lib/email/layout";
import type { RenderedEmail } from "@/lib/email/templates";
import { formatConfirmSearchSummary } from "@/lib/auth/buyer-confirmed-preference";
import { sendNotification } from "@/lib/notifications";
import { isStaffEmailCategoryEnabled } from "@/lib/notifications/staff-categories";
import { prisma, scheduleWorkerSideEffect } from "@/lib/prisma";
import { isAgentRole } from "@/lib/roles";
import { resolveCommunicationsE164 } from "@/lib/sms/e164";
import {
  formatSignupLeadEmailSubject,
  type LeadNotificationBrand,
  LEGACY_HOUZZAT_NOTIFICATION_BRAND,
} from "@/lib/tenancy/lead-notification-brand";
import { filterStaffRecipientsForLead } from "@/lib/workspace-notification-recipients";
import type { Prisma } from "@prisma/client";

export const SIGNUP_QUALIFICATION_UPDATE_KEY =
  "agent.signup_qualification_update" as const;
/** @deprecated Use per-channel cycle keys; kept for source-guard compatibility. */
export const SIGNUP_QUALIFICATION_CYCLE_KEY = "qualification" as const;
export const SIGNUP_QUALIFICATION_EMAIL_CYCLE_KEY =
  "qualification:email" as const;
export const SIGNUP_QUALIFICATION_SMS_CYCLE_KEY = "qualification:sms" as const;

type QualificationNotifyChannel = "email" | "sms";
type QualificationNotifyDelivery = "sent" | "skipped" | "failed";

function qualificationNotifyCycleKey(
  channel: QualificationNotifyChannel,
): typeof SIGNUP_QUALIFICATION_EMAIL_CYCLE_KEY | typeof SIGNUP_QUALIFICATION_SMS_CYCLE_KEY {
  return channel === "email"
    ? SIGNUP_QUALIFICATION_EMAIL_CYCLE_KEY
    : SIGNUP_QUALIFICATION_SMS_CYCLE_KEY;
}

/** Map sendNotification channel result → SmsAutomationDispatch status. */
export function qualificationNotifyDispatchStatus(
  delivery: QualificationNotifyDelivery,
): "SENT" | "SKIPPED" | "FAILED" {
  switch (delivery) {
    case "sent":
      return "SENT";
    case "skipped":
      return "SKIPPED";
    case "failed":
      return "FAILED";
    default: {
      const _exhaustive: never = delivery;
      return _exhaustive;
    }
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

/**
 * Pre-channel-split rows used cycleKey "qualification" claimed as SENT before send.
 * Honor those so a post-deploy re-invoke cannot duplicate.
 */
async function hasLegacyQualificationNotifyClaim(
  workspaceId: string,
  leadId: string,
): Promise<boolean> {
  const legacy = await prisma.smsAutomationDispatch.findUnique({
    where: {
      workspaceId_leadId_automationKey_cycleKey: {
        workspaceId,
        leadId,
        automationKey: SIGNUP_QUALIFICATION_UPDATE_KEY,
        cycleKey: SIGNUP_QUALIFICATION_CYCLE_KEY,
      },
    },
    select: { id: true },
  });
  return Boolean(legacy);
}

/**
 * Per-channel claim via SmsAutomationDispatch.
 * SENT/SKIPPED/in-flight block; FAILED is reclaimable for retry.
 */
async function claimQualificationNotifyChannel(input: {
  workspaceId: string;
  leadId: string;
  channel: QualificationNotifyChannel;
}): Promise<string | null> {
  if (await hasLegacyQualificationNotifyClaim(input.workspaceId, input.leadId)) {
    return null;
  }
  const cycleKey = qualificationNotifyCycleKey(input.channel);
  try {
    const row = await prisma.smsAutomationDispatch.create({
      data: {
        workspaceId: input.workspaceId,
        leadId: input.leadId,
        automationKey: SIGNUP_QUALIFICATION_UPDATE_KEY,
        cycleKey,
        status: "PROCESSING",
        processedAt: new Date(),
      },
    });
    return row.id;
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const existing = await prisma.smsAutomationDispatch.findUnique({
      where: {
        workspaceId_leadId_automationKey_cycleKey: {
          workspaceId: input.workspaceId,
          leadId: input.leadId,
          automationKey: SIGNUP_QUALIFICATION_UPDATE_KEY,
          cycleKey,
        },
      },
      select: { id: true, status: true },
    });
    if (!existing) return null;
    if (existing.status !== "FAILED") return null;
    const claimed = await prisma.smsAutomationDispatch.updateMany({
      where: { id: existing.id, status: "FAILED" },
      data: {
        status: "PROCESSING",
        errorCode: null,
        processedAt: new Date(),
      },
    });
    return claimed.count === 1 ? existing.id : null;
  }
}

async function finishQualificationNotifyChannel(
  dispatchId: string,
  delivery: QualificationNotifyDelivery,
): Promise<void> {
  const status = qualificationNotifyDispatchStatus(delivery);
  await prisma.smsAutomationDispatch.update({
    where: { id: dispatchId },
    data: {
      status,
      processedAt: new Date(),
      errorCode: status === "FAILED" ? "DELIVERY_FAILED" : null,
    },
  });
}

function absoluteLeadCrmUrl(leadId: string): string {
  const path = openLeadHandoffHref(leadId);
  const base = SITE_URL.replace(/\/$/, "");
  return `${base}${path}`;
}

function row(label: string, value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  return `${label}: ${v}`;
}

function extractObservedFromCapture(
  captureContext: Prisma.JsonValue | null,
): {
  cities: string[];
  minPrice: number | null;
  maxPrice: number | null;
  propertyTypes: string[];
  minBeds: number | null;
  minBaths: number | null;
  summary: string | null;
} {
  const empty = {
    cities: [] as string[],
    minPrice: null as number | null,
    maxPrice: null as number | null,
    propertyTypes: [] as string[],
    minBeds: null as number | null,
    minBaths: null as number | null,
    summary: null as string | null,
  };
  if (!captureContext || typeof captureContext !== "object" || Array.isArray(captureContext)) {
    return empty;
  }
  const ctx = captureContext as Record<string, unknown>;
  const filters =
    ctx.searchFilters && typeof ctx.searchFilters === "object"
      ? (ctx.searchFilters as Record<string, unknown>)
      : null;
  const cities: string[] = [];
  if (typeof filters?.city === "string" && filters.city.trim()) {
    cities.push(filters.city.trim());
  }
  if (Array.isArray(filters?.cities)) {
    for (const c of filters.cities) {
      if (typeof c === "string" && c.trim()) cities.push(c.trim());
    }
  }
  const parseMoney = (raw: unknown): number | null => {
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string" && raw.trim()) {
      const n = Number(raw.replace(/[^\d.]/g, ""));
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };
  const parseCount = (raw: unknown): number | null => {
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string" && raw.trim()) {
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };
  const minPrice = parseMoney(filters?.minPrice);
  const maxPrice = parseMoney(filters?.maxPrice);
  const propertyTypes: string[] = [];
  if (typeof filters?.propertyType === "string") {
    propertyTypes.push(filters.propertyType);
  }
  if (Array.isArray(filters?.propertyTypes)) {
    for (const t of filters.propertyTypes) {
      if (typeof t === "string") propertyTypes.push(t);
    }
  }
  const minBeds = parseCount(filters?.minBeds);
  const minBaths = parseCount(filters?.minBaths);
  const summary = formatConfirmSearchSummary({ cities, minPrice, maxPrice });
  return {
    cities,
    minPrice,
    maxPrice,
    propertyTypes,
    minBeds,
    minBaths,
    summary,
  };
}

type SignupLeadNotifyMode = "initial" | "qualification";

export type SignupLeadNotifyContent = {
  subject: string;
  text: string;
  html: string;
  smsText: string;
  detailLines: string[];
};

export async function buildSignupLeadNotifyContent(
  leadId: string,
  mode: SignupLeadNotifyMode,
  brand: LeadNotificationBrand = LEGACY_HOUZZAT_NOTIFICATION_BRAND,
): Promise<SignupLeadNotifyContent | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      source: true,
      intent: true,
      listingMls: true,
      captureContext: true,
      utmSource: true,
      utmMedium: true,
      utmCampaign: true,
      customer: {
        select: {
          name: true,
          email: true,
          phone: true,
          phoneE164: true,
          emailVerified: true,
          phoneOtpVerifiedAt: true,
          ownsHome: true,
          homeAddress: true,
          homeUnit: true,
          purchaseTimeframe: true,
          mortgageFinancing: true,
          qualificationCompletedAt: true,
          buyerConfirmedPreference: {
            select: {
              cities: true,
              minPrice: true,
              maxPrice: true,
              propertyTypes: true,
              minBeds: true,
              source: true,
            },
          },
        },
      },
    },
  });
  if (!lead?.customer) return null;

  const c = lead.customer;
  const crmUrl = absoluteLeadCrmUrl(lead.id);
  const observed = extractObservedFromCapture(lead.captureContext);
  const pref = c.buyerConfirmedPreference;
  const searchSummary =
    (pref
      ? formatConfirmSearchSummary({
          cities: pref.cities,
          minPrice: pref.minPrice,
          maxPrice: pref.maxPrice,
        })
      : null) || observed.summary;

  const phone =
    resolveCommunicationsE164(c.phone, c.phoneE164) || c.phone?.trim() || null;
  const ownership =
    c.ownsHome === true ? "Homeowner" : c.ownsHome === false ? "Renter / no" : null;
  const timeframe = c.purchaseTimeframe
    ? purchaseTimeframeLabel(c.purchaseTimeframe)
    : null;
  const financing =
    c.mortgageFinancing === "PRE_APPROVED"
      ? "Pre-approved"
      : c.mortgageFinancing === "NOT_PRE_APPROVED"
        ? "Not pre-approved"
        : c.mortgageFinancing === "CASH"
          ? "Cash"
          : null;
  const claimed = [c.homeAddress?.trim(), c.homeUnit?.trim()]
    .filter(Boolean)
    .join(", ");
  const acquisition = [
    lead.utmSource ? `utm_source=${lead.utmSource}` : null,
    lead.utmMedium ? `utm_medium=${lead.utmMedium}` : null,
    lead.utmCampaign ? `utm_campaign=${lead.utmCampaign}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const detailLines = [
    mode === "qualification"
      ? "Buyer completed qualification with additional details."
      : brand.isHouzzatWorkspace
        ? "A new customer signed up on Houzzat."
        : `A new customer signed up on ${brand.displayName}.`,
    row("Name", c.name),
    row("Email", c.email),
    row("Phone", phone),
    row(
      "Email verified",
      c.emailVerified ? "Yes" : "Not yet",
    ),
    row(
      "Phone verified",
      c.phoneOtpVerifiedAt ? "Yes" : "Pending / skipped",
    ),
    row("Intent", lead.intent === "SELLER" ? "Seller" : "Buyer"),
    row("Homeownership", ownership),
    row("Claimed address", claimed || null),
    row("Buying timeframe", timeframe),
    row("Financing", financing),
    row("Search preferences", searchSummary),
    row("Registration property", lead.listingMls ? `MLS ${lead.listingMls}` : null),
    row("Acquisition", acquisition || null),
  ].filter((line): line is string => Boolean(line));

  const subject =
    mode === "qualification"
      ? brand.isHouzzatWorkspace
        ? "Signup lead — qualification update"
        : `${brand.displayName} signup — qualification update`
      : formatSignupLeadEmailSubject(brand);

  const text = [...detailLines, "", `View lead in HouzzatPro: ${crmUrl}`].join(
    "\n",
  );

  const htmlRows = detailLines
    .slice(1)
    .map((line) => {
      const idx = line.indexOf(": ");
      if (idx < 0) return `<div style="margin:0 0 8px">${escapeHtml(line)}</div>`;
      const label = line.slice(0, idx);
      const value = line.slice(idx + 2);
      return `<tr>
        <td style="padding:6px 12px 6px 0;vertical-align:top;font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#047857;white-space:nowrap">${escapeHtml(label)}</td>
        <td style="padding:6px 0;vertical-align:top;font-size:15px;color:#064e3b;font-weight:600">${escapeHtml(value)}</td>
      </tr>`;
    })
    .join("");

  const rendered: RenderedEmail = {
    subject,
    text,
    kind: mode === "qualification" ? "signup_qualification_update" : "signup_lead",
    html: emailLayout({
      title:
        mode === "qualification"
          ? "Qualification update"
          : "New signup lead",
      subtitle: detailLines[0] ?? undefined,
      preheader: subject,
      bodyHtml: `
        ${infoCard(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${htmlRows}</table>`)}
        <div style="margin:20px 0 0;text-align:center">${ctaButton(crmUrl, "Open lead in HouzzatPro")}</div>
        <p style="margin:14px 0 0;font-size:12px;color:#047857;word-break:break-all">${escapeHtml(crmUrl)}</p>
      `,
    }),
  };

  const name = c.name?.trim() || "New signup";
  const smsBits = [
    mode === "qualification" ? `${name} updated qualification` : `${name} signed up`,
    timeframe ? `Buy: ${timeframe}` : null,
    financing ? financing : null,
    searchSummary,
    crmUrl,
  ].filter(Boolean);
  const smsText = smsBits.join(" · ").slice(0, 480);

  return {
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
    smsText,
    detailLines,
  };
}

function hasMeaningfulQualificationUpdate(lines: string[]): boolean {
  const keys = [
    "Homeownership:",
    "Claimed address:",
    "Buying timeframe:",
    "Financing:",
    "Search preferences:",
  ];
  return lines.some((line) => keys.some((k) => line.startsWith(k)));
}

/**
 * One consolidated email + SMS after qualification completes.
 * Per-channel SmsAutomationDispatch dedupe: SENT only after delivery success;
 * FAILED is reclaimable so retries cannot permanently suppress the other channel.
 */
export function scheduleSignupQualificationCompletedNotify(input: {
  leadId: string;
  assigneeId?: string | null;
  brand?: LeadNotificationBrand;
}): void {
  const assigneeId = input.assigneeId?.trim();
  if (!assigneeId) return;

  scheduleWorkerSideEffect(
    (async () => {
      const lead = await prisma.lead.findUnique({
        where: { id: input.leadId },
        select: { id: true, workspaceId: true, assignedAgentId: true },
      });
      if (!lead?.workspaceId) return;
      const agentId = lead.assignedAgentId ?? assigneeId;
      if (!agentId) return;

      const content = await buildSignupLeadNotifyContent(
        lead.id,
        "qualification",
        input.brand ?? LEGACY_HOUZZAT_NOTIFICATION_BRAND,
      );
      if (!content || !hasMeaningfulQualificationUpdate(content.detailLines)) {
        return;
      }

      const authorized = await filterStaffRecipientsForLead(
        lead.id,
        [agentId],
        "new_lead_email",
      );
      if (authorized.length === 0) return;

      const user = await prisma.user.findUnique({
        where: { id: agentId },
        select: {
          id: true,
          email: true,
          phone: true,
          role: true,
          disabledAt: true,
          pushNotificationPrefs: true,
        },
      });
      if (!user || user.disabledAt || !isAgentRole(user.role)) return;
      if (!isStaffEmailCategoryEnabled(user.pushNotificationPrefs, "new_leads")) {
        return;
      }

      const toEmail = user.email?.trim();
      if (toEmail) {
        const emailDispatchId = await claimQualificationNotifyChannel({
          workspaceId: lead.workspaceId,
          leadId: lead.id,
          channel: "email",
        });
        if (!emailDispatchId) {
          console.info(
            "[staff-notify] qualification update email skipped: duplicate",
            { leadId: lead.id },
          );
        } else {
          try {
            const result = await sendNotification({
              toEmail,
              subject: content.subject,
              text: content.text,
              html: content.html,
              workspaceId: lead.workspaceId,
            });
            await finishQualificationNotifyChannel(
              emailDispatchId,
              result.email,
            );
            if (result.email === "failed") {
              console.error(
                "[staff-notify] qualification update email failed",
                { leadId: lead.id },
              );
            }
          } catch (error) {
            await finishQualificationNotifyChannel(emailDispatchId, "failed");
            throw error;
          }
        }
      }

      const toPhone = user.phone?.trim();
      if (toPhone && content.smsText) {
        const smsDispatchId = await claimQualificationNotifyChannel({
          workspaceId: lead.workspaceId,
          leadId: lead.id,
          channel: "sms",
        });
        if (!smsDispatchId) {
          console.info(
            "[staff-notify] qualification update sms skipped: duplicate",
            { leadId: lead.id },
          );
        } else {
          try {
            const result = await sendNotification({
              toPhone,
              subject: content.subject,
              text: content.text,
              smsText: content.smsText,
              workspaceId: lead.workspaceId,
              smsClass: "staff",
            });
            await finishQualificationNotifyChannel(smsDispatchId, result.sms);
            if (result.sms === "failed") {
              console.error("[staff-notify] qualification update sms failed", {
                leadId: lead.id,
              });
            }
          } catch (error) {
            await finishQualificationNotifyChannel(smsDispatchId, "failed");
            throw error;
          }
        }
      }
    })().catch((error) => {
      console.error("[staff-notify] qualification update failed", {
        leadId: input.leadId,
        error: error instanceof Error ? error.message : String(error),
      });
    }),
  );
}
