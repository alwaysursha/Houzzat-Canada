/**
 * Stage 6.11D / 6.11D.1 / 6.11D.2 / 6.11E.8 / 6.11E.8B — professional/brokerage
 * identity + Website Setup completion. Incomplete identity never locks the live
 * website or CRM.
 */

import {
  isValidConfiguredTeamSignatureTheme,
  type TemplateCategory,
} from "@/lib/tenancy/templates";
import {
  TEAM_SIGNATURE_READINESS_FIELD_LABELS,
  type TeamSignatureDataReadiness,
  type TeamSignatureReadinessFieldKey,
} from "@/lib/tenancy/team-roster/readiness";
import type { ProfessionalIdentitySnapshot } from "./types";

export type ProfessionalIdentityAssets = {
  brokerageLogoUrl: string | null;
  agentProfilePhotoUrl?: string | null;
  logoUrl?: string | null;
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
  ...TEAM_SIGNATURE_READINESS_FIELD_LABELS,
} as const;

export type WebsiteSetupMissingFieldKey =
  keyof typeof WEBSITE_SETUP_FIELD_LABELS;

const BROKERAGE_IDENTITY_CHECKS: Array<{
  key: WebsiteSetupMissingFieldKey;
  valueFrom: (
    row: ProfessionalIdentitySnapshot | null | undefined,
    assets: ProfessionalIdentityAssets,
  ) => string | null | undefined;
}> = [
  {
    key: "brokerageRegisteredName",
    valueFrom: (row) => row?.brokerageRegisteredName,
  },
  {
    key: "brokerageAddress",
    valueFrom: (row) => row?.brokerageAddress,
  },
  {
    key: "brokeragePhone",
    valueFrom: (row) => row?.brokeragePhone,
  },
  {
    key: "brokerageFax",
    valueFrom: (row) => row?.brokerageFax,
  },
  {
    key: "brokerageLogoUrl",
    valueFrom: (_row, assets) => assets.brokerageLogoUrl,
  },
];

/**
 * Required for Website Setup professionalIdentityStatus COMPLETE.
 * AGENT/DEFAULT: agent personal + brokerage.
 * TEAM: brokerage only (no solo Agent identity).
 */
export function evaluateProfessionalIdentityStatus(input: {
  identity: ProfessionalIdentitySnapshot | null | undefined;
  assets: ProfessionalIdentityAssets;
  category?: TemplateCategory;
}): "COMPLETE" | "NOT_STARTED" {
  return listMissingProfessionalIdentityFields(input).length === 0
    ? "COMPLETE"
    : "NOT_STARTED";
}

export function listMissingProfessionalIdentityFields(input: {
  identity: ProfessionalIdentitySnapshot | null | undefined;
  assets: ProfessionalIdentityAssets;
  category?: TemplateCategory;
}): WebsiteSetupMissingFieldKey[] {
  const row = input.identity;
  const missing: WebsiteSetupMissingFieldKey[] = [];
  const category = input.category ?? "AGENT";

  if (category !== "TEAM") {
    const personal: Array<{
      key: WebsiteSetupMissingFieldKey;
      value: string | null | undefined;
    }> = [
      { key: "agentRegisteredName", value: row?.agentRegisteredName },
      { key: "agentDesignation", value: row?.agentDesignation },
      { key: "agentCellPhone", value: row?.agentCellPhone },
    ];
    for (const check of personal) {
      if (!check.value?.trim()) missing.push(check.key);
    }
  }

  for (const check of BROKERAGE_IDENTITY_CHECKS) {
    if (!check.valueFrom(row, input.assets)?.trim()) {
      missing.push(check.key);
    }
  }
  return missing;
}

/**
 * Overall Website Setup COMPLETE using existing onboarding step statuses.
 * TEAM requires a valid Team Signature theme plus Team roster/leader data
 * readiness. Does not suspend workspace / block public site / CRM.
 */
export function evaluateWebsiteSetupComplete(input: {
  businessProfileStatus: string;
  brandingStatus: string;
  professionalIdentityStatus: string;
  templateThemeStatus: string;
  category?: TemplateCategory;
  teamSignatureDataReady?: boolean;
  /** Persisted WorkspaceBranding.themeId — required for TEAM theme gate. */
  themeId?: string | null;
}): boolean {
  const category = input.category ?? "DEFAULT";
  const base =
    input.businessProfileStatus === "COMPLETE" &&
    input.brandingStatus === "COMPLETE" &&
    input.professionalIdentityStatus === "COMPLETE";

  if (!base) return false;

  if (category === "TEAM") {
    if (!isValidConfiguredTeamSignatureTheme(input.themeId ?? null)) {
      return false;
    }
    return input.teamSignatureDataReady === true;
  }

  // AGENT / DEFAULT / BROKERAGE: selectable catalog theme step unchanged.
  return input.templateThemeStatus === "COMPLETE";
}

/**
 * Server-side missing-field list for Website Setup UI.
 * Category-aware: Agent photo for AGENT; Team logo/roster/leader + Team theme
 * for TEAM.
 */
export function listMissingWebsiteSetupFields(input: {
  category: TemplateCategory;
  businessProfileStatus: string;
  templateThemeStatus: string;
  identity: ProfessionalIdentitySnapshot | null | undefined;
  assets: {
    agentProfilePhotoUrl: string | null;
    brokerageLogoUrl: string | null;
    logoUrl?: string | null;
  };
  teamSignatureReadiness?: Pick<
    TeamSignatureDataReadiness,
    "missing" | "sections"
  > | null;
  themeId?: string | null;
}): WebsiteSetupMissingFieldKey[] {
  const missing: WebsiteSetupMissingFieldKey[] = [];

  if (input.businessProfileStatus !== "COMPLETE") {
    missing.push("businessProfile");
  }

  missing.push(
    ...listMissingProfessionalIdentityFields({
      identity: input.identity,
      assets: { brokerageLogoUrl: input.assets.brokerageLogoUrl },
      category: input.category,
    }),
  );

  if (input.category === "AGENT") {
    if (!input.assets.agentProfilePhotoUrl?.trim()) {
      missing.push("agentProfilePhotoUrl");
    }
  }

  if (input.category === "TEAM") {
    if (!input.assets.logoUrl?.trim()) {
      missing.push("teamLogoUrl");
    }
    const teamMissing = input.teamSignatureReadiness?.missing ?? [];
    for (const key of teamMissing) {
      if (
        key === "visibleTeamMember" ||
        key === "teamLeader" ||
        key === "teamLeaderInvalid"
      ) {
        missing.push(key);
      }
    }
    if (!isValidConfiguredTeamSignatureTheme(input.themeId ?? null)) {
      missing.push("templateTheme");
    }
  } else if (input.templateThemeStatus !== "COMPLETE") {
    missing.push("templateTheme");
  }

  return missing;
}

export function isWebsiteSetupIdentityComplete(input: {
  professionalIdentityStatus: string;
}): boolean {
  return input.professionalIdentityStatus === "COMPLETE";
}

export type { TeamSignatureReadinessFieldKey };
