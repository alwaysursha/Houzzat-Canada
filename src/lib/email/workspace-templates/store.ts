import { Prisma, type WorkspaceEmailTemplateType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseStoredContentFields } from "@/lib/email/workspace-templates/validation";
import type {
  EmailTemplateContentFields,
  WorkspaceEmailTemplateRecord,
  WorkspaceEmailTemplateVersionRecord,
} from "@/lib/email/workspace-templates/types";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

export type WorkspaceEmailTemplateStore = {
  findTemplate(
    workspaceId: string,
    templateType: WorkspaceEmailTemplateType,
  ): Promise<WorkspaceEmailTemplateRecord | null>;
  listTemplates(
    workspaceId: string,
  ): Promise<WorkspaceEmailTemplateRecord[]>;
  upsertDraft(input: {
    workspaceId: string;
    templateType: WorkspaceEmailTemplateType;
    draft: EmailTemplateContentFields;
    actorUserId: string;
  }): Promise<WorkspaceEmailTemplateRecord>;
  publishDraft(input: {
    workspaceId: string;
    templateType: WorkspaceEmailTemplateType;
    actorUserId: string;
  }): Promise<WorkspaceEmailTemplateRecord>;
  clearPublished(input: {
    workspaceId: string;
    templateType: WorkspaceEmailTemplateType;
    actorUserId: string;
  }): Promise<WorkspaceEmailTemplateRecord | null>;
  listVersions(input: {
    workspaceId: string;
    templateType: WorkspaceEmailTemplateType;
  }): Promise<WorkspaceEmailTemplateVersionRecord[]>;
};

function mapVersion(row: {
  id: string;
  templateId: string;
  workspaceId: string;
  templateType: WorkspaceEmailTemplateType;
  versionNumber: number;
  subject: string | null;
  introText: string | null;
  bodySectionsJson: unknown;
  ctaText: string | null;
  styleJson: unknown;
  createdAt: Date;
  createdByUserId: string | null;
  publishedAt: Date;
  publishedByUserId: string | null;
}): WorkspaceEmailTemplateVersionRecord {
  return {
    id: row.id,
    templateId: row.templateId,
    workspaceId: row.workspaceId,
    templateType: row.templateType,
    versionNumber: row.versionNumber,
    content: parseStoredContentFields(row),
    createdAt: row.createdAt,
    createdByUserId: row.createdByUserId,
    publishedAt: row.publishedAt,
    publishedByUserId: row.publishedByUserId,
  };
}

function mapTemplate(row: {
  id: string;
  workspaceId: string;
  templateType: WorkspaceEmailTemplateType;
  draftSubject: string | null;
  draftIntroText: string | null;
  draftBodySectionsJson: unknown;
  draftCtaText: string | null;
  draftStyleJson: unknown;
  draftUpdatedAt: Date | null;
  draftUpdatedByUserId: string | null;
  publishedVersionId: string | null;
  publishedAt: Date | null;
  publishedByUserId: string | null;
  publishedVersion: {
    id: string;
    versionNumber: number;
    subject: string | null;
    introText: string | null;
    bodySectionsJson: unknown;
    ctaText: string | null;
    styleJson: unknown;
  } | null;
}): WorkspaceEmailTemplateRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    templateType: row.templateType,
    draft: parseStoredContentFields({
      subject: row.draftSubject,
      introText: row.draftIntroText,
      bodySectionsJson: row.draftBodySectionsJson,
      ctaText: row.draftCtaText,
      styleJson: row.draftStyleJson,
    }),
    draftUpdatedAt: row.draftUpdatedAt,
    draftUpdatedByUserId: row.draftUpdatedByUserId,
    publishedVersionId: row.publishedVersionId,
    publishedAt: row.publishedAt,
    publishedByUserId: row.publishedByUserId,
    published: row.publishedVersion
      ? parseStoredContentFields(row.publishedVersion)
      : null,
    publishedVersionNumber: row.publishedVersion?.versionNumber ?? null,
  };
}

const templateInclude = {
  publishedVersion: true,
} as const;

