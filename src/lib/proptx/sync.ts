import { prisma } from "@/lib/prisma";
import { getPropTxConfig, isPropTxConfigured } from "@/lib/proptx/config";
import { PropTxError, proptxPages } from "@/lib/proptx/client";
import {
  buildListingGeocodeQuery,
  geocodeAddress,
} from "@/lib/geo/geocode";
import {
  mapHistoryRow,
  mapMediaRow,
  mapOpenHouseRow,
  mapPropertyToListingResult,
  mapRoomRow,
  stripApproxPinNote,
  toODataDate,
  type PropTxProperty,
} from "@/lib/proptx/map-listing";

export type MlsSyncStats = {
  propertyUpserted: number;
  propertySkipped: number;
  mediaUpserted: number;
  roomsUpserted: number;
  openHousesUpserted: number;
  historyUpserted: number;
  pages: number;
  errors: string[];
  skipReasons?: Record<string, number>;
};

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
  // AMPRE docs use `ge` (not `gt`) on ModificationTimestamp.
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
  const keyLit = odataStringLiteral(listingKey);
  const attempts = [
    `ResourceRecordKey eq ${keyLit} and ImageSizeDescription eq 'Large'`,
    `ResourceRecordKey eq ${keyLit} and ImageSizeDescription eq 'Largest'`,
    `ResourceRecordKey eq ${keyLit}`,
  ];

  for (const filter of attempts) {
    const path = `Media?$filter=${encodeURIComponent(filter)}&$orderby=${encodeURIComponent("Order,MediaKey")}&$top=100`;
    const rows: PropTxProperty[] = [];
    for await (const page of proptxPages<PropTxProperty>(path, {
      maxPages: 1,
    })) {
      rows.push(...page);
    }
    if (rows.length > 0) return rows;
  }
  return [];
}

async function upsertMappedMedia(
  listingId: string,
  mapped: NonNullable<ReturnType<typeof mapMediaRow>>,
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

/** Attach photos for one listing by ListingKey (not the global media cursor). */
async function syncMediaForListing(
  listingKey: string,
  listingId: string,
  stats: MlsSyncStats,
): Promise<void> {
  const rows = await fetchPropertyPhotos(listingKey);
  // One URL per photo object — AMPRE returns Large/Medium/Thumbnail variants.
  const preferred = new Map<
    string,
    { row: PropTxProperty; score: number; mapped: NonNullable<ReturnType<typeof mapMediaRow>> }
  >();
  const sizeScore = (row: PropTxProperty): number => {
    const size = String(row.ImageSizeDescription ?? "").toLowerCase();
    if (size === "large") return 40;
    if (size === "largest") return 30;
    if (size === "medium") return 20;
    if (size === "thumbnail" || size === "small") return 5;
    return 10;
  };

  for (const row of rows) {
    const mapped = mapMediaRow(row);
    if (!mapped) continue;
    const objectId =
      (typeof row.MediaObjectID === "string" && row.MediaObjectID) ||
      (typeof row.SourceSystemMediaKey === "string" &&
        row.SourceSystemMediaKey) ||
      mapped.url;
    const score = sizeScore(row);
    const prev = preferred.get(objectId);
    if (!prev || score > prev.score) {
      preferred.set(objectId, { row, score, mapped });
    }
  }

  for (const { mapped } of preferred.values()) {
    try {
      await upsertMappedMedia(listingId, mapped, stats);
    } catch (err) {
      stats.errors.push(
        `media ${listingKey}: ${err instanceof Error ? err.message : "failed"}`,
      );
    }
  }
}

async function syncProperties(options: {
  maxPages: number;
  fullBackfillDays: number;
  stats: MlsSyncStats;
}): Promise<string | null> {
  const since = await getCursor(RESOURCE_PROPERTY);
  const filter = propertyFilter(since, options.fullBackfillDays);
  // Match AMPRE examples: order by ModificationTimestamp,ListingKey
  const path = `Property?$filter=${encodeURIComponent(filter)}&$orderby=${encodeURIComponent("ModificationTimestamp,ListingKey")}&$top=100`;

  let maxMod: Date | null = since ? new Date(since) : null;
  if (maxMod && Number.isNaN(maxMod.getTime())) maxMod = null;
  const skipReasons: Record<string, number> = {};

  for await (const page of proptxPages<PropTxProperty>(path, {
    maxPages: options.maxPages,
  })) {
    options.stats.pages += 1;
    for (const row of page) {
      const mapped = mapPropertyToListingResult(row);
      if (!mapped.ok) {
        options.stats.propertySkipped += 1;
        const key = mapped.reason.startsWith("missing mls")
          ? "missing mls"
          : mapped.reason.slice(0, 80);
        skipReasons[key] = (skipReasons[key] ?? 0) + 1;
        if (options.stats.errors.length < 8 && mapped.reason.startsWith("missing mls")) {
          options.stats.errors.push(mapped.reason);
        }
        continue;
      }
      let data = mapped.data;
      if (mapped.approximateCoords) {
        try {
          const query = buildListingGeocodeQuery({
            addressLine: String(data.addressLine),
            unitNumber:
              typeof data.unitNumber === "string" ? data.unitNumber : null,
            city: String(data.city),
            province:
              typeof data.province === "string" ? data.province : "ON",
            postalCode:
              typeof data.postalCode === "string" ? data.postalCode : null,
          });
          const geo = await geocodeAddress(query);
          if (geo) {
            data = {
              ...data,
              lat: geo.lat,
              lng: geo.lng,
              description: stripApproxPinNote(String(data.description ?? "")),
            };
          }
        } catch (err) {
          options.stats.errors.push(
            `geocode ${data.mlsNumber}: ${err instanceof Error ? err.message : "failed"}`,
          );
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
            soldPrice: data.soldPrice,
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
            soldAt: data.soldAt,
            updatedAtMls: data.updatedAtMls,
            daysOnMarket: data.daysOnMarket,
            isMock: false,
          },
        });
        options.stats.propertyUpserted += 1;

        // Pull photos / rooms when still missing (avoid re-fetch every sync).
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
              );
            } catch (err) {
              options.stats.errors.push(
                `media ${data.mlsNumber}: ${err instanceof Error ? err.message : "failed"}`,
              );
            }
          }

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
        if (
          updatedAtMls &&
          !Number.isNaN(updatedAtMls.getTime()) &&
          (!maxMod || updatedAtMls.getTime() > maxMod.getTime())
        ) {
          maxMod = updatedAtMls;
        }
      } catch (err) {
        options.stats.propertySkipped += 1;
        options.stats.errors.push(
          `property ${data.mlsNumber}: ${err instanceof Error ? err.message : "upsert failed"}`,
        );
      }
    }
  }

  options.stats.skipReasons = skipReasons;

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
  const listings = await prisma.listing.findMany({
    where: {
      dataSource: "mls",
      isMock: false,
      listingKey: { not: null },
      media: { none: {} },
    },
    select: { id: true, listingKey: true, mlsNumber: true },
    take: options.maxListings,
    orderBy: { updatedAt: "desc" },
  });

  const concurrency = Math.max(1, Math.min(options.concurrency ?? 6, 12));
  let index = 0;

  async function worker() {
    while (index < listings.length) {
      const current = listings[index];
      index += 1;
      if (!current?.listingKey) continue;
      try {
        await syncMediaForListing(
          current.listingKey,
          current.id,
          options.stats,
        );
      } catch (err) {
        options.stats.errors.push(
          `media backfill ${current.mlsNumber}: ${err instanceof Error ? err.message : "failed"}`,
        );
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, listings.length) }, () =>
      worker(),
    ),
  );
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
    maxListings: Math.max(options.maxPages * 50, 200),
    stats: options.stats,
    concurrency: 6,
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
 * Pull PropTx VOW feed into Postgres. Safe to re-run (idempotent upserts).
 */
