import type { ListingStatus, ListingTransactionType } from "@prisma/client";
import {
  formatListingAddress,
  listingStatusLabel,
} from "@/lib/listings/constants";
import {
  buildListingHistoryRows,
  compareHistoryRowsByRecency,
  type HistoryRow,
} from "@/lib/listings/history-rows";
import { prisma } from "@/lib/prisma";
import { excludeStagingSnapshotWhere } from "@/lib/tenancy/templates/high-octane-staging-snapshot";

export type AddressHistoryListing = {
  mlsNumber: string;
  status: ListingStatus;
  transactionType: ListingTransactionType | string;
  listPrice: number;
  soldPrice: number | null;
  listedAt: Date | string;
  soldAt: Date | string | null;
  updatedAtMls?: Date | string | null;
  addressLine: string;
  unitNumber?: string | null;
  city: string;
  province?: string | null;
  postalCode?: string | null;
  history: Array<{
    id: string;
    event: string;
    price: number | null;
    originalPrice?: number | null;
    contractDate: Date | string;
    lastUpdatedAt?: Date | string | null;
    externalMls?: string | null;
    visibility?: string | null;
    note?: string | null;
  }>;
};

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  return typeof value === "string" ? value : value.toISOString();
}

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePostal(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  return value.replace(/\s+/g, "").toUpperCase();
}

/** Street + unit key used to match other MLS cycles at the same property. */
export function addressMatchKey(listing: {
  addressLine: string;
  unitNumber?: string | null;
  city: string;
  province?: string | null;
  postalCode?: string | null;
}): string {
  const [street] = formatListingAddress(listing);
  return normalizeKey(street);
}

function streetNumberToken(streetKey: string): string | null {
  const match = streetKey.match(/^(\d+[a-z]?)/i);
  return match?.[1] ?? null;
}

/**
 * Other Neon listing rows at the same civic address (different MLS #).
 * VOW does not provide cross-listing property history — we assemble it.
 */
export async function findSiblingListingsAtAddress(
  subject: {
    mlsNumber: string;
    addressLine: string;
    unitNumber?: string | null;
    city: string;
    province?: string | null;
    postalCode?: string | null;
  },
  options?: { limit?: number },
): Promise<AddressHistoryListing[]> {
  const subjectKey = addressMatchKey(subject);
  if (!subjectKey) return [];

  const numberToken = streetNumberToken(subjectKey);
  const limit = options?.limit ?? 40;
  const subjectPostal = normalizePostal(subject.postalCode);

  const candidates = await prisma.listing.findMany({
    where: {
      mlsNumber: { not: subject.mlsNumber },
      ...excludeStagingSnapshotWhere(),
      city: { equals: subject.city.trim(), mode: "insensitive" },
      ...(numberToken
        ? {
            OR: [
              {
                addressLine: {
                  startsWith: `${numberToken} `,
                  mode: "insensitive",
                },
              },
              {
                addressLine: {
                  startsWith: `${numberToken},`,
                  mode: "insensitive",
                },
              },
              {
                addressLine: {
                  equals: subject.addressLine.trim(),
                  mode: "insensitive",
                },
              },
            ],
          }
        : {
            addressLine: {
              equals: subject.addressLine.trim(),
              mode: "insensitive",
            },
          }),
    },
    select: {
      mlsNumber: true,
      status: true,
      transactionType: true,
      listPrice: true,
      soldPrice: true,
      listedAt: true,
      soldAt: true,
      updatedAtMls: true,
      addressLine: true,
      unitNumber: true,
      city: true,
      province: true,
      postalCode: true,
      history: { orderBy: { contractDate: "desc" } },
    },
    take: Math.max(limit * 3, 60),
    orderBy: { listedAt: "desc" },
  });

  return candidates
    .filter((row) => {
      if (addressMatchKey(row) !== subjectKey) return false;
      const rowPostal = normalizePostal(row.postalCode);
      if (subjectPostal && rowPostal && subjectPostal !== rowPostal) {
        return false;
      }
      return true;
    })
    .slice(0, limit);
}

