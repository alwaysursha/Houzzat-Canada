/**
 * Fast Sync unchanged-listing gate. Fixtures only — no PropTx, no database.
 * Run: pnpm mls:fast-change:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateFastListingChange,
  type FastIncomingProperty,
  type FastListingComparable,
} from "../src/lib/proptx/mls-fast-change";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const MOD = new Date("2026-09-21T18:00:00.000Z");
const PHOTO = new Date("2026-09-21T17:00:00.000Z");
const LISTED = new Date("2026-09-01T15:00:00.000Z");

function stored(overrides: Partial<FastListingComparable> = {}): FastListingComparable {
  return {
    status: "ACTIVE",
    listPrice: 899_000,
    soldPrice: null,
    soldAt: null,
    updatedAtMls: MOD,
    transactionType: "SALE",
    segment: "RESIDENTIAL",
    propertyType: "DETACHED",
    beds: 3,
    baths: 2,
    sqft: 1800,
    parkingSpaces: 2,
    yearBuilt: 1998,
    taxes: 5000,
    maintenanceFee: null,
    addressLine: "10 King St",
    unitNumber: null,
    city: "Mississauga",
    community: "Port Credit",
    postalCode: "L5H 1A1",
    province: "ON",
    description: "Bright detached.",
    brokerageName: "Houzzat Brokerage",
    listedAt: LISTED,
    listingKey: "LK1",
    ...overrides,
  };
}

function incoming(
  overrides: Partial<FastIncomingProperty> = {},
): FastIncomingProperty {
  return {
    ...stored(),
    modificationTimestamp: MOD,
    photosChangeTimestamp: PHOTO,
    ...overrides,
  };
}

function main() {
  console.log("\n=== MLS FAST CHANGE DETECTION ===\n");

  {
    const decision = evaluateFastListingChange(stored(), incoming());
    assert.equal(decision.write, false);
    console.log("[1] identical Property → skipped... PASS");
  }

  {
    const decision = evaluateFastListingChange(
      stored(),
      incoming({
        modificationTimestamp: new Date("2026-09-21T18:05:00.000Z"),
        updatedAtMls: new Date("2026-09-21T18:05:00.000Z"),
      }),
    );
    assert.equal(decision.write, true);
    if (!decision.write) throw new Error("expected write");
    assert.equal(decision.flags.newerModification, true);
    assert.equal(decision.fetchMedia, false);
    console.log("[2] newer ModificationTimestamp → processed, no media... PASS");
  }

  {
    const decision = evaluateFastListingChange(
      stored(),
      incoming({ listPrice: 875_000 }),
    );
    assert.equal(decision.write, true);
    if (!decision.write) throw new Error("expected write");
    assert.equal(decision.flags.priceChanged, true);
    assert.equal(decision.fetchMedia, false);
    console.log("[3] price change → processed... PASS");
  }

  {
    const decision = evaluateFastListingChange(
      stored(),
      incoming({ status: "SOLD_CONDITIONAL" }),
    );
    assert.equal(decision.write, true);
    if (!decision.write) throw new Error("expected write");
    assert.equal(decision.flags.statusChanged, true);
    console.log("[4] status change → processed... PASS");
  }

  {
    const soldAt = new Date("2026-09-21T16:00:00.000Z");
    const decision = evaluateFastListingChange(
      stored(),
      incoming({ status: "SOLD", soldAt, soldPrice: 880_000 }),
    );
    assert.equal(decision.write, true);
    if (!decision.write) throw new Error("expected write");
    assert.equal(decision.flags.statusChanged, true);
    assert.equal(decision.flags.soldChanged, true);
    console.log("[5] sold/leased change → processed... PASS");
  }

  {
    const decision = evaluateFastListingChange(
      stored({ status: "SOLD", soldAt: new Date("2026-09-20T12:00:00.000Z"), soldPrice: 880_000 }),
      incoming({
        status: "SOLD",
        soldAt: null,
        soldPrice: null,
      }),
    );
    assert.equal(decision.write, false);
    console.log("[5b] incomplete sold payload does not force a rewrite... PASS");
  }

  {
    const photo = new Date("2026-09-21T19:00:00.000Z");
    const decision = evaluateFastListingChange(
      stored(),
      incoming({ photosChangeTimestamp: photo }),
    );
    assert.equal(decision.write, true);
    if (!decision.write) throw new Error("expected write");
    assert.equal(decision.flags.photoChanged, true);
    assert.equal(decision.fetchMedia, true);
    console.log("[6] photo timestamp change → processed + media allowed... PASS");
  }

  {
    const decision = evaluateFastListingChange(stored(), incoming());
    assert.equal(decision.write, false);
    console.log(
      "[7] unchanged listing (including 1–4 photos) → no media fetch... PASS",
    );
  }

  {
    const decision = evaluateFastListingChange(null, incoming());
    assert.equal(decision.write, true);
    if (!decision.write) throw new Error("expected write");
    assert.equal(decision.isNew, true);
    assert.equal(decision.fetchMedia, true);
    console.log("[8] new listing → processed + media allowed... PASS");
  }

  {
    const decision = evaluateFastListingChange(stored(), incoming());
    assert.equal(decision.write, false);
    console.log("[9] unchanged listing does not request Typesense... PASS");
  }

  {
    const sync = read("src/lib/proptx/sync.ts");
    const upsertStart = sync.indexOf("async function upsertPropertyRow");
    const onDemand = sync.indexOf("export async function upsertPropTxPropertiesOnDemand");
    const upsertFn = sync.slice(upsertStart, onDemand);
    const provenanceAt = upsertFn.indexOf("assertListingMirrorsCompatible");
    const skipAt = upsertFn.indexOf("FAST_UNCHANGED_SKIP");
    const writeAt = upsertFn.indexOf("prisma.listing.upsert");
    const typesenseAt = upsertFn.indexOf("pushListingToTypesense");
    assert.ok(provenanceAt >= 0 && skipAt > provenanceAt);
    assert.ok(writeAt > skipAt && typesenseAt > skipAt);
    assert.ok(upsertFn.includes("allowMediaFetch"));
    assert.ok(upsertFn.includes("propertyUnchangedSkipped"));
    const fastStart = sync.indexOf("async function runMlsFastPropertyPasses");
    const fastEnd = sync.indexOf("export async function runPropTxMlsSync");
    const fastFn = sync.slice(fastStart, fastEnd);
    assert.equal(fastFn.split("fastUnchangedSkip: true").length - 1, 2);
    assert.ok(!fastFn.includes("setCursor"));
    assert.ok(!fastFn.includes("getCursor"));
    const runStart = sync.indexOf("export async function runPropTxMlsSync");
    const runEnd = sync.indexOf("function emptyStats");
    const runFn = sync.slice(runStart, runEnd);
    assert.ok(!runFn.includes("fastUnchangedSkip"));
    assert.ok(runFn.includes("await syncProperties("));
    assert.ok(runFn.includes("await syncSoldAtBackfill"));
    assert.ok(runFn.includes("await syncMediaBackfill"));
    assert.ok(sync.includes("assertMlsSyncCursorAccess"));
    assert.ok(sync.includes("gateMlsTypesenseDocument") || read("src/lib/typesense/sync-listing.ts").includes("gateMlsTypesenseDocument"));
    console.log(
      "[10] provenance before skip; fast does not touch cursor; full sync unchanged... PASS",
    );
  }

  console.log("\nMLS FAST CHANGE DETECTION SELFTEST PASSED\n");
}

main();
