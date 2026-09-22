import { prisma } from "@/lib/prisma";
import { isPropTxConfigured } from "@/lib/proptx/config";

const RESOURCE_PROPERTY = "Property";

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
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
        { message: { contains: "TYPESENSE INDEX NOT UPDATED" } },
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
        ? "No MLS rows yet. Browser GET only shows status. MLS sync runs on the Sync Mac."
        : undefined,
    lastRun: lastRun
      ? {
          id: lastRun.id,
          status: lastRun.status,
          startedAt: toIso(lastRun.startedAt) ?? "",
          finishedAt: toIso(lastRun.finishedAt),
          message: lastRun.message,
          stats: lastRun.stats,
          isSeedRun: Boolean(seedLike),
        }
      : null,
    lastPropTxRun: lastPropTxRun
      ? {
          id: lastPropTxRun.id,
          status: lastPropTxRun.status,
          startedAt: toIso(lastPropTxRun.startedAt) ?? "",
          finishedAt: toIso(lastPropTxRun.finishedAt),
          message: lastPropTxRun.message,
          stats: lastPropTxRun.stats,
        }
      : null,
    propertyCursor: cursor?.cursor ?? null,
  };
}

/** Lightweight pulse for Admin HQ — avoids the full MLS-sync module graph. */
export async function getAdminMlsPulse(): Promise<{
  provider: "proptx" | "mock";
  listingCount: number;
  message: string;
}> {
  const configured = isPropTxConfigured();
  const mlsCount = await prisma.listing.count({
    where: { dataSource: "mls", isMock: false },
  });
  const lastRun = await prisma.mlsSyncRun.findFirst({
    orderBy: { startedAt: "desc" },
    select: { status: true, message: true },
  });

  if (!configured) {
    return {
      provider: "proptx",
      listingCount: mlsCount,
      message: "PropTx credentials not configured.",
    };
  }

  if (mlsCount > 0) {
    let listingLabel: string;
    try {
      listingLabel = mlsCount.toLocaleString("en-CA");
    } catch {
      listingLabel = String(mlsCount);
    }
    return {
      provider: "proptx",
      listingCount: mlsCount,
      message: `Serving ${listingLabel} MLS listings from PropTx sync.`,
    };
  }

  return {
    provider: "proptx",
    listingCount: 0,
    message:
      lastRun?.status === "error"
        ? `PropTx sync error: ${lastRun.message ?? "unknown"}`
        : "PropTx configured. MLS sync runs on the Sync Mac.",
  };
}
