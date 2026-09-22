import { prisma } from "@/lib/prisma";
import { toMlsHealthRun, typesenseRetryCount } from "@/lib/mls-health/parse-run";
import type {
  MlsHealthSampleState,
  MlsHealthSampleUpdate,
  MlsHealthSnapshot,
  StoredMlsHealthIncident,
} from "@/lib/mls-health/types";

const SAMPLE_ID = "current";
const PROPERTY_CURSOR = "Property";
const DISCOVER_CURSOR = "OnMarketDiscover";
const ROTATE_CURSOR = "OnMarketRotate";
const RETRY_CURSOR = "OnMarketTypesenseRetry";

const EMPTY_SAMPLE: MlsHealthSampleState = {
  zeroPhotoBaseline: null,
  zeroPhotoElevatedStreak: 0,
  reconcileRetryCount: null,
  reconcileRetryHighSince: null,
};

function iso(value: Date | null | undefined): string | null {
  if (!value) return null;
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

/**
 * Reads MLS run state, cursors, and the ACTIVE zero-photo count.
 * Does not call PropTx or start a sync.
 */
export async function loadMlsHealthSnapshot(now: Date): Promise<MlsHealthSnapshot> {
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [running, fast, full, media, cursors, zeroRows, maxRows, sample] = await Promise.all([
    prisma.mlsSyncRun.findMany({
      where: { status: "running" },
      orderBy: { startedAt: "desc" },
      take: 10,
    }),
    prisma.mlsSyncRun.findMany({
      where: { resource: "fast", status: { not: "running" } },
      orderBy: { finishedAt: "desc" },
      take: 20,
    }),
    prisma.mlsSyncRun.findMany({
      where: { resource: "all", startedAt: { gte: since } },
      orderBy: { startedAt: "desc" },
      take: 200,
    }),
    prisma.mlsSyncRun.findMany({
      where: { resource: "media", status: { not: "running" } },
      orderBy: { finishedAt: "desc" },
      take: 10,
    }),
    prisma.mlsSyncCursor.findMany({
      where: {
        resource: { in: [PROPERTY_CURSOR, DISCOVER_CURSOR, ROTATE_CURSOR, RETRY_CURSOR] },
      },
    }),
    prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM "Listing" l
      WHERE l."dataSource" = 'mls'
        AND l."isMock" = false
        AND l.status = 'ACTIVE'::"ListingStatus"
        AND NOT EXISTS (
          SELECT 1 FROM "ListingMedia" m WHERE m."listingId" = l.id
        )
    `,
    prisma.$queryRaw<Array<{ max: Date | null }>>`
      SELECT MAX(l."updatedAtMls") AS max
      FROM "Listing" l
      WHERE l."dataSource" = 'mls'
        AND l."isMock" = false
    `,
    prisma.mlsHealthSample.findUnique({ where: { id: SAMPLE_ID } }),
  ]);

  const byId = new Map<string, (typeof running)[number]>();
  for (const row of [...running, ...fast, ...full, ...media]) byId.set(row.id, row);
  const cursorByResource = new Map(cursors.map((row) => [row.resource, row]));
  const property = cursorByResource.get(PROPERTY_CURSOR);
  const sampleState: MlsHealthSampleState = sample
    ? {
        zeroPhotoBaseline: sample.zeroPhotoBaseline,
        zeroPhotoElevatedStreak: sample.zeroPhotoElevatedStreak,
        reconcileRetryCount: sample.reconcileRetryCount,
        reconcileRetryHighSince: iso(sample.reconcileRetryHighSince),
      }
    : EMPTY_SAMPLE;

  return {
    now: now.toISOString(),
    runs: [...byId.values()].map((row) => toMlsHealthRun(row)),
    propertyCursor: {
      cursor: property?.cursor ?? null,
      updatedAt: iso(property?.updatedAt),
    },
    maxUpdatedAtMls: iso(maxRows[0]?.max ?? null),
    discoverCursorUpdatedAt: iso(cursorByResource.get(DISCOVER_CURSOR)?.updatedAt),
    rotateCursorUpdatedAt: iso(cursorByResource.get(ROTATE_CURSOR)?.updatedAt),
    typesenseRetryCount: typesenseRetryCount(cursorByResource.get(RETRY_CURSOR)?.cursor),
    activeZeroPhotos: Number(zeroRows[0]?.count ?? 0),
    sample: sampleState,
  };
}

export async function loadMlsHealthIncidents(): Promise<StoredMlsHealthIncident[]> {
  const rows = await prisma.mlsHealthIncident.findMany();
  return rows.map((row) => ({
    signal: row.signal as StoredMlsHealthIncident["signal"],
    severity: row.severity === "critical" ? "critical" : "warning",
    state: row.state === "open" ? "open" : "recovered",
    openedAt: row.openedAt.toISOString(),
    recoveredAt: iso(row.recoveredAt),
    lastObservedAt: row.lastObservedAt.toISOString(),
    notifiedAt: iso(row.notifiedAt),
    reminded: row.reminded,
    summary: row.summary,
    detail: asDetail(row.detail),
  }));
}

function asDetail(value: unknown): StoredMlsHealthIncident["detail"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const detail: StoredMlsHealthIncident["detail"] = {};
  for (const [key, item] of Object.entries(value)) {
    if (
      item == null ||
      typeof item === "string" ||
      typeof item === "number" ||
      typeof item === "boolean"
    ) {
      detail[key] = item;
    }
  }
  return detail;
}

export async function persistMlsHealth(input: {
  incidents: StoredMlsHealthIncident[];
  sample: MlsHealthSampleUpdate;
  now: Date;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.mlsHealthSample.upsert({
      where: { id: SAMPLE_ID },
      create: {
        id: SAMPLE_ID,
        evaluatedAt: input.now,
        activeZeroPhotos: input.sample.activeZeroPhotos,
        zeroPhotoBaseline: input.sample.zeroPhotoBaseline,
        zeroPhotoElevatedStreak: input.sample.zeroPhotoElevatedStreak,
        reconcileRetryCount: input.sample.reconcileRetryCount,
        reconcileRetryHighSince: input.sample.reconcileRetryHighSince
          ? new Date(input.sample.reconcileRetryHighSince)
          : null,
      },
      update: {
        evaluatedAt: input.now,
        activeZeroPhotos: input.sample.activeZeroPhotos,
        zeroPhotoBaseline: input.sample.zeroPhotoBaseline,
        zeroPhotoElevatedStreak: input.sample.zeroPhotoElevatedStreak,
        reconcileRetryCount: input.sample.reconcileRetryCount,
        reconcileRetryHighSince: input.sample.reconcileRetryHighSince
          ? new Date(input.sample.reconcileRetryHighSince)
          : null,
      },
    });
    for (const incident of input.incidents) {
      const data = {
        severity: incident.severity,
        state: incident.state,
        openedAt: new Date(incident.openedAt),
        recoveredAt: incident.recoveredAt ? new Date(incident.recoveredAt) : null,
        lastObservedAt: new Date(incident.lastObservedAt),
        notifiedAt: incident.notifiedAt ? new Date(incident.notifiedAt) : null,
        reminded: incident.reminded,
        summary: incident.summary,
        detail: incident.detail,
      };
      await tx.mlsHealthIncident.upsert({
        where: { signal: incident.signal },
        create: { signal: incident.signal, ...data },
        update: data,
      });
    }
  });
}