export function prismaWorkspaceEmailTemplateStore(
  db: typeof prisma = prisma,
): WorkspaceEmailTemplateStore {
  return {
    async findTemplate(workspaceId, templateType) {
      const row = await db.workspaceEmailTemplate.findUnique({
        where: {
          workspaceId_templateType: { workspaceId, templateType },
        },
        include: templateInclude,
      });
      return row ? mapTemplate(row) : null;
    },

    async listTemplates(workspaceId) {
      const rows = await db.workspaceEmailTemplate.findMany({
        where: { workspaceId },
        include: templateInclude,
        orderBy: { templateType: "asc" },
      });
      return rows.map(mapTemplate);
    },

    async upsertDraft(input) {
      const now = new Date();
      const row = await db.workspaceEmailTemplate.upsert({
        where: {
          workspaceId_templateType: {
            workspaceId: input.workspaceId,
            templateType: input.templateType,
          },
        },
        create: {
          workspaceId: input.workspaceId,
          templateType: input.templateType,
          draftSubject: input.draft.subject,
          draftIntroText: input.draft.introText,
          draftBodySectionsJson: input.draft.bodySections,
          draftCtaText: input.draft.ctaText,
          draftStyleJson: input.draft.style,
          draftUpdatedAt: now,
          draftUpdatedByUserId: input.actorUserId,
        },
        update: {
          draftSubject: input.draft.subject,
          draftIntroText: input.draft.introText,
          draftBodySectionsJson: input.draft.bodySections,
          draftCtaText: input.draft.ctaText,
          draftStyleJson: input.draft.style,
          draftUpdatedAt: now,
          draftUpdatedByUserId: input.actorUserId,
        },
        include: templateInclude,
      });
      return mapTemplate(row);
    },

    async publishDraft(input) {
      const maxAttempts = 3;
      let lastError: unknown;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        try {
          return await db.$transaction(async (tx) => {
            // Serialize concurrent publishes for this workspace+type row.
            const locked = await tx.$queryRaw<Array<{ id: string }>>(
              Prisma.sql`
                SELECT "id"
                FROM "WorkspaceEmailTemplate"
                WHERE "workspaceId" = ${input.workspaceId}
                  AND "templateType" = CAST(${input.templateType} AS "WorkspaceEmailTemplateType")
                FOR UPDATE
              `,
            );
            if (!locked[0]?.id) {
              throw new Error("NO_DRAFT");
            }

            const existing = await tx.workspaceEmailTemplate.findUnique({
              where: { id: locked[0].id },
              include: templateInclude,
            });
            if (!existing || existing.workspaceId !== input.workspaceId) {
              throw new Error("NO_DRAFT");
            }

            const latest = await tx.workspaceEmailTemplateVersion.findFirst({
              where: {
                templateId: existing.id,
                workspaceId: input.workspaceId,
              },
              orderBy: { versionNumber: "desc" },
              select: { versionNumber: true },
            });
            const versionNumber = (latest?.versionNumber ?? 0) + 1;
            const now = new Date();
            const content = parseStoredContentFields({
              subject: existing.draftSubject,
              introText: existing.draftIntroText,
              bodySectionsJson: existing.draftBodySectionsJson,
              ctaText: existing.draftCtaText,
              styleJson: existing.draftStyleJson,
            });

            const version = await tx.workspaceEmailTemplateVersion.create({
              data: {
                templateId: existing.id,
                workspaceId: input.workspaceId,
                templateType: input.templateType,
                versionNumber,
                status: "PUBLISHED",
                subject: content.subject,
                introText: content.introText,
                bodySectionsJson: content.bodySections,
                ctaText: content.ctaText,
                styleJson: content.style,
                createdByUserId: input.actorUserId,
                publishedAt: now,
                publishedByUserId: input.actorUserId,
              },
            });

            const updated = await tx.workspaceEmailTemplate.update({
              where: { id: existing.id },
              data: {
                publishedVersionId: version.id,
                publishedAt: now,
                publishedByUserId: input.actorUserId,
              },
              include: templateInclude,
            });
            if (updated.workspaceId !== input.workspaceId) {
              throw new Error("WORKSPACE_MISMATCH");
            }
            return mapTemplate(updated);
          });
        } catch (error) {
          lastError = error;
          // Unique (templateId, versionNumber) collision under rare races — retry.
          if (isUniqueViolation(error) && attempt < maxAttempts - 1) {
            continue;
          }
          throw error;
        }
      }
      throw lastError instanceof Error
        ? lastError
        : new Error("PUBLISH_FAILED");
    },

    async clearPublished(input) {
      return db.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`
            SELECT "id"
            FROM "WorkspaceEmailTemplate"
            WHERE "workspaceId" = ${input.workspaceId}
              AND "templateType" = CAST(${input.templateType} AS "WorkspaceEmailTemplateType")
            FOR UPDATE
          `,
        );
        if (!locked[0]?.id) return null;

        const existing = await tx.workspaceEmailTemplate.findUnique({
          where: { id: locked[0].id },
          select: { id: true, workspaceId: true },
        });
        if (!existing || existing.workspaceId !== input.workspaceId) {
          return null;
        }

        const updated = await tx.workspaceEmailTemplate.update({
          where: { id: existing.id },
          data: {
            publishedVersionId: null,
            publishedAt: null,
            publishedByUserId: null,
            draftUpdatedAt: new Date(),
            draftUpdatedByUserId: input.actorUserId,
          },
          include: templateInclude,
        });
        return mapTemplate(updated);
      });
    },

    async listVersions(input) {
      const template = await db.workspaceEmailTemplate.findUnique({
        where: {
          workspaceId_templateType: {
            workspaceId: input.workspaceId,
            templateType: input.templateType,
          },
        },
        select: { id: true },
      });
      if (!template) return [];

      const rows = await db.workspaceEmailTemplateVersion.findMany({
        where: {
          templateId: template.id,
          workspaceId: input.workspaceId,
          status: "PUBLISHED",
        },
        orderBy: { versionNumber: "desc" },
      });
      return rows.map(mapVersion);
    },
  };
}

