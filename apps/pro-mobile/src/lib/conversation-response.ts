/**
 * Stage 4.8 — LeadEmailLog envelope helpers (no React Native imports).
 */

import type { MobileLeadEmail } from "../types/lead";

export function unwrapEmailsList(payload: unknown): MobileLeadEmail[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload as MobileLeadEmail[];
  if (typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  if (Array.isArray(root.emails)) {
    return root.emails as MobileLeadEmail[];
  }
  if (root.data && typeof root.data === "object") {
    const nested = root.data as Record<string, unknown>;
    if (Array.isArray(nested.emails)) {
      return nested.emails as MobileLeadEmail[];
    }
  }
  return [];
}

export function unwrapEmail(payload: unknown): MobileLeadEmail | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  if (root.email && typeof root.email === "object") {
    return root.email as MobileLeadEmail;
  }
  if (root.data && typeof root.data === "object") {
    const nested = root.data as Record<string, unknown>;
    if (nested.email && typeof nested.email === "object") {
      return nested.email as MobileLeadEmail;
    }
  }
  return null;
}

export function unwrapComposer(payload: unknown): {
  toEmail: string | null;
  consented: boolean;
  alertsEnabled: boolean;
} {
  const defaults = {
    toEmail: null as string | null,
    consented: false,
    alertsEnabled: true,
  };
  if (!payload || typeof payload !== "object") return defaults;
  const root = payload as Record<string, unknown>;
  const composer =
    (root.composer && typeof root.composer === "object"
      ? (root.composer as Record<string, unknown>)
      : null) ||
    (root.data &&
    typeof root.data === "object" &&
    (root.data as Record<string, unknown>).composer &&
    typeof (root.data as Record<string, unknown>).composer === "object"
      ? ((root.data as Record<string, unknown>).composer as Record<
          string,
          unknown
        >)
      : null);
  if (!composer) return defaults;
  return {
    toEmail: typeof composer.toEmail === "string" ? composer.toEmail : null,
    consented: Boolean(composer.consented),
    alertsEnabled: composer.alertsEnabled !== false,
  };
}

export function unwrapNextCursor(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  if (typeof root.nextCursor === "string") return root.nextCursor;
  if (root.data && typeof root.data === "object") {
    const nested = root.data as Record<string, unknown>;
    if (typeof nested.nextCursor === "string") return nested.nextCursor;
  }
  return null;
}

/** Lead detail GET may include emails[] before /conversations is deployed. */
export function unwrapLeadDetailEmails(payload: unknown): MobileLeadEmail[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const lead =
    root.lead && typeof root.lead === "object"
      ? (root.lead as Record<string, unknown>)
      : root.data &&
          typeof root.data === "object" &&
          (root.data as Record<string, unknown>).lead &&
          typeof (root.data as Record<string, unknown>).lead === "object"
        ? ((root.data as Record<string, unknown>).lead as Record<string, unknown>)
        : null;
  if (!lead || !Array.isArray(lead.emails)) return [];
  return lead.emails as MobileLeadEmail[];
}

export function unwrapLeadDetailComposer(payload: unknown): {
  toEmail: string | null;
  consented: boolean;
  alertsEnabled: boolean;
} | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const lead =
    root.lead && typeof root.lead === "object"
      ? (root.lead as Record<string, unknown>)
      : null;
  if (!lead) return null;
  const customer =
    lead.customer && typeof lead.customer === "object"
      ? (lead.customer as Record<string, unknown>)
      : null;
  const toEmail =
    typeof customer?.email === "string" ? customer.email.trim() || null : null;
  const consented = Boolean(
    lead.contactConsentAt || customer?.caslConsentAt,
  );
  const alertsEnabled = customer?.emailAlertsEnabled !== false;
  return { toEmail, consented, alertsEnabled };
}
