import type { WorkspaceEmailTemplateType, WorkspaceMemberRole } from "@prisma/client";
import {
  allWorkspaceEmailTemplateTypes,
  getMasterEmailTemplate,
  listMasterEmailTemplates,
} from "@/lib/email/workspace-templates/registry";
import { resolvePublishedEmailTemplate } from "@/lib/email/workspace-templates/resolve";
import {
  prismaWorkspaceEmailTemplateStore,
  type WorkspaceEmailTemplateStore,
} from "@/lib/email/workspace-templates/store";
import { validateWorkspaceEmailTemplateDraft } from "@/lib/email/workspace-templates/validation";
import type {
  ResolvedEmailTemplate,
  WorkspaceEmailTemplateDraftInput,
  WorkspaceEmailTemplateRecord,
  WorkspaceEmailTemplateVersionRecord,
} from "@/lib/email/workspace-templates/types";

export type EmailTemplateServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string; message: string };

export function canManageWorkspaceEmailTemplates(
  role: WorkspaceMemberRole | null | undefined,
): boolean {
  return role === "OWNER" || role === "ADMIN";
}

function forbidAgent(): EmailTemplateServiceResult<never> {
  return {
    ok: false,
    status: 403,
    code: "FORBIDDEN",
    message: "Only workspace OWNER or ADMIN can manage email templates",
  };
}

function requireWorkspace(
  workspaceId: string | null | undefined,
): EmailTemplateServiceResult<{ workspaceId: string }> {
  if (!workspaceId?.trim()) {
    return {
      ok: false,
      status: 403,
      code: "WORKSPACE_REQUIRED",
      message: "Workspace required",
    };
  }
  return { ok: true, data: { workspaceId: workspaceId.trim() } };
}

export type EmailTemplateCatalogItem = {
  type: WorkspaceEmailTemplateType;
  label: string;
  description: string;
  rendererKinds: readonly string[];
  editableFields: readonly string[];
  allowedVariables: readonly string[];
  protectedElements: readonly string[];
  systemDefaults: {
    subject: string;
    introText: string;
    ctaText: string;
  };
  hasDraft: boolean;
  hasPublished: boolean;
  publishedVersionNumber: number | null;
  publishedAt: Date | null;
  draftUpdatedAt: Date | null;
  /** Live resolution source if senders were switched (they are not yet). */
  resolved: ResolvedEmailTemplate;
};

export async function listWorkspaceEmailTemplates(input: {
  workspaceId: string;
  role: WorkspaceMemberRole;
  store?: WorkspaceEmailTemplateStore;
}): Promise<EmailTemplateServiceResult<EmailTemplateCatalogItem[]>> {
  if (!canManageWorkspaceEmailTemplates(input.role)) return forbidAgent();
  const ws = requireWorkspace(input.workspaceId);
  if (!ws.ok) return ws;
  const workspaceId = ws.data.workspaceId;

  const store = input.store ?? prismaWorkspaceEmailTemplateStore();
  const rows = await store.listTemplates(workspaceId);
  const byType = new Map(rows.map((r) => [r.templateType, r]));

  const items: EmailTemplateCatalogItem[] = [];
  for (const master of listMasterEmailTemplates()) {
    const row = byType.get(master.type) ?? null;
    const resolved = await resolvePublishedEmailTemplate(
      { workspaceId, templateType: master.type },
      store,
    );
    items.push({
      type: master.type,
      label: master.label,
      description: master.description,
      rendererKinds: master.rendererKinds,
      editableFields: master.editableFields,
      allowedVariables: master.allowedVariables,
      protectedElements: master.protectedElements,
      systemDefaults: master.defaults,
      hasDraft: Boolean(
        row &&
          (row.draft.subject ||
            row.draft.introText ||
            row.draft.ctaText ||
            row.draft.bodySections.paragraphs?.length ||
            row.draft.style.primaryColor),
      ),
      hasPublished: Boolean(row?.published),
      publishedVersionNumber: row?.publishedVersionNumber ?? null,
      publishedAt: row?.publishedAt ?? null,
      draftUpdatedAt: row?.draftUpdatedAt ?? null,
      resolved,
    });
  }
  return { ok: true, data: items };
}

export async function getWorkspaceEmailTemplate(input: {
  workspaceId: string;
  role: WorkspaceMemberRole;
  templateType: WorkspaceEmailTemplateType;
  store?: WorkspaceEmailTemplateStore;
}): Promise<
  EmailTemplateServiceResult<{
    master: NonNullable<ReturnType<typeof getMasterEmailTemplate>>;
    record: WorkspaceEmailTemplateRecord | null;
    resolved: ResolvedEmailTemplate;
  }>
> {
  if (!canManageWorkspaceEmailTemplates(input.role)) return forbidAgent();
  const ws = requireWorkspace(input.workspaceId);
  if (!ws.ok) return ws;
  const workspaceId = ws.data.workspaceId;

  const master = getMasterEmailTemplate(input.templateType);
  if (!master) {
    return {
      ok: false,
      status: 404,
      code: "UNKNOWN_TYPE",
      message: "Unknown template type",
    };
  }

  const store = input.store ?? prismaWorkspaceEmailTemplateStore();
  const record = await store.findTemplate(workspaceId, input.templateType);
  const resolved = await resolvePublishedEmailTemplate(
    { workspaceId, templateType: input.templateType },
    store,
  );
  return { ok: true, data: { master, record, resolved } };
}

