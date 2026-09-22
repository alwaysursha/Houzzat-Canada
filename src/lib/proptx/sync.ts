import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { NEON_LISTING_MEDIA_CAP } from "@/lib/listings/gallery-constants";
import {
  getPropTxIdxConfig,
  getPropTxSoldSyncConfig,
  getPropTxSyncConfig,
} from "@/lib/proptx/config";
import { PropTxError, proptxJson, proptxPages } from "@/lib/proptx/client";
import {
  readPropTxTransportStats,
  resetPropTxTransportStats,
} from "@/lib/proptx/transport-retry";
import type { PropTxConfig } from "@/lib/proptx/config";
import { geocodeListing } from "@/lib/geo/geocode";
import { isKnownCityCentroid } from "@/lib/geo/city-centroids";
import {
  fetchRawPropertyMedia,
  preferListingPhotos,
} from "@/lib/proptx/listing-photos";
import {
  mapHistoryRow,
  mapMediaRow,
  mapMlsNumber,
  mapOpenHouseRow,
  mapPropertyToListingResult,
  mapRoomRow,
  mapSyntheticHistoryFromProperty,
  stripApproxPinNote,
  SYNTHETIC_HISTORY_NOTE_PREFIX,
  toODataDate,
  type PropTxProperty,
} from "@/lib/proptx/map-listing";
import { cityAllowedForMlsSync, getMlsSyncCities, normalizeCityName } from "@/lib/proptx/sync-cities";
import {
  assertDurablePropTxListingKey,
  assertListingMirrorsCompatible,
  createPrismaPropTxProvenanceStore,
  createPropTxProvenanceSession,
  ensurePropTxListingProvenance,
  logPropTxProvenanceConflict,
  PropTxProvenanceError,
  type PropTxListingProvenance,
} from "@/lib/proptx/listing-provenance";
import {
  evaluateFastListingChange,
  readMlsTimestamps,
  type FastIncomingProperty,
  type FastListingComparable,
} from "@/lib/proptx/mls-fast-change";
import {
  completionMediaSourceStamp,
  mediaStampAfterOutcome,
  reconcileCappedMedia,
  shouldFetchListingMedia,
  MEDIA_DELAYED_COOLDOWN_MS,
  MEDIA_DELAYED_GRACE_MS,
  type MediaSyncOutcome,
} from "@/lib/proptx/mls-media-sync-state";
import {
  assertMlsSyncCursorAccess,
  isMlsFastSyncMode,
  MLS_FAST_JUST_LISTED_DAYS,
  MLS_FAST_JUST_LISTED_PAGES,
  MLS_FAST_RECENT_DAYS,
  MLS_FAST_RECENT_PAGES,
  MLS_FULL_SYNC_MODE,
  type MlsSyncMode,
} from "@/lib/proptx/mls-fast-sync";
import {
  syncListingToTypesense,
  typesenseSyncDisabledReason,
} from "@/lib/typesense/sync-listing";
import { assertMlsSyncExecutionHost } from "@/lib/proptx/mls-sync-host";
import {
  executeOnMarketReconciliation,
  formatOnMarketReconcileLog,
  type OnMarketReconcileStats,
} from "@/lib/proptx/mls-on-market-reconcile";

export type MlsSyncStats = {
  propertyUpserted: number;
  propertySkipped: number;
  mediaUpserted: number;
  roomsUpserted: number;
  openHousesUpserted: number;
  historyUpserted: number;
  /** Street-geocode attempts during this sync (approximate pins only). */
  geocodeAttempted: number;
  /** Approximate pins upgraded to street-level during this sync. */
  geocodeFixed: number;
  pages: number;
  errors: string[];
  skipReasons?: Record<string, number>;
  /** Typesense write attempts (excludes disabled / mock / missing row). */
  typesenseAttempted: number;
  /** Listings successfully upserted into Typesense this run. */
  typesenseUpserted: number;
  /** Listings that failed Typesense upsert (index enabled, network/API). */
  typesenseFailed: number;
  /** MLS docs refused because canonical org/provider/SAK was missing. */
  typesenseMissingProvenance: number;
  /** Listings skipped because Typesense writes are disabled/misconfigured. */
  typesenseDisabled: number;
  /** Distinguishes fast freshness ticks from full/slow maintenance runs. */
  mode: MlsSyncMode;
  /** Property rows that reached the fast change gate (after city + provenance). */
  propertyInspected: number;
  /** Fast Sync: identical Property, no Listing/Typesense/Media work. */
  propertyUnchangedSkipped: number;
  /** Fast Sync: no existing mlsNumber row. */
  propertyNew: number;
  propertyStatusChanged: number;
  propertyPriceChanged: number;
  propertySoldChanged: number;
  propertyPhotoChanged: number;
  /** PropTx Media requests issued for a listing (not rows upserted). */
  mediaFetches: number;
  /** Off-market reconciliation. Null when the pass did not run. */
  onMarketReconcile: OnMarketReconcileStats | null;
  /** Shared PropTx transport counters for this process since the run started. */
  proptxRequests: number;
  proptxRetries: number;
  proptx429: number;
  proptx5xx: number;
  proptxTimeouts: number;
  proptxNetworkErrors: number;
  proptxRetryAfterWaits: number;
  proptxRetriesExhausted: number;
  proptxBackoffMs: number;
};

/** Cap inline geocode so property sync stays within the 5-minute cron window. */
const SYNC_GEOCODE_BUDGET = 250;

export type MlsSyncResult = {
  ok: boolean;
  message: string;
  stats: MlsSyncStats;
  runId: string;
  mode: MlsSyncMode;
};

const RESOURCE_PROPERTY = "Property";
const RESOURCE_MEDIA = "Media";
const RESOURCE_OPEN_HOUSE = "OpenHouse";
const RESOURCE_HISTORY = "HistoryTransactional";

/** Slow sync only. Fast mode throws if these are reached. */
let activeMlsSyncMode: MlsSyncMode = MLS_FULL_SYNC_MODE;

async function getCursor(resource: string): Promise<string | null> {
  assertMlsSyncCursorAccess(activeMlsSyncMode, resource, "get");
  const row = await prisma.mlsSyncCursor.findUnique({ where: { resource } });
  return row?.cursor ?? null;
}

async function setCursor(resource: string, cursor: string) {
  assertMlsSyncCursorAccess(activeMlsSyncMode, resource, "set");
  await prisma.mlsSyncCursor.upsert({
    where: { resource },
    create: { resource, cursor },
    update: { cursor },
  });
}

function propertyFilter(since: string | null, fullBackfillDays: number): string {
  // Time window only — a giant `City eq … or City eq …` filter hangs AMPRE.
  // City allowlisting is applied after fetch via cityAllowedForMlsSync().
  if (since) {
    return `ModificationTimestamp ge ${since}`;
  }
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - fullBackfillDays);
  return `ModificationTimestamp ge ${toODataDate(from)}`;
}

async function resolveListingIdByKey(
  listingKey: string,
  cache: Map<string, string>,
): Promise<string | null> {
  const hit = cache.get(listingKey);
  if (hit) return hit;
  const row = await prisma.listing.findFirst({
    where: {
      OR: [{ listingKey }, { mlsNumber: listingKey }],
    },
    select: { id: true },
  });
  if (!row) return null;
  cache.set(listingKey, row.id);
  return row.id;
}

function odataStringLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Active + Sold/Leased Conditional (accepted offer; includes Escape variants). */
function onMarketStatusFilter(): string {
  return (
    "(StandardStatus eq 'Active' or MlsStatus eq 'A' or " +
    "startswith(MlsStatus,'Sold Conditional') or " +
    "startswith(MlsStatus,'Leased Conditional') or " +
    "StandardStatus eq 'Active Under Contract')"
  );
}

/**
 * Prefer Large → Largest → any size.
 * One request when Large exists (typical for AMPRE).
 */
async function fetchPropertyPhotos(
  listingKey: string,
): Promise<PropTxProperty[]> {
  const config = getPropTxSyncConfig();
  if (!config) return [];
  return fetchRawPropertyMedia(listingKey, config);
}

async function upsertMappedMedia(
  listingId: string,
  mapped: { url: string; sortOrder: number; isPrimary: boolean },
  stats: MlsSyncStats,
): Promise<void> {
  const existing = await prisma.listingMedia.findFirst({
    where: { listingId, url: mapped.url },
  });
  if (existing) {
    await prisma.listingMedia.update({
      where: { id: existing.id },
      data: {
        sortOrder: mapped.sortOrder,
        isPrimary: mapped.isPrimary,
      },
    });
  } else {
    await prisma.listingMedia.create({
      data: {
        listingId,
        url: mapped.url,
        sortOrder: mapped.sortOrder,
        isPrimary: mapped.isPrimary,
      },
    });
  }
  if (mapped.isPrimary) {
    await prisma.listingMedia.updateMany({
      where: { listingId, NOT: { url: mapped.url } },
      data: { isPrimary: false },
    });
  }
  stats.mediaUpserted += 1;
}

async function fetchPropertyRooms(
  listingKey: string,
): Promise<PropTxProperty[]> {
  const keyLit = odataStringLiteral(listingKey);
  const filter = `ListingKey eq ${keyLit}`;
  const path = `PropertyRooms?$filter=${encodeURIComponent(filter)}&$orderby=${encodeURIComponent("Order,RoomKey")}&$top=100`;
  const rows: PropTxProperty[] = [];
  for await (const page of proptxPages<PropTxProperty>(path, {
    maxPages: 2,
  })) {
    rows.push(...page);
  }
  return rows;
}

async function syncRoomsForListing(
  listingKey: string,
  listingId: string,
  stats: MlsSyncStats,
): Promise<void> {
  const rows = await fetchPropertyRooms(listingKey);
  for (const row of rows) {
    const mapped = mapRoomRow(row);
    if (!mapped) continue;
    try {
      await prisma.listingRoom.upsert({
        where: { roomKey: mapped.roomKey },
        create: {
          listingId,
          roomKey: mapped.roomKey,
          roomType: mapped.roomType,
          roomLevel: mapped.roomLevel,
          dimensions: mapped.dimensions,
          length: mapped.length,
          width: mapped.width,
          units: mapped.units,
          features: mapped.features,
          sortOrder: mapped.sortOrder,
        },
        update: {
          listingId,
          roomType: mapped.roomType,
          roomLevel: mapped.roomLevel,
          dimensions: mapped.dimensions,
          length: mapped.length,
          width: mapped.width,
          units: mapped.units,
          features: mapped.features,
          sortOrder: mapped.sortOrder,
        },
      });
      stats.roomsUpserted += 1;
    } catch (err) {
      stats.errors.push(
        `room ${listingKey}: ${err instanceof Error ? err.message : "failed"}`,
      );
    }
  }
}