export async function runPropTxMlsSync(options?: {
  maxPages?: number;
  fullBackfillDays?: number;
  resources?: Array<
    "property" | "media" | "rooms" | "openHouse" | "history"
  >;
  /** Media gap-fill only (skip slow global Media feed). */
  mediaBackfillOnly?: boolean;
}): Promise<MlsSyncResult> {
  const config = getPropTxConfig();
  if (!config) {
    return {
      ok: false,
      message:
        "PropTx credentials missing. Set PROPTX_ENDPOINT_URL, PROPTX_BEARER_TOKEN, PROPTX_TOKEN_ID.",
      stats: emptyStats(),
      runId: "",
    };
  }

  const maxPages = options?.maxPages ?? 20;
  const fullBackfillDays = options?.fullBackfillDays ?? 45;
  const resources = options?.resources ?? [
    "property",
    "media",
    "rooms",
    "openHouse",
    // HistoryTransactional is not on all AMPRE feeds (VOW may omit it).
  ];

  const run = await prisma.mlsSyncRun.create({
    data: {
      resource: "all",
      status: "running",
      message: `VOW sync starting (${config.feed})`,
    },
  });

  const stats = emptyStats();

  try {
    if (resources.includes("property")) {
      await syncProperties({ maxPages, fullBackfillDays, stats });
    }
    if (resources.includes("media")) {
      try {
        await syncMedia({
          maxPages,
          fullBackfillDays,
          stats,
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

    const message = `Synced properties=${stats.propertyUpserted} media=${stats.mediaUpserted} rooms=${stats.roomsUpserted} openHouses=${stats.openHousesUpserted} history=${stats.historyUpserted} skipped=${stats.propertySkipped}`;
    await prisma.mlsSyncRun.update({
      where: { id: run.id },
      data: {
        status: "ok",
        finishedAt: new Date(),
        message,
        stats,
      },
    });

    return { ok: true, message, stats, runId: run.id };
  } catch (err) {
    const message =
      err instanceof PropTxError
        ? err.message
        : err instanceof Error
          ? err.message
          : "MLS sync failed";
    stats.errors.push(message);
    await prisma.mlsSyncRun.update({
      where: { id: run.id },
      data: {
        status: "error",
        finishedAt: new Date(),
        message,
        stats,
      },
    });

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
