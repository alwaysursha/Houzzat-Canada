/**
 * Pre-deploy consistency audit for SALE/LEASE status labels + Neon↔Typesense.
 * Usage: pnpm exec tsx scripts/audit-status-consistency.ts
 * Optional: --backfill to remap PropTx conditionals into Neon + Typesense heal.
 */
import { config } from "dotenv";
import { assertMlsSyncExecutionHost } from "../src/lib/proptx/mls-sync-host";
config({ path: ".env.local" });
config({ path: ".env" });

const DO_BACKFILL = process.argv.includes("--backfill");

async function main() {
  assertMlsSyncExecutionHost();
  const { prisma } = await import("../src/lib/prisma");
  const { listingStatusLabel } = await import("../src/lib/listings/constants");
  const { mapListingStatus, mapTransactionType } = await import(
    "../src/lib/proptx/map-listing"
  );
  const { getPropTxSyncConfig } = await import("../src/lib/proptx/config");
  const { proptxJson } = await import("../src/lib/proptx/client");
  const {
    getTypesenseSearchClient,
    getTypesenseCollectionName,
  } = await import("../src/lib/typesense/client");
  const { syncListingToTypesense } = await import(
    "../src/lib/typesense/sync-listing"
  );

  const cfg = getPropTxSyncConfig();
  if (!cfg) throw new Error("PropTx sync config missing");

  const buckets = [
    { key: "ACTIVE_SALE", status: "ACTIVE", txn: "SALE" },
    { key: "ACTIVE_LEASE", status: "ACTIVE", txn: "LEASE" },
    { key: "COND_SALE", status: "SOLD_CONDITIONAL", txn: "SALE" },
    { key: "COND_LEASE", status: "SOLD_CONDITIONAL", txn: "LEASE" },
    { key: "SOLD", status: "SOLD", txn: "SALE" },
    { key: "LEASED", status: "LEASED", txn: "LEASE" },
  ] as const;

  type Sample = {
    key: string;
    id: string;
    mlsNumber: string;
    status: string;
    transactionType: string;
    addressLine: string;
    city: string;
  };

  const samples: Sample[] = [];
  for (const b of buckets) {
    const row = await prisma.listing.findFirst({
      where: {
        isMock: false,
        status: b.status,
        transactionType: b.txn,
        mlsNumber: { not: { startsWith: "PC-" } },
      },
      orderBy: { updatedAtMls: "desc" },
      select: {
        id: true,
        mlsNumber: true,
        status: true,
        transactionType: true,
        addressLine: true,
        city: true,
      },
    });
    if (row) {
      samples.push({ key: b.key, ...row });
    } else {
      console.log(`MISSING_NEON_SAMPLE ${b.key}`);
    }
  }

  const ts = getTypesenseSearchClient();
  const collection = getTypesenseCollectionName();

  console.log("\n=== Neon samples vs Typesense vs expected label ===");
  for (const s of samples) {
    let tsDoc: Record<string, unknown> | null = null;
    try {
      const result = await ts.collections(collection).documents().search({
        q: "*",
        query_by: "mlsNumber",
        filter_by: `mlsNumber:=${s.mlsNumber}`,
        per_page: 1,
      });
      tsDoc =
        ((result.hits?.[0]?.document as Record<string, unknown> | undefined) ??
          null);
    } catch {
      tsDoc = null;
    }
    const expected = listingStatusLabel(
      s.status as "ACTIVE",
      s.transactionType as "SALE",
    );
    console.log({
      bucket: s.key,
      mls: s.mlsNumber,
      address: `${s.addressLine}, ${s.city}`,
      neon: { status: s.status, txn: s.transactionType },
      typesense: tsDoc
        ? { status: tsDoc.status, txn: tsDoc.transactionType }
        : null,
      expectedLabel: expected,
      statusMatch: tsDoc ? tsDoc.status === s.status : false,
      txnMatch: tsDoc ? tsDoc.transactionType === s.transactionType : false,
    });
  }

  // PropTx: find real conditionals and compare to Neon
  console.log("\n=== PropTx conditional inventory samples ===");
  const proptxFilters = [
    {
      name: "sold_conditional_mls",
      filter: "startswith(MlsStatus,'Sold Conditional')",
    },
    {
      name: "leased_conditional_mls",
      filter: "startswith(MlsStatus,'Leased Conditional')",
    },
    {
      name: "active_under_contract",
      filter: "StandardStatus eq 'Active Under Contract'",
    },
  ];

  type Mismatch = {
    mlsNumber: string;
    id: string;
    neonStatus: string;
    neonTxn: string;
    mappedStatus: string;
    mappedTxn: string;
    mlsStatus: string;
    standardStatus: string;
    transactionTypeRaw: string;
  };
  const mismatches: Mismatch[] = [];
  const alreadyOk: string[] = [];

  for (const pf of proptxFilters) {
    const path =
      `Property?$select=ListingKey,MlsStatus,StandardStatus,TransactionType,UnparsedAddress,City` +
      `&$filter=${encodeURIComponent(pf.filter)}&$top=100&$count=true`;
    try {
      const data = (await proptxJson(path, cfg)) as {
        value?: Record<string, unknown>[];
        "@odata.count"?: number;
      };
      const rows = data.value ?? [];
      console.log(
        pf.name,
        "odata.count=",
        data["@odata.count"] ?? "n/a",
        "fetched=",
        rows.length,
      );

      for (const row of rows) {
        const mls = String(row.ListingKey ?? "").trim();
        if (!mls) continue;
        const mappedTxn = mapTransactionType(row);
        const mappedStatus = mapListingStatus(row, mappedTxn);
        const neon = await prisma.listing.findFirst({
          where: { mlsNumber: mls, isMock: false },
          select: {
            id: true,
            status: true,
            transactionType: true,
          },
        });
        if (!neon) continue;
        if (
          neon.status === mappedStatus &&
          neon.transactionType === mappedTxn
        ) {
          alreadyOk.push(mls);
          continue;
        }
        if (mappedStatus === "SOLD_CONDITIONAL") {
          mismatches.push({
            mlsNumber: mls,
            id: neon.id,
            neonStatus: neon.status,
            neonTxn: neon.transactionType,
            mappedStatus,
            mappedTxn,
            mlsStatus: String(row.MlsStatus ?? ""),
            standardStatus: String(row.StandardStatus ?? ""),
            transactionTypeRaw: String(row.TransactionType ?? ""),
          });
        }
      }
    } catch (e) {
      console.log(
        "PROPTX_ERR",
        pf.name,
        e instanceof Error ? e.message.slice(0, 240) : e,
      );
    }
  }

  const uniqueMismatches = [
    ...new Map(mismatches.map((m) => [m.mlsNumber, m])).values(),
  ];
  console.log("\n=== Conditional mismatches (Neon != mapped) ===");
  console.log("already_ok", alreadyOk.length, "mismatches", uniqueMismatches.length);
  for (const m of uniqueMismatches.slice(0, 25)) {
    console.log(m);
  }

  // Filter membership checks in Typesense after heal
  async function filterHas(
    filter: string,
    mls: string,
  ): Promise<boolean> {
    const result = await ts.collections(collection).documents().search({
      q: "*",
      query_by: "mlsNumber",
      filter_by: `${filter} && mlsNumber:=${mls}`,
      per_page: 1,
    });
    return (result.found ?? 0) > 0;
  }

  if (DO_BACKFILL && uniqueMismatches.length > 0) {
    console.log("\n=== Backfill remap + Typesense heal ===");
    let updated = 0;
    let healed = 0;
    for (const m of uniqueMismatches) {
      await prisma.listing.update({
        where: { id: m.id },
        data: {
          status: m.mappedStatus as "SOLD_CONDITIONAL",
          transactionType: m.mappedTxn as "SALE" | "LEASE",
        },
      });
      updated += 1;
      const synced = await syncListingToTypesense(m.id);
      if (synced.ok) healed += 1;
    }
    console.log({ updated, healed });

    console.log("\n=== Post-heal filter checks ===");
    for (const m of uniqueMismatches.slice(0, 12)) {
      const neon = await prisma.listing.findUnique({
        where: { id: m.id },
        select: { status: true, transactionType: true, mlsNumber: true },
      });
      if (!neon) continue;
      let tsDoc: Record<string, unknown> | null = null;
      try {
        const result = await ts.collections(collection).documents().search({
          q: "*",
          query_by: "mlsNumber",
          filter_by: `mlsNumber:=${neon.mlsNumber}`,
          per_page: 1,
        });
        tsDoc =
          ((result.hits?.[0]?.document as Record<string, unknown> | undefined) ??
            null);
      } catch {
        tsDoc = null;
      }
      const onMarketSale =
        neon.transactionType === "SALE"
          ? await filterHas(
              "transactionType:=SALE && status:=[ACTIVE,SOLD_CONDITIONAL]",
              neon.mlsNumber,
            )
          : null;
      const onMarketLease =
        neon.transactionType === "LEASE"
          ? await filterHas(
              "transactionType:=LEASE && status:=[ACTIVE,SOLD_CONDITIONAL]",
              neon.mlsNumber,
            )
          : null;
      const activeOnly = await filterHas(
        `transactionType:=${neon.transactionType} && status:=ACTIVE`,
        neon.mlsNumber,
      );
      console.log({
        mls: neon.mlsNumber,
        neon,
        typesense: tsDoc
          ? { status: tsDoc.status, txn: tsDoc.transactionType }
          : null,
        inOnMarketSale: onMarketSale,
        inOnMarketLease: onMarketLease,
        inActiveOnly: activeOnly,
        label: listingStatusLabel(
          neon.status as "ACTIVE",
          neon.transactionType as "SALE",
        ),
      });
    }
  } else if (!DO_BACKFILL) {
    console.log(
      "\n(Re-run with --backfill to remap mismatched conditionals + Typesense heal)",
    );
  }

  // Production API smoke (pre-deploy code may differ)
  console.log("\n=== Production autocomplete smoke (deployed code) ===");
  for (const s of samples.slice(0, 4)) {
    const q = encodeURIComponent(s.mlsNumber);
    const url = `https://houzzat.com/api/listings/autocomplete?q=${q}`;
    try {
      const res = await fetch(url);
      const json = (await res.json()) as {
        suggestions?: Array<{
          mlsNumber?: string;
          status?: string;
          transactionType?: string;
          label?: string;
        }>;
      };
      const hit = (json.suggestions ?? []).find(
        (x) => x.mlsNumber === s.mlsNumber,
      );
      console.log({
        mls: s.mlsNumber,
        http: res.status,
        hit: hit
          ? {
              status: hit.status,
              txn: hit.transactionType,
            }
          : null,
        localExpectedLabel: listingStatusLabel(
          s.status as "ACTIVE",
          s.transactionType as "SALE",
        ),
      });
    } catch (e) {
      console.log("fetch_err", s.mlsNumber, e);
    }
  }

  await prisma.$disconnect().catch(() => undefined);
}

main().catch(async (e) => {
  console.error(e);
  process.exitCode = 1;
});
