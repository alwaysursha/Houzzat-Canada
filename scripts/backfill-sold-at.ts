/**
 * Backfill soldAt / soldPrice for SOLD|LEASED rows missing firm dates.
 * Uses VOW feed (IDX often 404s sold listings).
 *
 * Usage: pnpm exec tsx scripts/backfill-sold-at.ts [limit=200]
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { getPropTxVowConfig, getPropTxSyncConfig } = await import(
    "../src/lib/proptx/config"
  );
  const { proptxJson } = await import("../src/lib/proptx/client");
  const { mapPropertyToListingResult } = await import(
    "../src/lib/proptx/map-listing"
  );

  const limit = Math.max(1, Number(process.argv[2] ?? 200));
  const configFeed = getPropTxVowConfig() ?? getPropTxSyncConfig();
  if (!configFeed) {
    throw new Error("Missing PropTx credentials (need VOW Token for sold dates)");
  }
  console.log(`Using feed=${configFeed.feed} to backfill up to ${limit} solds…`);

  const rows = await prisma.listing.findMany({
    where: {
      dataSource: "mls",
      isMock: false,
      status: { in: ["SOLD", "LEASED"] },
      OR: [{ soldAt: null }, { soldPrice: null }],
    },
    select: {
      id: true,
      mlsNumber: true,
      listingKey: true,
      status: true,
      updatedAtMls: true,
    },
    take: limit,
    orderBy: [{ updatedAtMls: "desc" }, { listedAt: "desc" }],
  });

  let ok = 0;
  let miss = 0;
  let err = 0;
  const concurrency = 5;
  let index = 0;

  async function worker() {
    while (index < rows.length) {
      const row = rows[index]!;
      index += 1;
      const key = row.listingKey || row.mlsNumber;
      try {
        const raw = await proptxJson<Record<string, unknown>>(
          `Property('${key.replace(/'/g, "''")}')`,
          configFeed,
        );
        const mapped = mapPropertyToListingResult(raw);
        if (!mapped.ok) {
          miss += 1;
          continue;
        }
        const soldAt = mapped.data.soldAt ?? null;
        const soldPrice = mapped.data.soldPrice ?? null;
        if (!soldAt && soldPrice == null) {
          miss += 1;
          continue;
        }
        await prisma.listing.update({
          where: { id: row.id },
          data: {
            ...(soldAt ? { soldAt } : {}),
            ...(soldPrice != null ? { soldPrice } : {}),
          },
        });
        ok += 1;
        if (ok <= 10 || ok % 25 === 0) {
          const soldLabel =
            soldAt instanceof Date
              ? soldAt.toISOString().slice(0, 10)
              : soldAt
                ? String(soldAt).slice(0, 10)
                : "—";
          console.log("ok", row.mlsNumber, soldLabel, soldPrice ?? "—");
        }
      } catch (e) {
        err += 1;
        if (err <= 8) {
          console.log(
            "err",
            row.mlsNumber,
            e instanceof Error ? e.message.slice(0, 100) : e,
          );
        }
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, rows.length || 1) }, () =>
      worker(),
    ),
  );

  const remaining = await prisma.listing.count({
    where: {
      dataSource: "mls",
      isMock: false,
      status: { in: ["SOLD", "LEASED"] },
      soldAt: null,
    },
  });

  console.log(JSON.stringify({ ok, miss, err, remaining, processed: rows.length }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
