/**
 * Backfill Typesense listing provenance from Neon
 * (organizationId, providerKey, sourceAuthorityKey).
 *
 * Usage:
 *   pnpm typesense:provenance-backfill
 *   pnpm typesense:provenance-backfill 250           # batch size
 *   pnpm typesense:provenance-backfill 250 7         # only listedAt last N days
 *   pnpm typesense:provenance-backfill 250 0 5000    # batch, all days, max rows
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

async function main() {
  process.env.TYPESENSE_SYNC = "1";

  const batchSize = Math.max(1, Number(process.argv[2] ?? 250));
  const sinceDaysRaw = process.argv[3];
  const sinceDays =
    sinceDaysRaw == null || sinceDaysRaw === ""
      ? null
      : Math.max(0, Number(sinceDaysRaw));
  const maxRows = process.argv[4]
    ? Math.max(1, Number(process.argv[4]))
    : null;

  const { backfillTypesenseListingProvenance } = await import(
    "../src/lib/typesense/backfill-provenance"
  );
  const { prisma } = await import("../src/lib/prisma");

  console.log(
    `Typesense provenance backfill batch=${batchSize}${sinceDays ? ` sinceDays=${sinceDays}` : " all attributable"}${maxRows ? ` max=${maxRows}` : ""}`,
  );

  const result = await backfillTypesenseListingProvenance({
    batchSize,
    sinceDays,
    maxRows,
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
