import {
  isPropertyAlertEmailKind,
  propertyAlertEmailLabel,
} from "@/lib/agent/email-alert-kinds";

/**
 * Kinds that should notify the assigned agent on first open.
 * Transactional mail (welcome, verify, password reset, …) stays silent.
 */
export const EMAIL_OPEN_NOTIFY_KINDS = new Set([
  "agent_message",
  "shortlist",
  "cma_share",
  "newsletter",
  "saved_search_digest",
  "neighborhood_weekly",
  "price_reduction",
  "sold_alert",
  "just_listed",
  "property_update",
]);

export function shouldNotifyAgentOnEmailOpen(
  kind: string | null | undefined,
): boolean {
  if (!kind) return false;
  return EMAIL_OPEN_NOTIFY_KINDS.has(kind);
}

export type EmailOpenNotificationCopy = {
  title: string;
  body: string;
  /** Staff push preference bucket. */
  pushType: "alert_engagement" | "email_engagement";
};

function leadDisplayName(name: string | null | undefined): string {
  const trimmed = name?.trim();
  return trimmed || "Your lead";
}

/**
 * Build lock-screen / push copy from authoritative LeadEmailLog fields only.
 * Never invents property addresses from unrelated lead associations.
 */
export function emailOpenNotificationCopy(input: {
  kind: string | null | undefined;
  subject: string;
  leadName: string | null | undefined;
  /** Authoritative address only when resolved from this email's mlsNumber. */
  propertyAddress?: string | null;
}): EmailOpenNotificationCopy {
  const subject = input.subject.trim() || "your email";
  const lead = leadDisplayName(input.leadName);
  const address = input.propertyAddress?.trim() || null;

  if (isPropertyAlertEmailKind(input.kind)) {
    const label = propertyAlertEmailLabel(input.kind);
    const title =
      input.kind === "saved_search_digest"
        ? "Morning Digest Opened"
        : input.kind === "neighborhood_weekly"
          ? "Neighborhood Report Opened"
          : "Property Alert Opened";
    const body = address
      ? `${lead} opened your ${label.toLowerCase()}: ${address}`
      : `${lead} opened your ${label.toLowerCase()}: ${subject}`;
    return { title, body, pushType: "alert_engagement" };
  }

  // Manual CRM / agent-authored and other notify-eligible non-alert mail.
  return {
    title: "Email Opened",
    body: `${lead} opened your email: ${subject}`,
    pushType: "email_engagement",
  };
}

export function emailClickNotificationCopy(input: {
  kind: string | null | undefined;
  subject: string;
  leadName: string | null | undefined;
  propertyAddress?: string | null;
}): EmailOpenNotificationCopy | null {
  if (!isPropertyAlertEmailKind(input.kind)) {
    // Clicks on manual CRM mail are not pushed in this phase.
    return null;
  }
  const subject = input.subject.trim() || "your alert";
  const lead = leadDisplayName(input.leadName);
  const address = input.propertyAddress?.trim() || null;
  const label = propertyAlertEmailLabel(input.kind);
  return {
    title: "Property Alert Clicked",
    body: address
      ? `${lead} clicked your ${label.toLowerCase()}: ${address}`
      : `${lead} clicked your ${label.toLowerCase()}: ${subject}`,
    pushType: "alert_engagement",
  };
}
