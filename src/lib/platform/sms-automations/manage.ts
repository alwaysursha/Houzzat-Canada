import type { Prisma, PrismaClient } from "@prisma/client";
import { writePlatformAuditEvent } from "@/lib/platform/audit";
import { smsAutomationCatalogByKey, SMS_AUTOMATION_CATALOG } from "./catalog";
import {
  SMS_AUTOMATION_AUDIT,
  SMS_AUTOMATION_ENTITY_TYPE,
  type SmsAutomationRecipient,
  type SmsAutomationVersionStatus,
} from "./constants";
import { SmsAutomationActionError } from "./errors";
import {
  renderSmsTemplate,
  SMS_TEMPLATE_PREVIEW_SAMPLES,
  validateSmsTemplateBody,
  type SmsTemplatePreviewContext,
} from "./variables";

export type SmsAutomationDefinitionRow = {
  id: string;
  key: string;
  name: string;
  recipient: SmsAutomationRecipient;
  triggerKey: string;
  description: string | null;
  active: boolean;
  replyEnabled: boolean;
  delayMinutes: number | null;
  inactivityDays: number | null;
  inactivityBucketsJson: Prisma.JsonValue | null;
  allowedVariables: string[];
  createdAt: Date;
  updatedAt: Date;
};

export type SmsAutomationVersionRow = {
  id: string;
  definitionId: string;
  versionNumber: number;
  status: SmsAutomationVersionStatus;
  body: string;
  delayMinutes: number | null;
  inactivityDays: number | null;
  inactivityBucketsJson: Prisma.JsonValue | null;
  createdAt: Date;
  createdByOperatorId: string | null;
  publishedAt: Date | null;
  publishedByOperatorId: string | null;
  rollbackOfVersionId: string | null;
};

export type SmsAutomationDb = {
  smsAutomationDefinition: {
    findUnique: (args: {
      where: { key: string } | { id: string };
    }) => Promise<SmsAutomationDefinitionRow | null>;
    findMany: (args?: {
      orderBy?: unknown;
    }) => Promise<SmsAutomationDefinitionRow[]>;
    create: (args: {
      data: Omit<SmsAutomationDefinitionRow, "id" | "createdAt" | "updatedAt"> & {
        id?: string;
      };
    }) => Promise<SmsAutomationDefinitionRow>;
    update: (args: {
      where: { id: string };
      data: Partial<
        Pick<
          SmsAutomationDefinitionRow,
          | "name"
          | "description"
          | "triggerKey"
          | "active"
          | "delayMinutes"
          | "updatedAt"
        >
      >;
    }) => Promise<SmsAutomationDefinitionRow>;
  };
  smsAutomationVersion: {
    findMany: (args: {
      where: { definitionId: string; status?: SmsAutomationVersionStatus };
      orderBy?: unknown;
    }) => Promise<SmsAutomationVersionRow[]>;
    findFirst: (args: {
      where: {
        definitionId: string;
        status?: SmsAutomationVersionStatus;
        versionNumber?: number;
      };
      orderBy?: unknown;
    }) => Promise<SmsAutomationVersionRow | null>;
    findUnique: (args: {
      where: { id: string };
    }) => Promise<SmsAutomationVersionRow | null>;
    create: (args: {
      data: Omit<SmsAutomationVersionRow, "id" | "createdAt"> & { id?: string };
    }) => Promise<SmsAutomationVersionRow>;
    update: (args: {
      where: { id: string };
      data: Partial<SmsAutomationVersionRow>;
    }) => Promise<SmsAutomationVersionRow>;
  };
};

export type SmsAutomationAuditWriter = typeof writePlatformAuditEvent;

function asJson(value: unknown): Prisma.JsonValue | null {
  if (value == null) return null;
  return value as Prisma.JsonValue;
}

export function latestPublishedVersion(
  versions: SmsAutomationVersionRow[],
): SmsAutomationVersionRow | null {
  const published = versions.filter((row) => row.status === "PUBLISHED");
  if (published.length === 0) return null;
  return published.reduce((best, row) =>
    row.versionNumber > best.versionNumber ? row : best,
  );
}

export function currentDraftVersion(
  versions: SmsAutomationVersionRow[],
): SmsAutomationVersionRow | null {
  return versions.find((row) => row.status === "DRAFT") ?? null;
}

export function maxVersionNumber(versions: SmsAutomationVersionRow[]): number {
  return versions.reduce((max, row) => Math.max(max, row.versionNumber), 0);
}

