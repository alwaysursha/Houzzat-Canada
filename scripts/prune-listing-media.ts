/**
 * Free Neon space by capping photos per listing.
 * Long AMPRE MediaURLs inflate ListingMedia (~308MB / 548k rows).
 *
 * Usage: pnpm exec tsx scripts/prune-listing-media.ts [maxPerListing=1]
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const maxKeep = Math.max(1, Number(process.argv[2] ?? 1));
  const { prisma } = await import("../src/lib/prisma");

  const before = await prisma.listingMedia.count();
  console.log(`ListingMedia before: ${before.toLocaleString("en-CA")} (keep ≤${maxKeep}/listing)`);

  // Delete extras in batches via SQL — keep lowest sortOrder, prefer primary.
  const result = await prisma.$executeRawUnsafe(`
    WITH ranked AS (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY "listingId"
               ORDER BY "isPrimary" DESC, "sortOrder" ASC, id ASC
             ) AS rn
      FROM "ListingMedia"
    )
    DELETE FROM "ListingMedia"
    WHERE id IN (SELECT id FROM ranked WHERE rn > ${maxKeep})
  `);

  const after = await prisma.listingMedia.count();
  console.log(`Deleted batch result code: ${result}`);
  console.log(`ListingMedia after: ${after.toLocaleString("en-CA")} (removed ${(before - after).toLocaleString("en-CA")})`);

  try {
    await prisma.$executeRawUnsafe(`VACUUM (ANALYZE) "ListingMedia"`);
    console.log("VACUUM ANALYZE ListingMedia done");
  } catch (err) {
    console.log(
      "VACUUM skipped/failed:",
      err instanceof Error ? err.message : err,
    );
  }

  const sizes = await prisma.$queryRawUnsafe<
    Array<{ table: string; total: string }>
  >(`
    SELECT relname::text AS table,
           pg_size_pretty(pg_total_relation_size(c.oid))::text AS total
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND relname IN ('ListingMedia', 'Listing', 'ListingHistory')
    ORDER BY pg_total_relation_size(c.oid) DESC
  `);
  console.log("sizes:", sizes);

  const db = await prisma.$queryRawUnsafe<Array<{ db: string }>>(
    `SELECT pg_size_pretty(pg_database_size(current_database()))::text AS db`,
  );
  console.log("database:", db);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
