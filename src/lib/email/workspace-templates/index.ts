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