async function loadDefinitionBundle(
  db: SmsAutomationDb,
  key: string,
): Promise<{
  definition: SmsAutomationDefinitionRow;
  versions: SmsAutomationVersionRow[];
} | null> {
  const definition = await db.smsAutomationDefinition.findUnique({
    where: { key },
  });
  if (!definition) return null;
  const versions = await db.smsAutomationVersion.findMany({
    where: { definitionId: definition.id },
    orderBy: { versionNumber: "desc" },
  });
  return { definition, versions };
}

export async function ensureSmsAutomationCatalog(
  db: SmsAutomationDb,
  audit: SmsAutomationAuditWriter | null = null,
): Promise<{ createdKeys: string[] }> {
  const createdKeys: string[] = [];
  for (const spec of SMS_AUTOMATION_CATALOG) {
    const existing = await db.smsAutomationDefinition.findUnique({
      where: { key: spec.key },
    });
    if (existing) {
      const patch: Partial<
        Pick<SmsAutomationDefinitionRow, "name" | "description" | "triggerKey">
      > = {};
      if (existing.name !== spec.name) patch.name = spec.name;
      if (existing.description !== spec.description) {
        patch.description = spec.description;
      }
      if (existing.triggerKey !== spec.triggerKey) {
        patch.triggerKey = spec.triggerKey;
      }
      if (Object.keys(patch).length > 0) {
        await db.smsAutomationDefinition.update({
          where: { id: existing.id },
          data: { ...patch, updatedAt: new Date() },
        });
      }
      continue;
    }
    const definition = await db.smsAutomationDefinition.create({
      data: {
        key: spec.key,
        name: spec.name,
        recipient: spec.recipient,
        triggerKey: spec.triggerKey,
        description: spec.description,
        active: true,
        replyEnabled: spec.replyEnabled,
        delayMinutes: spec.delayMinutes,
        inactivityDays: spec.inactivityDays,
        inactivityBucketsJson: asJson(spec.inactivityBuckets),
        allowedVariables: [...spec.allowedVariables],
      },
    });
    const now = new Date();
    await db.smsAutomationVersion.create({
      data: {
        definitionId: definition.id,
        versionNumber: 1,
        status: "PUBLISHED",
        body: spec.body,
        delayMinutes: spec.delayMinutes,
        inactivityDays: spec.inactivityDays,
        inactivityBucketsJson: asJson(spec.inactivityBuckets),
        createdByOperatorId: null,
        publishedAt: now,
        publishedByOperatorId: null,
        rollbackOfVersionId: null,
      },
    });
    createdKeys.push(spec.key);
    if (audit) {
      await audit({
        actorType: "SYSTEM",
        action: SMS_AUTOMATION_AUDIT.seeded,
        entityType: SMS_AUTOMATION_ENTITY_TYPE,
        entityId: definition.id,
        summary: `Seeded SMS automation ${spec.key}`,
        metadata: { key: spec.key },
      });
    }
  }
  return { createdKeys };
}

export type PublishedSmsAutomation = {
  definition: SmsAutomationDefinitionRow;
  version: SmsAutomationVersionRow;
};

/**
 * Runtime lookup for the trigger engine. Unpublished drafts are ignored.
 * Inactive definitions resolve to null even if a published version exists.
 */
export async function resolvePublishedSmsAutomation(
  db: SmsAutomationDb,
  key: string,
): Promise<PublishedSmsAutomation | null> {
  const bundle = await loadDefinitionBundle(db, key);
  if (!bundle) return null;
  if (!bundle.definition.active) return null;
  const version = latestPublishedVersion(bundle.versions);
  if (!version) return null;
  return { definition: bundle.definition, version };
}