/** In-memory store for isolation selftests (no DB). */
export function memoryWorkspaceEmailTemplateStore(): WorkspaceEmailTemplateStore & {
  templates: Map<string, WorkspaceEmailTemplateRecord>;
  versions: WorkspaceEmailTemplateVersionRecord[];
} {
  const templates = new Map<string, WorkspaceEmailTemplateRecord>();
  const versions: WorkspaceEmailTemplateVersionRecord[] = [];
  /** Per workspace+type lock chain — simulates FOR UPDATE serialization. */
  const publishLocks = new Map<string, Promise<unknown>>();
  const key = (workspaceId: string, type: WorkspaceEmailTemplateType) =>
    `${workspaceId}:${type}`;

  async function withPublishLock<T>(
    k: string,
    work: () => Promise<T>,
  ): Promise<T> {
    const prior = publishLocks.get(k) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chained = prior.then(() => gate);
    publishLocks.set(
      k,
      chained.catch(() => undefined),
    );
    await prior.catch(() => undefined);
    try {
      return await work();
    } finally {
      release();
    }
  }

  return {
    templates,
    versions,
    async findTemplate(workspaceId, templateType) {
      return templates.get(key(workspaceId, templateType)) ?? null;
    },
    async listTemplates(workspaceId) {
      return [...templates.values()].filter((t) => t.workspaceId === workspaceId);
    },
    async upsertDraft(input) {
      const k = key(input.workspaceId, input.templateType);
      const existing = templates.get(k);
      const now = new Date();
      const record: WorkspaceEmailTemplateRecord = {
        id: existing?.id ?? `tpl_${k}`,
        workspaceId: input.workspaceId,
        templateType: input.templateType,
        draft: input.draft,
        draftUpdatedAt: now,
        draftUpdatedByUserId: input.actorUserId,
        publishedVersionId: existing?.publishedVersionId ?? null,
        publishedAt: existing?.publishedAt ?? null,
        publishedByUserId: existing?.publishedByUserId ?? null,
        published: existing?.published ?? null,
        publishedVersionNumber: existing?.publishedVersionNumber ?? null,
      };
      templates.set(k, record);
      return record;
    },
    async publishDraft(input) {
      const k = key(input.workspaceId, input.templateType);
      return withPublishLock(k, async () => {
        const existing = templates.get(k);
        if (!existing) throw new Error("NO_DRAFT");
        if (existing.workspaceId !== input.workspaceId) {
          throw new Error("WORKSPACE_MISMATCH");
        }
        const prior = versions.filter(
          (v) =>
            v.workspaceId === input.workspaceId &&
            v.templateType === input.templateType &&
            v.templateId === existing.id,
        );
        const nextVersion =
          prior.reduce((max, v) => Math.max(max, v.versionNumber), 0) + 1;
        // Simulate unique constraint — never allow duplicate version numbers.
        if (
          prior.some((v) => v.versionNumber === nextVersion) ||
          versions.some(
            (v) =>
              v.templateId === existing.id && v.versionNumber === nextVersion,
          )
        ) {
          const error = new Error("unique") as Error & { code: string };
          error.code = "P2002";
          throw error;
        }
        const now = new Date();
        const version: WorkspaceEmailTemplateVersionRecord = {
          id: `ver_${k}_${nextVersion}`,
          templateId: existing.id,
          workspaceId: input.workspaceId,
          templateType: input.templateType,
          versionNumber: nextVersion,
          content: { ...existing.draft },
          createdAt: now,
          createdByUserId: input.actorUserId,
          publishedAt: now,
          publishedByUserId: input.actorUserId,
        };
        versions.push(version);
        const updated: WorkspaceEmailTemplateRecord = {
          ...existing,
          publishedVersionId: version.id,
          publishedAt: now,
          publishedByUserId: input.actorUserId,
          published: { ...existing.draft },
          publishedVersionNumber: version.versionNumber,
        };
        templates.set(k, updated);
        return updated;
      });
    },
    async clearPublished(input) {
      const k = key(input.workspaceId, input.templateType);
      const existing = templates.get(k);
      if (!existing) return null;
      const updated: WorkspaceEmailTemplateRecord = {
        ...existing,
        publishedVersionId: null,
        publishedAt: null,
        publishedByUserId: null,
        published: null,
        publishedVersionNumber: null,
        draftUpdatedAt: new Date(),
        draftUpdatedByUserId: input.actorUserId,
      };
      templates.set(k, updated);
      return updated;
    },
    async listVersions(input) {
      return versions
        .filter(
          (v) =>
            v.workspaceId === input.workspaceId &&
            v.templateType === input.templateType,
        )
        .sort((a, b) => b.versionNumber - a.versionNumber);
    },
  };
}