async function syncRoomsBackfill(options: {
  maxListings: number;
  stats: MlsSyncStats;
  concurrency?: number;
}): Promise<void> {
  const listings = await prisma.listing.findMany({
    where: {
      dataSource: "mls",
      isMock: false,
      listingKey: { not: null },
      rooms: { none: {} },
    },
    select: { id: true, listingKey: true, mlsNumber: true },
    take: options.maxListings,
    orderBy: { updatedAt: "desc" },
  });

  const concurrency = Math.max(1, Math.min(options.concurrency ?? 6, 12));
  let index = 0;

  async function worker() {
    while (index < listings.length) {
      const current = listings[index]!;
      index += 1;
      if (!current.listingKey) continue;
      try {
        await syncRoomsForListing(
          current.listingKey,
          current.id,
          options.stats,
        );
      } catch (err) {
        options.stats.errors.push(
          `rooms backfill ${current.mlsNumber}: ${err instanceof Error ? err.message : "failed"}`,
        );
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, listings.length || 1) }, () =>
      worker(),
    ),
  );
}

/**
 * Replace Property-derived history rows for a listing.
 * Leaves HistoryTransactional rows (non-synthetic notes) intact.
 */
export async function upsertSyntheticHistoryFromProperty(
  listingId: string,
  row: PropTxProperty,
  stats?: Pick<MlsSyncStats, "historyUpserted" | "errors">,
): Promise<number> {
  const events = mapSyntheticHistoryFromProperty(row);
  await prisma.listingHistory.deleteMany({
    where: {
      listingId,
      note: { startsWith: SYNTHETIC_HISTORY_NOTE_PREFIX },
    },
  });

  let count = 0;
  for (const event of events) {
    try {
      await prisma.listingHistory.create({
        data: {
          listingId,
          event: event.event,
          price: event.price,
          originalPrice: event.originalPrice,
          contractDate: event.contractDate,
          lastUpdatedAt: event.lastUpdatedAt,
          visibility: event.visibility,
          note: event.note,
        },
      });
      count += 1;
      if (stats) stats.historyUpserted += 1;
    } catch (err) {
      stats?.errors.push(
        `synthetic history: ${err instanceof Error ? err.message : "failed"}`,
      );
    }
  }

  // Marker so backfill won't re-fetch listings with no deriveable events.
  if (events.length === 0) {
    const listedAt =
      typeof row.ListingContractDate === "string"
        ? new Date(row.ListingContractDate)
        : new Date();
    const contractDate = Number.isNaN(listedAt.getTime()) ? new Date() : listedAt;
    await prisma.listingHistory.create({
      data: {
        listingId,
        event: "Synced",
        price: null,
        originalPrice: null,
        contractDate,
        lastUpdatedAt: new Date(),
        visibility: "public",
        note: `${SYNTHETIC_HISTORY_NOTE_PREFIX}empty`,
      },
    });
  }

  return count;
}

async function syncSyntheticHistoryBackfill(options: {
  maxListings: number;
  stats: MlsSyncStats;
  concurrency?: number;
}): Promise<void> {
  const listings = await prisma.listing.findMany({
    where: {
      dataSource: "mls",
      isMock: false,
      listingKey: { not: null },
      NOT: {
        history: {
          some: { note: { startsWith: SYNTHETIC_HISTORY_NOTE_PREFIX } },
        },
      },
    },
    select: { id: true, listingKey: true, mlsNumber: true },
    take: options.maxListings,
    orderBy: { updatedAt: "desc" },
  });

  const concurrency = Math.max(1, Math.min(options.concurrency ?? 6, 10));
  let index = 0;

  async function worker() {
    while (index < listings.length) {
      const current = listings[index]!;
      index += 1;
      if (!current.listingKey) continue;
      try {
        const row = await proptxJson<PropTxProperty>(
          `Property('${encodeURIComponent(current.listingKey)}')`,
        );
        await upsertSyntheticHistoryFromProperty(
          current.id,
          row,
          options.stats,
        );
      } catch (err) {
        options.stats.errors.push(
          `synthetic history ${current.mlsNumber}: ${err instanceof Error ? err.message : "failed"}`,
        );
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, listings.length || 1) }, () =>
      worker(),
    ),
  );
}

async function syncHistoryForListing(
  listingKey: string,
  listingId: string,
  stats: MlsSyncStats,
): Promise<void> {
  const keyLit = odataStringLiteral(listingKey);
  const filter = `ListingKey eq ${keyLit}`;
  const path = `HistoryTransactional?$filter=${encodeURIComponent(filter)}&$orderby=${encodeURIComponent("ModificationTimestamp")}&$top=100`;
  for await (const page of proptxPages<PropTxProperty>(path, {
    maxPages: 3,
  })) {
    for (const row of page) {
      const mapped = mapHistoryRow(row);
      if (!mapped) continue;
      try {
        const existing = await prisma.listingHistory.findFirst({
          where: {
            listingId,
            event: mapped.event,
            contractDate: mapped.contractDate,
            price: mapped.price,
          },
        });
        if (existing) {
          await prisma.listingHistory.update({
            where: { id: existing.id },
            data: {
              originalPrice: mapped.originalPrice,
              lastUpdatedAt: mapped.lastUpdatedAt,
              externalMls: mapped.externalMls,
              visibility: mapped.visibility,
              note: mapped.note,
            },
          });
        } else {
          await prisma.listingHistory.create({
            data: {
              listingId,
              event: mapped.event,
              price: mapped.price,
              originalPrice: mapped.originalPrice,
              contractDate: mapped.contractDate,
              lastUpdatedAt: mapped.lastUpdatedAt,
              externalMls: mapped.externalMls,
              visibility: mapped.visibility,
              note: mapped.note,
            },
          });
        }
        stats.historyUpserted += 1;
      } catch (err) {
        stats.errors.push(
          `history ${listingKey}: ${err instanceof Error ? err.message : "failed"}`,
        );
      }
    }
  }
}

async function syncHistoryBackfill(options: {
  maxListings: number;
  stats: MlsSyncStats;
  concurrency?: number;
}): Promise<void> {
  const listings = await prisma.listing.findMany({
    where: {
      dataSource: "mls",
      isMock: false,
      listingKey: { not: null },
      history: { none: {} },
    },
    select: { id: true, listingKey: true, mlsNumber: true },
    take: options.maxListings,
    orderBy: { updatedAt: "desc" },
  });

  const concurrency = Math.max(1, Math.min(options.concurrency ?? 4, 8));
  let index = 0;

  async function worker() {
    while (index < listings.length) {
      const current = listings[index]!;
      index += 1;
      if (!current.listingKey) continue;
      try {
        await syncHistoryForListing(
          current.listingKey,
          current.id,
          options.stats,
        );
      } catch (err) {
        options.stats.errors.push(
          `history backfill ${current.mlsNumber}: ${err instanceof Error ? err.message : "failed"}`,
        );
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, listings.length || 1) }, () =>
      worker(),
    ),
  );
}

/**
 * Attach up to NEON_LISTING_MEDIA_CAP photos. Full gallery stays a live detail read.
 * Empty and failed fetches do not write Media and do not count as complete.
 */
async function syncMediaForListing(
  listingKey: string,
  listingId: string,
  stats: MlsSyncStats,
  options?: { maxPhotos?: number },
): Promise<MediaSyncOutcome> {
  const maxPhotos = Math.max(
    1,
    Math.min(options?.maxPhotos ?? NEON_LISTING_MEDIA_CAP, NEON_LISTING_MEDIA_CAP),
  );
  stats.mediaFetches += 1;
  let rows: Awaited<ReturnType<typeof fetchPropertyPhotos>>;
  try {
    rows = await fetchPropertyPhotos(listingKey);
  } catch (err) {
    pushSyncError(
      stats,
      `media ${listingKey}: ${err instanceof Error ? err.message : "failed"}`,
    );
    if (isNeonSizeLimitError(err)) throw err;
    return "error";
  }
  const selected = preferListingPhotos(rows, maxPhotos);
  if (selected.length === 0) return "empty";

  const existing = await prisma.listingMedia.findMany({
    where: { listingId },
    select: { url: true, sortOrder: true, isPrimary: true },
  });
  const plan = reconcileCappedMedia(existing, selected);

  try {
    for (const photo of plan.upserts) {
      await upsertMappedMedia(listingId, photo, stats);
    }
    if (plan.deleteUrls.length > 0) {
      await prisma.listingMedia.deleteMany({
        where: {
          listingId,
          url: { in: plan.deleteUrls },
        },
      });
    }
  } catch (err) {
    pushSyncError(
      stats,
      `media ${listingKey}: ${err instanceof Error ? err.message : "failed"}`,
    );
    if (isNeonSizeLimitError(err)) throw err;
    return "error";
  }
  return "complete";
}

async function commitMediaSyncStamp(
  listingId: string,
  outcome: MediaSyncOutcome,
  previous: {
    mediaSourceTimestamp: Date | null;
    mediaSyncedAt: Date | null;
  },
  sourceStamp: Date,
): Promise<void> {
  const completedAt = new Date();
  const next = mediaStampAfterOutcome(outcome, previous, {
    mediaSourceTimestamp: sourceStamp,
    mediaSyncedAt: completedAt,
  });
  if (outcome !== "complete") return;
  await prisma.listing.update({
    where: { id: listingId },
    data: {
      mediaSourceTimestamp: next.mediaSourceTimestamp,
      mediaSyncedAt: next.mediaSyncedAt,
    },
  });
}

/** Drop Neon media beyond the SSR cap without calling PropTx. */
async function pruneListingMediaToCap(listingId: string): Promise<void> {
  const media = await prisma.listingMedia.findMany({
    where: { listingId },
    select: { id: true, isPrimary: true, sortOrder: true },
  });
  if (media.length <= NEON_LISTING_MEDIA_CAP) return;

  const keepIds = media
    .slice()
    .sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.sortOrder - b.sortOrder;
    })
    .slice(0, NEON_LISTING_MEDIA_CAP)
    .map((row) => row.id);

  await prisma.listingMedia.deleteMany({
    where: { listingId, id: { notIn: keepIds } },
  });
}

function isNeonSizeLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /project size limit/i.test(msg) ||
    /could not extend file/i.test(msg) ||
    /53100/.test(msg)
  );
}

function pushSyncError(stats: MlsSyncStats, message: string) {
  if (stats.errors.length >= 40) return;
  stats.errors.push(message);
}