export async function saveSmsAutomationDraft(input: {
  db: SmsAutomationDb;
  key: string;
  operatorId: string;
  body?: string;
  delayMinutes?: number | null;
  name?: string;
  audit?: SmsAutomationAuditWriter;
}): Promise<{ draft: SmsAutomationVersionRow; created: boolean }> {
  const spec = smsAutomationCatalogByKey(input.key);
  const bundle = await loadDefinitionBundle(input.db, input.key);
  if (!bundle) {
    throw new SmsAutomationActionError(
      "SMS automation not found.",
      "NOT_FOUND",
      404,
    );
  }

  const existingDraft = currentDraftVersion(bundle.versions);
  const published = latestPublishedVersion(bundle.versions);
  const nextBody =
    input.body != null
      ? input.body.replace(/\r\n/g, "\n")
      : existingDraft?.body ?? published?.body ?? spec?.body ?? "";

  if (input.body != null) {
    const validation = validateSmsTemplateBody(
      nextBody,
      bundle.definition.allowedVariables,
    );
    if (!validation.ok && nextBody.trim()) {
      const unknown = validation.issues.filter(
        (issue) => issue.reason === "unknown",
      );
      if (unknown.length) {
        throw new SmsAutomationActionError(
          `Unknown template placeholder: ${unknown.map((i) => i.placeholder || "{{").join(", ")}`,
          "INVALID_VARIABLES",
        );
      }
    }
  }

  let delayMinutes =
    existingDraft?.delayMinutes ??
    published?.delayMinutes ??
    bundle.definition.delayMinutes;
  if (spec?.delayEditable && input.delayMinutes !== undefined) {
    if (
      input.delayMinutes != null &&
      (!Number.isInteger(input.delayMinutes) || input.delayMinutes < 0)
    ) {
      throw new SmsAutomationActionError(
        "Delay must be a whole number of minutes.",
        "INVALID_DELAY",
      );
    }
    delayMinutes = input.delayMinutes;
  }

  if (input.name?.trim()) {
    await input.db.smsAutomationDefinition.update({
      where: { id: bundle.definition.id },
      data: { name: input.name.trim() },
    });
  }

  if (existingDraft) {
    const draft = await input.db.smsAutomationVersion.update({
      where: { id: existingDraft.id },
      data: {
        body: nextBody,
        delayMinutes,
        inactivityDays: bundle.definition.inactivityDays,
        inactivityBucketsJson: bundle.definition.inactivityBucketsJson,
      },
    });
    if (input.audit) {
      await input.audit({
        actorOperatorId: input.operatorId,
        actorType: "OPERATOR",
        action: SMS_AUTOMATION_AUDIT.draftSaved,
        entityType: SMS_AUTOMATION_ENTITY_TYPE,
        entityId: bundle.definition.id,
        summary: `Saved draft for ${input.key}`,
        metadata: { key: input.key, versionNumber: draft.versionNumber },
      });
    }
    return { draft, created: false };
  }

  const nextNumber = maxVersionNumber(bundle.versions) + 1;
  const draft = await input.db.smsAutomationVersion.create({
    data: {
      definitionId: bundle.definition.id,
      versionNumber: nextNumber,
      status: "DRAFT",
      body: nextBody,
      delayMinutes,
      inactivityDays: bundle.definition.inactivityDays,
      inactivityBucketsJson: bundle.definition.inactivityBucketsJson,
      createdByOperatorId: input.operatorId,
      publishedAt: null,
      publishedByOperatorId: null,
      rollbackOfVersionId: null,
    },
  });
  if (input.audit) {
    await input.audit({
      actorOperatorId: input.operatorId,
      actorType: "OPERATOR",
      action: SMS_AUTOMATION_AUDIT.draftSaved,
      entityType: SMS_AUTOMATION_ENTITY_TYPE,
      entityId: bundle.definition.id,
      summary: `Opened draft v${draft.versionNumber} for ${input.key}`,
      metadata: { key: input.key, versionNumber: draft.versionNumber },
    });
  }
  return { draft, created: true };
}

export function previewSmsAutomationTemplate(input: {
  body: string;
  allowedVariables: readonly string[];
  context?: SmsTemplatePreviewContext;
}): {
  rendered: string;
  valid: boolean;
  issues: { placeholder: string; reason: string }[];
} {
  const validation = validateSmsTemplateBody(input.body, input.allowedVariables);
  const rendered = renderSmsTemplate(input.body, {
    ...SMS_TEMPLATE_PREVIEW_SAMPLES,
    ...input.context,
  });
  return {
    rendered,
    valid: validation.ok,
    issues: validation.ok ? [] : validation.issues,
  };
}

