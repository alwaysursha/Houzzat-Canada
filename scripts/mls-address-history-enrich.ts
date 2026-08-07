/**
 * Batch enrich listing addresses with all PropTx Property cycles (siblings).
 *
 *   pnpm mls:address-history
 *   pnpm mls:address-history 200
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config();

async function main() {
  const limitRaw = process.argv[2];
  const limit = Math.max(
    1,
    Math.min(Number(limitRaw) || Number(process.env.MLS_ADDRESS_HISTORY_LIMIT) || 300, 800),
  );

  const { prisma } = await import("../src/lib/prisma");
  const {
    ADDRESS_HISTORY_ENRICH_TTL_MS,
    enrichAddressListingHistory,
  } = await import("../src/lib/proptx/address-history-enrich");

  const staleBefore = new Date(Date.now() - ADDRESS_HISTORY_ENRICH_TTL_MS);

  const listings = await prisma.listing.findMany({
    where: {
      dataSource: { not: "mock" },
      OR: [
        { addressHistoryEnrichedAt: null },
        { addressHistoryEnrichedAt: { lt: staleBefore } },
      ],
    },
    orderBy: [{ updatedAtMls: "desc" }, { listedAt: "desc" }],
    take: limit,
    select: {
      mlsNumber: true,
      addressLine: true,
      unitNumber: true,
      city: true,
      province: true,
      postalCode: true,
      listPrice: true,
      listedAt: true,
      updatedAtMls: true,
      soldAt: true,
      soldPrice: true,
      status: true,
      transactionType: true,
      addressHistoryEnrichedAt: true,
      history: { orderBy: { contractDate: "desc" } },
    },
  });

  console.log(`Enriching ${listings.length} listings (limit=${limit})`);

  let ok = 0;
  let skipped = 0;
  let failed = 0;
  let upserted = 0;

  for (const listing of listings) {
    const result = await enrichAddressListingHistory(listing, { force: true });
    if (!result.ok) {
      failed += 1;
      console.log("fail", listing.mlsNumber);
      continue;
    }
    if (result.skipped) {
      skipped += 1;
    } else {
      ok += 1;
      upserted += result.upsertedMls.length;
      console.log(
        "ok",
        listing.mlsNumber,
        `siblings+self=${result.upsertedMls.length}`,
      );
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log(JSON.stringify({ checked: listings.length, ok, skipped, failed, upserted }));
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
