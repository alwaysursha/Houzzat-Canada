import { prisma } from "@/lib/prisma";
import {
  buildCursorPage,
  type PlatformListParams,
} from "@/lib/platform/api/pagination";
import { serializeAuditEvent } from "@/lib/platform/read/serialize";

export async function listPlatformAuditEvents(params: PlatformListParams & {
  entityType?: string | null;
  action?: string | null;
}) {
  const where: {
    entityType?: string;
    action?: string;
  } = {};
  if (params.entityType) where.entityType = params.entityType;
  if (params.action) where.action = params.action;

  const rows = await prisma.platformAuditEvent.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: params.limit + 1,
    ...(params.cursor
      ? {
          cursor: { id: params.cursor },
          skip: 1,
        }
      : {}),
  });

  const page = buildCursorPage(rows, params.limit);
  return {
    items: page.items.map(serializeAuditEvent),
    nextCursor: page.nextCursor,
  };
}