async function pushListingToTypesense(
  listingId: string,
  stats: MlsSyncStats,
): Promise<void> {
  const result = await syncListingToTypesense(listingId);
  if (result.ok) {
    stats.typesenseAttempted += 1;
    stats.typesenseUpserted += 1;
    return;
  }
  switch (result.reason) {
    case "disabled":
      stats.typesenseDisabled += 1;
      return;
    case "missing_provenance":
    case "sak_mismatch":
      stats.typesenseAttempted += 1;
      stats.typesenseMissingProvenance += 1;
      return;
    case "error":
      stats.typesenseAttempted += 1;
      stats.typesenseFailed += 1;
      return;
    case "not_found":
    case "mock":
      return;
    default: {
      const _never: never = result.reason;
      void _never;
      stats.typesenseAttempted += 1;
      stats.typesenseFailed += 1;
    }
  }
}

function recordProvenanceSkip(
  options: {
    stats: MlsSyncStats;
    skipReasons: Record<string, number>;
  },
  err: PropTxProvenanceError,
  mlsNumber: string,
): void {
  options.stats.propertySkipped += 1;
  const reason = `provenance:${err.code}`;
  options.skipReasons[reason] = (options.skipReasons[reason] ?? 0) + 1;
  logPropTxProvenanceConflict(err);
  pushSyncError(options.stats, `provenance ${mlsNumber}: ${err.code}`);
}

function fastComparableFromListing(row: {
  status: string;
  listPrice: number;
  soldPrice: number | null;
  soldAt: Date | null;
  updatedAtMls: Date | null;
  transactionType: string;
  segment: string;
  propertyType: string;
  beds: number;
  baths: number;
  sqft: number | null;
  parkingSpaces: number;
  yearBuilt: number | null;
  taxes: number | null;
  maintenanceFee: number | null;
  addressLine: string;
  unitNumber: string | null;
  city: string;
  community: string | null;
  postalCode: string | null;
  province: string;
  description: string | null;
  brokerageName: string | null;
  listedAt: Date | null;
  listingKey: string | null;
}): FastListingComparable {
  return {
    status: row.status,
    listPrice: row.listPrice,
    soldPrice: row.soldPrice,
    soldAt: row.soldAt,
    updatedAtMls: row.updatedAtMls,
    transactionType: row.transactionType,
    segment: row.segment,
    propertyType: row.propertyType,
    beds: row.beds,
    baths: row.baths,
    sqft: row.sqft,
    parkingSpaces: row.parkingSpaces,
    yearBuilt: row.yearBuilt,
    taxes: row.taxes,
    maintenanceFee: row.maintenanceFee,
    addressLine: row.addressLine,
    unitNumber: row.unitNumber,
    city: row.city,
    community: row.community,
    postalCode: row.postalCode,
    province: row.province,
    description: stripApproxPinNote(row.description ?? ""),
    brokerageName: row.brokerageName ?? "",
    listedAt: row.listedAt,
    listingKey: row.listingKey,
  };
}

function stampDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function stampNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function fastIncomingFromMapped(
  data: {
    status?: unknown;
    listPrice?: unknown;
    soldPrice?: unknown;
    soldAt?: unknown;
    updatedAtMls?: unknown;
    transactionType?: unknown;
    segment?: unknown;
    propertyType?: unknown;
    beds?: unknown;
    baths?: unknown;
    sqft?: unknown;
    parkingSpaces?: unknown;
    yearBuilt?: unknown;
    taxes?: unknown;
    maintenanceFee?: unknown;
    addressLine?: unknown;
    unitNumber?: unknown;
    city?: unknown;
    community?: unknown;
    postalCode?: unknown;
    province?: unknown;
    description?: unknown;
    brokerageName?: unknown;
    listedAt?: unknown;
  },
  row: PropTxProperty,
  durableListingKey: string,
): FastIncomingProperty {
  return {
    status: String(data.status ?? ""),
    listPrice: stampNumber(data.listPrice) ?? 0,
    soldPrice: stampNumber(data.soldPrice),
    soldAt: stampDate(data.soldAt),
    updatedAtMls: stampDate(data.updatedAtMls),
    transactionType: String(data.transactionType ?? ""),
    segment: String(data.segment ?? ""),
    propertyType: String(data.propertyType ?? ""),
    beds: stampNumber(data.beds) ?? 0,
    baths: stampNumber(data.baths) ?? 0,
    sqft: stampNumber(data.sqft),
    parkingSpaces: stampNumber(data.parkingSpaces) ?? 0,
    yearBuilt: stampNumber(data.yearBuilt),
    taxes: stampNumber(data.taxes),
    maintenanceFee: stampNumber(data.maintenanceFee),
    addressLine: String(data.addressLine ?? ""),
    unitNumber: data.unitNumber == null ? null : String(data.unitNumber),
    city: String(data.city ?? ""),
    community: data.community == null ? null : String(data.community),
    postalCode: data.postalCode == null ? null : String(data.postalCode),
    province: String(data.province ?? ""),
    description: stripApproxPinNote(String(data.description ?? "")),
    brokerageName: String(data.brokerageName ?? ""),
    listedAt: stampDate(data.listedAt),
    listingKey: durableListingKey,
    ...readMlsTimestamps(row),
  };
}

