/**
 * Phase 2A — published template resolution (merged with registry defaults).
 *
 * Phase 2C live sends use loadPublishedPropertyWatchOverride /
 * loadPublishedAreaWatchOverride, which return sparse published fields so
 * empty values keep event-specific legacy wording. Digests, agent email,
 * shortlist, and CMA must not consume overrides until their cutover phases.
 */

import type { WorkspaceEmailTemplateType } from "@prisma/client";
import {
  getMasterEmailTemplate,
} from "@/lib/email/workspace-templates/registry";
import {
  prismaWorkspaceEmailTemplateStore,
  type WorkspaceEmailTemplateStore,
} from "@/lib/email/workspace-templates/store";
import {
  mergeWithSystemDefaults,
  validateWorkspaceEmailTemplateDraft,
} from "@/lib/email/workspace-templates/validation";
import type { ResolvedEmailTemplate } from "@/lib/email/workspace-templates/types";

export async function resolvePublishedEmailTemplate(
  input: {
    workspaceId: string;
    templateType: WorkspaceEmailTemplateType;
  },
  store: WorkspaceEmailTemplateStore = prismaWorkspaceEmailTemplateStore(),
): Promise<ResolvedEmailTemplate> {
  const master = getMasterEmailTemplate(input.templateType);
  if (!master) {
    return {
      type: input.templateType,
      source: "system",
      workspaceId: input.workspaceId,
      content: mergeWithSystemDefaults(input.templateType, null),
      versionNumber: null,
      publishedAt: null,
      protectedElements: [],
    };
  }

  try {
    const row = await store.findTemplate(
      input.workspaceId,
      input.templateType,
    );
    // Drafts are intentionally ignored for resolution.
    if (row?.published) {
      const valid = validateWorkspaceEmailTemplateDraft(
        input.templateType,
        row.published,
      );
      if (valid.ok) {
        return {
          type: input.templateType,
          source: "workspace_published",
          workspaceId: input.workspaceId,
          content: mergeWithSystemDefaults(input.templateType, valid.value),
          versionNumber: row.publishedVersionNumber,
          publishedAt: row.publishedAt,
          protectedElements: master.protectedElements,
        };
      }
      // Corrupt published override → system default (fail closed).
    }
  } catch (error) {
    console.error("[email-templates:resolve]", error);
    // Fail closed to system defaults — never throw into send paths later.
  }

  return {
    type: input.templateType,
    source: "system",
    workspaceId: input.workspaceId,
    content: mergeWithSystemDefaults(input.templateType, null),
    versionNumber: null,
    publishedAt: null,
    protectedElements: master.protectedElements,
  };
}

/** System default only — never reads workspace drafts or published rows. */
export function resolveSystemEmailTemplate(
  templateType: WorkspaceEmailTemplateType,
): ResolvedEmailTemplate {
  const master = getMasterEmailTemplate(templateType);
  return {
    type: templateType,
    source: "system",
    workspaceId: null,
    content: mergeWithSystemDefaults(templateType, null),
    versionNumber: null,
    publishedAt: null,
    protectedElements: master?.protectedElements ?? [],
  };
}
