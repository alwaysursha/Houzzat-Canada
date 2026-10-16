/**
 * Phase 2C-2 — AREA_WATCH published override for live Area Watch emails.
 *
 * Same safety model as PROPERTY_WATCH (Phase 2C-1):
 * - TENANT_EMAIL_TEMPLATES=on required (default off → no DB)
 * - Drafts never applied
 * - Sparse published fields; empty → event-specific legacy wording
 * - Never merges registry defaults into live send copy
 */

import { isTenantEmailTemplatesEnabled } from "@/lib/email/workspace-templates/feature-flag";
import {
  prismaWorkspaceEmailTemplateStore,
  type WorkspaceEmailTemplateStore,
} from "@/lib/email/workspace-templates/store";
import {
  applyAllowedTemplateVariables,
  validateWorkspaceEmailTemplateDraft,
} from "@/lib/email/workspace-templates/validation";
import type { EmailTemplateContentFields } from "@/lib/email/workspace-templates/types";

export type AreaWatchTemplateVars = {
  recipientName?: string | null;
  tenantName?: string | null;
  agentName?: string | null;
  areaName?: string | null;
  addressLine?: string | null;
  city?: string | null;
  mlsNumber?: string | null;
};

export type FilledAreaWatchTemplate = {
  /** Empty string when published field is null/blank — use event-specific fallback. */
  subject: string;
  introText: string;
  ctaText: string;
  paragraphs: string[];
  primaryColor: string | null;
};

function toVarMap(
  vars: AreaWatchTemplateVars,
): Record<string, string | null | undefined> {
  return {
    recipientName: vars.recipientName?.trim() || null,
    tenantName: vars.tenantName?.trim() || null,
    agentName: vars.agentName?.trim() || null,
    areaName: vars.areaName?.trim() || null,
    addressLine: vars.addressLine?.trim() || null,
    city: vars.city?.trim() || null,
    mlsNumber: vars.mlsNumber?.trim() || null,
  };
}

/**
 * Load published AREA_WATCH fields for a verified workspace only.
 * Returns null when flag is off (no DB), no published override, or invalid.
 */
export async function loadPublishedAreaWatchOverride(input: {
  workspaceId: string;
  store?: WorkspaceEmailTemplateStore;
  env?: NodeJS.ProcessEnv;
}): Promise<EmailTemplateContentFields | null> {
  if (!isTenantEmailTemplatesEnabled(input.env)) return null;

  const workspaceId = input.workspaceId?.trim();
  if (!workspaceId) return null;

  try {
    const store = input.store ?? prismaWorkspaceEmailTemplateStore();
    const row = await store.findTemplate(workspaceId, "AREA_WATCH");
    // Drafts are intentionally ignored — only published content applies.
    if (!row?.published) return null;

    const valid = validateWorkspaceEmailTemplateDraft(
      "AREA_WATCH",
      row.published,
    );
    if (!valid.ok) return null;

    // Sparse fields: null means "keep event-specific legacy wording".
    return valid.value;
  } catch (error) {
    console.error("[email-templates:area-watch]", error);
    return null;
  }
}

/** Interpolate approved variables for sparse AREA_WATCH published content. */
export function fillPublishedAreaWatchTemplate(
  content: EmailTemplateContentFields,
  vars: AreaWatchTemplateVars,
): FilledAreaWatchTemplate {
  const map = toVarMap(vars);
  const fill = (text: string | null | undefined) => {
    if (text == null || !text.trim()) return "";
    return applyAllowedTemplateVariables("AREA_WATCH", text, map).trim();
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
