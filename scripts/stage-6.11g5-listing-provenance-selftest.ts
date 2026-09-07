/**
 * Stage 6.11G.5 / G.5A — Listing provenance identity selftest.
 * Run: pnpm stage-6.11g5-listing-provenance:selftest
 * No production mutation / migration apply / backfill.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  G5_BACKFILL_ENABLED,
  G5_ENTITLEMENT_FILTERING_ENABLED,
  G5_TYPESENSE_REINDEX_ENABLED,
  LISTING_ORG_PROVIDER_ARE_DENORMALIZED_PRIMARY,
  LISTING_OWNED_BY_WORKSPACE_DATA_CONNECTION,
  LISTING_SOURCE_FEED_KEY_INCLUDED,
  LISTING_SOURCE_IS_CANONICAL_LINEAGE,
  LISTING_SOURCE_MODEL,
  MLS_NUMBER_GLOBALLY_UNIQUE_IS_MULTI_BOARD_RISK,
  NON_MLS_PROVENANCE_CHANNELS,
  PROVIDER_LISTING_KEY_REQUIRED,
  PROPTX_PROVIDER_LISTING_KEY_FIELD,
  PROPTX_SOURCE_MLS_NUMBER_FIELD,
} from "@/lib/tenancy/listing-provenance";
import {
  getTemplate,
  listSelectableTemplates,
  TEAM_SIGNATURE_TEMPLATE_ID,
} from "@/lib/tenancy/templates";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const MIGRATION =
  "prisma/migrations/20260907200000_stage_611g5_listing_provenance_foundation/migration.sql";

function modelBlock(schema: string, modelName: string): string {
  const start = schema.indexOf(`model ${modelName} {`);
  assert.ok(start >= 0, `missing model ${modelName}`);
  const end = schema.indexOf("\nmodel ", start + 1);
  assert.ok(end > start);
  return schema.slice(start, end);
}

async function main() {
  console.log("\n=== STAGE 6.11G.5A — LISTING SOURCE IDENTITY / PROVENANCE ===\n");

  const schema = read("prisma/schema.prisma");
  const migration = read(MIGRATION);
  const contract = read("src/lib/tenancy/listing-provenance/contract.ts");
  const mapListing = read("src/lib/proptx/map-listing.ts");
  const listing = modelBlock(schema, "Listing");
  const source = modelBlock(schema, "ListingSource");
  const ddl = migration.replace(/^--.*$/gm, "");

  {
    assert.equal(LISTING_SOURCE_MODEL, "ListingSource");
    assert.ok(schema.includes("model ListingSource"));
    assert.ok(listing.includes("organizationId"));
    assert.ok(listing.includes("providerKey"));
    assert.ok(migration.includes('CREATE TABLE "ListingSource"'));
    console.log("[0] provenance architecture exists (hybrid)... PASS");
  }

  {
    assert.equal(LISTING_SOURCE_IS_CANONICAL_LINEAGE, true);
    assert.equal(LISTING_ORG_PROVIDER_ARE_DENORMALIZED_PRIMARY, true);
    assert.ok(contract.includes("CANONICAL lineage"));
    assert.ok(contract.includes("DENORMALIZED"));
    assert.ok(schema.includes("DENORMALIZED primary provenance"));
    assert.ok(migration.includes("ListingSource_one_primary_per_listing_key"));
    assert.ok(migration.includes('WHERE "isPrimary" = true'));
    console.log("[1] primary-source canonical + denormalized Listing fields... PASS");
  }

  {
    assert.equal(PROVIDER_LISTING_KEY_REQUIRED, true);
    assert.ok(/\n\s+providerListingKey\s+String\n/.test(source) || /\n\s+providerListingKey\s+String\s/.test(source));
    assert.ok(!source.includes("providerListingKey String?"));
    assert.ok(migration.includes('"providerListingKey" TEXT NOT NULL'));
    assert.equal(PROPTX_PROVIDER_LISTING_KEY_FIELD, "ListingKey");
    assert.equal(PROPTX_SOURCE_MLS_NUMBER_FIELD, "ListingId");
    assert.ok(mapListing.includes("export function mapListingKey"));
    assert.ok(mapListing.includes("ListingKey"));
    assert.ok(mapListing.includes("export function mapMlsNumber"));
    console.log("[2] providerListingKey REQUIRED; PropTx = ListingKey... PASS");
  }

  {
    assert.ok(
      source.includes("@@unique([listingId, providerKey, providerListingKey])"),
    );
    assert.ok(
      migration.includes(
        '"listingId", "providerKey", "providerListingKey"',
      ),
    );
    // No nullable providerListingKey → no duplicate-NULL UNIQUE hole.
    assert.ok(!/"providerListingKey" TEXT,/.test(ddl) || migration.includes('"providerListingKey" TEXT NOT NULL'));
    assert.ok(migration.includes('"providerListingKey" TEXT NOT NULL'));
    console.log("[3] uniqueness without ambiguous NULL identities... PASS");
  }

  {
    assert.equal(LISTING_SOURCE_FEED_KEY_INCLUDED, false);
    assert.ok(!/\n\s+feedKey\s+/.test(source));
    assert.ok(!ddl.includes('"feedKey"'));
    assert.ok(contract.includes("feedKey") && contract.includes("REMOVED"));
    console.log("[4] feedKey removed (not IDX/VOW access class)... PASS");
  }

  {
    assert.equal(LISTING_OWNED_BY_WORKSPACE_DATA_CONNECTION, false);
    assert.ok(!/\n\s+workspaceId\s+/.test(listing));
    assert.ok(!/\n\s+workspaceId\s+/.test(source));
    assert.ok(!listing.includes("workspaceDataConnectionId"));
    assert.ok(!source.includes("workspaceDataConnectionId"));
    console.log("[5] no Workspace / DataConnection ownership... PASS");
  }

  {
    assert.equal(MLS_NUMBER_GLOBALLY_UNIQUE_IS_MULTI_BOARD_RISK, true);
    assert.ok(listing.includes("@unique"));
    assert.ok(!ddl.includes("DROP INDEX") && !/\bDROP\b/i.test(ddl));
    console.log("[6] global mlsNumber uniqueness unchanged (documented risk)... PASS");
  }

  {
    for (const ch of NON_MLS_PROVENANCE_CHANNELS) {
      assert.ok(contract.includes(ch));
    }
    assert.ok(contract.includes("must NOT"));
    console.log("[7] FSBO/mock/manual not tagged MLS... PASS");
  }

  {
    assert.ok(contract.includes("never auto-merge"));
    assert.ok(contract.includes("ACTIVE connection"));
    assert.ok(contract.includes("DATA capability"));
    console.log("[8] multi-source + G.4A entitlement match contract... PASS");
  }

  {
    assert.equal(G5_ENTITLEMENT_FILTERING_ENABLED, false);
    assert.equal(G5_BACKFILL_ENABLED, false);
    assert.equal(G5_TYPESENSE_REINDEX_ENABLED, false);
    assert.ok(!/PropTx|PROPTX|TRREB/i.test(ddl));
    assert.ok(!/INSERT\s+INTO/i.test(ddl));
    assert.ok(
      !read("src/lib/listings/provider.ts").includes("ListingSource"),
    );
    console.log("[9] no entitlement / backfill / Typesense / PropTx runtime... PASS");
  }

  {
    const team = getTemplate(TEAM_SIGNATURE_TEMPLATE_ID);
    assert.equal(team?.selectable, false);
    assert.equal(listSelectableTemplates().length, 2);
    console.log("[10] Team Signature selectable=false... PASS");
  }

  console.log("\nSTAGE 6.11G.5A selftest passed.\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
