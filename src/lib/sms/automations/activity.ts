import type { PrismaClient } from "@prisma/client";

export type LastCustomerActivityDb = {
  siteVisitor: {
    findFirst: (args: {
      where: { userId: string };
      orderBy: { lastSeenAt: "desc" };
      select: { lastSeenAt: true };
    }) => Promise<{ lastSeenAt: Date } | null>;
  };
  activityEvent: {
    findFirst: (args: {
      where: {
        userId: string;
        type: { not: "HEARTBEAT" };
        createdAt?: { lt: Date };
      };
      orderBy: { createdAt: "desc" };
      select: { createdAt: true };
    }) => Promise<{ createdAt: Date } | null>;
  };
  message: {
    findFirst: (args: {
      where: {
        leadId: { in: string[] };
        channel: "SMS";
        senderKind: "CUSTOMER";
      };
      orderBy: { createdAt: "desc" };
      select: { createdAt: true };
    }) => Promise<{ createdAt: Date } | null>;
  };
};

export function completedInactiveDays(from: Date, now: Date): number {
  const ms = now.getTime() - from.getTime();
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return Math.floor(ms / 86_400_000);
}

export async function resolveLastCustomerActivityAt(
  db: LastCustomerActivityDb,
  input: {
    customerId: string | null;
    leadIds: string[];
    createdAt: Date;
    before?: Date | null;
  },
): Promise<Date> {
  let latest = input.createdAt;
  const customerId = input.customerId?.trim() || "";
  const before = input.before ?? null;

  if (customerId) {
    const visitor = await db.siteVisitor.findFirst({
      where: { userId: customerId },
      orderBy: { lastSeenAt: "desc" },
      select: { lastSeenAt: true },
    });
    if (visitor?.lastSeenAt && visitor.lastSeenAt > latest) {
      if (!before || visitor.lastSeenAt < before) latest = visitor.lastSeenAt;
    }

    const event = await db.activityEvent.findFirst({
      where: {
        userId: customerId,
        type: { not: "HEARTBEAT" },
        ...(before ? { createdAt: { lt: before } } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (event?.createdAt && event.createdAt > latest) latest = event.createdAt;
  }

  if (input.leadIds.length) {
    const inbound = await db.message.findFirst({
      where: {
        leadId: { in: input.leadIds },
        channel: "SMS",
        senderKind: "CUSTOMER",
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (inbound?.createdAt && inbound.createdAt > latest) {
      if (!before || inbound.createdAt < before) latest = inbound.createdAt;
    }
  }

  return latest;
}

export function prismaLastCustomerActivityDb(
  prisma: PrismaClient,
): LastCustomerActivityDb {
  return prisma as unknown as LastCustomerActivityDb;
}
