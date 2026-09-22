import {
  buildAddressListingHistoryRows,
  findSiblingListingsAtAddress,
  type AddressHistoryListing,
} from "@/lib/listings/address-history";
import type { HistoryRow } from "@/lib/listings/history-rows";
import { parseExactAddressQuery } from "@/lib/listings/search-match";
import { formatListingAddressOneLine } from "@/lib/listings/constants";
import { prisma } from "@/lib/prisma";
import {
  mapPropertyToListingResult,
  type PropTxProperty,
} from "@/lib/proptx/map-listing";
import { assertMlsSyncExecutionHost } from "@/lib/proptx/mls-sync-host";
import { fetchAllPropertiesAtExactAddress } from "@/lib/proptx/resolve-listing";
import { upsertPropTxPropertiesOnDemand } from "@/lib/proptx/sync";

/** Skip PropTx re-pull if enriched within this window. */
export const ADDRESS_HISTORY_ENRICH_TTL_MS = 24 * 60 * 60 * 1000;

export type AddressHistoryListingInput = {
  mlsNumber: string;
  addressLine: string;
  unitNumber?: string | null;
  city: string;
  province?: string | null;
  postalCode?: string | null;
  listPrice: number;
  listedAt: Date;
  updatedAtMls?: Date | null;
  soldAt?: Date | null;
  soldPrice?: number | null;
  status: string;
  transactionType: string;
  history: Array<{
    id: string;
    event: string;
    price: number | null;
    originalPrice?: number | null;
    contractDate: Date;
    lastUpdatedAt?: Date | null;
    externalMls?: string | null;
    visibility?: string | null;
    note?: string | null;
  }>;
  addressHistoryEnrichedAt?: Date | null;
};

function listingAddressQuery(listing: {
  addressLine: string;
  unitNumber?: string | null;
  city: string;
}): string {
  // Prefer the street segment before any embedded city/province/postal.
  const streetPart =
    listing.addressLine.split(",")[0]?.trim() || listing.addressLine.trim();
  const unit = listing.unitNumber?.trim();
  const head =
    unit && !streetPart.toLowerCase().includes(unit.toLowerCase())
      ? `Unit ${unit} ${streetPart}`
      : streetPart;
  return `${head}, ${listing.city.trim()}`;
}

function parsedAddressFromListing(listing: {
  addressLine: string;
  unitNumber?: string | null;
  city: string;
}): ReturnType<typeof parseExactAddressQuery> {
  const q = listingAddressQuery(listing);
  const parsed = parseExactAddressQuery(q);
  if (parsed) {
    return {
      ...parsed,
      city: parsed.city || listing.city.trim() || null,
      unit: parsed.unit || listing.unitNumber?.trim() || null,
    };
  }

  // Fallback when addressLine is noisy (city/postal baked into the street field).
  const streetPart =
    listing.addressLine.split(",")[0]?.trim() || listing.addressLine.trim();
  const match = streetPart.match(/^(\d+[A-Za-z]?)\s+(.+)$/);
  if (!match?.[1] || !match[2]) return null;
  let rest = match[2].trim();
  let unitFromStreet: string | null = null;
  const unitTail = rest.match(/^(.*\S)\s+(\d{1,6})$/);
  if (unitTail) {
    rest = unitTail[1]!.trim();
    unitFromStreet = unitTail[2]!;
  }
  if (rest.length < 2) return null;

  // Pull trailing street type into streetType (AMPRE StreetName usually omits it).
  const restParts = rest.split(/\s+/);
  let streetType: string | null = null;
  const last = restParts[restParts.length - 1]?.toLowerCase() ?? "";
  const STREET_TYPES = new Set([
    "st",
    "street",
    "ave",
    "avenue",
    "rd",
    "road",
    "dr",
    "drive",
    "cres",
    "crescent",
    "trail",
    "tr",
    "crt",
    "court",
    "ct",
    "blvd",
    "boulevard",
    "ln",
    "lane",
    "pl",
    "place",
    "way",
    "pkwy",
    "parkway",
  ]);
  if (restParts.length >= 2 && STREET_TYPES.has(last)) {
    streetType = restParts.pop() ?? null;
    rest = restParts.join(" ").trim();
  }
  if (rest.length < 2) return null;

  return {
    streetNumber: match[1],
    streetName: rest,
    streetType,
    unit: listing.unitNumber?.trim() || unitFromStreet || null,
    city: listing.city.trim() || null,
  };
}


export function isAddressHistoryEnrichFresh(
  enrichedAt: Date | null | undefined,
  ttlMs = ADDRESS_HISTORY_ENRICH_TTL_MS,
): boolean {
  if (!enrichedAt) return false;
  return Date.now() - enrichedAt.getTime() < ttlMs;
}

