/**
 * Stage 6.11G.8C — historical TRREB/PropTx Listing provenance backfill.
 *
 *   pnpm stage-6.11g8c-trreb-provenance-backfill -- --dry-run
 *   pnpm stage-6.11g8c-trreb-provenance-backfill -- --confirm-production-write
 *
 * THIS STAGE (G.8C-A): dry-run only. Do NOT pass --confirm-production-write
 * until ChatGPT reviews G.8C-A.
 *
 * Reuses G.8B helpers — same canonical state as live PropTx ingestion.
 * Neon-safe: no multi-statement transactions / bulk updates. Cursor pagination by Listing.id.
 * Conflicts are skipped (never overwritten). Live sync may continue.
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

import {
  classifyPropTxListingProvenance,
  createPrismaPropTxProvenanceStore,
  createPropTxProvenanceSession,
  ensurePropTxListingProvenance,
  isPropTxProvenanceBackfillWritable,
  logPropTxProvenanceConflict,
  PropTxProvenanceError,
  PROPTX_PROVENANCE_BACKFILL_CLASSIFICATIONS,
  type PropTxListingProvenance,
  type PropTxProvenanceBackfillClassification,
  type PropTxProvenanceStore,
} from "@/lib/proptx/listing-provenance";

/**
 * G.8C-B: production write mode enabled. Still requires --confirm-production-write
 * and refuses when --dry-run is set. Accidental invocation without the flag
 * remains read-only / refused.
 */
const ALLOW_PRODUCTION_WRITE_MODE = true;

/** Conservative default — correctness/resumability over throughput. */
const DEFAULT_BATCH_SIZE = 200;

/** Emit progress about every N scanned candidates. */
const PROGRESS_EVERY = 5_000;

type Counts = Record<PropTxProvenanceBackfillClassification, number> & {
  scanned: number;
  non_mls_skipped: number;
  written: number;
  write_errors: number;
};

function emptyCounts(): Counts {
  const counts = {
    scanned: 0,
    non_mls_skipped: 0,
    written: 0,
    write_errors: 0,
  } as Counts;
  for (const key of PROPTX_PROVENANCE_BACKFILL_CLASSIFICATIONS) {
    counts[key] = 0;
  }
  return counts;
}

function parseArgs(argv: string[]) {
  const dryRun = argv.includes("--dry-run");
  const confirmWrite = argv.includes("--confirm-production-write");
  let batchSize = DEFAULT_BATCH_SIZE;
  let afterId: string | null = null;
  let limit: number | null = null;

  for (const arg of argv) {
    if (arg.startsWith("--batch-size=")) {
      batchSize = Math.max(1, Math.min(1000, Number(arg.slice("--batch-size=".length)) || DEFAULT_BATCH_SIZE));
    }
    if (arg.startsWith("--after-id=")) {
      afterId = arg.slice("--after-id=".length).trim() || null;
    }
    if (arg.startsWith("--limit=")) {
      const n = Number(arg.slice("--limit=".length));
      limit = Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
    }
  }

  return { dryRun, confirmWrite, batchSize, afterId, limit };
}

/**
 * Write mode is allowed only when BOTH:
 * - --confirm-production-write
 * - --dry-run is NOT set
 * Accidental invocation without confirmation → zero mutations.
 */
export function resolveBackfillWriteMode(input: {
  dryRun: boolean;
  confirmWrite: boolean;
}): { mutate: boolean; reason: string } {
  if (input.dryRun) {
    return { mutate: false, reason: "dry-run" };
  }
  if (!input.confirmWrite) {
    return {
      mutate: false,
      reason: "missing --confirm-production-write (refusing mutation)",
    };
  }
  return { mutate: true, reason: "confirm-production-write" };
}

type CandidateRow = {
  id: string;
  mlsNumber: string;
  listingKey: string | null;
  dataSource: string;
  isMock: boolean;
  organizationId: string | null;
  providerKey: string | null;
};