async function upsertPropertyRow(
  row: PropTxProperty,
  options: {
    stats: MlsSyncStats;
    skipReasons: Record<string, number>;
    /** When false, skip geocode + per-listing media/rooms (much faster). */
    fetchNested: boolean;
    /** Explicit user lookup — do not apply MLS sync city allowlist. */
    skipCityAllowlist?: boolean;
    /** Bulk backfill: upsert listing row + Typesense without PropTx media pulls. */
    skipMedia?: boolean;
    /** Fast sync: skip inline street-geocode drain (slow job / mls:geocode). */
    skipGeocode?: boolean;
    /**
     * Fast Sync only. Skip Listing/Typesense/Media when the Property is unchanged.
     * Full sync and on-demand upserts leave this unset.
     */
    fastUnchangedSkip?: boolean;
    /** Feed-bound TRREB/PropTx provenance (resolved once per invocation). */
    provenance: PropTxListingProvenance;
  },
): Promise<Date | null> {
  const mapped = mapPropertyToListingResult(row);
  if (!mapped.ok) {
    options.stats.propertySkipped += 1;
    const key = mapped.reason.startsWith("missing mls")
      ? "missing mls"
      : mapped.reason.slice(0, 80);
    options.skipReasons[key] = (options.skipReasons[key] ?? 0) + 1;
    if (
      options.stats.errors.length < 8 &&
      mapped.reason.startsWith("missing mls")
    ) {
      options.stats.errors.push(mapped.reason);
    }
    return null;
  }

  let durableListingKey: string;
  try {
    durableListingKey = assertDurablePropTxListingKey(
      typeof mapped.data.listingKey === "string"
        ? mapped.data.listingKey
        : null,
      { mlsNumber: String(mapped.data.mlsNumber) },
    );
  } catch (err) {
    if (err instanceof PropTxProvenanceError) {
      recordProvenanceSkip(options, err, String(mapped.data.mlsNumber));
      return null;
    }
    throw err;
  }

  if (!options.skipCityAllowlist) {
    const allowlist = getMlsSyncCities();
    const cityName = String(mapped.data.city ?? "");
    if (!cityAllowedForMlsSync(cityName, allowlist)) {
      options.stats.propertySkipped += 1;
      options.skipReasons["city filter"] =
        (options.skipReasons["city filter"] ?? 0) + 1;
      return null;
    }
  }

  let data = {
    ...mapped.data,
    listingKey: durableListingKey,
  };
  let approximateCoords = mapped.approximateCoords;

  // Feed often omits lat/lng → city centroids. Preserve a prior street pin;
  // otherwise street-geocode (new + approximate updates) within a per-run budget.
  // Remaining backlog is drained by `pnpm mls:geocode` / the geocode cron.
  if (approximateCoords) {
    const existing = await prisma.listing.findUnique({
      where: { mlsNumber: String(data.mlsNumber) },
      select: { lat: true, lng: true, description: true },
    });

    const existingWasApprox =
      existing != null &&
      typeof existing.description === "string" &&
      /Map pin approximate|coordinates missing from feed/i.test(
        existing.description,
      );
    const existingIsStreet =
      existing != null &&
      !existingWasApprox &&
      !isKnownCityCentroid(existing.lat, existing.lng);

    if (existingIsStreet && existing) {
      data = {
        ...data,
        lat: existing.lat,
        lng: existing.lng,
        description: stripApproxPinNote(String(data.description ?? "")),
      };
      approximateCoords = false;
    } else {
      const underBudget =
        options.skipGeocode !== true &&
        options.stats.geocodeAttempted < SYNC_GEOCODE_BUDGET;
      if (underBudget) {
        options.stats.geocodeAttempted += 1;
        try {
          const geo = await geocodeListing({
            addressLine: String(data.addressLine),
            unitNumber:
              typeof data.unitNumber === "string" ? data.unitNumber : null,
            city: String(data.city),
            community:
              typeof data.community === "string" ? data.community : null,
            province: typeof data.province === "string" ? data.province : "ON",
            postalCode:
              typeof data.postalCode === "string" ? data.postalCode : null,
          });
          if (geo && geo.precision === "street") {
            data = {
              ...data,
              lat: geo.lat,
              lng: geo.lng,
              description: stripApproxPinNote(String(data.description ?? "")),
            };
            approximateCoords = false;
            options.stats.geocodeFixed += 1;
          }
        } catch (err) {
          pushSyncError(
            options.stats,
            `geocode ${data.mlsNumber}: ${err instanceof Error ? err.message : "failed"}`,
          );
        }
      }

      if (approximateCoords) {
        data = {
          ...data,
          lat: existing?.lat ?? data.lat,
          lng: existing?.lng ?? data.lng,
          description: stripApproxPinNote(String(data.description ?? "")),
        };
      }
    }
  }

  try {
    const existingListing = await prisma.listing.findUnique({
      where: { mlsNumber: String(data.mlsNumber) },
      select: {
        id: true,
        listingKey: true,
        organizationId: true,
        providerKey: true,
        mlsNumber: true,
        status: true,
        listPrice: true,
        soldPrice: true,
        soldAt: true,
        updatedAtMls: true,
        transactionType: true,
        segment: true,
        propertyType: true,
        beds: true,
        baths: true,
        sqft: true,
        parkingSpaces: true,
        yearBuilt: true,
        taxes: true,
        maintenanceFee: true,
        addressLine: true,
        unitNumber: true,
        city: true,
        community: true,
        postalCode: true,
        province: true,
        description: true,
        brokerageName: true,
        listedAt: true,
        mediaSourceTimestamp: true,
        mediaSyncedAt: true,
        photosChangeTimestamp: true,
      },
    });

    if (existingListing) {
      try {
        assertListingMirrorsCompatible(
          options.provenance,
          {
            organizationId: existingListing.organizationId,
            providerKey: existingListing.providerKey,
          },
          {
            listingId: existingListing.id,
            mlsNumber: existingListing.mlsNumber,
          },
        );
      } catch (err) {
        if (err instanceof PropTxProvenanceError) {
          recordProvenanceSkip(options, err, String(data.mlsNumber));
          return null;
        }
        throw err;
      }

      const existingSources = await prisma.listingSource.findMany({
        where: {
          listingId: existingListing.id,
          providerKey: options.provenance.providerKey,
        },
        select: { id: true, providerListingKey: true },
      });
      for (const source of existingSources) {
        if (source.providerListingKey !== durableListingKey) {
          recordProvenanceSkip(
            options,
            new PropTxProvenanceError(
              "listing_key_identity_conflict",
              "Existing PropTx ListingSource providerListingKey differs from incoming ListingKey",
              {
                listingId: existingListing.id,
                mlsNumber: String(data.mlsNumber),
                existingProviderListingKey: source.providerListingKey,
                incomingProviderListingKey: durableListingKey,
              },
            ),
            String(data.mlsNumber),
          );
          return null;
        }
      }
    }

    let allowMediaFetch = true;
    if (options.fastUnchangedSkip) {
      options.stats.propertyInspected += 1;
      const decision = evaluateFastListingChange(
        existingListing ? fastComparableFromListing(existingListing) : null,
        fastIncomingFromMapped(data, row, durableListingKey),
      );
      if (!decision.write) {
        // FAST_UNCHANGED_SKIP — no Listing write, synthetic history, Typesense, or Media.
        options.stats.propertyUnchangedSkipped += 1;
        return null;
      }
      if (decision.isNew) options.stats.propertyNew += 1;
      if (decision.flags.statusChanged) options.stats.propertyStatusChanged += 1;
      if (decision.flags.priceChanged) options.stats.propertyPriceChanged += 1;
      if (decision.flags.soldChanged) options.stats.propertySoldChanged += 1;
      if (decision.flags.photoChanged) options.stats.propertyPhotoChanged += 1;
      allowMediaFetch = decision.fetchMedia;
    }
    // Fast fetchMedia is recorded above. The Media call itself follows
    // shouldFetchListingMedia so a price change, a missing photo timestamp,
    // or a count under 5 cannot refetch a completed stamp.
    void allowMediaFetch;

    const observedStamps = readMlsTimestamps(row);

    // Mirrors on create only — never overwrite conflicting mirrors via update.
    // Use unchecked create so organizationId/providerKey scalars are writable.
    const listing = await prisma.listing.upsert({
      where: { mlsNumber: data.mlsNumber },
      create: {
        ...(data as Prisma.ListingUncheckedCreateInput),
        listingKey: durableListingKey,
        organizationId: options.provenance.organizationId,
        providerKey: options.provenance.providerKey,
        dataSource: "mls",
        isMock: false,
        ...(observedStamps.photosChangeTimestamp
          ? { photosChangeTimestamp: observedStamps.photosChangeTimestamp }
          : {}),
      },
      update: {
        listingKey: durableListingKey,
        status: data.status,
        segment: data.segment,
        transactionType: data.transactionType,
        dataSource: "mls",
        propertyType: data.propertyType,
        listPrice: data.listPrice,
        beds: data.beds,
        baths: data.baths,
        sqft: data.sqft ?? null,
        parkingSpaces: data.parkingSpaces,
        yearBuilt: data.yearBuilt,
        taxes: data.taxes,
        maintenanceFee: data.maintenanceFee,
        addressLine: data.addressLine,
        unitNumber: data.unitNumber,
        city: data.city,
        community: data.community,
        postalCode: data.postalCode,
        province: data.province,
        lat: data.lat,
        lng: data.lng,
        description: data.description,
        brokerageName: data.brokerageName,
        facts: data.facts,
        listedAt: data.listedAt,
        // Never wipe firm sold timing with an incomplete IDX/partial payload.
        ...(data.status === "SOLD" || data.status === "LEASED"
          ? {
              ...(data.soldAt ? { soldAt: data.soldAt } : {}),
              ...(data.soldPrice != null ? { soldPrice: data.soldPrice } : {}),
            }
          : { soldAt: null, soldPrice: null }),
        updatedAtMls: data.updatedAtMls,
        daysOnMarket: data.daysOnMarket,
        isMock: false,
        ...(observedStamps.photosChangeTimestamp
          ? { photosChangeTimestamp: observedStamps.photosChangeTimestamp }
          : {}),
      },
    });

    const listingAfter = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
      select: {
        id: true,
        mlsNumber: true,
        organizationId: true,
        providerKey: true,
      },
    });

    try {
      await ensurePropTxListingProvenance(
        createPrismaPropTxProvenanceStore(prisma),
        options.provenance,
        {
          listingId: listingAfter.id,
          listingKey: durableListingKey,
          mlsNumber: listingAfter.mlsNumber,
          organizationId: listingAfter.organizationId,
          providerKey: listingAfter.providerKey,
        },
      );
    } catch (err) {
      if (err instanceof PropTxProvenanceError) {
        recordProvenanceSkip(options, err, String(data.mlsNumber));
        return null;
      }
      throw err;
    }

    options.stats.propertyUpserted += 1;

    try {
      await upsertSyntheticHistoryFromProperty(
        listing.id,
        row,
        options.stats,
      );
    } catch (err) {
      options.stats.errors.push(
        `synthetic history ${data.mlsNumber}: ${err instanceof Error ? err.message : "failed"}`,
      );
    }

    // Keep up to NEON_LISTING_MEDIA_CAP photos for SSR galleries.
    // Remaining photos load live on the listing detail page and are not stored.
    if (!options.skipMedia && data.listingKey) {
      const mediaCount = await prisma.listingMedia.count({
        where: { listingId: listing.id },
      });
      const listedAt =
        data.listedAt instanceof Date
          ? data.listedAt
          : data.listedAt
            ? new Date(data.listedAt)
            : listing.listedAt;
      const mediaDecision = shouldFetchListingMedia({
        mediaCount,
        mediaSourceTimestamp: existingListing?.mediaSourceTimestamp ?? null,
        mediaSyncedAt: existingListing?.mediaSyncedAt ?? null,
        listedAt,
        photosChangeTimestamp: observedStamps.photosChangeTimestamp,
        now: new Date(),
      });
      if (mediaDecision.fetch) {
        try {
          const outcome = await syncMediaForListing(
            data.listingKey,
            listing.id,
            options.stats,
            { maxPhotos: NEON_LISTING_MEDIA_CAP },
          );
          const fallback =
            data.updatedAtMls instanceof Date
              ? data.updatedAtMls
              : new Date(data.updatedAtMls);
          await commitMediaSyncStamp(
            listing.id,
            outcome,
            {
              mediaSourceTimestamp: existingListing?.mediaSourceTimestamp ?? null,
              mediaSyncedAt: existingListing?.mediaSyncedAt ?? null,
            },
            completionMediaSourceStamp({
              photosChangeTimestamp: observedStamps.photosChangeTimestamp,
              modificationTimestamp: observedStamps.modificationTimestamp,
              fallback: Number.isNaN(fallback.getTime()) ? listedAt : fallback,
            }),
          );
        } catch (err) {
          options.stats.errors.push(
            `media ${data.mlsNumber}: ${err instanceof Error ? err.message : "failed"}`,
          );
          if (isNeonSizeLimitError(err)) throw err;
        }
      } else if (mediaCount > NEON_LISTING_MEDIA_CAP) {
        try {
          await pruneListingMediaToCap(listing.id);
        } catch (err) {
          options.stats.errors.push(
            `media prune ${data.mlsNumber}: ${err instanceof Error ? err.message : "failed"}`,
          );
          if (isNeonSizeLimitError(err)) throw err;
        }
      }
    }

    if (options.fetchNested && data.listingKey) {
      const roomCount = await prisma.listingRoom.count({
        where: { listingId: listing.id },
      });
      if (roomCount === 0) {
        try {
          await syncRoomsForListing(
            data.listingKey,
            listing.id,
            options.stats,
          );
        } catch (err) {
          options.stats.errors.push(
            `rooms ${data.mlsNumber}: ${err instanceof Error ? err.message : "failed"}`,
          );
        }
      }
    }

    // Keep search index fresh (tracked; a zero-write run is marked degraded).
    await pushListingToTypesense(listing.id, options.stats);

    const updatedAtMls =
      data.updatedAtMls instanceof Date
        ? data.updatedAtMls
        : data.updatedAtMls
          ? new Date(data.updatedAtMls)
          : null;
    if (updatedAtMls && !Number.isNaN(updatedAtMls.getTime())) {
      return updatedAtMls;
    }
  } catch (err) {
    options.stats.propertySkipped += 1;
    options.stats.errors.push(
      `property ${data.mlsNumber}: ${err instanceof Error ? err.message : "upsert failed"}`,
    );
  }
  return null;
}

/**
 * Request-path upsert for on-demand PropTx lookups (MLS / address / street).
 * Skips city allowlist; fetches cover photo only (no geocode / rooms).
 */
export async function upsertPropTxPropertiesOnDemand(
  rows: PropTxProperty[],
  options?: { concurrency?: number; skipMedia?: boolean },
): Promise<string[]> {
  assertMlsSyncExecutionHost();
  if (rows.length === 0) return [];

  const stats = emptyStats();
  const skipReasons: Record<string, number> = {};
  const mlsNumbers: string[] = [];
  const concurrency = Math.max(1, Math.min(options?.concurrency ?? 3, 6));
  const skipMedia = options?.skipMedia === true;
  let index = 0;

  let provenance: PropTxListingProvenance;
  try {
    provenance = await createPropTxProvenanceSession(
      createPrismaPropTxProvenanceStore(prisma),
    ).get();
  } catch (err) {
    if (err instanceof PropTxProvenanceError) {
      logPropTxProvenanceConflict(err);
      throw err;
    }
    throw err;
  }

  async function worker() {
    while (index < rows.length) {
      const row = rows[index]!;
      index += 1;
      const mls = mapMlsNumber(row);
      await upsertPropertyRow(row, {
        stats,
        skipReasons,
        fetchNested: false,
        skipCityAllowlist: true,
        skipMedia,
        provenance,
      });
      if (!mls) continue;

      const listing = await prisma.listing.findFirst({
        where: { mlsNumber: mls },
        select: { id: true, listingKey: true },
      });
      if (!listing) continue;
      mlsNumbers.push(mls);

      // Media is decided once inside upsertPropertyRow. A second count < 5
      // fetch here ignored the completion stamp.
      await pushListingToTypesense(listing.id, stats);

      try {
        await upsertSyntheticHistoryFromProperty(listing.id, row, stats);
      } catch {
        // History is best-effort
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, rows.length) }, () => worker()),
  );

  return [...new Set(mlsNumbers)];
}

