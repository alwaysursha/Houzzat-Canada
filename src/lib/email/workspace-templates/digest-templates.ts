/**
 * Phase 2C-3 — published overrides for buyer (SAVED_SEARCH_DIGEST) and
 * seller (SELLER_NEIGHBOURHOOD_DIGEST) digest emails.
 *
 * Same safety model as Property/Area Watch:
 * - TENANT_EMAIL_TEMPLATES=on (default off → no DB)
 * - Drafts never applied
 * - Sparse published fields; empty → digest-specific legacy wording
 * - Buyer and seller types never cross
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
import type {
  EmailTemplateContentFields,
  WorkspaceEmailTemplateType,
} from "@/lib/email/workspace-templates/types";

export type SavedSearchDigestTemplateVars = {
  recipientName?: string | null;
  tenantName?: string | null;
  agentName?: string | null;
  searchName?: string | null;
  listingCount?: string | number | null;
};

export type SellerNeighbourhoodDigestTemplateVars = {
  recipientName?: string | null;
  tenantName?: string | null;
  agentName?: string | null;
  homeLabel?: string | null;
  newCount?: string | number | null;
  soldCount?: string | number | null;
};

export type FilledDigestTemplate = {
  subject: string;
  introText: string;
  ctaText: string;
  paragraphs: string[];
  primaryColor: string | null;
};

async function loadPublishedDigestOverride(input: {
  workspaceId: string;
  templateType: WorkspaceEmailTemplateType;
  store?: WorkspaceEmailTemplateStore;
  env?: NodeJS.ProcessEnv;
  logLabel: string;
}): Promise<EmailTemplateContentFields | null> {
  if (!isTenantEmailTemplatesEnabled(input.env)) return null;

  const workspaceId = input.workspaceId?.trim();
  if (!workspaceId) return null;

  try {
    const store = input.store ?? prismaWorkspaceEmailTemplateStore();
    const row = await store.findTemplate(workspaceId, input.templateType);
    if (!row?.published) return null;

    const valid = validateWorkspaceEmailTemplateDraft(
      input.templateType,
      row.published,
    );
    if (!valid.ok) return null;

    return valid.value;
  } catch (error) {
    console.error(`[email-templates:${input.logLabel}]`, error);
    return null;
  }
}

export async function loadPublishedSavedSearchDigestOverride(input: {
  workspaceId: string;
  store?: WorkspaceEmailTemplateStore;
  env?: NodeJS.ProcessEnv;
}): Promise<EmailTemplateContentFields | null> {
  return loadPublishedDigestOverride({
    ...input,
    templateType: "SAVED_SEARCH_DIGEST",
    logLabel: "saved-search-digest",
  });
}

export async function loadPublishedSellerNeighbourhoodDigestOverride(input: {
  workspaceId: string;
  store?: WorkspaceEmailTemplateStore;
  env?: NodeJS.ProcessEnv;
}): Promise<EmailTemplateContentFields | null> {
  return loadPublishedDigestOverride({
    ...input,
    templateType: "SELLER_NEIGHBOURHOOD_DIGEST",
    logLabel: "seller-neighbourhood-digest",
  });
}

function fillDigest(
  type: WorkspaceEmailTemplateType,
  content: EmailTemplateContentFields,
  values: Record<string, string | number | null | undefined>,
): FilledDigestTemplate {
  const fill = (text: string | null | undefined) => {
    if (text == null || !text.trim()) return "";
    return applyAllowedTemplateVariables(type, text, values).trim();
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

export function fillPublishedSavedSearchDigestTemplate(
  content: EmailTemplateContentFields,
  vars: SavedSearchDigestTemplateVars,
): FilledDigestTemplate {
  return fillDigest("SAVED_SEARCH_DIGEST", content, {
    recipientName: vars.recipientName?.trim() || null,
    tenantName: vars.tenantName?.trim() || null,
    agentName: vars.agentName?.trim() || null,
    searchName: vars.searchName?.trim() || null,
    listingCount:
      vars.listingCount == null ? null : String(vars.listingCount),
  });
}

export function fillPublishedSellerNeighbourhoodDigestTemplate(
  content: EmailTemplateContentFields,
  vars: SellerNeighbourhoodDigestTemplateVars,
): FilledDigestTemplate {
  return fillDigest("SELLER_NEIGHBOURHOOD_DIGEST", content, {
    recipientName: vars.recipientName?.trim() || null,
    tenantName: vars.tenantName?.trim() || null,
    agentName: vars.agentName?.trim() || null,
    homeLabel: vars.homeLabel?.trim() || null,
    newCount: vars.newCount == null ? null : String(vars.newCount),
    soldCount: vars.soldCount == null ? null : String(vars.soldCount),
  });
}
