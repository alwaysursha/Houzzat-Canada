/**
 * Phase 2C-1 — persist CSV import Job / Row / Origin / Tags.
 * Neon HTTP-safe: sequential findFirst/findUnique/create/update only.
 * No interactive transactions, bulk updates, upserts, or nested relational creates.
 *
 * Tags never write Lead.isBuyer / isSeller / intent.
 * Origin never overwrites Lead.createdAt / Lead.source / notes.
 */
import type {
  LeadImportDefaultType as PrismaLeadImportDefaultType,
  LeadImportJob,
  LeadImportJobStatus,
  LeadImportRow,
  LeadImportRowStatus,
  Prisma,
} from "@prisma/client";
import type { LeadImportDefaultType } from "@/lib/agent/lead-import-classify";
import {
  deferredValue,
  parseImportedCrmDate,
  parseImportedCrmTags,
} from "@/lib/agent/lead-import-metadata";
import { prisma } from "@/lib/prisma";

export const CSV_IMPORT_SOURCE_CRM = "csv";

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

export function toPrismaImportDefaultType(
  value: LeadImportDefaultType,
): PrismaLeadImportDefaultType {
  switch (value) {
    case "buyer":
      return "BUYER";
    case "seller":
      return "SELLER";
    case "both":
      return "BOTH";
    case "detect":
      return "DETECT";
    default: {
      const _never: never = value;
      return _never;
    }
  }
}

export function importRowIdempotencyKey(input: {
  rowNumber: number;
  email?: string | null;
}): string {
  const email = input.email?.trim().toLowerCase() || "no-email";
  return `${input.rowNumber}:${email}`;
}

export type ImportOriginBuildInput = {
  defaultLeadType: LeadImportDefaultType;
  leadTypeRaw?: string | null;
  dateCreatedRaw?: string | null;
  dealCompletedRaw?: string | null;
  extraUnmapped?: Record<string, string>;
};

export type ImportOriginBuildResult = {
  originalClassification: string | null;
  sourceCreatedAt: Date | null;
  sourceClosedAt: Date | null;
  unmappedFields: Record<string, string> | null;
};

/**
 * Detect: keep the raw mapped CSV Lead Type.
 * Import-level Buyer/Seller/Both: do not invent a source classification.
 */
export function buildImportOriginFields(
  input: ImportOriginBuildInput,
): ImportOriginBuildResult {
  const unmapped: Record<string, string> = { ...input.extraUnmapped };
  const originalClassification =
    input.defaultLeadType === "detect"
      ? input.leadTypeRaw?.trim() || null
      : null;

  const created = parseImportedCrmDate(input.dateCreatedRaw);
  let sourceCreatedAt: Date | null = null;
  if (created?.ok) sourceCreatedAt = created.at;
  else if (created) unmapped.date_created = created.raw;

  const closed = parseImportedCrmDate(input.dealCompletedRaw);
  let sourceClosedAt: Date | null = null;
  if (closed?.ok) sourceClosedAt = closed.at;
  else if (closed) unmapped.deal_completed = closed.raw;

  return {
    originalClassification,
    sourceCreatedAt,
    sourceClosedAt,
    unmappedFields: Object.keys(unmapped).length > 0 ? unmapped : null,
  };
}

export async function createLeadImportJob(input: {
  workspaceId: string;
  importedByUserId: string;
  filename?: string | null;
  mapping: Prisma.InputJsonValue;
  defaultLeadType: LeadImportDefaultType;
  consentAsserted: boolean;
  allowDuplicates: boolean;
}): Promise<LeadImportJob> {
  const startedAt = new Date();
  return prisma.leadImportJob.create({
    data: {
      workspaceId: input.workspaceId,
      importedByUserId: input.importedByUserId,
      filename: input.filename?.trim() || null,
      sourceCrm: CSV_IMPORT_SOURCE_CRM,
      mapping: input.mapping,
      defaultLeadType: toPrismaImportDefaultType(input.defaultLeadType),
      consentAsserted: input.consentAsserted,
      checksum: null,
      allowDuplicates: input.allowDuplicates,
      status: "RUNNING",
      startedAt,
    },
  });
}

export async function createLeadImportRow(input: {
  workspaceId: string;
  jobId: string;
  rowNumber: number;
  payloadOriginal: Prisma.InputJsonValue;
  payloadCanonical: Prisma.InputJsonValue;
  email?: string | null;
}): Promise<LeadImportRow> {
  return prisma.leadImportRow.create({
    data: {
      workspaceId: input.workspaceId,
      jobId: input.jobId,
      rowNumber: input.rowNumber,
      payloadOriginal: input.payloadOriginal,
      payloadCanonical: input.payloadCanonical,
      status: "PENDING",
      idempotencyKey: importRowIdempotencyKey({
        rowNumber: input.rowNumber,
        email: input.email,
      }),
      attemptCount: 1,
    },
  });
}

export async function updateLeadImportRow(input: {
  id: string;
  status: LeadImportRowStatus;
  leadId?: string | null;
  error?: string | null;
}): Promise<void> {
  await prisma.leadImportRow.update({
    where: { id: input.id },
    data: {
      status: input.status,
      leadId: input.leadId ?? undefined,
      error: input.error ?? null,
    },
  });
}