/**
 * Pull brand-new listings by list date (not ModificationTimestamp).
 * Photo/price churn can bury just-listed homes in the "recent mods" stream;
 * this pass keeps the website's "new on market" rails current while backlog fills.
 */
async function syncJustListedProperties(options: {
  days: number;
  maxPages: number;
  stats: MlsSyncStats;
  config?: PropTxConfig | null;
  skipGeocode?: boolean;
  fastUnchangedSkip?: boolean;
}): Promise<void> {
  const provenance = await createPropTxProvenanceSession(
    createPrismaPropTxProvenanceStore(prisma),
  ).get();

  const from = new Date();
  from.setUTCDate(from.getUTCDate() - options.days);
  const fromDate = from.toISOString().slice(0, 10);
  const fromTs = toODataDate(from);

  // Prefer entry timestamp (has clock). ListingContractDate succeeds board-wide
  // but is date-only — using it first buried true "just listed" ordering.
  const attempts: Array<{ label: string; filter: string; orderby: string }> = [
    {
      label: "OriginalEntryTimestamp",
      filter: `${onMarketStatusFilter()} and OriginalEntryTimestamp ge ${fromTs}`,
      orderby: "OriginalEntryTimestamp desc,ListingKey desc",
    },
    {
      label: "ListingContractDate",
      filter: `${onMarketStatusFilter()} and ListingContractDate ge ${fromDate}`,
      orderby: "ListingContractDate desc,ListingKey desc",
    },
    {
      label: "OnMarketDate",
      filter: `${onMarketStatusFilter()} and OnMarketDate ge ${fromDate}`,
      orderby: "OnMarketDate desc,ListingKey desc",
    },
  ];

  for (const attempt of attempts) {
    const path = `Property?$filter=${encodeURIComponent(attempt.filter)}&$orderby=${encodeURIComponent(attempt.orderby)}&$top=100`;
    console.log(
      `[mls] Just-listed pass via ${attempt.label} (last ${options.days}d, maxPages=${options.maxPages}, feed=${options.config?.feed ?? "default"})`,
    );
    const skipReasons: Record<string, number> = {};
    let pageNo = 0;
    try {
      for await (const page of proptxPages<PropTxProperty>(path, {
        maxPages: options.maxPages,
        config: options.config,
      })) {
        pageNo += 1;
        options.stats.pages += 1;
        console.log(
          `[mls] Just-listed page ${pageNo}/${options.maxPages} (+${page.length} rows, upserted=${options.stats.propertyUpserted}, skipped=${options.stats.propertySkipped})`,
        );
        for (const row of page) {
          await upsertPropertyRow(row, {
            stats: options.stats,
            skipReasons,
            fetchNested: false,
            skipGeocode: options.skipGeocode,
            fastUnchangedSkip: options.fastUnchangedSkip,
            provenance,
          });
        }
      }
      options.stats.skipReasons = {
        ...(options.stats.skipReasons ?? {}),
        ...Object.fromEntries(
          Object.entries(skipReasons).map(([k, v]) => [
            `justListed:${attempt.label}:${k}`,
            v,
          ]),
        ),
      };
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[mls] Just-listed via ${attempt.label} failed, trying next: ${msg}`,
      );
      pushSyncError(
        options.stats,
        `Just-listed ${attempt.label}: ${msg.slice(0, 160)}`,
      );
    }
  }
}

/**
 * Pull newest MLS changes first (just-listed / recent mods).
 * Does not advance the Property cursor — backlog catch-up stays ascending.
 */
async function syncRecentProperties(options: {
  days: number;
  maxPages: number;
  stats: MlsSyncStats;
  config?: PropTxConfig | null;
  skipGeocode?: boolean;
  fastUnchangedSkip?: boolean;
}): Promise<void> {
  const provenance = await createPropTxProvenanceSession(
    createPrismaPropTxProvenanceStore(prisma),
  ).get();

  const from = new Date();
  from.setUTCDate(from.getUTCDate() - options.days);
  const filter = `ModificationTimestamp ge ${toODataDate(from)}`;
  const path = `Property?$filter=${encodeURIComponent(filter)}&$orderby=${encodeURIComponent("ModificationTimestamp desc,ListingKey desc")}&$top=100`;
  console.log(
    `[mls] Recent Property pass (last ${options.days}d, maxPages=${options.maxPages}, newest-first, feed=${options.config?.feed ?? "default"})`,
  );

  const skipReasons: Record<string, number> = {};
  let pageNo = 0;
  for await (const page of proptxPages<PropTxProperty>(path, {
    maxPages: options.maxPages,
    config: options.config,
  })) {
    pageNo += 1;
    options.stats.pages += 1;
    console.log(
      `[mls] Recent page ${pageNo}/${options.maxPages} (+${page.length} rows, upserted=${options.stats.propertyUpserted}, skipped=${options.stats.propertySkipped})`,
    );
    for (const row of page) {
      await upsertPropertyRow(row, {
        stats: options.stats,
        skipReasons,
        fetchNested: false,
        skipGeocode: options.skipGeocode,
        fastUnchangedSkip: options.fastUnchangedSkip,
        provenance,
      });
    }
  }
  options.stats.skipReasons = {
    ...(options.stats.skipReasons ?? {}),
    ...Object.fromEntries(
      Object.entries(skipReasons).map(([k, v]) => [`recent:${k}`, v]),
    ),
  };
}

/**
 * Fill active inventory city-by-city (ModificationTimestamp sync alone never
 * walks the full active book). One City eq filter at a time — giant OR lists hang AMPRE.
 */
async function syncActiveInventory(options: {
  maxPages: number;
  stats: MlsSyncStats;
  config?: PropTxConfig | null;
}): Promise<void> {
  const provenance = await createPropTxProvenanceSession(
    createPrismaPropTxProvenanceStore(prisma),
  ).get();

  const cities = getMlsSyncCities();
  // Heavier markets first so a page budget still covers core GTA.
  const priority = new Map(
    [
      "Toronto",
      "Mississauga",
      "Brampton",
      "Vaughan",
      "Markham",
      "Oakville",
      "Hamilton",
      "London",
      "Burlington",
      "Richmond Hill",
    ].map((c, i) => [normalizeCityName(c), i]),
  );
  const ordered = [...cities].sort((a, b) => {
    const pa = priority.get(normalizeCityName(a)) ?? 100;
    const pb = priority.get(normalizeCityName(b)) ?? 100;
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b);
  });

  let pagesLeft = options.maxPages;
  console.log(
    `[mls] Active inventory pass (${ordered.length} cities, maxPages=${options.maxPages})`,
  );

  for (const city of ordered) {
    if (pagesLeft <= 0) break;

    const cityBudget = Math.min(
      pagesLeft,
      normalizeCityName(city) === "toronto" ? 30 : 8,
    );
    // StandardStatus is RESO; MlsStatus 'A' is common on older TRREB feeds.
    // Toronto districts are often "Toronto C01" — use startswith for that city.
    const cityClause =
      normalizeCityName(city) === "toronto"
        ? "startswith(City,'Toronto')"
        : `City eq ${odataStringLiteral(city)}`;
    const filter = `${onMarketStatusFilter()} and ${cityClause}`;
    const path = `Property?$filter=${encodeURIComponent(filter)}&$orderby=${encodeURIComponent("ListingKey")}&$top=100`;
    const skipReasons: Record<string, number> = {};
    let pageNo = 0;

    try {
      for await (const page of proptxPages<PropTxProperty>(path, {
        maxPages: cityBudget,
        config: options.config,
      })) {
        pageNo += 1;
        pagesLeft -= 1;
        options.stats.pages += 1;
        console.log(
          `[mls] Active ${city} page ${pageNo}/${cityBudget} (+${page.length} rows, upserted=${options.stats.propertyUpserted}, skipped=${options.stats.propertySkipped})`,
        );
        for (const row of page) {
          await upsertPropertyRow(row, {
            stats: options.stats,
            skipReasons,
            fetchNested: false,
            provenance,
          });
        }
        if (page.length === 0) break;
      }
    } catch (err) {
      options.stats.errors.push(
        `active inventory ${city}: ${err instanceof Error ? err.message : "failed"}`,
      );
      console.error(`[mls] Active inventory failed for ${city}`, err);
    }

    options.stats.skipReasons = {
      ...(options.stats.skipReasons ?? {}),
      ...Object.fromEntries(
        Object.entries(skipReasons).map(([k, v]) => [`active:${city}:${k}`, v]),
      ),
    };
  }
}

async function syncProperties(options: {
  maxPages: number;
  fullBackfillDays: number;
  stats: MlsSyncStats;
  fetchNested?: boolean;
  config?: PropTxConfig | null;
}): Promise<string | null> {
  const provenance = await createPropTxProvenanceSession(
    createPrismaPropTxProvenanceStore(prisma),
  ).get();

  const since = await getCursor(RESOURCE_PROPERTY);
  const filter = propertyFilter(since, options.fullBackfillDays);
  // Ascending — advances cursor through backlog safely.
  const path = `Property?$filter=${encodeURIComponent(filter)}&$orderby=${encodeURIComponent("ModificationTimestamp,ListingKey")}&$top=100`;
  console.log(
    `[mls] Property backlog start (maxPages=${options.maxPages}, since=${since ?? "none"}, feed=${options.config?.feed ?? "default"})`,
  );

  let maxMod: Date | null = since ? new Date(since) : null;
  if (maxMod && Number.isNaN(maxMod.getTime())) maxMod = null;
  const skipReasons: Record<string, number> = {};
  const fetchNested = options.fetchNested === true;

  let pageNo = 0;
  for await (const page of proptxPages<PropTxProperty>(path, {
    maxPages: options.maxPages,
    config: options.config,
  })) {
    pageNo += 1;
    options.stats.pages += 1;
    console.log(
      `[mls] Property page ${pageNo}/${options.maxPages} (+${page.length} rows, upserted=${options.stats.propertyUpserted}, skipped=${options.stats.propertySkipped})`,
    );
    for (const row of page) {
      const updatedAtMls = await upsertPropertyRow(row, {
        stats: options.stats,
        skipReasons,
        fetchNested,
        provenance,
      });
      if (
        updatedAtMls &&
        (!maxMod || updatedAtMls.getTime() > maxMod.getTime())
      ) {
        maxMod = updatedAtMls;
      }
    }
  }

  options.stats.skipReasons = {
    ...(options.stats.skipReasons ?? {}),
    ...skipReasons,
  };

  if (maxMod) {
    const cursor = toODataDate(maxMod);
    await setCursor(RESOURCE_PROPERTY, cursor);
    return cursor;
  }
  return since;
}

/**
 * Media gap-fill. Incomplete means zero photos, never successfully synced,
 * a newer observed PhotosChangeTimestamp, or a delayed-upload retry whose
 * 24-hour cooldown has elapsed inside the 48-hour grace window.
 * A stamped 1–4 photo listing is not selected.
 * Does not read or advance the Media cursor.
 */
async function syncMediaBackfill(options: {
  maxListings: number;
  stats: MlsSyncStats;
  concurrency?: number;
}): Promise<void> {
  const take = options.maxListings;
  const now = new Date();
  const graceCutoff = new Date(now.getTime() - MEDIA_DELAYED_GRACE_MS);
  const cooldownCutoff = new Date(now.getTime() - MEDIA_DELAYED_COOLDOWN_MS);

  type BackfillRow = {
    id: string;
    listingKey: string;
    mlsNumber: string;
    status: string;
    listedAt: Date | null;
    updatedAtMls: Date | null;
    mediaSourceTimestamp: Date | null;
    mediaSyncedAt: Date | null;
    photosChangeTimestamp: Date | null;
    mediaCount: number;
  };

  const listings = await prisma.$queryRaw<BackfillRow[]>`
    SELECT
      l.id,
      l."listingKey",
      l."mlsNumber",
      l.status::text AS status,
      l."listedAt",
      l."updatedAtMls",
      l."mediaSourceTimestamp",
      l."mediaSyncedAt",
      l."photosChangeTimestamp",
      c.n AS "mediaCount"
    FROM "Listing" l
    JOIN LATERAL (
      SELECT count(*)::int AS n
      FROM "ListingMedia" m
      WHERE m."listingId" = l.id
    ) c ON true
    WHERE l."dataSource" = 'mls'
      AND l."isMock" = false
      AND l."listingKey" IS NOT NULL
      AND (
        (
          l.status IN ('ACTIVE', 'SOLD_CONDITIONAL')
          AND (
            c.n = 0
            OR l."mediaSourceTimestamp" IS NULL
            OR (
              l."photosChangeTimestamp" IS NOT NULL
              AND l."mediaSourceTimestamp" IS NOT NULL
              AND l."photosChangeTimestamp" > l."mediaSourceTimestamp"
            )
            OR (
              c.n BETWEEN 1 AND 4
              AND l."mediaSourceTimestamp" IS NOT NULL
              AND l."listedAt" >= ${graceCutoff}
              AND (
                l."mediaSyncedAt" IS NULL
                OR l."mediaSyncedAt" <= ${cooldownCutoff}
              )
            )
          )
        )
        OR (
          l.status IN ('SOLD', 'LEASED', 'TERMINATED', 'EXPIRED', 'SUSPENDED')
          AND (
            c.n = 0
            OR l."mediaSourceTimestamp" IS NULL
            OR (
              l."photosChangeTimestamp" IS NOT NULL
              AND l."mediaSourceTimestamp" IS NOT NULL
              AND l."photosChangeTimestamp" > l."mediaSourceTimestamp"
            )
          )
        )
      )
    ORDER BY
      CASE
        WHEN l.status IN ('ACTIVE', 'SOLD_CONDITIONAL') AND c.n = 0 THEN 0
        WHEN l.status IN ('ACTIVE', 'SOLD_CONDITIONAL')
          AND l."mediaSourceTimestamp" IS NULL
          AND c.n BETWEEN 1 AND 4 THEN 1
        WHEN l.status IN ('ACTIVE', 'SOLD_CONDITIONAL')
          AND l."photosChangeTimestamp" IS NOT NULL
          AND l."mediaSourceTimestamp" IS NOT NULL
          AND l."photosChangeTimestamp" > l."mediaSourceTimestamp" THEN 2
        WHEN l.status IN ('ACTIVE', 'SOLD_CONDITIONAL')
          AND c.n BETWEEN 1 AND 4
          AND l."mediaSourceTimestamp" IS NOT NULL
          AND l."listedAt" >= ${graceCutoff}
          AND (
            l."mediaSyncedAt" IS NULL
            OR l."mediaSyncedAt" <= ${cooldownCutoff}
          ) THEN 3
        WHEN l.status IN ('ACTIVE', 'SOLD_CONDITIONAL')
          AND l."mediaSourceTimestamp" IS NULL THEN 4
        WHEN l.status IN ('SOLD', 'LEASED') THEN 5
        ELSE 6
      END,
      l."listedAt" DESC NULLS LAST
    LIMIT ${take}
  `;

  console.log(
    `[mls] Media backfill start (${listings.length} eligible listings, concurrency=${Math.max(1, Math.min(options.concurrency ?? 6, 12))})`,
  );

  const concurrency = Math.max(1, Math.min(options.concurrency ?? 6, 12));
  let index = 0;
  let completed = 0;
  let stoppedForDisk = false;

  async function worker() {
    while (index < listings.length && !stoppedForDisk) {
      const current = listings[index];
      index += 1;
      if (!current?.listingKey) continue;
      try {
        const mediaCount = Number(current.mediaCount);
        const decision = shouldFetchListingMedia({
          mediaCount,
          mediaSourceTimestamp: current.mediaSourceTimestamp,
          mediaSyncedAt: current.mediaSyncedAt,
          listedAt: current.listedAt,
          photosChangeTimestamp: current.photosChangeTimestamp,
          now,
        });
        if (decision.fetch) {
          const outcome = await syncMediaForListing(
            current.listingKey,
            current.id,
            options.stats,
            { maxPhotos: NEON_LISTING_MEDIA_CAP },
          );
          const fallback = current.updatedAtMls ?? current.listedAt ?? now;
          await commitMediaSyncStamp(
            current.id,
            outcome,
            {
              mediaSourceTimestamp: current.mediaSourceTimestamp,
              mediaSyncedAt: current.mediaSyncedAt,
            },
            completionMediaSourceStamp({
              photosChangeTimestamp: current.photosChangeTimestamp,
              modificationTimestamp: null,
              fallback,
            }),
          );
        } else if (mediaCount > NEON_LISTING_MEDIA_CAP) {
          await pruneListingMediaToCap(current.id);
        }
        await pushListingToTypesense(current.id, options.stats);
      } catch (err) {
        pushSyncError(
          options.stats,
          `media backfill ${current.mlsNumber}: ${err instanceof Error ? err.message : "failed"}`,
        );
        if (isNeonSizeLimitError(err)) {
          stoppedForDisk = true;
          console.error(
            "[mls] Media backfill stopped — Neon project size limit reached. Upgrade Neon or prune more media.",
          );
          break;
        }
      }
      completed += 1;
      if (completed === 1 || completed % 50 === 0 || completed === listings.length) {
        console.log(
          `[mls] Media backfill ${completed}/${listings.length} (upserted=${options.stats.mediaUpserted})`,
        );
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, listings.length || 1) }, () =>
      worker(),
    ),
  );
  console.log(
    `[mls] Media backfill done (upserted=${options.stats.mediaUpserted}${stoppedForDisk ? ", stopped: disk full" : ""})`,
  );
}

/**
 * Fill missing soldAt/soldPrice on SOLD|LEASED rows via VOW Property fetch.
 * IDX often omits PurchaseContractDate — leaves "Recently sold" stuck on list dates.
 */
async function syncSoldAtBackfill(options: {
  maxListings: number;
  stats: MlsSyncStats;
  concurrency?: number;
}): Promise<void> {
  const config =
    getPropTxSoldSyncConfig() ?? getPropTxSyncConfig();
  if (!config) return;

  const take = Math.max(1, Math.min(options.maxListings, 2000));
  const listings = await prisma.listing.findMany({
    where: {
      dataSource: "mls",
      isMock: false,
      status: { in: ["SOLD", "LEASED"] },
      OR: [{ soldAt: null }, { soldPrice: null }],
    },
    select: {
      id: true,
      listingKey: true,
      mlsNumber: true,
    },
    take,
    orderBy: [{ updatedAtMls: "desc" }, { listedAt: "desc" }],
  });

  if (listings.length === 0) return;

  console.log(
    `[mls] Sold-date backfill start (${listings.length} missing soldAt/price, feed=${config.feed})`,
  );

  const concurrency = Math.max(1, Math.min(options.concurrency ?? 6, 10));
  let index = 0;
  let filled = 0;

  async function worker() {
    while (index < listings.length) {
      const current = listings[index];
      index += 1;
      if (!current) continue;
      const key = current.listingKey || current.mlsNumber;
      try {
        const raw = await proptxJson<PropTxProperty>(
          `Property('${key.replace(/'/g, "''")}')`,
          config,
        );
        const mapped = mapPropertyToListingResult(raw);
        if (!mapped.ok) continue;
        const soldAt = mapped.data.soldAt ?? null;
        const soldPrice = mapped.data.soldPrice ?? null;
        if (!soldAt && soldPrice == null) continue;
        await prisma.listing.update({
          where: { id: current.id },
          data: {
            ...(soldAt ? { soldAt } : {}),
            ...(soldPrice != null ? { soldPrice } : {}),
          },
        });
        await pushListingToTypesense(current.id, options.stats);
        filled += 1;
        options.stats.propertyUpserted += 1;
      } catch (err) {
        pushSyncError(
          options.stats,
          `soldAt ${current.mlsNumber}: ${err instanceof Error ? err.message : "failed"}`,
        );
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, listings.length || 1) }, () =>
      worker(),
    ),
  );
  console.log(`[mls] Sold-date backfill done (filled=${filled}/${listings.length})`);
}

