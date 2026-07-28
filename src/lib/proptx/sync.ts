import { prisma } from "@/lib/prisma";
import { getPropTxConfig, isPropTxConfigured } from "@/lib/proptx/config";
import { PropTxError, proptxPages } from "@/lib/proptx/client";
import {
  mapHistoryRow,
  mapMediaRow,
  mapOpenHouseRow,
  mapPropertyToListingResult,
  toODataDate,
  type PropTxProperty,
} from "@/lib/proptx/map-listing";

export type MlsSyncStats = {
  propertyUpserted: number;
  propertySkipped: number;
  mediaUpserted: number;
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
    where: { listingKey },
    select: { id: true },
  });
  if (!row) return null;
  cache.set(listingKey, row.id);
  return row.id;
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
      const data = mapped.data;
      try {
        await prisma.listing.upsert({
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
            listedAt: data.listedAt,
            soldAt: data.soldAt,
            updatedAtMls: data.updatedAtMls,
            daysOnMarket: data.daysOnMarket,
            isMock: false,
          },
        });
        options.stats.propertyUpserted += 1;

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

async function syncMedia(options: {
  maxPages: number;
  fullBackfillDays: number;
  stats: MlsSyncStats;
}): Promise<void> {
  const since = await getCursor(RESOURCE_MEDIA);
  const filter = propertyFilter(since, options.fullBackfillDays);
  const path = `Media?$filter=${encodeURIComponent(filter)}&$orderby=${encodeURIComponent("ModificationTimestamp asc")}&$top=200`;
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
        options.stats.mediaUpserted += 1;
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
  resources?: Array<"property" | "media" | "openHouse" | "history">;
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
    "openHouse",
    // HistoryTransactional on AMPRE often rejects broad ModificationTimestamp filters.
    // Sync history in a later pass keyed by ListingKey once inventory is loaded.
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
        await syncMedia({ maxPages, fullBackfillDays, stats });
      } catch (err) {
        stats.errors.push(
          `Media resource: ${err instanceof Error ? err.message : "unavailable"}`,
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
        await syncHistory({ maxPages, fullBackfillDays, stats });
      } catch (err) {
        stats.errors.push(
          `HistoryTransactional resource: ${err instanceof Error ? err.message : "unavailable"}`,
        );
      }
    }

    const message = `Synced properties=${stats.propertyUpserted} media=${stats.mediaUpserted} openHouses=${stats.openHousesUpserted} history=${stats.historyUpserted} skipped=${stats.propertySkipped}`;
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
        ? `${err.message}${err.body ? ` — ${err.body.slice(0, 400)}` : ""}`
        : err instanceof Error
          ? err.message
          : "Sync failed";

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