function liveSiblingFromPropTx(
  row: PropTxProperty,
): AddressHistoryListing | null {
  const mapped = mapPropertyToListingResult(row);
  if (!mapped.ok) return null;
  const data = mapped.data;
  if (
    !data.mlsNumber ||
    !data.status ||
    !data.transactionType ||
    !data.addressLine ||
    !data.city ||
    data.listPrice == null ||
    !(data.listedAt instanceof Date)
  ) {
    return null;
  }
  return {
    mlsNumber: data.mlsNumber,
    status: data.status,
    transactionType: data.transactionType,
    listPrice: data.listPrice,
    soldPrice: data.soldPrice ?? null,
    listedAt: data.listedAt,
    soldAt: data.soldAt ?? null,
    updatedAtMls: data.updatedAtMls ?? null,
    addressLine: data.addressLine,
    unitNumber: data.unitNumber ?? null,
    city: data.city,
    province: data.province,
    postalCode: data.postalCode ?? null,
    history: [],
  };
}

/**
 * Local Neon history plus live PropTx cycles. Does not write.
 */
export function historyRowsWithLiveAddressSiblings(
  listing: AddressHistoryListingInput,
  localSiblings: AddressHistoryListing[],
  liveRows: PropTxProperty[],
): HistoryRow[] {
  const byMls = new Map<string, AddressHistoryListing>();
  for (const sibling of localSiblings) {
    if (sibling.mlsNumber === listing.mlsNumber) continue;
    byMls.set(sibling.mlsNumber, sibling);
  }
  for (const row of liveRows) {
    const live = liveSiblingFromPropTx(row);
    if (!live || live.mlsNumber === listing.mlsNumber) continue;
    const existing = byMls.get(live.mlsNumber);
    byMls.set(
      live.mlsNumber,
      existing
        ? {
            ...existing,
            status: live.status,
            transactionType: live.transactionType,
            listPrice: live.listPrice,
            soldPrice: live.soldPrice,
            listedAt: live.listedAt,
            soldAt: live.soldAt,
            updatedAtMls: live.updatedAtMls,
          }
        : live,
    );
  }
  return buildAddressListingHistoryRows({
    mlsNumber: listing.mlsNumber,
    listPrice: listing.listPrice,
    listedAt: listing.listedAt,
    updatedAtMls: listing.updatedAtMls ?? null,
    soldAt: listing.soldAt ?? null,
    soldPrice: listing.soldPrice ?? null,
    status: listing.status as never,
    transactionType: listing.transactionType as never,
    history: listing.history,
    siblings: [...byMls.values()],
  });
}

async function localAddressHistoryRows(listing: AddressHistoryListingInput) {
  const siblings = await findSiblingListingsAtAddress(listing);
  return buildAddressListingHistoryRows({
    mlsNumber: listing.mlsNumber,
    listPrice: listing.listPrice,
    listedAt: listing.listedAt,
    updatedAtMls: listing.updatedAtMls ?? null,
    soldAt: listing.soldAt ?? null,
    soldPrice: listing.soldPrice ?? null,
    status: listing.status as never,
    transactionType: listing.transactionType as never,
    history: listing.history,
    siblings,
  });
}

/**
 * Customer panel: read PropTx cycles and return history rows.
 * Does not upsert siblings, write History, update Typesense, or stamp
 * addressHistoryEnrichedAt. The Sync Mac nightly job persists that state.
 */
export async function previewAddressListingHistory(
  listing: AddressHistoryListingInput,
  options?: { force?: boolean },
): Promise<{
  ok: boolean;
  skipped: boolean;
  upsertedMls: string[];
  historyRows: HistoryRow[];
}> {
  try {
    if (
      !options?.force &&
      isAddressHistoryEnrichFresh(listing.addressHistoryEnrichedAt)
    ) {
      return {
        ok: true,
        skipped: true,
        upsertedMls: [],
        historyRows: await localAddressHistoryRows(listing),
      };
    }

    const parsed = parsedAddressFromListing(listing);
    if (!parsed) {
      return {
        ok: false,
        skipped: true,
        upsertedMls: [],
        historyRows: await localAddressHistoryRows(listing),
      };
    }

    const rows = await fetchAllPropertiesAtExactAddress(parsed, { max: 20 });
    const siblings = await findSiblingListingsAtAddress(listing);
    return {
      ok: true,
      skipped: false,
      upsertedMls: [],
      historyRows: historyRowsWithLiveAddressSiblings(listing, siblings, rows),
    };
  } catch (err) {
    console.error("[address-history:preview]", listing.mlsNumber, err);
    try {
      return {
        ok: false,
        skipped: false,
        upsertedMls: [],
        historyRows: await localAddressHistoryRows(listing),
      };
    } catch {
      return {
        ok: false,
        skipped: false,
        upsertedMls: [],
        historyRows: [],
      };
    }
  }
}

/**
 * Pull all PropTx Property cycles at this civic address into Neon.
 * Sync Mac only. Throws before any PropTx request when the host marker is absent.
 */