async function syncMedia(options: {
  maxPages: number;
  fullBackfillDays: number;
  stats: MlsSyncStats;
  /** When true, skip the global Media feed (gap-fill only). */
  backfillOnly?: boolean;
}): Promise<void> {
  // Primary path: fill gaps for inventory we already have.
  await syncMediaBackfill({
    maxListings: Math.max(options.maxPages * 50, 100),
    stats: options.stats,
    concurrency: 10,
  });

  if (options.backfillOnly) return;

  // Secondary: incremental Media feed for listings already in DB.
  const since = await getCursor(RESOURCE_MEDIA);
  const sinceFilter = propertyFilter(since, options.fullBackfillDays);
  // ImageSizeDescription only — avoid over-filtering.
  const filter = `(${sinceFilter}) and ImageSizeDescription eq 'Large'`;
  const path = `Media?$filter=${encodeURIComponent(filter)}&$orderby=${encodeURIComponent("ModificationTimestamp,MediaKey")}&$top=200`;
  const keyCache = new Map<string, string>();
  let maxMod: Date | null = since ? new Date(since) : null;
  if (maxMod && Number.isNaN(maxMod.getTime())) maxMod = null;

  for await (const page of proptxPages<PropTxProperty>(path, {
    maxPages: options.maxPages,
  })) {
    options.stats.pages += 1;
    for (const row of page) {
      const mapped = mapMediaRow(row);
      if (!mapped) continue;
      const listingId = await resolveListingIdByKey(mapped.listingKey, keyCache);
      if (!listingId) continue;
      try {
        // Cover only — full gallery is live from PropTx on detail pages.
        const existingCount = await prisma.listingMedia.count({
          where: { listingId },
        });
        if (existingCount >= 1) continue;
        await upsertMappedMedia(listingId, mapped, options.stats);
      } catch (err) {
        options.stats.errors.push(
          `media: ${err instanceof Error ? err.message : "failed"}`,
        );
      }

      const mod = row.ModificationTimestamp;
      if (typeof mod === "string") {
        const d = new Date(mod);
        if (!Number.isNaN(d.getTime()) && (!maxMod || d > maxMod)) maxMod = d;
      }
    }
  }

  if (maxMod) {
    await setCursor(RESOURCE_MEDIA, toODataDate(maxMod));
  }
}

