import type { WorkspaceEmailTemplateType } from "@prisma/client";

export type { WorkspaceEmailTemplateType };

/** Approved visual styling only — never arbitrary CSS. */
export type EmailTemplateStyleOverride = {
  primaryColor?: string | null;
};

/** Plain-text body sections tenants may customize. */
export type EmailTemplateBodySections = {
  paragraphs?: string[];
};

export type EmailTemplateContentFields = {
  subject: string | null;
  introText: string | null;
  bodySections: EmailTemplateBodySections;
  ctaText: string | null;
  style: EmailTemplateStyleOverride;
};

export type MasterEmailTemplateDefinition = {
  type: WorkspaceEmailTemplateType;
  label: string;
  description: string;
  /** Existing RenderedEmail.kind values this template covers. */
  rendererKinds: readonly string[];
  defaults: {
    subject: string;
    introText: string;
    ctaText: string;
  };
  /** Whitelisted {{variable}} names for subject/intro/body/cta. */
  allowedVariables: readonly string[];
  /** Fields tenants may edit. */
  editableFields: readonly (
    | "subject"
    | "introText"
    | "bodySections"
    | "ctaText"
    | "style"
  )[];
  /**
   * Protected system concerns — never overridable by tenants.
   * Documented for UI + validation; enforcement is structural (not stored).
   */
  protectedElements: readonly string[];
};

export type ResolvedEmailTemplate = {
  type: WorkspaceEmailTemplateType;
  source: "system" | "workspace_published";
  workspaceId: string | null;
  content: EmailTemplateContentFields;
  versionNumber: number | null;
  publishedAt: Date | null;
  /** Always true — live senders must keep these system-owned. */
  protectedElements: readonly string[];
};

export type WorkspaceEmailTemplateDraftInput = {
  subject?: string | null;
  introText?: string | null;
  bodySections?: EmailTemplateBodySections | null;
  ctaText?: string | null;
  style?: EmailTemplateStyleOverride | null;
};

export type WorkspaceEmailTemplateRecord = {
  id: string;
  workspaceId: string;
  templateType: WorkspaceEmailTemplateType;
  draft: EmailTemplateContentFields;
  draftUpdatedAt: Date | null;
  draftUpdatedByUserId: string | null;
  publishedVersionId: string | null;
  publishedAt: Date | null;
  publishedByUserId: string | null;
  published: EmailTemplateContentFields | null;
  publishedVersionNumber: number | null;
};

export type WorkspaceEmailTemplateVersionRecord = {
  id: string;
  templateId: string;
  workspaceId: string;
  templateType: WorkspaceEmailTemplateType;
  versionNumber: number;
  content: EmailTemplateContentFields;
  createdAt: Date;
  createdByUserId: string | null;
  publishedAt: Date;
  publishedByUserId: string | null;
};
