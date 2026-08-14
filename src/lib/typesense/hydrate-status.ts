import type { ListingStatus, ListingTransactionType } from "@prisma/client";
import { prisma, scheduleWorkerSideEffect } from "@/lib/prisma";
import { syncListingToTypesense } from "@/lib/typesense/sync-listing";

/** Cap Neon lookups to one page of Typesense hits — never a full inventory scan. */
const MAX_HYDRATE = 120;
/** Bound background Typesense heal work per request. */
const MAX_HEAL = 40;

export type NeonListingStatusRow = {
  id: string;
  mlsNumber: string;
  status: ListingStatus;
  transactionType: ListingTransactionType;
};

/**
 * Tiny indexed lookup: mlsNumber → Neon status + deal type (source of truth vs Typesense).
 * Request-scoped Prisma only — no cross-request reuse.
 */
export async function loadNeonListingStatusesByMls(
  mlsNumbers: string[],
): Promise<Map<string, NeonListingStatusRow>> {
  const unique = [
    ...new Set(
      mlsNumbers
        .map((m) => m.trim())
        .filter((m) => m.length > 0),
    ),
  ].slice(0, MAX_HYDRATE);

  if (unique.length === 0) return new Map();

  const rows = await prisma.listing.findMany({
    where: { mlsNumber: { in: unique }, isMock: false },
    select: {
      id: true,
      mlsNumber: true,
      status: true,
      transactionType: true,
    },
  });

  return new Map(rows.map((row) => [row.mlsNumber, row]));
}

/**
 * Overlay Neon status (+ transactionType) onto Typesense-shaped rows.
 * When drift is detected, schedule Typesense upserts via waitUntil
 * (does not block the response).
 */
export function applyNeonListingStatuses<
  T extends {
    mlsNumber: string;
    status?: ListingStatus | string | null;
    transactionType?: ListingTransactionType | string | null;
  },
>(items: T[], neonByMls: Map<string, NeonListingStatusRow>): T[] {
  if (items.length === 0 || neonByMls.size === 0) return items;

  const driftedIds: string[] = [];
  const next = items.map((item) => {
    const row = neonByMls.get(item.mlsNumber);
    if (!row) return item;

    const statusDrift = item.status !== row.status;
    const txnDrift =
      item.transactionType != null &&
      item.transactionType !== row.transactionType;
    if (statusDrift || txnDrift) driftedIds.push(row.id);

    if (
      !statusDrift &&
      !txnDrift &&
      item.transactionType != null
    ) {
      return item;
    }

    return {
      ...item,
      status: row.status,
      transactionType: row.transactionType,
    };
  });

  if (driftedIds.length > 0) {
    const uniqueIds = [...new Set(driftedIds)].slice(0, MAX_HEAL);
    scheduleWorkerSideEffect(
      Promise.all(uniqueIds.map((id) => syncListingToTypesense(id))).then(
        () => undefined,
      ),
    );
  }

  return next;
}
