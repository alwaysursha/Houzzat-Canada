/**
 * Stage 6.2A — platform audit helpers.
 * NEVER STORE TENANT CRM PII OR CRM CONTENT in PlatformAuditEvent.metadata.
 */

import type {
  PlatformAuditActorType,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";

export const PLATFORM_AUDIT_NO_CRM_CONTENT =
  "PlatformAuditEvent must never store tenant CRM PII or CRM content" as const;

export type WritePlatformAuditEventInput = {
  actorOperatorId?: string | null;
  actorType: PlatformAuditActorType;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  /** Must not include Lead/Customer CRM content or PII beyond operator ids. */
  metadata?: Prisma.InputJsonValue | null;
};

export async function writePlatformAuditEvent(
  input: WritePlatformAuditEventInput,
  db: PrismaClient = defaultPrisma,
): Promise<{ id: string }> {
  const row = await db.platformAuditEvent.create({
    data: {
      actorOperatorId: input.actorOperatorId ?? null,
      actorType: input.actorType,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      summary: input.summary,
      metadata: input.metadata ?? undefined,
    },
    select: { id: true },
  });
  return row;
}
