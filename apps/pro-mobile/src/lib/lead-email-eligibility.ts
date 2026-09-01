/**
 * Shared CASL / email eligibility checks for lead shortlist email.
 */

import type { MobileLeadDetail } from "../types/lead";

export function isLeadEmailEligible(detail: {
  customer?: {
    email?: string | null;
    caslConsentAt?: string | null;
    emailAlertsEnabled?: boolean | null;
  } | null;
  contactConsentAt?: string | null;
}): { ok: boolean; reason: string | null } {
  const email = detail.customer?.email?.trim();
  if (!email) {
    return { ok: false, reason: "No email on file" };
  }
  const consented =
    Boolean(detail.contactConsentAt) ||
    Boolean(detail.customer?.caslConsentAt);
  if (!consented) {
    return { ok: false, reason: "Needs CASL consent" };
  }
  if (detail.customer?.emailAlertsEnabled === false) {
    return { ok: false, reason: "Email alerts are off" };
  }
  return { ok: true, reason: null };
}
