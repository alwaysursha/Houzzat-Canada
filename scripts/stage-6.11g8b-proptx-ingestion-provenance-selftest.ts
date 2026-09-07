/**
 * Stage 6.11G.8B — PropTx ingestion provenance selftest.
 * Run: pnpm stage-6.11g8b-proptx-ingestion-provenance:selftest
 * No production mutation / backfill / deploy.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertDurablePropTxListingKey,
  assertListingMirrorsCompatible,
  createPropTxProvenanceSession,
  ensurePropTxListingProvenance,
  PROPTX_LISTING_PROVIDER_KEY,
  PROPTX_TRREB_ORGANIZATION_SLUG,
  PropTxProvenanceError,
  resolvePropTxListingProvenance,
  type ListingSourceProvenanceRow,
  type PropTxListingProvenance,
  type PropTxProvenanceStore,
  type RealEstateOrganizationProvenanceRow,
} from "@/lib/proptx/listing-provenance";
import { CURRENT_PROPTX_PROVIDER_KEY } from "@/lib/tenancy/listing-provenance";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const TRREB_ORG_ID = "org_trreb_fixture";
const OTHER_ORG_ID = "org_other_fixture";

function canonicalOrg(
  overrides: Partial<RealEstateOrganizationProvenanceRow> = {},
): RealEstateOrganizationProvenanceRow {
  return {
    id: TRREB_ORG_ID,
    slug: PROPTX_TRREB_ORGANIZATION_SLUG,
    name: "Toronto Regional Real Estate Board",
    shortName: "TRREB",
    countryCode: "CA",
    regionCode: "ON",
    kind: "BOARD",
    supportStatus: "SUPPORTED",
    active: true,
    ...overrides,
  };
}

function createMemoryStore(options?: {
  org?: RealEstateOrganizationProvenanceRow | null;
}): {
  store: PropTxProvenanceStore;
  sources: ListingSourceProvenanceRow[];
  mirrors: Map<string, { organizationId: string | null; providerKey: string | null }>;
} {
  const sources: ListingSourceProvenanceRow[] = [];
  const mirrors = new Map<
    string,
    { organizationId: string | null; providerKey: string | null }
  >();
  let org: RealEstateOrganizationProvenanceRow | null =
    options && "org" in options ? (options.org ?? null) : canonicalOrg();
  let sourceSeq = 0;

  const store: PropTxProvenanceStore = {
    findOrganizationBySlug: async (slug) =>
      org && org.slug === slug ? org : null,
    findListingSources: async (listingId) =>
      sources.filter((s) => s.listingId === listingId),
    createListingSource: async (data) => {
      sourceSeq += 1;
      const id = `src_${sourceSeq}`;
      sources.push({
        id,
        listingId: data.listingId,
        organizationId: data.organizationId,
        providerKey: data.providerKey,
        providerListingKey: data.providerListingKey,
        sourceMlsNumber: data.sourceMlsNumber,
        isPrimary: true,
      });
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

function provenance(): PropTxListingProvenance {
  return {
    organizationId: TRREB_ORG_ID,
    organizationSlug: PROPTX_TRREB_ORGANIZATION_SLUG,
    providerKey: PROPTX_LISTING_PROVIDER_KEY,
  };
}

async function main() {
  console.log("\n=== STAGE 6.11G.8B — PROPTX INGESTION PROVENANCE ===\n");

  const helper = read("src/lib/proptx/listing-provenance.ts");
  const sync = read("src/lib/proptx/sync.ts");
  const fsbo = read("src/app/api/admin/fsbo/route.ts");
  const ownerCreate = read("src/app/api/owner/listings/route.ts");

  {
    assert.equal(PROPTX_TRREB_ORGANIZATION_SLUG, "ca-on-trreb");
    assert.equal(PROPTX_LISTING_PROVIDER_KEY, CURRENT_PROPTX_PROVIDER_KEY);
    const helperCode = helper
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    assert.ok(!helper.includes("cmt7kfcth0000gvu0bqsycsvz"));
    assert.ok(!helper.includes("cmtrdf23t000091u0cw3a5zu9"));
    assert.ok(!helperCode.includes("resolveAuthoritativeWorkspaceFromHost"));
    assert.ok(!helperCode.includes("WorkspaceDataConnection"));
    assert.ok(!helperCode.includes("HOUZZAT_WORKSPACE"));
    assert.ok(helper.includes("feed-bound, NOT workspace-bound"));
    assert.ok(sync.includes("ensurePropTxListingProvenance"));
    assert.ok(sync.includes("createPropTxProvenanceSession"));
    assert.ok(sync.includes("organizationId: options.provenance.organizationId"));
    assert.ok(sync.includes("Mirrors on create only"));
    console.log("[0] architecture / no workspace coupling / no hardcoded cuids... PASS");
  }

  {
    const { store } = createMemoryStore();
    const resolved = await resolvePropTxListingProvenance(store);
    assert.equal(resolved.organizationId, TRREB_ORG_ID);
    assert.equal(resolved.organizationSlug, "ca-on-trreb");
    assert.equal(resolved.providerKey, "proptx");

    const session = createPropTxProvenanceSession(store);
    const a = await session.get();
    const b = await session.get();
    assert.equal(a.organizationId, b.organizationId);

    await assert.rejects(
      () => resolvePropTxListingProvenance(createMemoryStore({ org: null }).store),
      (err: unknown) =>
        err instanceof PropTxProvenanceError && err.code === "directory_missing",
    );
    await assert.rejects(
      () =>
        resolvePropTxListingProvenance(
          createMemoryStore({ org: canonicalOrg({ active: false }) }).store,
        ),
      (err: unknown) =>
        err instanceof PropTxProvenanceError && err.code === "directory_inactive",
    );
    await assert.rejects(
      () =>
        resolvePropTxListingProvenance(
          createMemoryStore({
            org: canonicalOrg({ supportStatus: "UNSUPPORTED" }),
          }).store,
        ),
      (err: unknown) =>
        err instanceof PropTxProvenanceError && err.code === "directory_invalid",
    );
    console.log("[1] TRREB directory resolve / fail-closed... PASS");
  }

  {
    assert.equal(assertDurablePropTxListingKey(" W1234567 "), "W1234567");
    assert.throws(
      () => assertDurablePropTxListingKey(""),
      (err: unknown) =>
        err instanceof PropTxProvenanceError && err.code === "missing_listing_key",
    );
    assert.throws(
      () => assertDurablePropTxListingKey(null),
      (err: unknown) =>
        err instanceof PropTxProvenanceError && err.code === "missing_listing_key",
    );
    console.log("[2] durable ListingKey required... PASS");
  }

  {
    const { store, sources, mirrors } = createMemoryStore();
    const p = provenance();
    await ensurePropTxListingProvenance(store, p, {
      listingId: "listing_new",
      listingKey: "W1111111",
      mlsNumber: "W1111111",
      organizationId: null,
      providerKey: null,
    });
    assert.equal(sources.length, 1);
    assert.equal(sources[0]!.providerKey, "proptx");
    assert.equal(sources[0]!.organizationId, TRREB_ORG_ID);
    assert.equal(sources[0]!.providerListingKey, "W1111111");
    assert.equal(sources[0]!.sourceMlsNumber, "W1111111");
    assert.equal(sources[0]!.isPrimary, true);
    assert.deepEqual(mirrors.get("listing_new"), {
      organizationId: TRREB_ORG_ID,
      providerKey: "proptx",
    });
    console.log("[3] new listing → mirrors + PRIMARY source... PASS");
  }

  {
    const { store, sources, mirrors } = createMemoryStore();
    const p = provenance();
    await ensurePropTxListingProvenance(store, p, {
      listingId: "listing_null",
      listingKey: "W2222222",
      mlsNumber: "W2222222",
      organizationId: null,
      providerKey: null,
    });
    assert.equal(sources.length, 1);
    // Exact rerun
    await ensurePropTxListingProvenance(store, p, {
      listingId: "listing_null",
      listingKey: "W2222222",
      mlsNumber: "W2222222",
      organizationId: TRREB_ORG_ID,
      providerKey: "proptx",
    });
    assert.equal(sources.length, 1);
    assert.equal(mirrors.get("listing_null")?.organizationId, TRREB_ORG_ID);
    console.log("[4] null→canonical repair + exact rerun idempotent... PASS");
  }

  {
    const { store, sources, mirrors } = createMemoryStore();
    const p = provenance();
    mirrors.set("listing_mirrors_only", {
      organizationId: TRREB_ORG_ID,
      providerKey: "proptx",
    });
    await ensurePropTxListingProvenance(store, p, {
      listingId: "listing_mirrors_only",
      listingKey: "W3333333",
      mlsNumber: "W3333333",
      organizationId: TRREB_ORG_ID,
      providerKey: "proptx",
    });
    assert.equal(sources.length, 1);
    assert.equal(sources[0]!.providerListingKey, "W3333333");
    console.log("[5] partial recovery: mirrors only → source created... PASS");
  }

  {
    const { store, sources, mirrors } = createMemoryStore();
    const p = provenance();
    sources.push({
      id: "src_existing",
      listingId: "listing_source_only",
      organizationId: TRREB_ORG_ID,
      providerKey: "proptx",
      providerListingKey: "W4444444",
      sourceMlsNumber: "W4444444",
      isPrimary: true,
    });
    await ensurePropTxListingProvenance(store, p, {
      listingId: "listing_source_only",
      listingKey: "W4444444",
      mlsNumber: "W4444444",
      organizationId: null,
      providerKey: null,
    });
    assert.equal(sources.length, 1);
    assert.deepEqual(mirrors.get("listing_source_only"), {
      organizationId: TRREB_ORG_ID,
      providerKey: "proptx",
    });
    console.log("[6] partial recovery: source only → mirrors repaired... PASS");
  }

  {
    const p = provenance();
    assert.throws(
      () =>
        assertListingMirrorsCompatible(p, {
          organizationId: OTHER_ORG_ID,
          providerKey: null,
        }),
      (err: unknown) =>
        err instanceof PropTxProvenanceError &&
        err.code === "mirror_organization_conflict",
    );
    assert.throws(
      () =>
        assertListingMirrorsCompatible(p, {
          organizationId: null,
          providerKey: "other-provider",
        }),
      (err: unknown) =>
        err instanceof PropTxProvenanceError &&
        err.code === "mirror_provider_conflict",
    );

    const { store } = createMemoryStore();
    await assert.rejects(
      () =>
        ensurePropTxListingProvenance(store, p, {
          listingId: "listing_conflict_org",
          listingKey: "W5555555",
          mlsNumber: "W5555555",
          organizationId: OTHER_ORG_ID,
          providerKey: null,
        }),
      (err: unknown) =>
        err instanceof PropTxProvenanceError &&
        err.code === "mirror_organization_conflict",
    );
    console.log("[7] conflicting organization/provider refused... PASS");
  }

  {
    const { store, sources } = createMemoryStore();
    const p = provenance();
    sources.push({
      id: "src_other_primary",
      listingId: "listing_other_primary",
      organizationId: OTHER_ORG_ID,
      providerKey: "other",
      providerListingKey: "OTHER-1",
      sourceMlsNumber: "OTHER-1",
      isPrimary: true,
    });
    await assert.rejects(
      () =>
        ensurePropTxListingProvenance(store, p, {
          listingId: "listing_other_primary",
          listingKey: "W6666666",
          mlsNumber: "W6666666",
          organizationId: null,
          providerKey: null,
        }),
      (err: unknown) =>
        err instanceof PropTxProvenanceError &&
        err.code === "primary_source_conflict",
    );
    assert.equal(sources.length, 1);
    console.log("[8] conflicting PRIMARY source refused... PASS");
  }

  {
    const { store, sources } = createMemoryStore();
    const p = provenance();
    sources.push({
      id: "src_old_key",
      listingId: "listing_key_change",
      organizationId: TRREB_ORG_ID,
      providerKey: "proptx",
      providerListingKey: "OLD-KEY",
      sourceMlsNumber: "W7777777",
      isPrimary: true,
    });
    await assert.rejects(
      () =>
        ensurePropTxListingProvenance(store, p, {
          listingId: "listing_key_change",
          listingKey: "NEW-KEY",
          mlsNumber: "W7777777",
          organizationId: TRREB_ORG_ID,
          providerKey: "proptx",
        }),
      (err: unknown) =>
        err instanceof PropTxProvenanceError &&
        err.code === "listing_key_identity_conflict",
    );
    console.log("[9] ListingKey identity change refused... PASS");
  }

  {
    const { store, sources } = createMemoryStore();
    const p = provenance();
    sources.push({
      id: "src_bad_fields",
      listingId: "listing_field_conflict",
      organizationId: OTHER_ORG_ID,
      providerKey: "proptx",
      providerListingKey: "W8888888",
      sourceMlsNumber: "W8888888",
      isPrimary: true,
    });
    await assert.rejects(
      () =>
        ensurePropTxListingProvenance(store, p, {
          listingId: "listing_field_conflict",
          listingKey: "W8888888",
          mlsNumber: "W8888888",
          organizationId: null,
          providerKey: null,
        }),
      (err: unknown) =>
        err instanceof PropTxProvenanceError &&
        err.code === "source_field_conflict",
    );
    console.log("[10] same-key source field conflict refused... PASS");
  }

  {
    assert.ok(fsbo.includes('dataSource: "fsbo"'));
    assert.ok(!fsbo.includes("ensurePropTxListingProvenance"));
    assert.ok(!ownerCreate.includes("ensurePropTxListingProvenance"));
    assert.ok(sync.includes("upsertPropTxPropertiesOnDemand"));
    assert.ok(sync.includes("createPropTxProvenanceSession"));
    // Media/history/rooms do not create Listing rows independently.
    assert.ok(sync.includes("syncMediaForListing"));
    assert.ok(sync.includes("resolveListingIdByKey"));
    console.log("[11] FSBO/owner unchanged; PropTx create paths covered... PASS");
  }

  {
    const mapListing = read("src/lib/proptx/map-listing.ts");
    assert.ok(mapListing.includes("export function mapListingKey"));
    assert.ok(mapListing.includes("export function mapMlsNumber"));
    assert.ok(mapListing.includes('"ListingKey"'));
    assert.ok(mapListing.includes('"ListingId"'));
    console.log("[12] PropTx ListingKey/ListingId mapping preserved... PASS");
  }

  console.log("\nstage-6.11g8b-proptx-ingestion-provenance:selftest ok\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
