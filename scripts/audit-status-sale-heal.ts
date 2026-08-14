/**
 * Follow-up: sale-conditional sample + heal known drift cases.
 * Usage: pnpm exec tsx scripts/audit-status-sale-heal.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { getPropTxSyncConfig } = await import("../src/lib/proptx/config");
  const { proptxJson } = await import("../src/lib/proptx/client");
  const { mapListingStatus, mapTransactionType } = await import(
    "../src/lib/proptx/map-listing"
  );
  const { syncListingToTypesense } = await import(
    "../src/lib/typesense/sync-listing"
  );
  const {
    getTypesenseSearchClient,
    getTypesenseCollectionName,
  } = await import("../src/lib/typesense/client");
  const { listingStatusLabel } = await import("../src/lib/listings/constants");

  const cfg = getPropTxSyncConfig();
  if (!cfg) throw new Error("missing proptx");

  const path =
    "Property?$select=ListingKey,MlsStatus,StandardStatus,TransactionType&$filter=" +
    encodeURIComponent("startswith(MlsStatus,'Sold Conditional')") +
    "&$top=50";
  const data = (await proptxJson(path, cfg)) as {
    value: Record<string, unknown>[];
  };

  let missing = 0;
  let mismatch = 0;
  let ok = 0;
  const toFix: Array<{
    id: string;
    mls: string;
    mapped: string;
    txn: "SALE" | "LEASE";
    neon: string;
  }> = [];

  for (const row of data.value) {
    const mls = String(row.ListingKey);
    const mappedTxn = mapTransactionType(row);
    const mappedStatus = mapListingStatus(row, mappedTxn);
    const neon = await prisma.listing.findFirst({
      where: { mlsNumber: mls, isMock: false },
      select: { id: true, status: true, transactionType: true },
    });
    if (!neon) {
      missing += 1;
      continue;
    }
    if (neon.status === mappedStatus && neon.transactionType === mappedTxn) {
      ok += 1;
      continue;
    }
    mismatch += 1;
    toFix.push({
      id: neon.id,
      mls,
      mapped: mappedStatus,
      txn: mappedTxn,
      neon: `${neon.status}/${neon.transactionType}`,
    });
  }
  console.log({
    soldCondSample: data.value.length,
    missing,
    mismatch,
    ok,
    toFixPreview: toFix.slice(0, 20),
  });

  let updated = 0;
  let healed = 0;
  for (const f of toFix) {
    if (f.mapped !== "SOLD_CONDITIONAL") continue;
    await prisma.listing.update({
      where: { id: f.id },
      data: { status: "SOLD_CONDITIONAL", transactionType: f.txn },
    });
    updated += 1;
    if (await syncListingToTypesense(f.id)) healed += 1;
  }

  // Always heal known Rivertrail drift
  const river = await prisma.listing.findFirst({
    where: { mlsNumber: "X13585286" },
    select: { id: true, status: true, transactionType: true },
  });
  if (river) {
    const okHeal = await syncListingToTypesense(river.id);
    console.log({ healRivertrail: river, okHeal });
  }

  console.log({ saleSampleUpdated: updated, saleSampleHealed: healed });

  const ts = getTypesenseSearchClient();
  const collection = getTypesenseCollectionName();
  const checks = [
    "X13585286",
    "N12748080",
    "X13670588",
    "C13674960",
    "E13557516",
    "C13617594",
  ];
  for (const mls of checks) {
    const neon = await prisma.listing.findFirst({
      where: { mlsNumber: mls },
      select: { status: true, transactionType: true },
    });
    const r = await ts.collections(collection).documents().search({
      q: "*",
      query_by: "mlsNumber",
      filter_by: `mlsNumber:=${mls}`,
      per_page: 1,
    });
    const doc = r.hits?.[0]?.document as
      | { status?: string; transactionType?: string }
      | undefined;
    const onMarket = await ts.collections(collection).documents().search({
      q: "*",
      query_by: "mlsNumber",
      filter_by: `mlsNumber:=${mls} && status:=[ACTIVE,SOLD_CONDITIONAL] && transactionType:=${neon?.transactionType}`,
      per_page: 1,
    });
    const activeOnly = await ts.collections(collection).documents().search({
      q: "*",
      query_by: "mlsNumber",
      filter_by: `mlsNumber:=${mls} && status:=ACTIVE && transactionType:=${neon?.transactionType}`,
      per_page: 1,
    });
    console.log({
      mls,
      neon,
      ts: doc ? { status: doc.status, txn: doc.transactionType } : null,
      label: neon
        ? listingStatusLabel(neon.status, neon.transactionType)
        : null,
      inOnMarket: (onMarket.found ?? 0) > 0,
      inActiveOnly: (activeOnly.found ?? 0) > 0,
    });
  }

  const condCounts = await prisma.listing.groupBy({
    by: ["status", "transactionType"],
    where: { isMock: false, status: "SOLD_CONDITIONAL" },
    _count: true,
  });
  console.log({ neonSoldConditional: condCounts });
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
