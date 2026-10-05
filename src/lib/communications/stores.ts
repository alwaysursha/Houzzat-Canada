import type { Prisma } from "@prisma/client";
import type {
  CommunicationPreferenceAuditRecord,
  CommunicationPreferenceAuditStore,
} from "@/lib/communications/preference-audit";
import type {
  EmailSuppressionRecord,
  EmailSuppressionStore,
} from "@/lib/communications/suppression";
import { prisma as defaultPrisma } from "@/lib/prisma";

type PrismaSuppressionRow = {
  workspaceId: string;
  userId: string | null;
  emailNormalized: string;
  scope: EmailSuppressionRecord["scope"];
  identityKey: string;
  reason: EmailSuppressionRecord["reason"];
  source: string;
  providerId: string | null;
  leadEmailLogId: string | null;
  meta: Prisma.JsonValue;
};

type Db = {
  emailSuppression: {
    findUnique(args: {
      where: {
        workspaceId_scope_identityKey: {
          workspaceId: string;
          scope: EmailSuppressionRecord["scope"];
          identityKey: string;
        };
      };
    }): Promise<PrismaSuppressionRow | null>;
    upsert(args: {
      where: {
        workspaceId_scope_identityKey: {
          workspaceId: string;
          scope: EmailSuppressionRecord["scope"];
          identityKey: string;
        };
      };
      create: {
        workspaceId: string;
        userId: string | null;
        emailNormalized: string;
        scope: EmailSuppressionRecord["scope"];
        identityKey: string;
        reason: EmailSuppressionRecord["reason"];
        source: string;
        providerId: string | null;
        leadEmailLogId: string | null;
        meta: Prisma.InputJsonValue;
      };
      update: {
        reason: EmailSuppressionRecord["reason"];
        source: string;
        providerId: string | null;
        leadEmailLogId: string | null;
        userId: string | null;
        meta: Prisma.InputJsonValue;
      };
    }): Promise<unknown>;
  };
  communicationPreferenceEvent: {
    findUnique(args: {
      where: { providerEventId: string };
    }): Promise<PrismaAuditRow | null>;
    create(args: {
      data: {
        workspaceId: string | null;
        userId: string | null;
        leadId: string | null;
        emailNormalized: string | null;
        kind: string;
        category: string | null;
        channel: string | null;
        previousState: Prisma.InputJsonValue | undefined;
        resultingState: Prisma.InputJsonValue | undefined;
        source: string;
        providerEventId: string | null;
        providerId: string | null;
        ip: string | null;
        userAgent: string | null;
        meta: Prisma.InputJsonValue | undefined;
      };
    }): Promise<PrismaAuditRow>;
  };
};

type PrismaAuditRow = {
  workspaceId: string | null;
  userId: string | null;
  leadId: string | null;
  emailNormalized: string | null;
  kind: string;
  category: string | null;
  channel: string | null;
  previousState: Prisma.JsonValue;
  resultingState: Prisma.JsonValue;
  source: string;
  providerEventId: string | null;
  providerId: string | null;
  ip: string | null;
  userAgent: string | null;
  meta: Prisma.JsonValue;
};

function jsonObject(
  value: Prisma.JsonValue,
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toSuppressionRecord(row: PrismaSuppressionRow): EmailSuppressionRecord {
  return {
    workspaceId: row.workspaceId,
    userId: row.userId,
    emailNormalized: row.emailNormalized,
    scope: row.scope,
    identityKey: row.identityKey,
    reason: row.reason,
    source: row.source,
    providerId: row.providerId,
    leadEmailLogId: row.leadEmailLogId,
    meta: jsonObject(row.meta),
  };
}

function toAuditRecord(row: PrismaAuditRow): CommunicationPreferenceAuditRecord {
  return {
    workspaceId: row.workspaceId,
    userId: row.userId,
    leadId: row.leadId,
    emailNormalized: row.emailNormalized,
    kind: row.kind,
    category: row.category,
    channel: row.channel,
    previousState: jsonObject(row.previousState),
    resultingState: jsonObject(row.resultingState),
    source: row.source,
    providerEventId: row.providerEventId,
    providerId: row.providerId,
    ip: row.ip,
    userAgent: row.userAgent,
    meta: jsonObject(row.meta),
  };
}

export function prismaEmailSuppressionStore(
  db: Db = defaultPrisma,
): EmailSuppressionStore {
  return {
    async findByIdentity({ workspaceId, scope, identityKey }) {
      const row = await db.emailSuppression.findUnique({
        where: {
          workspaceId_scope_identityKey: { workspaceId, scope, identityKey },
        },
      });
      return row ? toSuppressionRecord(row) : null;
    },
    async upsert(record) {
      const existing = await db.emailSuppression.findUnique({
        where: {
          workspaceId_scope_identityKey: {
            workspaceId: record.workspaceId,
            scope: record.scope,
            identityKey: record.identityKey,
          },
        },
      });
      await db.emailSuppression.upsert({
        where: {
          workspaceId_scope_identityKey: {
            workspaceId: record.workspaceId,
            scope: record.scope,
            identityKey: record.identityKey,
          },
        },
        create: {
          workspaceId: record.workspaceId,
          userId: record.userId,
          emailNormalized: record.emailNormalized,
          scope: record.scope,
          identityKey: record.identityKey,
          reason: record.reason,
          source: record.source,
          providerId: record.providerId,
          leadEmailLogId: record.leadEmailLogId,
          meta: (record.meta ?? {}) as Prisma.InputJsonValue,
        },
        update: {
          reason: record.reason,
          source: record.source,
          providerId: record.providerId,
          leadEmailLogId: record.leadEmailLogId,
          userId: record.userId,
          meta: (record.meta ?? {}) as Prisma.InputJsonValue,
        },
      });
      return { created: !existing };
    },
  };
}

export function prismaPreferenceAuditStore(
  db: Db = defaultPrisma,
): CommunicationPreferenceAuditStore {
  return {
    async findByProviderEventId(providerEventId) {
      const row = await db.communicationPreferenceEvent.findUnique({
        where: { providerEventId },
      });
      return row ? toAuditRecord(row) : null;
    },
    async create(record) {
      const row = await db.communicationPreferenceEvent.create({
        data: {
          workspaceId: record.workspaceId,
          userId: record.userId,
          leadId: record.leadId,
          emailNormalized: record.emailNormalized,
          kind: record.kind,
          category: record.category,
          channel: record.channel,
          previousState: (record.previousState ?? undefined) as
            | Prisma.InputJsonValue
            | undefined,
          resultingState: (record.resultingState ?? undefined) as
            | Prisma.InputJsonValue
            | undefined,
          source: record.source,
          providerEventId: record.providerEventId,
          providerId: record.providerId,
          ip: record.ip,
          userAgent: record.userAgent,
          meta: (record.meta ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
      return toAuditRecord(row);
    },
  };
}
