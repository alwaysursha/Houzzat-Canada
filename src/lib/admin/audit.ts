import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function writeAuditLog(input: {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  meta?: Prisma.InputJsonValue | null;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId ?? undefined,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? undefined,
        summary: input.summary,
        meta: input.meta ?? undefined,
      },
    });
  } catch {
    // Never block the primary admin action on audit failure.
  }
}
