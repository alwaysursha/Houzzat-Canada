/**
 * Reclaim disk after media prune. Neon free tier needs VACUUM FULL
 * to shrink table files after large deletes.
 *
 * Usage: pnpm exec tsx scripts/vacuum-listing-media.ts
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  console.log("Running VACUUM FULL ListingMedia…");
  await prisma.$executeRawUnsafe(`VACUUM (FULL, ANALYZE) "ListingMedia"`);
  console.log("VACUUM FULL done");

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
  const db = await prisma.$queryRawUnsafe<Array<{ db: string }>>(
    `SELECT pg_size_pretty(pg_database_size(current_database()))::text AS db`,
  );
  console.log({ sizes, db });
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