function jobStatusFromCounts(input: {
  createdCount: number;
  failedCount: number;
}): LeadImportJobStatus {
  if (input.failedCount > 0 && input.createdCount === 0) return "FAILED";
  if (input.failedCount > 0) return "PARTIAL";
  return "COMPLETED";
}

export async function finishLeadImportJob(input: {
  jobId: string;
  createdCount: number;
  skippedCount: number;
  failedCount: number;
  deferredFieldCount: number;
}): Promise<void> {
  await prisma.leadImportJob.update({
    where: { id: input.jobId },
    data: {
      createdCount: input.createdCount,
      skippedCount: input.skippedCount,
      failedCount: input.failedCount,
      deferredFieldCount: input.deferredFieldCount,
      status: jobStatusFromCounts(input),
      finishedAt: new Date(),
    },
  });
}

export async function findOrCreateImportedWorkspaceTag(input: {
  workspaceId: string;
  name: string;
  nameNormalized: string;
}): Promise<{ id: string } | null> {
  const existing = await prisma.workspaceTag.findFirst({
    where: {
      workspaceId: input.workspaceId,
      nameNormalized: input.nameNormalized,
    },
    select: { id: true },
  });
  if (existing) return existing;

  try {
    return await prisma.workspaceTag.create({
      data: {
        workspaceId: input.workspaceId,
        name: input.name,
        nameNormalized: input.nameNormalized,
        origin: "IMPORTED",
      },
      select: { id: true },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    return prisma.workspaceTag.findFirst({
      where: {
        workspaceId: input.workspaceId,
        nameNormalized: input.nameNormalized,
      },
      select: { id: true },
    });
  }
}

export async function attachImportedLeadTags(input: {
  workspaceId: string;
  leadId: string;
  tagsRaw?: string | null;
}): Promise<void> {
  const tags = parseImportedCrmTags(input.tagsRaw);
  for (const tag of tags) {
    const workspaceTag = await findOrCreateImportedWorkspaceTag({
      workspaceId: input.workspaceId,
      name: tag.name,
      nameNormalized: tag.nameNormalized,
    });
    if (!workspaceTag) continue;

    const existing = await prisma.leadTag.findFirst({
      where: {
        workspaceId: input.workspaceId,
        leadId: input.leadId,
        tagId: workspaceTag.id,
      },
      select: { id: true },
    });
    if (existing) continue;

    try {
      await prisma.leadTag.create({
        data: {
          workspaceId: input.workspaceId,
          leadId: input.leadId,
          tagId: workspaceTag.id,
        },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
    }
  }
}

/**
 * V1 duplicate origin: never create/update if the Lead already has an origin.
 * 1:1 LeadOrigin.leadId would overwrite archaeology if we replaced it.
 */
export async function persistImportedLeadOrigin(input: {
  workspaceId: string;
  leadId: string;
  importRowId: string;
  defaultLeadType: LeadImportDefaultType;
  leadTypeRaw?: string | null;
  dateCreatedRaw?: string | null;
  dealCompletedRaw?: string | null;
  extraUnmapped?: Record<string, string>;
}): Promise<{
  created: boolean;
  unmappedCount: number;
  unmappedFields: Record<string, string> | null;
}> {
  const existing = await prisma.leadOrigin.findUnique({
    where: { leadId: input.leadId },
    select: { id: true },
  });
  if (existing) {
    return { created: false, unmappedCount: 0, unmappedFields: null };
  }

  const fields = buildImportOriginFields({
    defaultLeadType: input.defaultLeadType,
    leadTypeRaw: input.leadTypeRaw,
    dateCreatedRaw: input.dateCreatedRaw,
    dealCompletedRaw: input.dealCompletedRaw,
    extraUnmapped: input.extraUnmapped,
  });

  try {
    await prisma.leadOrigin.create({
      data: {
        workspaceId: input.workspaceId,
        leadId: input.leadId,
        sourceCrm: CSV_IMPORT_SOURCE_CRM,
        externalContactId: null,
        originalClassification: fields.originalClassification,
        sourceCreatedAt: fields.sourceCreatedAt,
        sourceClosedAt: fields.sourceClosedAt,
        unmappedFields: fields.unmappedFields ?? undefined,
        importRowId: input.importRowId,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { created: false, unmappedCount: 0, unmappedFields: null };
    }
    throw error;
  }

  return {
    created: true,
    unmappedCount: fields.unmappedFields
      ? Object.keys(fields.unmappedFields).length
      : 0,
    unmappedFields: fields.unmappedFields,
  };
}

export function extraUnmappedFromDeferred(
  deferred: ReadonlyArray<{ field: string; value: string; reason: string }>,
): Record<string, string> {
  const extra: Record<string, string> = {};
  const timeframe = deferredValue(deferred, "timeframe");
  if (timeframe) extra.timeframe = timeframe;
  const unrecognizedType = deferredValue(deferred, "lead_type");
  if (unrecognizedType) extra.lead_type = unrecognizedType;
  return extra;
}

export function tagsRawFromDeferred(
  deferred: ReadonlyArray<{ field: string; value: string }> | undefined,
): string | undefined {
  return deferredValue(deferred, "tags");
}