export async function publishSmsAutomation(input: {
  db: SmsAutomationDb;
  key: string;
  operatorId: string;
  audit?: SmsAutomationAuditWriter;
}): Promise<{ version: SmsAutomationVersionRow }> {
  const bundle = await loadDefinitionBundle(input.db, input.key);
  if (!bundle) {
    throw new SmsAutomationActionError(
      "SMS automation not found.",
      "NOT_FOUND",
      404,
    );
  }
  const draft = currentDraftVersion(bundle.versions);
  if (!draft) {
    throw new SmsAutomationActionError(
      "No draft to publish.",
      "NO_DRAFT",
      409,
    );
  }
  const validation = validateSmsTemplateBody(
    draft.body,
    bundle.definition.allowedVariables,
  );
  if (!validation.ok) {
    throw new SmsAutomationActionError(
      "Cannot publish: template has empty body or invalid variables.",
      "INVALID_VARIABLES",
    );
  }

  const now = new Date();
  const version = await input.db.smsAutomationVersion.update({
    where: { id: draft.id },
    data: {
      status: "PUBLISHED",
      publishedAt: now,
      publishedByOperatorId: input.operatorId,
    },
  });
  if (input.audit) {
    await input.audit({
      actorOperatorId: input.operatorId,
      actorType: "OPERATOR",
      action: SMS_AUTOMATION_AUDIT.published,
      entityType: SMS_AUTOMATION_ENTITY_TYPE,
      entityId: bundle.definition.id,
      summary: `Published ${input.key} v${version.versionNumber}`,
      metadata: {
        key: input.key,
        versionNumber: version.versionNumber,
        versionId: version.id,
      },
    });
  }
  return { version };
}

export async function rollbackSmsAutomation(input: {
  db: SmsAutomationDb;
  key: string;
  operatorId: string;
  versionId: string;
  audit?: SmsAutomationAuditWriter;
}): Promise<{ version: SmsAutomationVersionRow }> {
  const bundle = await loadDefinitionBundle(input.db, input.key);
  if (!bundle) {
    throw new SmsAutomationActionError(
      "SMS automation not found.",
      "NOT_FOUND",
      404,
    );
  }
  const target =
    bundle.versions.find((row) => row.id === input.versionId) ?? null;
  if (!target || target.status !== "PUBLISHED") {
    throw new SmsAutomationActionError(
      "Can only roll back to a previously published version.",
      "INVALID_ROLLBACK_TARGET",
      409,
    );
  }
  const current = latestPublishedVersion(bundle.versions);
  if (current && current.id === target.id) {
    throw new SmsAutomationActionError(
      "That version is already the live published template.",
      "ALREADY_PUBLISHED",
      409,
    );
  }

  const now = new Date();
  const version = await input.db.smsAutomationVersion.create({
    data: {
      definitionId: bundle.definition.id,
      versionNumber: maxVersionNumber(bundle.versions) + 1,
      status: "PUBLISHED",
      body: target.body,
      delayMinutes: target.delayMinutes,
      inactivityDays: target.inactivityDays,
      inactivityBucketsJson: target.inactivityBucketsJson,
      createdByOperatorId: input.operatorId,
      publishedAt: now,
      publishedByOperatorId: input.operatorId,
      rollbackOfVersionId: target.id,
    },
  });
  if (input.audit) {
    await input.audit({
      actorOperatorId: input.operatorId,
      actorType: "OPERATOR",
      action: SMS_AUTOMATION_AUDIT.rolledBack,
      entityType: SMS_AUTOMATION_ENTITY_TYPE,
      entityId: bundle.definition.id,
      summary: `Rolled ${input.key} back to v${target.versionNumber} as v${version.versionNumber}`,
      metadata: {
        key: input.key,
        versionNumber: version.versionNumber,
        rollbackOfVersionId: target.id,
        rollbackOfVersionNumber: target.versionNumber,
      },
    });
  }
  return { version };
}

export async function setSmsAutomationActive(input: {
  db: SmsAutomationDb;
  key: string;
  operatorId: string;
  active: boolean;
  audit?: SmsAutomationAuditWriter;
}): Promise<{ active: boolean }> {
  const definition = await input.db.smsAutomationDefinition.findUnique({
    where: { key: input.key },
  });
  if (!definition) {
    throw new SmsAutomationActionError(
      "SMS automation not found.",
      "NOT_FOUND",
      404,
    );
  }
  if (definition.active === input.active) {
    return { active: definition.active };
  }
  await input.db.smsAutomationDefinition.update({
    where: { id: definition.id },
    data: { active: input.active },
  });
  if (input.audit) {
    await input.audit({
      actorOperatorId: input.operatorId,
      actorType: "OPERATOR",
      action: input.active
        ? SMS_AUTOMATION_AUDIT.activated
        : SMS_AUTOMATION_AUDIT.deactivated,
      entityType: SMS_AUTOMATION_ENTITY_TYPE,
      entityId: definition.id,
      summary: `${input.active ? "Activated" : "Deactivated"} ${input.key}`,
      metadata: { key: input.key, active: input.active },
    });
  }
  return { active: input.active };
}

export function prismaSmsAutomationDb(
  prisma: PrismaClient,
): SmsAutomationDb {
  return prisma as unknown as SmsAutomationDb;
}
