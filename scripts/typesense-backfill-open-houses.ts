/**
 * Backfill open-house fields on Typesense docs for listings with upcoming OHs.
 * Usage: pnpm exec tsx scripts/typesense-backfill-open-houses.ts
 */
import { config } from "dotenv";
import { assertMlsSyncExecutionHost } from "../src/lib/proptx/mls-sync-host";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  assertMlsSyncExecutionHost();
  process.env.TYPESENSE_SYNC = "1";
  const { prisma } = await import("../src/lib/prisma");
  const { syncListingToTypesense } = await import(
    "../src/lib/typesense/sync-listing"
  );

  const now = new Date();
  const listingIds = await prisma.openHouse.findMany({
    where: { endsAt: { gte: now } },
    select: { listingId: true },
    distinct: ["listingId"],
  });

  console.log(`Backfilling Typesense open houses for ${listingIds.length} listings…`);
  let ok = 0;
  let fail = 0;
  for (const row of listingIds) {
    const synced = await syncListingToTypesense(row.listingId);
    if (synced.ok) ok += 1;
    else fail += 1;
    if ((ok + fail) % 50 === 0) {
      console.log(`… progress ok=${ok} fail=${fail}`);
    }
  }

  console.log(JSON.stringify({ ok: fail === 0, synced: ok, failed: fail }, null, 2));
  if (fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
