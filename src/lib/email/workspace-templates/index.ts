export {
  allWorkspaceEmailTemplateTypes,
  getMasterEmailTemplate,
  isWorkspaceEmailTemplateType,
  listMasterEmailTemplates,
  MASTER_EMAIL_TEMPLATES,
} from "@/lib/email/workspace-templates/registry";
export {
  resolvePublishedEmailTemplate,
  resolveSystemEmailTemplate,
} from "@/lib/email/workspace-templates/resolve";
export { isTenantEmailTemplatesEnabled } from "@/lib/email/workspace-templates/feature-flag";
export {
  fillPublishedPropertyWatchTemplate,
  loadPublishedPropertyWatchOverride,
} from "@/lib/email/workspace-templates/property-watch";
export type {
  FilledPropertyWatchTemplate,
  PropertyWatchTemplateVars,
} from "@/lib/email/workspace-templates/property-watch";
export {
  fillPublishedAreaWatchTemplate,
  loadPublishedAreaWatchOverride,
} from "@/lib/email/workspace-templates/area-watch";
export type {
  AreaWatchTemplateVars,
  FilledAreaWatchTemplate,
} from "@/lib/email/workspace-templates/area-watch";
export {
  assertTenantScopedEmailTemplateMutation,
  canManageWorkspaceEmailTemplates,
  getWorkspaceEmailTemplate,
  listWorkspaceEmailTemplateVersions,
  listWorkspaceEmailTemplates,
  publishWorkspaceEmailTemplate,
  restoreWorkspaceEmailTemplateDefault,
  saveWorkspaceEmailTemplateDraft,
} from "@/lib/email/workspace-templates/service";
export {
  memoryWorkspaceEmailTemplateStore,
  prismaWorkspaceEmailTemplateStore,
} from "@/lib/email/workspace-templates/store";
export {
  applyAllowedTemplateVariables,
  extractTemplateVariables,
  mergeWithSystemDefaults,
  validateWorkspaceEmailTemplateDraft,
} from "@/lib/email/workspace-templates/validation";
export {
  buildEmailTemplatePreviewHtml,
  EMAIL_TEMPLATE_PREVIEW_SAMPLE,
} from "@/lib/email/workspace-templates/preview";
export type {
  EmailTemplatePreviewBrand,
  EmailTemplatePreviewMode,
} from "@/lib/email/workspace-templates/preview";
export type {
  EmailTemplateBodySections,
  EmailTemplateContentFields,
  EmailTemplateStyleOverride,
  MasterEmailTemplateDefinition,
  ResolvedEmailTemplate,
  WorkspaceEmailTemplateDraftInput,
  WorkspaceEmailTemplateRecord,
  WorkspaceEmailTemplateVersionRecord,
} from "@/lib/email/workspace-templates/types";
