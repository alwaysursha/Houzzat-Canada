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
export {
  isTenantEmailTemplatesEnabled,
  isTenantEmailTemplatesEnabledForWorkspace,
} from "@/lib/email/workspace-templates/feature-flag";
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
  fillPublishedSavedSearchDigestTemplate,
  fillPublishedSellerNeighbourhoodDigestTemplate,
  loadPublishedSavedSearchDigestOverride,
  loadPublishedSellerNeighbourhoodDigestOverride,
} from "@/lib/email/workspace-templates/digest-templates";
export type {
  FilledDigestTemplate,
  SavedSearchDigestTemplateVars,
  SellerNeighbourhoodDigestTemplateVars,
} from "@/lib/email/workspace-templates/digest-templates";
export {
  fillPublishedAgentEmailTemplate,
  fillPublishedCmaShareTemplate,
  fillPublishedShortlistTemplate,
  loadPublishedAgentEmailOverride,
  loadPublishedCmaShareOverride,
  loadPublishedShortlistOverride,
} from "@/lib/email/workspace-templates/agent-share-templates";
export type {
  AgentEmailTemplateVars,
  CmaShareTemplateVars,
  FilledAgentShareTemplate,
  ShortlistTemplateVars,
} from "@/lib/email/workspace-templates/agent-share-templates";
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
  contentFieldsFromForm,
  emptyEmailTemplateEditorForm,
  formFromStoredContent,
  formToDraftPayload,
} from "@/lib/email/workspace-templates/editor-form";
export type {
  EmailTemplateDraftPayload,
  EmailTemplateEditorDefaults,
  EmailTemplateEditorForm,
} from "@/lib/email/workspace-templates/editor-form";
export {
  buildEmailTemplatePreviewHtml,
  defaultEmailTemplatePreviewVariant,
  EMAIL_TEMPLATE_PREVIEW_SAMPLE,
  listEmailTemplatePreviewVariants,
} from "@/lib/email/workspace-templates/preview";
export type {
  EmailTemplatePreviewBrand,
  EmailTemplatePreviewMode,
  EmailTemplatePreviewVariant,
  EmailTemplatePreviewVariantId,
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
