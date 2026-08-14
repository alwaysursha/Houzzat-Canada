/**
 * Paginated PropTx → Neon → Typesense backfill for conditional inventory.
 *
 * Uses upsertPropTxPropertiesOnDemand (normal mapper + Typesense sync).
 * Does not change status architecture (SOLD_CONDITIONAL + transactionType).
 *
 * Usage:
 *   pnpm exec tsx scripts/backfill-conditional-inventory.ts
 *   pnpm exec tsx scripts/backfill-conditional-inventory.ts --dry-run
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

const DRY_RUN = process.argv.includes("--dry-run");
const PAGE_SIZE = 50;
const UPSERT_CONCURRENCY = 2;
const PAGE_DELAY_MS = 350;
const MAX_PAGES_PER_FILTER = 200;
const MAX_FAILURES = 40;

type Counts = {
  propTxSeen: number;
  propTxCountHeader: number | null;
  missingNeon: number;
  wrongStatus: number;
  alreadyOk: number;
  upserted: number;
  typesenseHealed: number;
  skippedMap: number;
  failures: number;
  stoppedEarly: string | null;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isNeonSizeLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /project size limit/i.test(msg) ||
    /could not extend file/i.test(msg) ||
    /53100/.test(msg)
  );
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { getPropTxSyncConfig } = await import("../src/lib/proptx/config");
  const { proptxPages, proptxJson } = await import("../src/lib/proptx/client");
  const { mapMlsNumber, mapListingStatus, mapTransactionType } = await import(
    "../src/lib/proptx/map-listing"
  );
  const { upsertPropTxPropertiesOnDemand } = await import(
    "../src/lib/proptx/sync"
  );
  const {
    getTypesenseSearchClient,
    getTypesenseCollectionName,
  } = await import("../src/lib/typesense/client");
  const { listingStatusLabel } = await import("../src/lib/listings/constants");

  const cfg = getPropTxSyncConfig();
  if (!cfg) throw new Error("PropTx sync config missing");

  console.log(
    JSON.stringify({
      mode: DRY_RUN ? "dry-run" : "write",
      feed: cfg.feed,
      pageSize: PAGE_SIZE,
      concurrency: UPSERT_CONCURRENCY,
    }),
  );

  const filters: Array<{ name: "sold_conditional" | "leased_conditional"; odata: string }> =
    [
      {
        name: "sold_conditional",
        odata: "startswith(MlsStatus,'Sold Conditional')",
      },
      {
        name: "leased_conditional",
        odata: "startswith(MlsStatus,'Leased Conditional')",
      },
    ];

  const byFilter: Record<string, Counts> = {};

  for (const filter of filters) {
    const counts: Counts = {
      propTxSeen: 0,
      propTxCountHeader: null,
      missingNeon: 0,
      wrongStatus: 0,
      alreadyOk: 0,
      upserted: 0,
      typesenseHealed: 0,
      skippedMap: 0,
      failures: 0,
      stoppedEarly: null,
    };
    byFilter[filter.name] = counts;

    // Count header (no row payload beyond first page metadata).
    try {
      const countPath =
        `Property?$select=ListingKey&$filter=${encodeURIComponent(filter.odata)}` +
        `&$top=1&$count=true`;
      const counted = (await proptxJson(countPath, cfg)) as {
        "@odata.count"?: number;
      };
      counts.propTxCountHeader = counted["@odata.count"] ?? null;
    } catch (err) {
      counts.failures += 1;
      console.log(
        JSON.stringify({
          phase: "count",
          filter: filter.name,
          error: err instanceof Error ? err.message.slice(0, 160) : "failed",
        }),
      );
    }

    const path =
      `Property?$filter=${encodeURIComponent(filter.odata)}` +
      `&$orderby=${encodeURIComponent("ModificationTimestamp desc,ListingKey desc")}` +
      `&$top=${PAGE_SIZE}`;

    let pageNo = 0;
    try {
      for await (const page of proptxPages<Record<string, unknown>>(path, {
        maxPages: MAX_PAGES_PER_FILTER,
        config: cfg,
      })) {
        pageNo += 1;
        counts.propTxSeen += page.length;

        const toUpsert: Record<string, unknown>[] = [];

        for (const row of page) {
          const mls = mapMlsNumber(row);
          if (!mls) {
            counts.skippedMap += 1;
            continue;
          }

          const mappedTxn = mapTransactionType(row);
          const mappedStatus = mapListingStatus(row, mappedTxn);
          void mappedStatus;

          const neon = await prisma.listing.findFirst({
            where: { mlsNumber: mls, isMock: false },
            select: { id: true, status: true, transactionType: true },
          });

          if (!neon) {
            counts.missingNeon += 1;
            toUpsert.push(row);
            continue;
          }

          const statusWrong = neon.status !== "SOLD_CONDITIONAL";
          const txnWrong = neon.transactionType !== mappedTxn;
          if (statusWrong || txnWrong) {
            counts.wrongStatus += 1;
            toUpsert.push(row);
            continue;
          }

          counts.alreadyOk += 1;
        }

        if (!DRY_RUN && toUpsert.length > 0) {
          try {
            const upsertedMls = await upsertPropTxPropertiesOnDemand(toUpsert, {
              concurrency: UPSERT_CONCURRENCY,
              // Listing row + Typesense only; detail gallery still loads from PropTx.
              skipMedia: true,
            });
            counts.upserted += upsertedMls.length;
            counts.typesenseHealed += upsertedMls.length;
          } catch (err) {
            counts.failures += 1;
            if (isNeonSizeLimitError(err)) {
              counts.stoppedEarly = "neon_size_limit";
              console.log(
                JSON.stringify({
                  phase: "upsert",
                  filter: filter.name,
                  page: pageNo,
                  stopped: "neon_size_limit",
                }),
              );
              break;
            }
            console.log(
              JSON.stringify({
                phase: "upsert",
                filter: filter.name,
                page: pageNo,
                error:
                  err instanceof Error ? err.message.slice(0, 160) : "failed",
              }),
            );
            if (counts.failures >= MAX_FAILURES) {
              counts.stoppedEarly = "max_failures";
              break;
            }
          }
        } else if (DRY_RUN) {
          counts.upserted += toUpsert.length;
        }

        console.log(
          JSON.stringify({
            filter: filter.name,
            page: pageNo,
            pageRows: page.length,
            queued: toUpsert.length,
            seen: counts.propTxSeen,
            missing: counts.missingNeon,
            wrong: counts.wrongStatus,
            ok: counts.alreadyOk,
            upserted: counts.upserted,
          }),
        );

        if (counts.stoppedEarly) break;
        await sleep(PAGE_DELAY_MS);
      }
    } catch (err) {
      counts.failures += 1;
      if (isNeonSizeLimitError(err)) {
        counts.stoppedEarly = "neon_size_limit";
      }
      console.log(
        JSON.stringify({
          phase: "paginate",
          filter: filter.name,
          error: err instanceof Error ? err.message.slice(0, 160) : "failed",
        }),
      );
    }
  }

  console.log("\n=== BACKFILL SUMMARY ===");
  console.log(JSON.stringify({ dryRun: DRY_RUN, byFilter }, null, 2));

  // Consistency sample (counts only + a few MLS ids for verification).
  console.log("\n=== POST CHECK (counts + sample) ===");
  const neonCond = await prisma.listing.groupBy({
    by: ["transactionType"],
    where: { isMock: false, status: "SOLD_CONDITIONAL" },
    _count: true,
  });
  console.log(JSON.stringify({ neonSoldConditionalByTxn: neonCond }));

  const samples = await prisma.listing.findMany({
    where: { isMock: false, status: "SOLD_CONDITIONAL" },
    select: { mlsNumber: true, status: true, transactionType: true },
    orderBy: { updatedAt: "desc" },
    take: 8,
  });

  const ts = getTypesenseSearchClient();
  const collection = getTypesenseCollectionName();

  for (const s of samples) {
    const result = await ts.collections(collection).documents().search({
      q: "*",
      query_by: "mlsNumber",
      filter_by: `mlsNumber:=${s.mlsNumber}`,
      per_page: 1,
    });
    const doc = result.hits?.[0]?.document as
      | { status?: string; transactionType?: string }
      | undefined;
    const onMarket = await ts.collections(collection).documents().search({
      q: "*",
      query_by: "mlsNumber",
      filter_by: `mlsNumber:=${s.mlsNumber} && status:=[ACTIVE,SOLD_CONDITIONAL] && transactionType:=${s.transactionType}`,
      per_page: 1,
    });
    const activeOnly = await ts.collections(collection).documents().search({
      q: "*",
      query_by: "mlsNumber",
      filter_by: `mlsNumber:=${s.mlsNumber} && status:=ACTIVE && transactionType:=${s.transactionType}`,
      per_page: 1,
    });
    console.log(
      JSON.stringify({
        mls: s.mlsNumber,
        neon: { status: s.status, txn: s.transactionType },
        ts: doc
          ? { status: doc.status, txn: doc.transactionType }
          : null,
        label: listingStatusLabel(s.status, s.transactionType),
        match:
          !!doc &&
          doc.status === s.status &&
          doc.transactionType === s.transactionType,
        inOnMarket: (onMarket.found ?? 0) > 0,
        inActiveOnly: (activeOnly.found ?? 0) > 0,
      }),
    );
  }

  // Closed inventory must stay out of active filters.
  const closed = await prisma.listing.findMany({
    where: {
      isMock: false,
      status: { in: ["SOLD", "LEASED"] },
      mlsNumber: { not: { startsWith: "PC-" } },
    },
    select: { mlsNumber: true, status: true, transactionType: true },
    orderBy: { updatedAtMls: "desc" },
    take: 2,
  });
  for (const c of closed) {
    const activeOnly = await ts.collections(collection).documents().search({
      q: "*",
      query_by: "mlsNumber",
      filter_by: `mlsNumber:=${c.mlsNumber} && status:=ACTIVE`,
      per_page: 1,
    });
    const onMarket = await ts.collections(collection).documents().search({
      q: "*",
      query_by: "mlsNumber",
      filter_by: `mlsNumber:=${c.mlsNumber} && status:=[ACTIVE,SOLD_CONDITIONAL]`,
      per_page: 1,
    });
    console.log(
      JSON.stringify({
        closedMls: c.mlsNumber,
        neonStatus: c.status,
        inActiveOnly: (activeOnly.found ?? 0) > 0,
        inOnMarket: (onMarket.found ?? 0) > 0,
      }),
    );
  }

  await prisma.$disconnect().catch(() => undefined);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
