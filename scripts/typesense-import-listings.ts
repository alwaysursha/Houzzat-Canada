/**
 * One-time (or repeatable) bulk import: Neon listings → Typesense `listings`.
 *
 * Usage:
 *   pnpm typesense:import
 *   pnpm typesense:import 500          # batch size
 *   pnpm typesense:import 500 2000     # batch size + max listings (smoke test)
 */
import { config } from "dotenv";
import { assertMlsSyncExecutionHost } from "../src/lib/proptx/mls-sync-host";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  assertMlsSyncExecutionHost();
  const { prisma } = await import("../src/lib/prisma");
  const {
    getTypesenseAdminClient,
    getTypesenseCollectionName,
  } = await import("../src/lib/typesense/client");
  const { listingToTypesenseDocument } = await import(
    "../src/lib/typesense/listing-document"
  );
  const { gateMlsTypesenseDocument } = await import(
    "../src/lib/typesense/mls-write-gate"
  );

  const batchSize = Math.max(1, Number(process.argv[2] ?? 250));
  const maxListings = process.argv[3]
    ? Math.max(1, Number(process.argv[3]))
    : null;

  const client = getTypesenseAdminClient();
  const collection = getTypesenseCollectionName();

  const totalInDb = await prisma.listing.count({
    where: { isMock: false },
  });
  const target = maxListings == null ? totalInDb : Math.min(maxListings, totalInDb);

  console.log(
    `Typesense import → collection="${collection}" batch=${batchSize} target=${target} (db non-mock=${totalInDb})`,
  );

  let imported = 0;
  let failed = 0;
  let cursor: string | undefined;

  while (imported + failed < target) {
    const take = Math.min(batchSize, target - imported - failed);
    const rows = await prisma.listing.findMany({
      where: { isMock: false },
      orderBy: { id: "asc" },
      take,
      ...(cursor
        ? {
            skip: 1,
            cursor: { id: cursor },
          }
        : {}),
      select: {
        id: true,
        mlsNumber: true,
        addressLine: true,
        unitNumber: true,
        city: true,
        community: true,
        postalCode: true,
        province: true,
        status: true,
        segment: true,
        transactionType: true,
        propertyType: true,
        listPrice: true,
        soldPrice: true,
        beds: true,
        baths: true,
        sqft: true,
        parkingSpaces: true,
        listedAt: true,
        updatedAtMls: true,
        daysOnMarket: true,
        brokerageName: true,
        lat: true,
        lng: true,
        facts: true,
        dataSource: true,
        organizationId: true,
        providerKey: true,
        media: {
          select: { url: true, isPrimary: true, sortOrder: true },
          orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
          take: 1,
        },
        openHouses: {
          where: { endsAt: { gte: new Date() } },
          orderBy: { startsAt: "asc" },
          take: 8,
          select: { startsAt: true, endsAt: true },
        },
      },
    });

    if (rows.length === 0) break;
    cursor = rows[rows.length - 1]!.id;

    const documents = [];
    for (const row of rows) {
      const document = listingToTypesenseDocument(row);
      const gate = gateMlsTypesenseDocument({
        dataSource: row.dataSource,
        organizationId: row.organizationId,
        providerKey: row.providerKey,
        document,
      });
      if (!gate.allow) {
        failed += 1;
        console.error(
          "import skip MLS without provenance:",
          row.mlsNumber,
          gate.reason,
        );
        continue;
      }
      documents.push(document);
    }

    if (documents.length === 0) continue;

    const results = await client
      .collections(collection)
      .documents()
      .import(documents, { action: "emplace" });

    for (const result of results) {
      if (result.success) imported += 1;
      else {
        failed += 1;
        console.error("import fail:", result);
      }
    }

    console.log(`… progress imported=${imported} failed=${failed}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: failed === 0,
        collection,
        imported,
        failed,
        target,
      },
      null,
      2,
    ),
  );

  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