async function syncOpenHouses(options: {
  maxPages: number;
  stats: MlsSyncStats;
}): Promise<void> {
  // Upcoming + recent open houses
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - 1);
  const filter = `OpenHouseStartTime gt ${toODataDate(from)}`;
  const path = `OpenHouse?$filter=${encodeURIComponent(filter)}&$orderby=${encodeURIComponent("OpenHouseStartTime asc")}&$top=200`;
  const keyCache = new Map<string, string>();

  for await (const page of proptxPages<PropTxProperty>(path, {
    maxPages: options.maxPages,
  })) {
    options.stats.pages += 1;
    for (const row of page) {
      const mapped = mapOpenHouseRow(row);
      if (!mapped) continue;
      const listingId = await resolveListingIdByKey(mapped.listingKey, keyCache);
      if (!listingId) continue;
      try {
        const existing = await prisma.openHouse.findFirst({
          where: {
            listingId,
            startsAt: mapped.startsAt,
          },
        });
        if (existing) {
          await prisma.openHouse.update({
            where: { id: existing.id },
            data: {
              endsAt: mapped.endsAt,
              notes: mapped.notes,
            },
          });
        } else {
          await prisma.openHouse.create({
            data: {
              listingId,
              startsAt: mapped.startsAt,
              endsAt: mapped.endsAt,
              notes: mapped.notes,
            },
          });
        }
        options.stats.openHousesUpserted += 1;
        await pushListingToTypesense(listingId, options.stats);
      } catch (err) {
        options.stats.errors.push(
          `openHouse: ${err instanceof Error ? err.message : "failed"}`,
        );
      }
    }
  }
}

async function syncHistory(options: {
  maxPages: number;
  fullBackfillDays: number;
  stats: MlsSyncStats;
}): Promise<void> {
  const since = await getCursor(RESOURCE_HISTORY);
  const filter = propertyFilter(since, options.fullBackfillDays);
  const path = `HistoryTransactional?$filter=${encodeURIComponent(filter)}&$orderby=${encodeURIComponent("ModificationTimestamp asc")}&$top=200`;
  const keyCache = new Map<string, string>();
  let maxMod: Date | null = since ? new Date(since) : null;
  if (maxMod && Number.isNaN(maxMod.getTime())) maxMod = null;

  for await (const page of proptxPages<PropTxProperty>(path, {
    maxPages: options.maxPages,
  })) {
    options.stats.pages += 1;
    for (const row of page) {
      const mapped = mapHistoryRow(row);
      if (!mapped) continue;
      const listingId = await resolveListingIdByKey(mapped.listingKey, keyCache);
      if (!listingId) continue;
      try {
        const existing = await prisma.listingHistory.findFirst({
          where: {
            listingId,
            event: mapped.event,
            contractDate: mapped.contractDate,
            price: mapped.price,
          },
        });
        if (existing) {
          await prisma.listingHistory.update({
            where: { id: existing.id },
            data: {
              originalPrice: mapped.originalPrice,
              lastUpdatedAt: mapped.lastUpdatedAt,
              externalMls: mapped.externalMls,
              visibility: mapped.visibility,
              note: mapped.note,
            },
          });
        } else {
          await prisma.listingHistory.create({
            data: {
              listingId,
              event: mapped.event,
              price: mapped.price,
              originalPrice: mapped.originalPrice,
              contractDate: mapped.contractDate,
              lastUpdatedAt: mapped.lastUpdatedAt,
              externalMls: mapped.externalMls,
              visibility: mapped.visibility,
              note: mapped.note,
            },
          });
        }
        options.stats.historyUpserted += 1;

        const mod = row.ModificationTimestamp;
        if (typeof mod === "string") {
          const d = new Date(mod);
          if (!Number.isNaN(d.getTime()) && (!maxMod || d > maxMod)) maxMod = d;
        }
      } catch (err) {
        options.stats.errors.push(
          `history: ${err instanceof Error ? err.message : "failed"}`,
        );
      }
    }
  }

  if (maxMod) {
    await setCursor(RESOURCE_HISTORY, toODataDate(maxMod));
  }
}

/**
 * Fast freshness only: just-listed + recent mods. Never touches MlsSyncCursor.
 */
async function runMlsFastPropertyPasses(options: {
  stats: MlsSyncStats;
  config: PropTxConfig;
}): Promise<void> {
  console.log(
    `[mls] mode=fast justListed=${MLS_FAST_JUST_LISTED_PAGES}p/${MLS_FAST_JUST_LISTED_DAYS}d recent=${MLS_FAST_RECENT_PAGES}p/${MLS_FAST_RECENT_DAYS}d cursor=locked`,
  );
  await syncJustListedProperties({
    days: MLS_FAST_JUST_LISTED_DAYS,
    maxPages: MLS_FAST_JUST_LISTED_PAGES,
    stats: options.stats,
    config: options.config,
    skipGeocode: true,
    fastUnchangedSkip: true,
  });
  await syncRecentProperties({
    days: MLS_FAST_RECENT_DAYS,
    maxPages: MLS_FAST_RECENT_PAGES,
    stats: options.stats,
    config: options.config,
    skipGeocode: true,
    fastUnchangedSkip: true,
  });
}

/**
 * Pull PropTx MLS feed into Postgres. Safe to re-run (idempotent upserts).
 */
