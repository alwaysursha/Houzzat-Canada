import type { ActivityEventType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Fire-and-forget friendly writer for domain→journey events. */
export async function recordActivityEvent(input: {
  type: ActivityEventType;
  userId?: string | null;
  visitorId?: string | null;
  sessionId?: string | null;
  path?: string | null;
  title?: string | null;
  mlsNumber?: string | null;
  meta?: Prisma.InputJsonValue;
}) {
  try {
    await prisma.activityEvent.create({
      data: {
        type: input.type,
        userId: input.userId ?? undefined,
        visitorId: input.visitorId ?? undefined,
        sessionId: input.sessionId ?? undefined,
        path: input.path ?? undefined,
        title: input.title ?? undefined,
        mlsNumber: input.mlsNumber ?? undefined,
        meta: input.meta,
      },
    });
  } catch (error) {
    console.error("[recordActivityEvent]", error);
  }
}