function siblingCycleRow(sibling: AddressHistoryListing): HistoryRow {
  const isClosed =
    sibling.status === "SOLD" || sibling.status === "LEASED";
  const soldAtMs =
    sibling.soldAt != null ? new Date(sibling.soldAt).getTime() : NaN;
  const soldAtUsable =
    Number.isFinite(soldAtMs) && soldAtMs <= Date.now() + 86_400_000
      ? sibling.soldAt
      : null;
  const price =
    isClosed && sibling.soldPrice != null && sibling.soldPrice > 0
      ? sibling.soldPrice
      : sibling.listPrice;

  return {
    id: `sibling-${sibling.mlsNumber}`,
    contractDate: toIso(sibling.listedAt),
    lastUpdate: toIso(
      (isClosed ? soldAtUsable : null) ?? sibling.updatedAtMls ?? null,
    ),
    price,
    originalPrice: null,
    event: listingStatusLabel(
      sibling.status,
      sibling.transactionType ?? "SALE",
    ),
    listingId: sibling.mlsNumber,
    // Past / inactive cycles are VOW-restricted; on-market siblings stay public.
    public:
      sibling.status === "ACTIVE" || sibling.status === "SOLD_CONDITIONAL",
  };
}

function siblingHistoryRows(sibling: AddressHistoryListing): HistoryRow[] {
  const cycleEvent = listingStatusLabel(
    sibling.status,
    sibling.transactionType ?? "SALE",
  );
  const isClosed =
    sibling.status === "SOLD" || sibling.status === "LEASED";

  return sibling.history
    .filter((h) => {
      if (h.note === "synthetic:empty" || h.event === "Synced") return false;
      return true;
    })
    .map((h) => {
      const eventLower = h.event.toLowerCase();
      const mappedEvent =
        eventLower === "listed"
          ? sibling.transactionType === "LEASE"
            ? "For Lease"
            : "For Sale"
          : h.event;
      return {
        id: h.id,
        contractDate: toIso(h.contractDate),
        lastUpdate: toIso(h.lastUpdatedAt ?? null),
        price: h.price,
        originalPrice: h.originalPrice ?? null,
        event: mappedEvent,
        listingId: h.externalMls ?? sibling.mlsNumber,
        public: h.visibility === "public",
      } satisfies HistoryRow;
    })
    .filter((row) => {
      // Cycle row already represents this listing's status.
      if (
        row.listingId === sibling.mlsNumber &&
        row.event.trim().toLowerCase() === cycleEvent.toLowerCase()
      ) {
        return false;
      }
      if (
        row.listingId === sibling.mlsNumber &&
        /for sale|for lease|listed/i.test(row.event) &&
        sibling.status === "ACTIVE" ||
        sibling.status === "SOLD_CONDITIONAL"
      ) {
        return false;
      }
      if (
        isClosed &&
        row.listingId === sibling.mlsNumber &&
        /^(sold|leased)$/i.test(row.event.trim())
      ) {
        return false;
      }
      return true;
    });
}

/**
 * Current listing history + other MLS cycles at the same address.
 * Current listing stays first; remaining rows newest-first.
 */
export function buildAddressListingHistoryRows(input: {
  mlsNumber: string;
  listPrice: number;
  listedAt: Date | string;
  updatedAtMls?: Date | string | null;
  soldAt?: Date | string | null;
  soldPrice?: number | null;
  status: string;
  transactionType: string;
  history: AddressHistoryListing["history"];
  siblings: AddressHistoryListing[];
}): HistoryRow[] {
  const currentRows = buildListingHistoryRows({
    mlsNumber: input.mlsNumber,
    listPrice: input.listPrice,
    listedAt: input.listedAt,
    updatedAtMls: input.updatedAtMls,
    soldAt: input.soldAt,
    soldPrice: input.soldPrice,
    status: input.status,
    transactionType: input.transactionType,
    history: input.history,
  });

  const [current, ...currentPast] = currentRows;
  const siblingRows = input.siblings.flatMap((sibling) => [
    siblingCycleRow(sibling),
    ...siblingHistoryRows(sibling),
  ]);

  const seen = new Set<string>();
  const mergedPast: HistoryRow[] = [];
  for (const row of [...currentPast, ...siblingRows]) {
    const key = `${row.listingId}|${row.event}|${row.contractDate ?? ""}|${row.price ?? ""}|${row.originalPrice ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    mergedPast.push(row);
  }

  mergedPast.sort(compareHistoryRowsByRecency);

  return current ? [current, ...mergedPast] : mergedPast;
}