export async function saveWorkspaceEmailTemplateDraft(input: {
  workspaceId: string;
  role: WorkspaceMemberRole;
  actorUserId: string;
  templateType: WorkspaceEmailTemplateType;
  draft: WorkspaceEmailTemplateDraftInput;
  store?: WorkspaceEmailTemplateStore;
}): Promise<EmailTemplateServiceResult<WorkspaceEmailTemplateRecord>> {
  if (!canManageWorkspaceEmailTemplates(input.role)) return forbidAgent();
  const ws = requireWorkspace(input.workspaceId);
  if (!ws.ok) return ws;
  const workspaceId = ws.data.workspaceId;
  if (!input.actorUserId?.trim()) {
    return {
      ok: false,
      status: 401,
      code: "UNAUTHORIZED",
      message: "Actor required",
    };
  }

  const validated = validateWorkspaceEmailTemplateDraft(
    input.templateType,
    input.draft,
  );
  if (!validated.ok) {
    return {
      ok: false,
      status: 400,
      code: validated.code,
      message: validated.error,
    };
  }

  const store = input.store ?? prismaWorkspaceEmailTemplateStore();
  const record = await store.upsertDraft({
    workspaceId,
    templateType: input.templateType,
    draft: validated.value,
    actorUserId: input.actorUserId,
  });
  return { ok: true, data: record };
}

export async function publishWorkspaceEmailTemplate(input: {
  workspaceId: string;
  role: WorkspaceMemberRole;
  actorUserId: string;
  templateType: WorkspaceEmailTemplateType;
  store?: WorkspaceEmailTemplateStore;
}): Promise<EmailTemplateServiceResult<WorkspaceEmailTemplateRecord>> {
  if (!canManageWorkspaceEmailTemplates(input.role)) return forbidAgent();
  const ws = requireWorkspace(input.workspaceId);
  if (!ws.ok) return ws;
  const workspaceId = ws.data.workspaceId;

  const store = input.store ?? prismaWorkspaceEmailTemplateStore();
  const existing = await store.findTemplate(workspaceId, input.templateType);
  if (!existing) {
    return {
      ok: false,
      status: 400,
      code: "NO_DRAFT",
      message: "Save a draft before publishing",
    };
  }

  // Re-validate draft before publish — corrupt storage fails closed.
  const validated = validateWorkspaceEmailTemplateDraft(
    input.templateType,
    existing.draft,
  );
  if (!validated.ok) {
    return {
      ok: false,
      status: 400,
      code: validated.code,
      message: `Draft invalid: ${validated.error}`,
    };
  }

  try {
    const record = await store.publishDraft({
      workspaceId,
      templateType: input.templateType,
      actorUserId: input.actorUserId,
    });
    return { ok: true, data: record };
  } catch (error) {
    if (error instanceof Error && error.message === "NO_DRAFT") {
      return {
        ok: false,
        status: 400,
        code: "NO_DRAFT",
        message: "Save a draft before publishing",
      };
    }
    throw error;
  }
}

export async function restoreWorkspaceEmailTemplateDefault(input: {
  workspaceId: string;
  role: WorkspaceMemberRole;
  actorUserId: string;
  templateType: WorkspaceEmailTemplateType;
  store?: WorkspaceEmailTemplateStore;
}): Promise<
  EmailTemplateServiceResult<{
    record: WorkspaceEmailTemplateRecord | null;
    resolved: ResolvedEmailTemplate;
  }>
> {
  if (!canManageWorkspaceEmailTemplates(input.role)) return forbidAgent();
  const ws = requireWorkspace(input.workspaceId);
  if (!ws.ok) return ws;
  const workspaceId = ws.data.workspaceId;

  const store = input.store ?? prismaWorkspaceEmailTemplateStore();
  const record = await store.clearPublished({
    workspaceId,
    templateType: input.templateType,
    actorUserId: input.actorUserId,
  });
  const resolved = await resolvePublishedEmailTemplate(
    { workspaceId, templateType: input.templateType },
    store,
  );
  return { ok: true, data: { record, resolved } };
}

export async function listWorkspaceEmailTemplateVersions(input: {
  workspaceId: string;
  role: WorkspaceMemberRole;
  templateType: WorkspaceEmailTemplateType;
  store?: WorkspaceEmailTemplateStore;
}): Promise<EmailTemplateServiceResult<WorkspaceEmailTemplateVersionRecord[]>> {
  if (!canManageWorkspaceEmailTemplates(input.role)) return forbidAgent();
  const ws = requireWorkspace(input.workspaceId);
  if (!ws.ok) return ws;
  const workspaceId = ws.data.workspaceId;

  const store = input.store ?? prismaWorkspaceEmailTemplateStore();
  const versions = await store.listVersions({
    workspaceId,
    templateType: input.templateType,
  });
  return { ok: true, data: versions };
}

/** Guard used by APIs — Master Admin platform surface must not mutate tenants. */
export function assertTenantScopedEmailTemplateMutation(input: {
  surface: "tenant" | "platform" | "deny";
  workspaceId: string | null | undefined;
}): EmailTemplateServiceResult<{ workspaceId: string }> {
  if (input.surface !== "tenant") {
    return {
      ok: false,
      status: 403,
      code: "TENANT_SURFACE_REQUIRED",
      message:
        "Email template overrides are tenant-scoped. Platform Master Admin cannot overwrite tenant customizations from the platform surface.",
    };
  }
  return requireWorkspace(input.workspaceId);
}

export { allWorkspaceEmailTemplateTypes };
