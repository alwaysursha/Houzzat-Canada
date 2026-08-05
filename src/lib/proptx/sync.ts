import { prisma } from "@/lib/prisma";
import {
  getPropTxIdxConfig,
  getPropTxSoldSyncConfig,
  getPropTxSyncConfig,
  isPropTxConfigured,
} from "@/lib/proptx/config";
import { PropTxError, proptxJson, proptxPages } from "@/lib/proptx/client";
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
};

/** Cap inline geocode so property sync stays within the 5-minute cron window. */
const SYNC_GEOCODE_BUDGET = 250;

export type MlsSyncResult = {
  ok: boolean;
  message: string;
  stats: MlsSyncStats;
  runId: string;
};

const RESOURCE_PROPERTY = "Property";
const RESOURCE_MEDIA = "Media";
const RESOURCE_OPEN_HOUSE = "OpenHouse";
const RESOURCE_HISTORY = "HistoryTransactional";

async function getCursor(resource: string): Promise<string | null> {
  const row = await prisma.mlsSyncCursor.findUnique({ where: { resource } });
  return row?.cursor ?? null;
}

async function setCursor(resource: string, cursor: string) {
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

/** Attach cover photo only — full gallery is loaded live from PropTx on detail pages. */
async function syncMediaForListing(
  listingKey: string,
  listingId: string,
  stats: MlsSyncStats,
  options?: { maxPhotos?: number },
): Promise<void> {
  const maxPhotos = Math.max(1, Math.min(options?.maxPhotos ?? 1, 3));
  const rows = await fetchPropertyPhotos(listingKey);
  const selected = preferListingPhotos(rows, maxPhotos);
  if (selected.length === 0) return;

  const keepUrls = new Set(selected.map((p) => p.url));
  for (const photo of selected) {
    try {
      await upsertMappedMedia(
        listingId,
        {
          url: photo.url,
          sortOrder: photo.sortOrder,
          isPrimary: photo.isPrimary,
        },
        stats,
      );
    } catch (err) {
      pushSyncError(
        stats,
        `media ${listingKey}: ${err instanceof Error ? err.message : "failed"}`,
      );
      if (isNeonSizeLimitError(err)) throw err;
    }
  }

  // Drop extras so Neon only keeps the cover (or tiny set).
  await prisma.listingMedia.deleteMany({
    where: {
      listingId,
      url: { notIn: [...keepUrls] },
    },
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

async function upsertPropertyRow(
  row: PropTxProperty,
  options: {
    stats: MlsSyncStats;
    skipReasons: Record<string, number>;
    /** When false, skip geocode + per-listing media/rooms (much faster). */
    fetchNested: boolean;
    /** Explicit user lookup — do not apply MLS sync city allowlist. */
    skipCityAllowlist?: boolean;
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

  let data = mapped.data;
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
    const listing = await prisma.listing.upsert({
      where: { mlsNumber: data.mlsNumber },
      create: data,
      update: {
        listingKey: data.listingKey,
        status: data.status,
        segment: data.segment,
        transactionType: data.transactionType,
        dataSource: "mls",
        propertyType: data.propertyType,
        listPrice: data.listPrice,
        beds: data.beds,
        baths: data.baths,
        sqft: data.sqft,
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
      },
    });
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

    // Always attach a cover when Neon has none — cards/rails use stored media only.
    // Full gallery still loads live from PropTx on detail pages.
    if (data.listingKey) {
      const mediaCount = await prisma.listingMedia.count({
        where: { listingId: listing.id },
      });
      if (mediaCount === 0) {
        try {
          await syncMediaForListing(
            data.listingKey,
            listing.id,
            options.stats,
            { maxPhotos: 1 },
          );
        } catch (err) {
          options.stats.errors.push(
            `media ${data.mlsNumber}: ${err instanceof Error ? err.message : "failed"}`,
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
  options?: { concurrency?: number },
): Promise<string[]> {
  if (rows.length === 0) return [];

  const stats = emptyStats();
  const skipReasons: Record<string, number> = {};
  const mlsNumbers: string[] = [];
  const concurrency = Math.max(1, Math.min(options?.concurrency ?? 3, 6));
  let index = 0;

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
      });
      if (!mls) continue;

      const listing = await prisma.listing.findFirst({
        where: { mlsNumber: mls },
        select: { id: true, listingKey: true },
      });
      if (!listing) continue;
      mlsNumbers.push(mls);

      if (listing.listingKey) {
        const mediaCount = await prisma.listingMedia.count({
          where: { listingId: listing.id },
        });
        if (mediaCount === 0) {
          try {
            await syncMediaForListing(listing.listingKey, listing.id, stats, {
              maxPhotos: 1,
            });
          } catch {
            // Cover photo is best-effort on request path
          }
        }
      }

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
}): Promise<void> {
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - options.days);
  const fromDate = from.toISOString().slice(0, 10);
  const fromTs = toODataDate(from);

  // Prefer entry timestamp (has clock). ListingContractDate succeeds board-wide
  // but is date-only — using it first buried true "just listed" ordering.
  const attempts: Array<{ label: string; filter: string; orderby: string }> = [
    {
      label: "OriginalEntryTimestamp",
      filter: `(StandardStatus eq 'Active' or MlsStatus eq 'A') and OriginalEntryTimestamp ge ${fromTs}`,
      orderby: "OriginalEntryTimestamp desc,ListingKey desc",
    },
    {
      label: "ListingContractDate",
      filter: `(StandardStatus eq 'Active' or MlsStatus eq 'A') and ListingContractDate ge ${fromDate}`,
      orderby: "ListingContractDate desc,ListingKey desc",
    },
    {
      label: "OnMarketDate",
      filter: `(StandardStatus eq 'Active' or MlsStatus eq 'A') and OnMarketDate ge ${fromDate}`,
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
}): Promise<void> {
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
    const filter = `(StandardStatus eq 'Active' or MlsStatus eq 'A') and ${cityClause}`;
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
 * Backfill photos for MLS rows that still have zero media (per-ListingKey fetch).
 * Cap via maxPages ≈ number of listings to process this run.
 */
async function syncMediaBackfill(options: {
  maxListings: number;
  stats: MlsSyncStats;
  concurrency?: number;
}): Promise<void> {
  const take = options.maxListings;
  const baseWhere = {
    dataSource: "mls" as const,
    isMock: false,
    listingKey: { not: null },
    media: { none: {} },
  };

  // Newest ACTIVE without photos first (what visitors see), then closed,
  // then terminated/expired/suspended so every status gets a cover over time.
  const active = await prisma.listing.findMany({
    where: { ...baseWhere, status: "ACTIVE" },
    select: {
      id: true,
      listingKey: true,
      mlsNumber: true,
      status: true,
      listedAt: true,
    },
    take,
    orderBy: [{ listedAt: "desc" }, { updatedAt: "desc" }],
  });

  let listings = active;
  if (active.length < take) {
    const closed = await prisma.listing.findMany({
      where: {
        ...baseWhere,
        status: { in: ["LEASED", "SOLD"] },
      },
      select: {
        id: true,
        listingKey: true,
        mlsNumber: true,
        status: true,
        listedAt: true,
      },
      take: take - active.length,
      orderBy: [{ listedAt: "desc" }, { updatedAt: "desc" }],
    });
    listings = [...active, ...closed];
  }
  if (listings.length < take) {
    const inactive = await prisma.listing.findMany({
      where: {
        ...baseWhere,
        status: { in: ["TERMINATED", "EXPIRED", "SUSPENDED"] },
      },
      select: {
        id: true,
        listingKey: true,
        mlsNumber: true,
        status: true,
        listedAt: true,
      },
      take: take - listings.length,
      orderBy: [{ listedAt: "desc" }, { updatedAt: "desc" }],
    });
    listings = [...listings, ...inactive];
  }

  console.log(
    `[mls] Media backfill start (${listings.length} listings missing photos, concurrency=${Math.max(1, Math.min(options.concurrency ?? 6, 12))})`,
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
        await syncMediaForListing(
          current.listingKey,
          current.id,
          options.stats,
          { maxPhotos: 1 },
        );
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
}): Promise<MlsSyncResult> {
  const config = getPropTxSyncConfig();
  if (!config) {
    return {
      ok: false,
      message:
        "PropTx credentials missing. Set PROPTX_ENDPOINT_URL plus IDX Token ID (PROPTX_TOKEN_ID / PROPTX_BEARER_TOKEN or PROPTX_IDX_*), and optionally PROPTX_VOW_* for sold.",
      stats: emptyStats(),
      runId: "",
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

  const run = await prisma.mlsSyncRun.create({
    data: {
      resource: "all",
      status: "running",
      message: `MLS sync starting (${config.feed})`,
    },
  });

  const stats = emptyStats();

  try {
    // CloseDate was stored as soldAt; clear future closings so "Recently sold"
    // sorts by real firm dates after the next property upsert remaps them.
    await prisma.listing.updateMany({
      where: {
        status: { in: ["SOLD", "LEASED"] },
        soldAt: { gt: new Date() },
      },
      data: { soldAt: null },
    });

    if (resources.includes("property")) {
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

      // 4) Photo gap-fill (ACTIVE → SOLD/LEASED → TERMINATED/EXPIRED/SUSPENDED).
      // New/updated listings also get a cover in upsertPropertyRow when media is empty.
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
      options?.activeInventory === true ||
      resources.includes("activeInventory") ||
      process.env.MLS_SYNC_ACTIVE_INVENTORY === "1";
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

    if (resources.includes("media")) {
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
    if (resources.includes("rooms")) {
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
    if (resources.includes("openHouse")) {
      try {
        await syncOpenHouses({ maxPages, stats });
      } catch (err) {
        stats.errors.push(
          `OpenHouse resource: ${err instanceof Error ? err.message : "unavailable"}`,
        );
      }
    }
    if (resources.includes("syntheticHistory")) {
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
    if (resources.includes("history")) {
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

    const message = `Synced properties=${stats.propertyUpserted} media=${stats.mediaUpserted} rooms=${stats.roomsUpserted} openHouses=${stats.openHousesUpserted} history=${stats.historyUpserted} geocode=${stats.geocodeFixed}/${stats.geocodeAttempted} skipped=${stats.propertySkipped}`;
    try {
      await prisma.mlsSyncRun.update({
        where: { id: run.id },
        data: {
          status: "ok",
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

    return { ok: true, message, stats, runId: run.id };
  } catch (err) {
    const message =
      err instanceof PropTxError
        ? err.message
        : err instanceof Error
          ? err.message
          : "MLS sync failed";
    pushSyncError(stats, message);
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

    return { ok: false, message, stats, runId: run.id };
  }
}

function emptyStats(): MlsSyncStats {
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
  };
}

export async function getPropTxSyncHealth() {
  const configured = isPropTxConfigured();
  const mlsCount = await prisma.listing.count({
    where: { dataSource: "mls", isMock: false },
  });
  const lastPropTxRun = await prisma.mlsSyncRun.findFirst({
    where: {
      OR: [
        { message: { contains: "MLS sync" } },
        { message: { contains: "VOW sync" } },
        { message: { startsWith: "Synced properties=" } },
        { message: { contains: "PropTx" } },
      ],
    },
    orderBy: { startedAt: "desc" },
  });
  const lastRun = await prisma.mlsSyncRun.findFirst({
    orderBy: { startedAt: "desc" },
  });
  const cursor = await prisma.mlsSyncCursor.findUnique({
    where: { resource: RESOURCE_PROPERTY },
  });

  const seedLike =
    lastRun?.message?.includes("mock listings") ||
    (typeof lastRun?.stats === "object" &&
      lastRun.stats !== null &&
      "provider" in lastRun.stats &&
      (lastRun.stats as { provider?: string }).provider === "mock");

  return {
    configured,
    mlsCount,
    hint:
      mlsCount === 0
        ? "No MLS rows yet. Browser GET only shows status — run POST /api/admin/mls/sync (or pnpm mls:sync) to pull PropTx."
        : undefined,
    lastRun: lastRun
      ? {
          id: lastRun.id,
          status: lastRun.status,
          startedAt: lastRun.startedAt.toISOString(),
          finishedAt: lastRun.finishedAt?.toISOString() ?? null,
          message: lastRun.message,
          stats: lastRun.stats,
          isSeedRun: Boolean(seedLike),
        }
      : null,
    lastPropTxRun: lastPropTxRun
      ? {
          id: lastPropTxRun.id,
          status: lastPropTxRun.status,
          startedAt: lastPropTxRun.startedAt.toISOString(),
          finishedAt: lastPropTxRun.finishedAt?.toISOString() ?? null,
          message: lastPropTxRun.message,
          stats: lastPropTxRun.stats,
        }
      : null,
    propertyCursor: cursor?.cursor ?? null,
  };
}
