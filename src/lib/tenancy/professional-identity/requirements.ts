/**
 * Stage 6.11D / 6.11D.1 / 6.11D.2 — professional/brokerage identity completion.
 * Incomplete identity never locks the live website or CRM.
 */

import type { TemplateCategory } from "@/lib/tenancy/templates";
import type { ProfessionalIdentitySnapshot } from "./types";

export type ProfessionalIdentityAssets = {
  brokerageLogoUrl: string | null;
  agentProfilePhotoUrl?: string | null;
};

/** Human-readable labels for Website Setup missing-field lists. */
export const WEBSITE_SETUP_FIELD_LABELS = {
  agentRegisteredName: "Agent Name",
  agentDesignation: "Agent Designation",
  agentCellPhone: "Agent Cell",
  brokerageRegisteredName: "Brokerage Name",
  brokerageAddress: "Brokerage Address",
  brokeragePhone: "Brokerage Phone",
  brokerageFax: "Brokerage Fax",
  brokerageLogoUrl: "Brokerage Logo",
  agentProfilePhotoUrl: "Agent Profile Photo",
  businessProfile: "Business profile",
  templateTheme: "Website design",
} as const;

export type WebsiteSetupMissingFieldKey =
  keyof typeof WEBSITE_SETUP_FIELD_LABELS;

/**
 * Required for Website Setup professionalIdentityStatus COMPLETE.
 * Stage 6.11D.2 — brokerageFax required; registration numbers are out of scope.
 * Brokerage logo comes from WorkspaceBranding.brokerageLogoUrl.
 */
export function evaluateProfessionalIdentityStatus(input: {
  identity: ProfessionalIdentitySnapshot | null | undefined;
  assets: ProfessionalIdentityAssets;
}): "COMPLETE" | "NOT_STARTED" {
  return listMissingProfessionalIdentityFields(input).length === 0
    ? "COMPLETE"
    : "NOT_STARTED";
}

export function listMissingProfessionalIdentityFields(input: {
  identity: ProfessionalIdentitySnapshot | null | undefined;
  assets: ProfessionalIdentityAssets;
}): WebsiteSetupMissingFieldKey[] {
  const row = input.identity;
  const missing: WebsiteSetupMissingFieldKey[] = [];
  const checks: Array<{
    key: WebsiteSetupMissingFieldKey;
    value: string | null | undefined;
  }> = [
    { key: "agentRegisteredName", value: row?.agentRegisteredName },
    { key: "agentDesignation", value: row?.agentDesignation },
    { key: "agentCellPhone", value: row?.agentCellPhone },
    { key: "brokerageRegisteredName", value: row?.brokerageRegisteredName },
    { key: "brokerageAddress", value: row?.brokerageAddress },
    { key: "brokeragePhone", value: row?.brokeragePhone },
    { key: "brokerageFax", value: row?.brokerageFax },
    { key: "brokerageLogoUrl", value: input.assets.brokerageLogoUrl },
  ];
  for (const check of checks) {
    if (!check.value?.trim()) missing.push(check.key);
  }
  return missing;
}

/**
 * Overall Website Setup COMPLETE using existing onboarding step statuses.
 * Does not suspend workspace / block public site / CRM.
 */
export function evaluateWebsiteSetupComplete(input: {
  businessProfileStatus: string;
  brandingStatus: string;
  professionalIdentityStatus: string;
  templateThemeStatus: string;
}): boolean {
  return (
    input.businessProfileStatus === "COMPLETE" &&
    input.brandingStatus === "COMPLETE" &&
    input.professionalIdentityStatus === "COMPLETE" &&
    input.templateThemeStatus === "COMPLETE"
  );
}

/**
 * Server-side missing-field list for Website Setup UI.
 * Category-aware: Agent Profile Photo only when AGENT branding requires it.
 */
export function listMissingWebsiteSetupFields(input: {
  category: TemplateCategory;
  businessProfileStatus: string;
  templateThemeStatus: string;
  identity: ProfessionalIdentitySnapshot | null | undefined;
  assets: {
    agentProfilePhotoUrl: string | null;
    brokerageLogoUrl: string | null;
  };
}): WebsiteSetupMissingFieldKey[] {
  const missing: WebsiteSetupMissingFieldKey[] = [];

  if (input.businessProfileStatus !== "COMPLETE") {
    missing.push("businessProfile");
  }

  missing.push(
    ...listMissingProfessionalIdentityFields({
      identity: input.identity,
      assets: { brokerageLogoUrl: input.assets.brokerageLogoUrl },
    }),
  );

  if (input.category === "AGENT") {
    if (!input.assets.agentProfilePhotoUrl?.trim()) {
      missing.push("agentProfilePhotoUrl");
    }
  }

  if (input.templateThemeStatus !== "COMPLETE") {
    missing.push("templateTheme");
  }

  return missing;
}

export function isWebsiteSetupIdentityComplete(input: {
  professionalIdentityStatus: string;
}): boolean {
  return input.professionalIdentityStatus === "COMPLETE";
}