export async function enrichAddressListingHistory(
  listing: AddressHistoryListingInput,
  options?: { force?: boolean },
): Promise<{
  ok: boolean;
  skipped: boolean;
  upsertedMls: string[];
  historyRows: HistoryRow[];
}> {
  assertMlsSyncExecutionHost();
  try {
    if (
      !options?.force &&
      isAddressHistoryEnrichFresh(listing.addressHistoryEnrichedAt)
    ) {
      const siblings = await findSiblingListingsAtAddress(listing);
      return {
        ok: true,
        skipped: true,
        upsertedMls: [],
        historyRows: buildAddressListingHistoryRows({
          mlsNumber: listing.mlsNumber,
          listPrice: listing.listPrice,
          listedAt: listing.listedAt,
          updatedAtMls: listing.updatedAtMls ?? null,
          soldAt: listing.soldAt ?? null,
          soldPrice: listing.soldPrice ?? null,
          status: listing.status as never,
          transactionType: listing.transactionType as never,
          history: listing.history,
          siblings,
        }),
      };
    }

    const parsed = parsedAddressFromListing(listing);
    if (!parsed) {
      const siblings = await findSiblingListingsAtAddress(listing);
      return {
        ok: false,
        skipped: true,
        upsertedMls: [],
        historyRows: buildAddressListingHistoryRows({
          mlsNumber: listing.mlsNumber,
          listPrice: listing.listPrice,
          listedAt: listing.listedAt,
          updatedAtMls: listing.updatedAtMls ?? null,
          soldAt: listing.soldAt ?? null,
          soldPrice: listing.soldPrice ?? null,
          status: listing.status as never,
          transactionType: listing.transactionType as never,
          history: listing.history,
          siblings,
        }),
      };
    }

    const rows = await fetchAllPropertiesAtExactAddress(parsed, { max: 20 });
    // Stamp only after that lookup returns. Timeouts, 429s, 5xx, 400, 404,
    // and network failures throw and skip this update.
    const upsertedMls =
      rows.length > 0
        ? await upsertPropTxPropertiesOnDemand(rows, { concurrency: 3 })
        : [];

    const now = new Date();
    await prisma.listing.update({
      where: { mlsNumber: listing.mlsNumber },
      data: { addressHistoryEnrichedAt: now },
    });

    // Also stamp siblings we just upserted so nightly skips them.
    if (upsertedMls.length) {
      await prisma.listing.updateMany({
        where: {
          mlsNumber: { in: upsertedMls },
          OR: [
            { addressHistoryEnrichedAt: null },
            { addressHistoryEnrichedAt: { lt: new Date(now.getTime() - 60_000) } },
          ],
        },
        data: { addressHistoryEnrichedAt: now },
      });
    }

    const fresh = await prisma.listing.findUnique({
      where: { mlsNumber: listing.mlsNumber },
      select: {
        mlsNumber: true,
        listPrice: true,
        listedAt: true,
        updatedAtMls: true,
        soldAt: true,
        soldPrice: true,
        status: true,
        transactionType: true,
        addressLine: true,
        unitNumber: true,
        city: true,
        province: true,
        postalCode: true,
        history: { orderBy: { contractDate: "desc" } },
      },
    });

    const subject = fresh ?? listing;
    const siblings = await findSiblingListingsAtAddress(subject);
    const historyRows = buildAddressListingHistoryRows({
      mlsNumber: subject.mlsNumber,
      listPrice: subject.listPrice,
      listedAt: subject.listedAt,
      updatedAtMls: subject.updatedAtMls ?? null,
      soldAt: subject.soldAt ?? null,
      soldPrice: subject.soldPrice ?? null,
      status: subject.status as never,
      transactionType: subject.transactionType as never,
      history: subject.history,
      siblings,
    });

    return {
      ok: true,
      skipped: false,
      upsertedMls,
      historyRows,
    };
  } catch (err) {
    console.error("[address-history:enrich]", listing.mlsNumber, err);
    try {
      const siblings = await findSiblingListingsAtAddress(listing);
      return {
        ok: false,
        skipped: false,
        upsertedMls: [],
        historyRows: buildAddressListingHistoryRows({
          mlsNumber: listing.mlsNumber,
          listPrice: listing.listPrice,
          listedAt: listing.listedAt,
          updatedAtMls: listing.updatedAtMls ?? null,
          soldAt: listing.soldAt ?? null,
          soldPrice: listing.soldPrice ?? null,
          status: listing.status as never,
          transactionType: listing.transactionType as never,
          history: listing.history,
          siblings,
        }),
      };
    } catch {
      return {
        ok: false,
        skipped: false,
        upsertedMls: [],
        historyRows: [],
      };
    }
  }
}

export async function loadListingForAddressHistory(mlsNumber: string) {
  return prisma.listing.findUnique({
    where: { mlsNumber },
    select: {
      mlsNumber: true,
      addressLine: true,
      unitNumber: true,
      city: true,
      province: true,
      postalCode: true,
      listPrice: true,
      listedAt: true,
      updatedAtMls: true,
      soldAt: true,
      soldPrice: true,
      status: true,
      transactionType: true,
      addressHistoryEnrichedAt: true,
      history: { orderBy: { contractDate: "desc" } },
    },
  });
}

export function listingDisplayAddress(listing: {
  addressLine: string;
  unitNumber?: string | null;
  city: string;
  province?: string | null;
  postalCode?: string | null;
}) {
  return formatListingAddressOneLine(listing);
}
