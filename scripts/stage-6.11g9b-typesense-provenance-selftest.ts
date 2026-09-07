/**
 * Stage 6.11G.9B — Typesense listing provenance mapper / schema selftest.
 * Run: pnpm stage-6.11g9b-typesense-provenance:selftest
 * No production Typesense mutation / reindex / entitlement.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  G5_ENTITLEMENT_FILTERING_ENABLED,
  G5_TYPESENSE_REINDEX_ENABLED,
} from "@/lib/tenancy/listing-provenance/contract";
import {
  buildListingSourceAuthorityKey,
  listingToTypesenseDocument,
  type ListingForTypesense,
} from "@/lib/typesense/listing-document";
import {
  TYPESENSE_LISTING_PROVENANCE_FIELDS,
  ensureTypesenseListingProvenanceFields,
} from "@/lib/typesense/listing-provenance-fields";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const TRREB = "cmtrdf23t000091u0cw3a5zu9";

function baseListing(
  overrides: Partial<ListingForTypesense> = {},
): ListingForTypesense {
  return {
    mlsNumber: "W1234567",
    addressLine: "1 Test St",
    unitNumber: null,
    city: "Toronto",
    community: null,
    postalCode: null,
    province: "ON",
    status: "ACTIVE",
    segment: "RESIDENTIAL",
    transactionType: "SALE",
    propertyType: "Detached",
    listPrice: 1_000_000,
    soldPrice: null,
    beds: 3,
    baths: 2,
    sqft: null,
    parkingSpaces: 1,
    listedAt: new Date("2026-01-01T00:00:00Z"),
    updatedAtMls: new Date("2026-01-02T00:00:00Z"),
    daysOnMarket: 10,
    brokerageName: "Test Brokerage",
    lat: 43.65,
    lng: -79.38,
    media: [],
    ...overrides,
  };
}

async function main() {
  console.log("\n=== STAGE 6.11G.9B — TYPESENSE PROVENANCE HARDENING ===\n");

  const docSrc = read("src/lib/typesense/listing-document.ts");
  const syncSrc = read("src/lib/typesense/sync-listing.ts");
  const importSrc = read("scripts/typesense-import-listings.ts");
  const searchSrc = read("src/lib/typesense/search.ts");
  const ensureScript = read("scripts/typesense-ensure-provenance-fields.ts");

  {
    assert.equal(
      buildListingSourceAuthorityKey(TRREB, "proptx"),
      `${TRREB}:proptx`,
    );
    assert.equal(buildListingSourceAuthorityKey(null, "proptx"), undefined);
    assert.equal(buildListingSourceAuthorityKey(TRREB, null), undefined);
    assert.equal(buildListingSourceAuthorityKey("  ", "proptx"), undefined);
    assert.equal(buildListingSourceAuthorityKey(TRREB, "  "), undefined);
    assert.equal(
      buildListingSourceAuthorityKey(` ${TRREB} `, " proptx "),
      `${TRREB}:proptx`,
    );
    console.log("[0] buildListingSourceAuthorityKey... PASS");
  }

  {
    const doc = listingToTypesenseDocument(
      baseListing({
        organizationId: TRREB,
        providerKey: "proptx",
      }),
    );
    assert.equal(doc.id, "W1234567");
    assert.equal(doc.organizationId, TRREB);
    assert.equal(doc.providerKey, "proptx");
    assert.equal(doc.sourceAuthorityKey, `${TRREB}:proptx`);
    console.log("[1] canonical MLS mapper... PASS");
  }

  {
    const doc = listingToTypesenseDocument(
      baseListing({
        organizationId: null,
        providerKey: null,
      }),
    );
    assert.equal(doc.organizationId, undefined);
    assert.equal(doc.providerKey, undefined);
    assert.equal(doc.sourceAuthorityKey, undefined);
    assert.ok(!("organizationId" in doc && doc.organizationId === ""));
    assert.ok(!JSON.stringify(doc).includes("cmtrdf23t"));
    assert.ok(!JSON.stringify(doc).includes('"proptx"'));
    console.log("[2] null provenance omit (no TRREB/proptx fallback)... PASS");
  }

  {
    const orgOnly = listingToTypesenseDocument(
      baseListing({ organizationId: TRREB, providerKey: null }),
    );
    assert.equal(orgOnly.organizationId, TRREB);
    assert.equal(orgOnly.providerKey, undefined);
    assert.equal(orgOnly.sourceAuthorityKey, undefined);

    const providerOnly = listingToTypesenseDocument(
      baseListing({ organizationId: null, providerKey: "proptx" }),
    );
    assert.equal(providerOnly.organizationId, undefined);
    assert.equal(providerOnly.providerKey, "proptx");
    assert.equal(providerOnly.sourceAuthorityKey, undefined);

    const blankPair = listingToTypesenseDocument(
      baseListing({ organizationId: "  ", providerKey: "proptx" }),
    );
    assert.equal(blankPair.organizationId, undefined);
    assert.equal(blankPair.sourceAuthorityKey, undefined);
    console.log("[3] partial provenance / blank handling... PASS");
  }

  {
    const fsbo = listingToTypesenseDocument(
      baseListing({
        mlsNumber: "FSBO1",
        organizationId: null,
        providerKey: null,
      }),
    );
    assert.equal(fsbo.organizationId, undefined);
    assert.equal(fsbo.providerKey, undefined);
    assert.equal(fsbo.sourceAuthorityKey, undefined);
    console.log("[4] FSBO-like provenance-null omit... PASS");
  }

  {
    for (const field of TYPESENSE_LISTING_PROVENANCE_FIELDS) {
      assert.equal(field.type, "string");
      assert.equal(field.optional, true);
      assert.equal(field.facet, true);
    }
    assert.deepEqual(
      TYPESENSE_LISTING_PROVENANCE_FIELDS.map((f) => f.name),
      ["organizationId", "providerKey", "sourceAuthorityKey"],
    );

    const calls: string[] = [];
    const fakeClient = {
      collections: (name: string) => ({
        retrieve: async () => {
          calls.push(`retrieve:${name}`);
          return { fields: [{ name: "mlsNumber" }] };
        },
        update: async (body: { fields: unknown[] }) => {
          calls.push(`update:${body.fields.length}`);
          return {};
        },
      }),
    };
    const first = await ensureTypesenseListingProvenanceFields({
      client: fakeClient,
      collectionName: "listings",
    });
    assert.deepEqual(first.added, [
      "organizationId",
      "providerKey",
      "sourceAuthorityKey",
    ]);
    assert.deepEqual(first.alreadyPresent, []);

    const fakeClientPresent = {
      collections: (name: string) => ({
        retrieve: async () => {
          calls.push(`retrieve2:${name}`);
          return {
            fields: [
              { name: "organizationId" },
              { name: "providerKey" },
              { name: "sourceAuthorityKey" },
            ],
          };
        },
        update: async () => {
          throw new Error("update must not run when fields exist");
        },
      }),
    };
    const second = await ensureTypesenseListingProvenanceFields({
      client: fakeClientPresent,
      collectionName: "listings",
    });
    assert.deepEqual(second.added, []);
    assert.deepEqual(second.alreadyPresent, [
      "organizationId",
      "providerKey",
      "sourceAuthorityKey",
    ]);
    console.log("[5] schema field defs + ensure (no live Typesense)... PASS");
  }

  {
    assert.ok(syncSrc.includes("organizationId: true"));
    assert.ok(syncSrc.includes("providerKey: true"));
    assert.ok(importSrc.includes("organizationId: true"));
    assert.ok(importSrc.includes("providerKey: true"));
    assert.ok(docSrc.includes("buildListingSourceAuthorityKey"));
    assert.ok(docSrc.includes("sourceAuthorityKey"));
    // hydrate / OH / status heal all go through syncListingToTypesense
    assert.ok(
      read("src/lib/typesense/hydrate-status.ts").includes(
        "syncListingToTypesense",
      ),
    );
    assert.ok(
      read("scripts/typesense-backfill-open-houses.ts").includes(
        "syncListingToTypesense",
      ),
    );
    assert.ok(
      read("scripts/audit-status-consistency.ts").includes(
        "syncListingToTypesense",
      ),
    );
    assert.ok(
      read("scripts/audit-status-sale-heal.ts").includes(
        "syncListingToTypesense",
      ),
    );
    assert.ok(ensureScript.includes("ensureTypesenseListingProvenanceFields"));
    // Must not auto-invoke ensure from sync in G.9B (no prod schema mutation).
    assert.ok(!syncSrc.includes("ensureTypesenseListingProvenanceFields"));
    console.log("[6] Prisma select / write-path contract... PASS");
  }

  {
    assert.equal(G5_ENTITLEMENT_FILTERING_ENABLED, false);
    assert.equal(G5_TYPESENSE_REINDEX_ENABLED, false);
    // G.10B1 may reference sourceAuthorityKey behind the OFF flag.
    // Must never authorize via independent org/provider IN lists (cross-product).
    assert.ok(!searchSrc.includes("organizationId:="));
    assert.ok(!searchSrc.includes("providerKey:="));
    assert.ok(
      searchSrc.includes("isListingEntitlementEnforcementEnabled") ||
        searchSrc.includes("G5_ENTITLEMENT_FILTERING_ENABLED") ||
        searchSrc.includes("buildEntitledTypesenseFilterBy"),
    );
    console.log("[7] entitlement flag OFF; no org×provider cross-product... PASS");
  }

  console.log("\nstage-6.11g9b-typesense-provenance:selftest ok\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
