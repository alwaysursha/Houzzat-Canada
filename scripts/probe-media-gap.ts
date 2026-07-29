/**
 * Diagnose missing MLS photos + Neon size.
 * Usage: pnpm exec tsx scripts/probe-media-gap.ts
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const {
    getPropTxIdxConfig,
    getPropTxVowConfig,
    getPropTxSyncConfig,
  } = await import("../src/lib/proptx/config");
  const { proptxJson } = await import("../src/lib/proptx/client");
  const { mapMediaRow } = await import("../src/lib/proptx/map-listing");

  const idx = getPropTxIdxConfig();
  const vow = getPropTxVowConfig();
  const sync = getPropTxSyncConfig();
  console.log({
    idx: Boolean(idx),
    vow: Boolean(vow),
    syncFeed: sync?.feed ?? null,
    tokenSuffix: sync?.tokenId?.slice(-4) ?? null,
  });

  const withPhotos = await prisma.listing.count({
    where: { dataSource: "mls", isMock: false, media: { some: {} } },
  });
  const noPhotos = await prisma.listing.count({
    where: { dataSource: "mls", isMock: false, media: { none: {} } },
  });
  const mediaRows = await prisma.listingMedia.count();
  console.log({ withPhotos, noPhotos, mediaRows });

  const sizes = await prisma.$queryRawUnsafe<
    Array<{ table: string; total: string; bytes: string }>
  >(`
    SELECT relname::text AS table,
           pg_size_pretty(pg_total_relation_size(c.oid))::text AS total,
           pg_total_relation_size(c.oid)::text AS bytes
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY pg_total_relation_size(c.oid) DESC
    LIMIT 15
  `);
  console.log(
    "top tables:",
    sizes.map((r) => ({ table: r.table, total: r.total })),
  );

  const missing = await prisma.listing.findMany({
    where: {
      dataSource: "mls",
      isMock: false,
      listingKey: { not: null },
      media: { none: {} },
    },
    select: {
      mlsNumber: true,
      listingKey: true,
      status: true,
      city: true,
    },
    take: 3,
    orderBy: { listedAt: "desc" },
  });
  console.log("sample missing:", missing);

  const key = missing[0]?.listingKey;
  if (!key) {
    await prisma.$disconnect();
    return;
  }

  const keyLit = `'${key.replace(/'/g, "''")}'`;
  for (const feed of [idx, vow].filter(Boolean)) {
    if (!feed) continue;
    try {
      const filter = `ResourceRecordKey eq ${keyLit}`;
      const path = `Media?$filter=${encodeURIComponent(filter)}&$top=5`;
      const data = (await proptxJson(path, feed)) as {
        value?: Record<string, unknown>[];
      };
      const rows = data.value ?? [];
      console.log(`feed=${feed.feed} key=${key} mediaRows=${rows.length}`);
      if (rows[0]) {
        console.log("sample keys", Object.keys(rows[0]));
        console.log("mapped", mapMediaRow(rows[0]));
        console.log({
          MediaURL: rows[0].MediaURL,
          MediaType: rows[0].MediaType,
          ImageSizeDescription: rows[0].ImageSizeDescription,
          ResourceName: rows[0].ResourceName,
        });
      }
    } catch (e) {
      const err = e as { message?: string; status?: number; body?: string };
      console.log(
        `feed=${feed.feed} ERROR`,
        err.message,
        err.status,
        String(err.body ?? "").slice(0, 400),
      );
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
