/**
 * Phase 2C-4 — published overrides for AGENT_EMAIL, SHORTLIST, and CMA_SHARE.
 *
 * Same safety model as digests / Property Watch:
 * - TENANT_EMAIL_TEMPLATES=on + workspace allowlist (default off → no DB)
 * - Drafts never applied
 * - Sparse published fields; empty → path-specific legacy wording
 * - Types never cross
 *
 * AGENT_EMAIL: agent-authored subject and body always take precedence.
 * Template fields only customize presentation (subtitle, wrapper paragraphs, style).
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
import type {
  EmailTemplateContentFields,
  WorkspaceEmailTemplateType,
} from "@/lib/email/workspace-templates/types";

export type AgentEmailTemplateVars = {
  recipientName?: string | null;
  tenantName?: string | null;
  agentName?: string | null;
};

export type ShortlistTemplateVars = {
  recipientName?: string | null;
  tenantName?: string | null;
  agentName?: string | null;
  listingCount?: string | number | null;
};

export type CmaShareTemplateVars = {
  recipientName?: string | null;
  tenantName?: string | null;
  agentName?: string | null;
  subjectAddress?: string | null;
  subjectCity?: string | null;
};

export type FilledAgentShareTemplate = {
  subject: string;
  introText: string;
  ctaText: string;
  paragraphs: string[];
  primaryColor: string | null;
};

async function loadPublishedAgentShareOverride(input: {
  workspaceId: string;
  templateType: WorkspaceEmailTemplateType;
  store?: WorkspaceEmailTemplateStore;
  env?: NodeJS.ProcessEnv;
  logLabel: string;
}): Promise<EmailTemplateContentFields | null> {
  const workspaceId = input.workspaceId?.trim();
  if (!isTenantEmailTemplatesEnabledForWorkspace(workspaceId, input.env)) {
    return null;
  }
  if (!workspaceId) return null;

  try {
    const store = input.store ?? prismaWorkspaceEmailTemplateStore();
    const row = await store.findTemplate(workspaceId, input.templateType);
    // Drafts are intentionally ignored — only published content applies.
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

export async function loadPublishedAgentEmailOverride(input: {
  workspaceId: string;
  store?: WorkspaceEmailTemplateStore;
  env?: NodeJS.ProcessEnv;
}): Promise<EmailTemplateContentFields | null> {
  return loadPublishedAgentShareOverride({
    ...input,
    templateType: "AGENT_EMAIL",
    logLabel: "agent-email",
  });
}

export async function loadPublishedShortlistOverride(input: {
  workspaceId: string;
  store?: WorkspaceEmailTemplateStore;
  env?: NodeJS.ProcessEnv;
}): Promise<EmailTemplateContentFields | null> {
  return loadPublishedAgentShareOverride({
    ...input,
    templateType: "SHORTLIST",
    logLabel: "shortlist",
  });
}

export async function loadPublishedCmaShareOverride(input: {
  workspaceId: string;
  store?: WorkspaceEmailTemplateStore;
  env?: NodeJS.ProcessEnv;
}): Promise<EmailTemplateContentFields | null> {
  return loadPublishedAgentShareOverride({
    ...input,
    templateType: "CMA_SHARE",
    logLabel: "cma-share",
  });
}

function fillAgentShare(
  type: WorkspaceEmailTemplateType,
  content: EmailTemplateContentFields,
  values: Record<string, string | number | null | undefined>,
): FilledAgentShareTemplate {
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

export function fillPublishedAgentEmailTemplate(
  content: EmailTemplateContentFields,
  vars: AgentEmailTemplateVars,
): FilledAgentShareTemplate {
  return fillAgentShare("AGENT_EMAIL", content, {
    recipientName: vars.recipientName?.trim() || null,
    tenantName: vars.tenantName?.trim() || null,
    agentName: vars.agentName?.trim() || null,
  });
}

export function fillPublishedShortlistTemplate(
  content: EmailTemplateContentFields,
  vars: ShortlistTemplateVars,
): FilledAgentShareTemplate {
  return fillAgentShare("SHORTLIST", content, {
    recipientName: vars.recipientName?.trim() || null,
    tenantName: vars.tenantName?.trim() || null,
    agentName: vars.agentName?.trim() || null,
    listingCount:
      vars.listingCount == null ? null : String(vars.listingCount),
  });
}

export function fillPublishedCmaShareTemplate(
  content: EmailTemplateContentFields,
  vars: CmaShareTemplateVars,
): FilledAgentShareTemplate {
  return fillAgentShare("CMA_SHARE", content, {
    recipientName: vars.recipientName?.trim() || null,
    tenantName: vars.tenantName?.trim() || null,
    agentName: vars.agentName?.trim() || null,
    subjectAddress: vars.subjectAddress?.trim() || null,
    subjectCity: vars.subjectCity?.trim() || null,
  });
}
