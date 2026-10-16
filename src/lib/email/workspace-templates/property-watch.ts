/**
 * Phase 2C-1 — PROPERTY_WATCH published override for live Property Watch emails.
 *
 * Drafts are never applied. Missing/invalid overrides and flag-off return null
 * so callers keep existing renderer copy and behavior.
 *
 * Returns sparse validated published fields (nulls preserved). Callers must
 * apply event-specific fallbacks for empty fields — never registry defaults —
 * so Price Reduction / Sold / Property Update keep their legacy wording unless
 * the tenant explicitly customized that field.
 */

import { isTenantEmailTemplatesEnabledForWorkspace } from "@/lib/email/workspace-templates/feature-flag";
import {
  prismaWorkspaceEmailTemplateStore,
  type WorkspaceEmailTemplateStore,
} from "@/lib/email/workspace-templates/store";
import {
  applyAllowedTemplateVariables,
  validateWorkspaceEmailTemplateDraft,
} from "@/lib/email/workspace-templates/validation";
import type { EmailTemplateContentFields } from "@/lib/email/workspace-templates/types";

export type PropertyWatchTemplateVars = {
  recipientName?: string | null;
  tenantName?: string | null;
  agentName?: string | null;
  addressLine?: string | null;
  city?: string | null;
  mlsNumber?: string | null;
};

export type FilledPropertyWatchTemplate = {
  /** Empty string when published field is null/blank — use event-specific fallback. */
  subject: string;
  introText: string;
  ctaText: string;
  paragraphs: string[];
  primaryColor: string | null;
};

function toVarMap(
  vars: PropertyWatchTemplateVars,
): Record<string, string | null | undefined> {
  return {
    recipientName: vars.recipientName?.trim() || null,
    tenantName: vars.tenantName?.trim() || null,
    agentName: vars.agentName?.trim() || null,
    addressLine: vars.addressLine?.trim() || null,
    city: vars.city?.trim() || null,
    mlsNumber: vars.mlsNumber?.trim() || null,
  };
}

/**
 * Load published PROPERTY_WATCH fields for a verified workspace only.
 * Returns null when flag is off (no DB), no published override, or invalid.
 * Does not merge registry defaults — empty fields stay empty for event fallbacks.
 */
export async function loadPublishedPropertyWatchOverride(input: {
  workspaceId: string;
  store?: WorkspaceEmailTemplateStore;
  env?: NodeJS.ProcessEnv;
}): Promise<EmailTemplateContentFields | null> {
  const workspaceId = input.workspaceId?.trim();
  if (!isTenantEmailTemplatesEnabledForWorkspace(workspaceId, input.env)) {
    return null;
  }
  if (!workspaceId) return null;

  try {
    const store = input.store ?? prismaWorkspaceEmailTemplateStore();
    const row = await store.findTemplate(workspaceId, "PROPERTY_WATCH");
    // Drafts are intentionally ignored — only published content applies.
    if (!row?.published) return null;

    const valid = validateWorkspaceEmailTemplateDraft(
      "PROPERTY_WATCH",
      row.published,
    );
    if (!valid.ok) return null;

    // Sparse fields: null means "keep event-specific legacy wording".
    return valid.value;
  } catch (error) {
    console.error("[email-templates:property-watch]", error);
    return null;
  }
}

/** Interpolate approved variables for sparse PROPERTY_WATCH published content. */
export function fillPublishedPropertyWatchTemplate(
  content: EmailTemplateContentFields,
  vars: PropertyWatchTemplateVars,
): FilledPropertyWatchTemplate {
  const map = toVarMap(vars);
  const fill = (text: string | null | undefined) => {
    if (text == null || !text.trim()) return "";
    return applyAllowedTemplateVariables("PROPERTY_WATCH", text, map).trim();
  };

  return {
    subject: fill(content.subject),
    introText: fill(content.introText),
    ctaText: fill(content.ctaText),
    paragraphs: (content.bodySections.paragraphs ?? [])
      .map((p) => fill(p))
      .filter(Boolean),
    primaryColor: content.style.primaryColor?.trim() || null,
  };
}