export async function classifyCandidate(
  store: PropTxProvenanceStore,
  provenance: PropTxListingProvenance,
  row: CandidateRow,
): Promise<PropTxProvenanceBackfillClassification> {
  if (row.dataSource !== "mls" || row.isMock) {
    // Runner query should exclude these; defensive.
    return "invalid_listing_key";
  }
  const sources = await store.findListingSources(row.id);
  return classifyPropTxListingProvenance(provenance, {
    listingKey: row.listingKey,
    mlsNumber: row.mlsNumber,
    organizationId: row.organizationId,
    providerKey: row.providerKey,
    sources,
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = resolveBackfillWriteMode(args);

  console.log("=== STAGE 6.11G.8C — TRREB PROVENANCE BACKFILL ===\n");
  console.log(
    JSON.stringify(
      {
        dryRun: args.dryRun,
        confirmWrite: args.confirmWrite,
        mutate: mode.mutate,
        modeReason: mode.reason,
        batchSize: args.batchSize,
        afterId: args.afterId,
        limit: args.limit,
      },
      null,
      2,
    ),
  );

  if (!args.dryRun && !args.confirmWrite) {
    console.error(
      "\nRefusing to run: pass --dry-run (G.8C-A) or --confirm-production-write (later).",
    );
    process.exit(2);
  }

  if (mode.mutate && !ALLOW_PRODUCTION_WRITE_MODE) {
    console.error(
      "\nSTOP: G.8C-A forbids production write mode (ALLOW_PRODUCTION_WRITE_MODE=false). Re-run with --dry-run only.",
    );
    process.exit(2);
  }

  if (mode.mutate) {
    console.log("\nWRITE MODE ENABLED — mutations will occur.");
  }

  const { prisma } = await import("../src/lib/prisma");
  const store = createPrismaPropTxProvenanceStore(prisma);
  const provenance = await createPropTxProvenanceSession(store).get();

  console.log("\nResolved provenance:");
  console.log(
    JSON.stringify(
      {
        organizationSlug: provenance.organizationSlug,
        organizationId: provenance.organizationId,
        providerKey: provenance.providerKey,
      },
      null,
      2,
    ),
  );

  const [totalListings, mlsCandidates, nonMls] = await Promise.all([
    prisma.listing.count(),
    prisma.listing.count({
      where: {
        dataSource: "mls",
        isMock: false,
        listingKey: { not: null },
      },
    }),
    prisma.listing.count({
      where: {
        OR: [{ dataSource: { not: "mls" } }, { isMock: true }],
      },
    }),
  ]);

  // Blank listingKey among mls+!mock (predicate edge)
  const blankKeyCandidates = await prisma.$queryRaw<Array<{ c: bigint }>>`
    SELECT COUNT(*)::bigint AS c
    FROM "Listing"
    WHERE "dataSource" = 'mls'
      AND "isMock" = false
      AND "listingKey" IS NOT NULL
      AND btrim("listingKey") = ''
  `;

  const duplicateProviderKeys = await prisma.$queryRaw<
    Array<{ providerListingKey: string; c: bigint }>
  >`
    SELECT ls."providerListingKey", COUNT(DISTINCT ls."listingId")::bigint AS c
    FROM "ListingSource" ls
    WHERE ls."providerKey" = 'proptx'
    GROUP BY ls."providerListingKey"
    HAVING COUNT(DISTINCT ls."listingId") > 1
    LIMIT 10
  `;

  const multiPrimary = await prisma.$queryRaw<
    Array<{ listingId: string; c: bigint }>
  >`
    SELECT "listingId", COUNT(*)::bigint AS c
    FROM "ListingSource"
    WHERE "isPrimary" = true
    GROUP BY "listingId"
    HAVING COUNT(*) > 1
    LIMIT 10
  `;

  const mirrorSourceMismatches = await prisma.$queryRaw<
    Array<{ c: bigint }>
  >`
    SELECT COUNT(*)::bigint AS c
    FROM "Listing" l
    JOIN "ListingSource" ls
      ON ls."listingId" = l.id
     AND ls."isPrimary" = true
     AND ls."providerKey" = 'proptx'
    WHERE l."organizationId" IS NOT NULL
      AND l."providerKey" = 'proptx'
      AND (
        l."organizationId" IS DISTINCT FROM ls."organizationId"
        OR l."providerKey" IS DISTINCT FROM ls."providerKey"
        OR l."listingKey" IS DISTINCT FROM ls."providerListingKey"
      )
  `;

  console.log("\nPre-scan:");
  console.log(`  total Listings: ${totalListings}`);
  console.log(`  MLS candidates (mls + !mock + listingKey not null): ${mlsCandidates}`);
  console.log(`  non-MLS / mock (excluded): ${nonMls}`);
  console.log(`  blank listingKey among candidates: ${Number(blankKeyCandidates[0]?.c ?? 0)}`);
  console.log(`  duplicate proptx providerListingKey across listings: ${duplicateProviderKeys.length}`);
  console.log(`  multi-PRIMARY listings: ${multiPrimary.length}`);
  console.log(
    `  canonical mirror/source mismatches: ${Number(mirrorSourceMismatches[0]?.c ?? 0)}`,
  );

  if (
    duplicateProviderKeys.length > 0 ||
    multiPrimary.length > 0 ||
    Number(mirrorSourceMismatches[0]?.c ?? 0) > 0
  ) {
    console.error("\nBLOCKER: collision detected before scan");
    console.error(
      JSON.stringify(
        {
          duplicateProviderKeys,
          multiPrimary,
          mirrorSourceMismatches: Number(mirrorSourceMismatches[0]?.c ?? 0),
        },
        null,
        2,
      ),
    );
    if (mode.mutate) {
      console.error("STOP: refusing production writes while collisions exist.");
      process.exit(3);
    }
  }

  const counts = emptyCounts();
  counts.non_mls_skipped = nonMls;
  let afterId = args.afterId;
  let lastId: string | null = afterId;
  let scannedThisRun = 0;
  const conflictSamples: Array<{
    id: string;
    mlsNumber: string;
    classification: PropTxProvenanceBackfillClassification;
  }> = [];

  console.log(
    mode.mutate
      ? "\nScanning (write mode — mutations enabled)..."
      : "\nScanning (dry-run, no writes)...",
  );

  while (true) {
    if (args.limit != null && scannedThisRun >= args.limit) break;

    const take =
      args.limit != null
        ? Math.min(args.batchSize, args.limit - scannedThisRun)
        : args.batchSize;

    const batch = await prisma.listing.findMany({
      where: {
        dataSource: "mls",
        isMock: false,
        listingKey: { not: null },
        ...(afterId ? { id: { gt: afterId } } : {}),
      },
      orderBy: { id: "asc" },
      take,
      select: {
        id: true,
        mlsNumber: true,
        listingKey: true,
        dataSource: true,
        isMock: true,
        organizationId: true,
        providerKey: true,
      },
    });

    if (batch.length === 0) break;

    const sourceRows = await prisma.listingSource.findMany({
      where: { listingId: { in: batch.map((r) => r.id) } },
      select: {
        id: true,
        listingId: true,
        organizationId: true,
        providerKey: true,
        providerListingKey: true,
        sourceMlsNumber: true,
        isPrimary: true,
      },
    });
    const sourcesByListing = new Map<string, typeof sourceRows>();
    for (const source of sourceRows) {
      const list = sourcesByListing.get(source.listingId) ?? [];
      list.push(source);
      sourcesByListing.set(source.listingId, list);
    }

    for (const row of batch) {
      const classification = classifyPropTxListingProvenance(provenance, {
        listingKey: row.listingKey,
        mlsNumber: row.mlsNumber,
        organizationId: row.organizationId,
        providerKey: row.providerKey,
        sources: sourcesByListing.get(row.id) ?? [],
      });
      counts.scanned += 1;
      scannedThisRun += 1;
      counts[classification] += 1;
      lastId = row.id;

      if (
        classification.startsWith("conflict_") ||
        classification === "invalid_listing_key"
      ) {
        if (conflictSamples.length < 20) {
          conflictSamples.push({
            id: row.id,
            mlsNumber: row.mlsNumber,
            classification,
          });
        }
      }

      // Write path exists for later stages — gated and unused in G.8C-A.
      if (mode.mutate && isPropTxProvenanceBackfillWritable(classification)) {
        if (classification !== "already_canonical") {
          try {
            // Re-read immediately before write (live-sync coexistence).
            const fresh = await prisma.listing.findUniqueOrThrow({
              where: { id: row.id },
              select: {
                id: true,
                mlsNumber: true,
                listingKey: true,
                organizationId: true,
                providerKey: true,
              },
            });
            await ensurePropTxListingProvenance(store, provenance, {
              listingId: fresh.id,
              listingKey: String(fresh.listingKey ?? ""),
              mlsNumber: fresh.mlsNumber,
              organizationId: fresh.organizationId,
              providerKey: fresh.providerKey,
            });
            counts.written += 1;
          } catch (err) {
            counts.write_errors += 1;
            if (err instanceof PropTxProvenanceError) {
              logPropTxProvenanceConflict(err);
            } else {
              console.warn("[backfill-write-error]", {
                listingId: row.id,
                mlsNumber: row.mlsNumber,
                message: err instanceof Error ? err.message : String(err),
              });
            }
          }
        }
      }
    }

    afterId = batch[batch.length - 1]!.id;

    const atProgressBoundary =
      counts.scanned % PROGRESS_EVERY < batch.length ||
      counts.scanned === batch.length;
    if (atProgressBoundary) {
      console.log(
        `[progress] scanned=${counts.scanned} already_canonical=${counts.already_canonical} needs_full_backfill=${counts.needs_full_backfill} needs_mirror_repair=${counts.needs_mirror_repair} needs_source_repair=${counts.needs_source_repair} written=${counts.written} conflicts=${
          counts.conflict_mirror_organization +
          counts.conflict_mirror_provider +
          counts.conflict_primary_source +
          counts.conflict_source_fields +
          counts.conflict_listing_key_identity
        } invalid=${counts.invalid_listing_key} write_errors=${counts.write_errors} lastId=${lastId}`,
      );
    }
  }

  const conflictTotal =
    counts.conflict_mirror_organization +
    counts.conflict_mirror_provider +
    counts.conflict_primary_source +
    counts.conflict_source_fields +
    counts.conflict_listing_key_identity;

  const wouldMutate =
    counts.needs_full_backfill +
    counts.needs_mirror_repair +
    counts.needs_source_repair;

  const classifiedSum =
    counts.already_canonical +
    counts.needs_full_backfill +
    counts.needs_mirror_repair +
    counts.needs_source_repair +
    conflictTotal +
    counts.invalid_listing_key;

  console.log(
    mode.mutate
      ? `\n=== WRITE RESULTS ===`
      : `\n=== DRY-RUN RESULTS ===`,
  );
  console.log(
    JSON.stringify(
      {
        mutate: mode.mutate,
        scanned: counts.scanned,
        classifiedSum,
        reconciles: classifiedSum === counts.scanned,
        already_canonical: counts.already_canonical,
        needs_full_backfill: counts.needs_full_backfill,
        needs_mirror_repair: counts.needs_mirror_repair,
        needs_source_repair: counts.needs_source_repair,
        conflict_mirror_organization: counts.conflict_mirror_organization,
        conflict_mirror_provider: counts.conflict_mirror_provider,
        conflict_primary_source: counts.conflict_primary_source,
        conflict_source_fields: counts.conflict_source_fields,
        conflict_listing_key_identity: counts.conflict_listing_key_identity,
        invalid_listing_key: counts.invalid_listing_key,
        conflictTotal,
        wouldMutate,
        written: counts.written,
        write_errors: counts.write_errors,
        fullySuccessful: conflictTotal === 0 && counts.write_errors === 0,
        non_mls_skipped: counts.non_mls_skipped,
        lastCursorId: lastId,
        conflictSamples: conflictSamples.map((c) => ({
          id_prefix: c.id.slice(0, 12),
          mlsNumber: c.mlsNumber,
          classification: c.classification,
        })),
        collisions: {
          duplicateProviderListingKeys: duplicateProviderKeys.length,
          multiPrimary: multiPrimary.length,
          mirrorSourceMismatches: Number(mirrorSourceMismatches[0]?.c ?? 0),
        },
      },
      null,
      2,
    ),
  );

  if (mode.mutate) {
    if (conflictTotal > 0 || counts.write_errors > 0) {
      console.log(
        "\nSTAGE 6.11G.8C-B write complete — NOT fully successful (conflicts or write_errors > 0).",
      );
      process.exitCode = 3;
    } else {
      console.log(
        "\nSTAGE 6.11G.8C-B write complete — provenance mutations applied; zero conflicts.",
      );
    }
  } else {
    console.log(
      "\nSTAGE 6.11G.8C dry-run complete — zero provenance writes performed.",
    );
  }
}

// Allow selftests to import guards without running main.
const isDirect = /stage-6\.11g8c-trreb-provenance-backfill\.ts$/.test(
  process.argv[1] ?? "",
);

if (isDirect) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
