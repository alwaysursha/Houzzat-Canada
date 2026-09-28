import type { AreaMonitor, AreaMonitorTransaction, ListingSegment } from "@prisma/client";

export type AreaMonitorCriteria = {
  userId: string;
  city: string;
  community: string | null;
  transactionType: AreaMonitorTransaction;
  segment: ListingSegment;
};

export type AreaMonitorCreateStore = {
  findEquivalent(criteria: AreaMonitorCriteria): Promise<AreaMonitor | null>;
  create(data: AreaMonitorCriteria & {
    emailAlerts: boolean;
    lastSeenListingAt: Date;
    notifyNew: boolean;
    notifySold: boolean;
  }): Promise<AreaMonitor>;
};

export function isPrismaUniqueConflict(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "P2002"
  );
}

/**
 * One Area Watch per customer + city + community + transaction + segment.
 * A concurrent insert that loses the unique race returns the winning row.
 */
export async function createOrReuseAreaMonitor(
  store: AreaMonitorCreateStore,
  data: AreaMonitorCriteria & {
    emailAlerts: boolean;
    lastSeenListingAt: Date;
    notifyNew: boolean;
    notifySold: boolean;
  },
): Promise<{ item: AreaMonitor; alreadyWatching: boolean }> {
  const existing = await store.findEquivalent({
    userId: data.userId,
    city: data.city,
    community: data.community,
    transactionType: data.transactionType,
    segment: data.segment,
  });
  if (existing) return { item: existing, alreadyWatching: true };

  try {
    const item = await store.create(data);
    return { item, alreadyWatching: false };
  } catch (error) {
    if (!isPrismaUniqueConflict(error)) throw error;
    const winner = await store.findEquivalent({
      userId: data.userId,
      city: data.city,
      community: data.community,
      transactionType: data.transactionType,
      segment: data.segment,
    });
    if (!winner) throw error;
    return { item: winner, alreadyWatching: true };
  }
}