export async function runPropTxMlsSync(options?: {
  maxPages?: number;
  fullBackfillDays?: number;
  resources?: Array<
    | "property"
    | "media"
    | "rooms"
    | "openHouse"
    | "history"
    | "syntheticHistory"
    | "activeInventory"
  >;
  /** Media gap-fill only (skip slow global Media feed). */
  mediaBackfillOnly?: boolean;
  /** Run city-by-city Active inventory (heavy — off by default on cron). */
  activeInventory?: boolean;
  /** Fast: just-listed + recent mods only. Never advances Property/Media cursors. */
  mode?: MlsSyncMode;
}): Promise<MlsSyncResult> {
  assertMlsSyncExecutionHost();
  const mode: MlsSyncMode =
    options?.mode === "fast" ? "fast" : MLS_FULL_SYNC_MODE;
  const isFast = isMlsFastSyncMode(mode);

  const config = getPropTxSyncConfig();
  if (!config) {
    return {
      ok: false,
      message:
        "PropTx credentials missing. Set PROPTX_ENDPOINT_URL plus IDX Token ID (PROPTX_TOKEN_ID / PROPTX_BEARER_TOKEN or PROPTX_IDX_*), and optionally PROPTX_VOW_* for sold.",
      stats: emptyStats(mode),
      runId: "",
      mode,
    };
  }

  const maxPages = options?.maxPages ?? 200;
  const fullBackfillDays = options?.fullBackfillDays ?? 90;
  const resources = options?.resources ?? [
    "property",
    "openHouse",
    // media/rooms are heavy — run via `pnpm mls:sync … property,media,rooms,openHouse`
    // HistoryTransactional is not on all AMPRE feeds (VOW may omit it).
    // Property-derived synthetic history is written during property upserts.
  ];

  const previousMode = activeMlsSyncMode;
  activeMlsSyncMode = mode;

  const run = await prisma.mlsSyncRun.create({
    data: {
      resource: isFast ? "fast" : options?.mediaBackfillOnly ? "media" : "all",
      status: "running",
      message: `MLS sync starting (${config.feed}, mode=${mode})`,
    },
  });

  const stats = emptyStats(mode);
  resetPropTxTransportStats();

  try {
    // CloseDate was stored as soldAt; clear future closings so "Recently sold"
    // sorts by real firm dates after the next property upsert remaps them.
    if (!isFast) {
      await prisma.listing.updateMany({
        where: {
          status: { in: ["SOLD", "LEASED"] },
          soldAt: { gt: new Date() },
        },
        data: { soldAt: null },
      });
    }

    if (isFast) {
      await runMlsFastPropertyPasses({ stats, config });
    } else if (resources.includes("property")) {
      // Page budget: always pull fresh inventory first, then advance history/cursor.
      // maxPages≤40 stays lean (short CI ticks); Mac launchd uses higher defaults.
      const lean = maxPages <= 40;
      const envInt = (key: string, fallback: number) => {
        const raw = process.env[key]?.trim();
        if (!raw) return fallback;
        const n = Number(raw);
        return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
      };

      const justListedDays = envInt(
        "MLS_SYNC_JUST_LISTED_DAYS",
        Math.min(2, Math.max(1, fullBackfillDays)),
      );
      const justListedPages = envInt(
        "MLS_SYNC_JUST_LISTED_PAGES",
        lean ? Math.min(15, Math.max(8, maxPages)) : Math.min(25, Math.ceil(maxPages / 3)),
      );
      const recentDays = envInt(
        "MLS_SYNC_RECENT_DAYS",
        Math.min(3, Math.max(1, fullBackfillDays)),
      );
      const recentPages = envInt(
        "MLS_SYNC_RECENT_PAGES",
        lean
          ? Math.min(10, Math.max(5, Math.ceil(maxPages / 2)))
          : Math.min(25, Math.max(10, Math.ceil(maxPages / 2))),
      );
      const backlogPages = envInt(
        "MLS_SYNC_BACKLOG_PAGES",
        lean ? Math.min(12, maxPages) : maxPages,
      );
      const mediaCap = envInt(
        "MLS_SYNC_MEDIA_CAP",
        lean
          ? Math.min(80, Math.max(30, maxPages * 3))
          : Math.min(Math.max(maxPages * 25, 400), 1500),
      );
      const soldCap = envInt(
        "MLS_SYNC_SOLD_CAP",
        lean
          ? Math.min(60, Math.max(20, maxPages * 2))
          : Math.min(Math.max(maxPages * 5, 150), 800),
      );

      console.log(
        `[mls] Budget justListed=${justListedPages}p/${justListedDays}d recent=${recentPages}p/${recentDays}d backlog=${backlogPages}p media=${mediaCap} sold=${soldCap} lean=${lean}`,
      );

      // 1) Brand-new on market (list date) — keeps "within 1h / 24h" rails alive.
      await syncJustListedProperties({
        days: justListedDays,
        maxPages: justListedPages,
        stats,
        config,
      });

      // 2) Newest mods — status flips, price changes, photo churn.
      await syncRecentProperties({
        days: recentDays,
        maxPages: recentPages,
        stats,
        config,
      });

      // 3) Ascending cursor backlog — history / sold / off-market catch-up.
      await syncProperties({
        maxPages: backlogPages,
        fullBackfillDays,
        stats,
        fetchNested: false,
        config,
      });

      // 3b) Optional extra VOW pass when primary sync is IDX-only.
      const vowConfig = getPropTxSoldSyncConfig();
      if (vowConfig && config.feed === "idx") {
        const vowPages = Math.min(15, Math.max(5, Math.ceil(recentPages / 2)));
        console.log(
          `[mls] VOW enrichment pass (sold/history for clients, maxPages=${vowPages})`,
        );
        await syncRecentProperties({
          days: recentDays,
          maxPages: vowPages,
          stats,
          config: vowConfig,
        });
      }

      // 3c) Fill firm sold dates missing from earlier IDX-only syncs.
      try {
        await syncSoldAtBackfill({
          maxListings: soldCap,
          stats,
          concurrency: lean ? 4 : 6,
        });
      } catch (err) {
        stats.errors.push(
          `Sold-date backfill: ${err instanceof Error ? err.message : "unavailable"}`,
        );
      }

      // 4) Photo gap-fill: zero photos, never synced, photo-timestamp changes,
      // and cooldown-eligible delayed uploads. Not "count != 5".
      try {
        await syncMediaBackfill({
          maxListings: mediaCap,
          stats,
          concurrency: lean ? 6 : 8,
        });
      } catch (err) {
        stats.errors.push(
          `Media backfill: ${err instanceof Error ? err.message : "unavailable"}`,
        );
      }
    }

    // Optional heavy Active book fill (manual / nightly — not every cron tick).
    const runActiveInventory =
      !isFast &&
      (options?.activeInventory === true ||
        resources.includes("activeInventory") ||
        process.env.MLS_SYNC_ACTIVE_INVENTORY === "1");
    if (runActiveInventory) {
      const activePages = Math.max(maxPages * 2, 60);
      // Active book for visitors must use IDX Token when available.
      const idxConfig = getPropTxIdxConfig() ?? config;
      await syncActiveInventory({
        maxPages: activePages,
        stats,
        config: idxConfig,
      });
    }

    // Discovery + 7-day rotation. Off until MLS_ON_MARKET_RECONCILE=1.
    // Fast sync never enters this block. Does not move the Property cursor.
    if (!isFast && process.env.MLS_ON_MARKET_RECONCILE === "1") {
      try {
        stats.onMarketReconcile = await executeOnMarketReconciliation({
          mode,
        });
      } catch (err) {
        stats.errors.push(
          `On-market reconcile: ${err instanceof Error ? err.message : "failed"}`,
        );
      }
    }

    if (!isFast && resources.includes("media")) {
      try {
        await syncMedia({
          maxPages,
          fullBackfillDays,
          stats,
          // Property pass already ran gap-fill; optional Media feed is incremental.
          backfillOnly: options?.mediaBackfillOnly === true,
        });
      } catch (err) {
        stats.errors.push(
          `Media resource: ${err instanceof Error ? err.message : "unavailable"}`,
        );
      }
    }
    if (!isFast && resources.includes("rooms")) {
      try {
        await syncRoomsBackfill({
          maxListings: Math.max(maxPages * 50, 200),
          stats,
          concurrency: 6,
        });
      } catch (err) {
        stats.errors.push(
          `Rooms resource: ${err instanceof Error ? err.message : "unavailable"}`,
        );
      }
    }
    if (!isFast && resources.includes("openHouse")) {
      try {
        await syncOpenHouses({ maxPages, stats });
      } catch (err) {
        stats.errors.push(
          `OpenHouse resource: ${err instanceof Error ? err.message : "unavailable"}`,
        );
      }
    }
    if (!isFast && resources.includes("syntheticHistory")) {
      try {
        await syncSyntheticHistoryBackfill({
          maxListings: Math.max(maxPages * 50, 200),
          stats,
          concurrency: 6,
        });
      } catch (err) {
        stats.errors.push(
          `Synthetic history: ${err instanceof Error ? err.message : "unavailable"}`,
        );
      }
    }
    if (!isFast && resources.includes("history")) {
      try {
        // Prefer per-ListingKey backfill — broad HistoryTransactional filters often 400.
        await syncHistoryBackfill({
          maxListings: Math.max(maxPages * 25, 100),
          stats,
          concurrency: 4,
        });
      } catch (err) {
        stats.errors.push(
          `HistoryTransactional resource: ${err instanceof Error ? err.message : "unavailable"}`,
        );
      }
    }

    const typesenseOff = typesenseSyncDisabledReason();
    const typesenseIndexMissed =
      (stats.propertyUpserted > 0 || stats.openHousesUpserted > 0) &&
      stats.typesenseUpserted === 0;
    const typesenseDegraded =
      typesenseIndexMissed ||
      stats.typesenseMissingProvenance > 0 ||
      stats.typesenseFailed > 0 ||
      (stats.onMarketReconcile?.typesenseFailed ?? 0) > 0;
    const typesensePart = typesenseOff
      ? ` typesense=OFF (${typesenseOff}) attempted=${stats.typesenseAttempted} ok=${stats.typesenseUpserted} fail=${stats.typesenseFailed} missingProvenance=${stats.typesenseMissingProvenance}`
      : ` typesense attempted=${stats.typesenseAttempted} ok=${stats.typesenseUpserted} fail=${stats.typesenseFailed} missingProvenance=${stats.typesenseMissingProvenance}`;
    const staleWarning = typesenseDegraded
      ? " TYPESENSE INDEX NOT HEALTHY — houzzat.com listings may go stale or unauthorized."
      : "";
    const fastPart = isFast
      ? ` inspected=${stats.propertyInspected} unchanged=${stats.propertyUnchangedSkipped} new=${stats.propertyNew} statusChanges=${stats.propertyStatusChanged} priceChanges=${stats.propertyPriceChanged} soldChanges=${stats.propertySoldChanged} photoChanges=${stats.propertyPhotoChanged} mediaFetches=${stats.mediaFetches}`
      : "";
    const reconcilePart = stats.onMarketReconcile
      ? ` ${formatOnMarketReconcileLog(stats.onMarketReconcile).replace("[mls] ", "")}`
      : "";
    applyPropTxTransportStats(stats);
    const transportPart =
      stats.proptxRequests > 0
        ? ` proptx req=${stats.proptxRequests} retry=${stats.proptxRetries} 429=${stats.proptx429} 5xx=${stats.proptx5xx} timeout=${stats.proptxTimeouts} net=${stats.proptxNetworkErrors} exhausted=${stats.proptxRetriesExhausted} backoffMs=${stats.proptxBackoffMs}`
        : "";
    const message = `mode=${mode} Synced properties=${stats.propertyUpserted} media=${stats.mediaUpserted} rooms=${stats.roomsUpserted} openHouses=${stats.openHousesUpserted} history=${stats.historyUpserted} geocode=${stats.geocodeFixed}/${stats.geocodeAttempted} skipped=${stats.propertySkipped}${fastPart}${reconcilePart}${typesensePart}${transportPart}${staleWarning}`;
    if (typesenseDegraded) {
      console.error(`[mls] ${message}`);
    }
    try {
      await prisma.mlsSyncRun.update({
        where: { id: run.id },
        data: {
          status: typesenseDegraded ? "degraded" : "ok",
          finishedAt: new Date(),
          message,
          stats: {
            ...stats,
            errors: stats.errors.slice(0, 40),
          },
        },
      });
    } catch (err) {
      console.error(
        "[mls] Failed to write MlsSyncRun ok status:",
        err instanceof Error ? err.message : err,
      );
    }

    return {
      ok: !typesenseDegraded,
      message,
      stats,
      runId: run.id,
      mode,
    };
  } catch (err) {
    const message =
      `mode=${mode} ` +
      (err instanceof PropTxError
        ? err.message
        : err instanceof Error
          ? err.message
          : "MLS sync failed");
    pushSyncError(stats, message);
    applyPropTxTransportStats(stats);
    try {
      await prisma.mlsSyncRun.update({
        where: { id: run.id },
        data: {
          status: "error",
          finishedAt: new Date(),
          message,
          stats: {
            ...stats,
            errors: stats.errors.slice(0, 40),
          },
        },
      });
    } catch (writeErr) {
      console.error(
        "[mls] Failed to write MlsSyncRun error status:",
        writeErr instanceof Error ? writeErr.message : writeErr,
      );
    }

    return { ok: false, message, stats, runId: run.id, mode };
  } finally {
    activeMlsSyncMode = previousMode;
  }
}

function emptyStats(mode: MlsSyncMode = MLS_FULL_SYNC_MODE): MlsSyncStats {
  return {
    propertyUpserted: 0,
    propertySkipped: 0,
    mediaUpserted: 0,
    roomsUpserted: 0,
    openHousesUpserted: 0,
    historyUpserted: 0,
    geocodeAttempted: 0,
    geocodeFixed: 0,
    pages: 0,
    errors: [],
    skipReasons: {},
    typesenseAttempted: 0,
    typesenseUpserted: 0,
    typesenseFailed: 0,
    typesenseMissingProvenance: 0,
    typesenseDisabled: 0,
    mode,
    propertyInspected: 0,
    propertyUnchangedSkipped: 0,
    propertyNew: 0,
    propertyStatusChanged: 0,
    propertyPriceChanged: 0,
    propertySoldChanged: 0,
    propertyPhotoChanged: 0,
    mediaFetches: 0,
    onMarketReconcile: null,
    proptxRequests: 0,
    proptxRetries: 0,
    proptx429: 0,
    proptx5xx: 0,
    proptxTimeouts: 0,
    proptxNetworkErrors: 0,
    proptxRetryAfterWaits: 0,
    proptxRetriesExhausted: 0,
    proptxBackoffMs: 0,
  };
}

function applyPropTxTransportStats(stats: MlsSyncStats): void {
  const transport = readPropTxTransportStats();
  stats.proptxRequests = transport.requests;
  stats.proptxRetries = transport.retries;
  stats.proptx429 = transport.rateLimited;
  stats.proptx5xx = transport.serverErrors;
  stats.proptxTimeouts = transport.timeouts;
  stats.proptxNetworkErrors = transport.networkErrors;
  stats.proptxRetryAfterWaits = transport.retryAfterWaits;
  stats.proptxRetriesExhausted = transport.exhaustedRetries;
  stats.proptxBackoffMs = transport.backoffMs;
}

export { getPropTxSyncHealth } from "@/lib/proptx/sync-health";
