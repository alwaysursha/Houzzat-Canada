/**
 * Stage 6.11G.8C-A — historical provenance backfill runner selftest.
 * Run: pnpm stage-6.11g8c-trreb-provenance-backfill:selftest
 * No production mutation.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyPropTxListingProvenance,
  ensurePropTxListingProvenance,
  isPropTxProvenanceBackfillWritable,
  PROPTX_LISTING_PROVIDER_KEY,
  PROPTX_TRREB_ORGANIZATION_SLUG,
  PropTxProvenanceError,
  type ListingSourceProvenanceRow,
  type PropTxListingProvenance,
  type PropTxProvenanceStore,
  type RealEstateOrganizationProvenanceRow,
} from "@/lib/proptx/listing-provenance";
import { resolveBackfillWriteMode } from "./stage-6.11g8c-trreb-provenance-backfill";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const TRREB_ORG_ID = "org_trreb_fixture";

function provenance(): PropTxListingProvenance {
  return {
    organizationId: TRREB_ORG_ID,
    organizationSlug: PROPTX_TRREB_ORGANIZATION_SLUG,
    providerKey: PROPTX_LISTING_PROVIDER_KEY,
  };
}

function createMemoryStore(): {
  store: PropTxProvenanceStore;
  sources: ListingSourceProvenanceRow[];
  mirrors: Map<string, { organizationId: string | null; providerKey: string | null }>;
} {
  const sources: ListingSourceProvenanceRow[] = [];
  const mirrors = new Map<
    string,
    { organizationId: string | null; providerKey: string | null }
  >();
  let sourceSeq = 0;
  const org: RealEstateOrganizationProvenanceRow = {
    id: TRREB_ORG_ID,
    slug: PROPTX_TRREB_ORGANIZATION_SLUG,
    name: "Toronto Regional Real Estate Board",
    shortName: "TRREB",
    countryCode: "CA",
    regionCode: "ON",
    kind: "BOARD",
    supportStatus: "SUPPORTED",
    active: true,
  };

  const store: PropTxProvenanceStore = {
    findOrganizationBySlug: async (slug) => (org.slug === slug ? org : null),
    findListingSources: async (listingId) =>
      sources.filter((s) => s.listingId === listingId),
    createListingSource: async (data) => {
      sourceSeq += 1;
      const id = `src_${sourceSeq}`;
      sources.push({ id, ...data, isPrimary: true });
      return { id };
    },
    updateListingMirrors: async (listingId, data) => {
      mirrors.set(listingId, {
        organizationId: data.organizationId,
        providerKey: data.providerKey,
      });
    },
  };

  return { store, sources, mirrors };
}

async function main() {
  console.log("\n=== STAGE 6.11G.8C-A — BACKFILL RUNNER SELFTEST ===\n");

  const runner = read("scripts/stage-6.11g8c-trreb-provenance-backfill.ts");
  const helper = read("src/lib/proptx/listing-provenance.ts");

  {
    assert.ok(runner.includes("ALLOW_PRODUCTION_WRITE_MODE = true"));
    assert.ok(runner.includes("--dry-run"));
    assert.ok(runner.includes("--confirm-production-write"));
    assert.ok(runner.includes("--after-id="));
    assert.ok(runner.includes("classifyPropTxListingProvenance"));
    assert.ok(runner.includes("ensurePropTxListingProvenance"));
    assert.ok(!runner.includes("$transaction"));
    assert.ok(!runner.includes("updateMany"));
    assert.ok(helper.includes("classifyPropTxListingProvenance"));
    console.log("[0] runner guards / G.8B reuse / neon-safe... PASS");
  }

  {
    assert.deepEqual(resolveBackfillWriteMode({ dryRun: true, confirmWrite: false }), {
      mutate: false,
      reason: "dry-run",
    });
    assert.deepEqual(resolveBackfillWriteMode({ dryRun: true, confirmWrite: true }), {
      mutate: false,
      reason: "dry-run",
    });
    assert.equal(
      resolveBackfillWriteMode({ dryRun: false, confirmWrite: false }).mutate,
      false,
    );
    assert.equal(
      resolveBackfillWriteMode({ dryRun: false, confirmWrite: true }).mutate,
      true,
    );
    console.log("[1] write-mode guard... PASS");
  }

  {
    const p = provenance();
    assert.equal(
      classifyPropTxListingProvenance(p, {
        listingKey: "W1",
        mlsNumber: "W1",
        organizationId: null,
        providerKey: null,
        sources: [],
      }),
      "needs_full_backfill",
    );
    assert.equal(
      classifyPropTxListingProvenance(p, {
        listingKey: "",
        mlsNumber: "W1",
        organizationId: null,
        providerKey: null,
        sources: [],
      }),
      "invalid_listing_key",
    );
    assert.equal(
      classifyPropTxListingProvenance(p, {
        listingKey: "W1",
        mlsNumber: "W1",
        organizationId: "other",
        providerKey: null,
        sources: [],
      }),
      "conflict_mirror_organization",
    );
    assert.equal(
      classifyPropTxListingProvenance(p, {
        listingKey: "W1",
        mlsNumber: "W1",
        organizationId: null,
        providerKey: "other",
        sources: [],
      }),
      "conflict_mirror_provider",
    );
    assert.ok(isPropTxProvenanceBackfillWritable("needs_full_backfill"));
    assert.ok(!isPropTxProvenanceBackfillWritable("conflict_mirror_organization"));
    console.log("[2] classifications... PASS");
  }

  {
    const { store, sources, mirrors } = createMemoryStore();
    const p = provenance();
    await ensurePropTxListingProvenance(store, p, {
      listingId: "L1",
      listingKey: "W100",
      mlsNumber: "W100",
      organizationId: null,
      providerKey: null,
    });
    assert.equal(sources.length, 1);
    assert.equal(mirrors.get("L1")?.organizationId, TRREB_ORG_ID);

    const before = sources.length;
    await ensurePropTxListingProvenance(store, p, {
      listingId: "L1",
      listingKey: "W100",
      mlsNumber: "W100",
      organizationId: TRREB_ORG_ID,
      providerKey: "proptx",
    });
    assert.equal(sources.length, before);
    assert.equal(
      classifyPropTxListingProvenance(p, {
        listingKey: "W100",
        mlsNumber: "W100",
        organizationId: TRREB_ORG_ID,
        providerKey: "proptx",
        sources,
      }),
      "already_canonical",
    );
    console.log("[3] full backfill + exact rerun... PASS");
  }

  {
    const { store, sources, mirrors } = createMemoryStore();
    const p = provenance();
    mirrors.set("L2", { organizationId: TRREB_ORG_ID, providerKey: "proptx" });
    assert.equal(
      classifyPropTxListingProvenance(p, {
        listingKey: "W200",
        mlsNumber: "W200",
        organizationId: TRREB_ORG_ID,
        providerKey: "proptx",
        sources: [],
      }),
      "needs_source_repair",
    );
    await ensurePropTxListingProvenance(store, p, {
      listingId: "L2",
      listingKey: "W200",
      mlsNumber: "W200",
      organizationId: TRREB_ORG_ID,
      providerKey: "proptx",
    });
    assert.equal(sources.length, 1);

    const { store: store3, sources: sources3, mirrors: mirrors3 } =
      createMemoryStore();
    sources3.push({
      id: "src_x",
      listingId: "L3",
      organizationId: TRREB_ORG_ID,
      providerKey: "proptx",
      providerListingKey: "W300",
      sourceMlsNumber: "W300",
      isPrimary: true,
    });
    assert.equal(
      classifyPropTxListingProvenance(p, {
        listingKey: "W300",
        mlsNumber: "W300",
        organizationId: null,
        providerKey: null,
        sources: sources3,
      }),
      "needs_mirror_repair",
    );
    await ensurePropTxListingProvenance(store3, p, {
      listingId: "L3",
      listingKey: "W300",
      mlsNumber: "W300",
      organizationId: null,
      providerKey: null,
    });
    assert.deepEqual(mirrors3.get("L3"), {
      organizationId: TRREB_ORG_ID,
      providerKey: "proptx",
    });
    console.log("[4] mirror-only / source-only repair... PASS");
  }

  {
    const p = provenance();
    const { store, sources } = createMemoryStore();
    sources.push({
      id: "src_other",
      listingId: "L4",
      organizationId: "other",
      providerKey: "other",
      providerListingKey: "X1",
      sourceMlsNumber: "X1",
      isPrimary: true,
    });
    assert.equal(
      classifyPropTxListingProvenance(p, {
        listingKey: "W400",
        mlsNumber: "W400",
        organizationId: null,
        providerKey: null,
        sources,
      }),
      "conflict_primary_source",
    );
    await assert.rejects(
      () =>
        ensurePropTxListingProvenance(store, p, {
          listingId: "L4",
          listingKey: "W400",
          mlsNumber: "W400",
          organizationId: null,
          providerKey: null,
        }),
      (err: unknown) =>
        err instanceof PropTxProvenanceError &&
        err.code === "primary_source_conflict",
    );
    assert.equal(sources.length, 1);
    console.log("[5] conflict no overwrite... PASS");
  }

  {
    // Resume simulation: two sequential cursors cover sorted ids without dup/skip.
    const ids = ["a", "b", "c", "d", "e", "f"];
    const seen = new Set<string>();
    let after: string | null = null;
    const batchSize = 2;
    while (true) {
      const batch = ids.filter((id) => (after ? id > after : true)).slice(0, batchSize);
      if (batch.length === 0) break;
      for (const id of batch) {
        assert.ok(!seen.has(id), `duplicate ${id}`);
        seen.add(id);
      }
      after = batch[batch.length - 1]!;
    }
    assert.deepEqual([...seen].sort(), ids);
    console.log("[6] resume cursor coverage... PASS");
  }

  {
    // Live-sync race: classify needs_full → sync makes canonical → ensure no-ops.
    const { store, sources, mirrors } = createMemoryStore();
    const p = provenance();
    assert.equal(
      classifyPropTxListingProvenance(p, {
        listingKey: "W500",
        mlsNumber: "W500",
        organizationId: null,
        providerKey: null,
        sources: [],
      }),
      "needs_full_backfill",
    );
    // Simulate live sync winning the race:
    await ensurePropTxListingProvenance(store, p, {
      listingId: "L5",
      listingKey: "W500",
      mlsNumber: "W500",
      organizationId: null,
      providerKey: null,
    });
    const beforeSources = sources.length;
    const beforeMirrors = mirrors.get("L5");
    await ensurePropTxListingProvenance(store, p, {
      listingId: "L5",
      listingKey: "W500",
      mlsNumber: "W500",
      organizationId: TRREB_ORG_ID,
      providerKey: "proptx",
    });
    assert.equal(sources.length, beforeSources);
    assert.deepEqual(mirrors.get("L5"), beforeMirrors);
    console.log("[7] live-sync race → safe no-op... PASS");
  }

  {
    assert.ok(runner.includes("ALLOW_PRODUCTION_WRITE_MODE = true"));
    // Dry-run path must not call ensure unless mutate (structural).
    assert.ok(runner.includes("if (mode.mutate && isPropTxProvenanceBackfillWritable"));
    assert.equal(
      resolveBackfillWriteMode({ dryRun: false, confirmWrite: false }).mutate,
      false,
    );
    console.log("[8] dry-run / missing-confirm zero-write gate... PASS");
  }

  console.log("\nstage-6.11g8c-trreb-provenance-backfill:selftest ok\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
