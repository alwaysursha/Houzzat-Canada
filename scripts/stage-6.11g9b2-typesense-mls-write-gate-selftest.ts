/**
 * MLS Typesense write gate + Open House rail day default.
 * Run: pnpm stage-6.11g9b2-typesense-mls-write-gate:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  defaultOpenHouseDayTab,
  listingHasOpenHouseOnDay,
} from "@/lib/listings/home-open-house-day";
import {
  buildListingSourceAuthorityKey,
  listingToTypesenseDocument,
  type ListingForTypesense,
} from "@/lib/typesense/listing-document";
import { gateMlsTypesenseDocument } from "@/lib/typesense/mls-write-gate";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const TRREB = "cmtrdf23t000091u0cw3a5zu9";
const SAK = `${TRREB}:proptx`;

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
    listedAt: new Date("2026-01-01T12:00:00Z"),
    updatedAtMls: new Date("2026-01-02T12:00:00Z"),
    daysOnMarket: 10,
    brokerageName: "Test Brokerage",
    lat: 43.65,
    lng: -79.38,
    media: [],
    ...overrides,
  };
}

function localWeekdayIso(weekday: number): string {
  const d = new Date();
  d.setHours(15, 0, 0, 0);
  d.setDate(d.getDate() + ((weekday - d.getDay() + 7) % 7));
  return d.toISOString();
}

async function main() {
  console.log("\n=== STAGE 6.11G.9B2 — MLS TYPESENSE WRITE GATE ===\n");

  const syncSrc = read("src/lib/typesense/sync-listing.ts");
  const searchSrc = read("src/lib/typesense/search.ts");
  const ohBackfill = read("scripts/typesense-backfill-open-houses.ts");
  const importSrc = read("scripts/typesense-import-listings.ts");
  const syncTs = read("src/lib/proptx/sync.ts");

  {
    const listing = baseListing({
      organizationId: TRREB,
      providerKey: "proptx",
    });
    const doc = listingToTypesenseDocument(listing);
    assert.equal(doc.organizationId, TRREB);
    assert.equal(doc.providerKey, "proptx");
    assert.equal(doc.sourceAuthorityKey, SAK);
    assert.equal(buildListingSourceAuthorityKey(TRREB, "proptx"), SAK);
    const gate = gateMlsTypesenseDocument({
      dataSource: "mls",
      organizationId: TRREB,
      providerKey: "proptx",
      document: doc,
    });
    assert.equal(gate.allow, true);
    console.log("[A] MLS Typesense document includes org/provider/SAK... PASS");
  }

  {
    const listing = baseListing({
      organizationId: null,
      providerKey: null,
    });
    const doc = listingToTypesenseDocument(listing);
    const gate = gateMlsTypesenseDocument({
      dataSource: "mls",
      organizationId: listing.organizationId,
      providerKey: listing.providerKey,
      document: doc,
    });
    assert.equal(gate.allow, false);
    if (!gate.allow) assert.equal(gate.reason, "missing_provenance");

    const partial = listingToTypesenseDocument(
      baseListing({ organizationId: TRREB, providerKey: null }),
    );
    const partialGate = gateMlsTypesenseDocument({
      dataSource: "mls",
      organizationId: TRREB,
      providerKey: null,
      document: partial,
    });
    assert.equal(partialGate.allow, false);

    assert.ok(syncSrc.includes("gateMlsTypesenseDocument"));
    assert.ok(syncSrc.includes('return { ok: false, reason: gate.reason }'));
    assert.ok(importSrc.includes("gateMlsTypesenseDocument"));
    console.log("[B] missing MLS provenance prevents Typesense write... PASS");
  }

  {
    const withOh = listingToTypesenseDocument(
      baseListing({
        organizationId: TRREB,
        providerKey: "proptx",
        openHouses: [
          {
            startsAt: new Date("2026-09-12T18:00:00Z"),
            endsAt: new Date("2026-09-12T20:00:00Z"),
          },
        ],
      }),
    );
    const withoutOh = listingToTypesenseDocument(
      baseListing({
        organizationId: TRREB,
        providerKey: "proptx",
        openHouses: [],
      }),
    );
    assert.equal(withOh.sourceAuthorityKey, SAK);
    assert.equal(withoutOh.sourceAuthorityKey, SAK);
    assert.equal(withOh.organizationId, withoutOh.organizationId);
    assert.equal(withOh.providerKey, withoutOh.providerKey);
    assert.ok((withOh.nextOpenHouseStartsAt ?? 0) > 0);
    assert.equal(withoutOh.nextOpenHouseStartsAt, 0);
    const ohGate = gateMlsTypesenseDocument({
      dataSource: "mls",
      organizationId: TRREB,
      providerKey: "proptx",
      document: withOh,
    });
    assert.equal(ohGate.allow, true);
    assert.ok(ohBackfill.includes("syncListingToTypesense"));
    assert.ok(!ohBackfill.includes("action: \"update\""));
    console.log("[C] OH update cannot strip provenance... PASS");
  }

  {
    const filtersSrc = read(
      "src/lib/tenancy/listing-entitlement/search-authority-filters.ts",
    );
    assert.ok(!searchSrc.includes("organizationId:="));
    assert.ok(!searchSrc.includes("providerKey:="));
    assert.ok(filtersSrc.includes("sourceAuthorityKey:="));
    assert.ok(!filtersSrc.includes("organizationId:="));
    assert.ok(searchSrc.includes("buildEntitledTypesenseFilterBy"));
    assert.ok(searchSrc.includes("openHouseFilterByEntitled"));
    console.log("[D] G.10 exact SAK filter unchanged... PASS");
  }

  {
    assert.ok(
      searchSrc.includes('"listedAt:desc,updatedAtMls:desc"'),
    );
    assert.ok(!searchSrc.includes("createdAt:desc"));
    assert.ok(searchSrc.includes("resolveListingAddedAt"));
    console.log("[E] Newest sort remains listedAt/updatedAtMls... PASS");
  }

  {
    assert.equal(defaultOpenHouseDayTab(3, 2), "sat");
    assert.equal(defaultOpenHouseDayTab(2, 0), "sat");
    assert.equal(defaultOpenHouseDayTab(0, 4), "sun");
    assert.equal(defaultOpenHouseDayTab(0, 0), "sat");

    const satIso = localWeekdayIso(6);
    const sunIso = localWeekdayIso(0);
    const satOnly = {
      openHouses: [{ startsAt: satIso, endsAt: satIso }],
    };
    const sunOnly = {
      openHouses: [{ startsAt: sunIso, endsAt: sunIso }],
    };
    const both = {
      openHouses: [
        { startsAt: satIso, endsAt: satIso },
        { startsAt: sunIso, endsAt: sunIso },
      ],
    };
    const neither = { openHouses: [] };

    assert.equal(listingHasOpenHouseOnDay(satOnly, "sat"), true);
    assert.equal(listingHasOpenHouseOnDay(satOnly, "sun"), false);
    assert.equal(listingHasOpenHouseOnDay(sunOnly, "sun"), true);
    assert.equal(listingHasOpenHouseOnDay(sunOnly, "sat"), false);
    assert.equal(listingHasOpenHouseOnDay(both, "sat"), true);
    assert.equal(listingHasOpenHouseOnDay(both, "sun"), true);
    assert.equal(listingHasOpenHouseOnDay(neither, "sat"), false);
    assert.equal(listingHasOpenHouseOnDay(neither, "sun"), false);

    const railSrc = read("src/components/home/HomeOpenHousesRail.tsx");
    assert.ok(railSrc.includes("userTab ?? preferredTab"));
    assert.ok(railSrc.includes("defaultOpenHouseDayTab"));
    console.log("[F] Open House rail day default... PASS");
  }

  {
    const fsboDoc = listingToTypesenseDocument(
      baseListing({
        mlsNumber: "FSBO1",
        organizationId: null,
        providerKey: null,
      }),
    );
    const fsboGate = gateMlsTypesenseDocument({
      dataSource: "fsbo",
      organizationId: null,
      providerKey: null,
      document: fsboDoc,
    });
    assert.equal(fsboGate.allow, true);
    assert.equal(fsboDoc.sourceAuthorityKey, undefined);

    const manualGate = gateMlsTypesenseDocument({
      dataSource: "manual",
      organizationId: null,
      providerKey: null,
      document: fsboDoc,
    });
    assert.equal(manualGate.allow, true);
    console.log("[G] FSBO/manual writes not gated as MLS... PASS");
  }

  {
    assert.ok(syncTs.includes("typesenseMissingProvenance"));
    assert.ok(syncTs.includes("typesenseAttempted"));
    assert.ok(syncTs.includes('status: typesenseDegraded ? "degraded"'));
    assert.ok(syncTs.includes("pushListingToTypesense"));
    console.log("[H] MlsSyncRun degraded reporting... PASS");
  }

  console.log("\nstage-6.11g9b2-typesense-mls-write-gate:selftest ok\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
