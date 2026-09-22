/**
 * MLS execution-path lockdown. Mocks and source checks only.
 * Does not create ~/.houzzat/mls-sync-host and does not call PropTx.
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { readdirSync } from "node:fs";
import {
  assertMlsSyncExecutionHost,
  MlsSyncHostError,
  mlsSyncHostMarkerPath,
} from "../src/lib/proptx/mls-sync-host";
import { listingCardFromPropTx } from "../src/lib/proptx/read-only-listing";
import { historyRowsWithLiveAddressSiblings } from "../src/lib/proptx/address-history-enrich";
import { applyNeonListingStatuses } from "../src/lib/typesense/hydrate-status";
import { loadListingForDetailPage } from "../src/lib/listings/load-listing-for-detail";

const root = join(import.meta.dirname, "..");

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function sliceFn(source: string, startMark: string, endMark: string): string {
  const start = source.indexOf(startMark);
  assert.ok(start >= 0, `missing ${startMark}`);
  const end = source.indexOf(endMark, start + startMark.length);
  assert.ok(end > start, `missing ${endMark} after ${startMark}`);
  return source.slice(start, end);
}

const homeMarker = join(homedir(), ".houzzat", "mls-sync-host");
const homeMarkerExisted = existsSync(homeMarker);

const sampleRow = {
  ListingId: "W1234567",
  ListingKey: "key-w1234567",
  ListPrice: 900000,
  City: "Toronto",
  UnparsedAddress: "1 King Street",
  Latitude: 43.65,
  Longitude: -79.38,
  ModificationTimestamp: "2026-09-01T12:00:00Z",
  ListingContractDate: "2026-08-01",
  PublicRemarks: "Bright home",
  ListOfficeName: "Test Brokerage",
  PropertySubType: "Detached",
  TransactionType: "For Sale",
  StandardStatus: "Active",
  BedroomsTotal: 3,
  BathroomsTotalInteger: 2,
};

async function main() {
  {
    const previous = process.env.MLS_SYNC_HOST_MARKER;
    delete process.env.MLS_SYNC_HOST_MARKER;
    assert.equal(
      mlsSyncHostMarkerPath(),
      join(homedir(), ".houzzat", "mls-sync-host"),
    );
    if (previous == null) delete process.env.MLS_SYNC_HOST_MARKER;
    else process.env.MLS_SYNC_HOST_MARKER = previous;

    const missing = join(tmpdir(), `mls-sync-host-missing-${process.pid}`);
    let fetched = false;
    let mutated = false;
    await assert.rejects(
      async () => {
        assertMlsSyncExecutionHost({ MLS_SYNC_HOST_MARKER: missing });
        fetched = true;
        mutated = true;
      },
      (err: unknown) => err instanceof MlsSyncHostError,
    );
    assert.equal(fetched, false);
    assert.equal(mutated, false);

    const dir = mkdtempSync(join(tmpdir(), "mls-sync-host-"));
    const emptyPath = join(dir, "empty");
    writeFileSync(emptyPath, "   \n");
    await assert.rejects(
      async () => {
        assertMlsSyncExecutionHost({ MLS_SYNC_HOST_MARKER: emptyPath });
      },
      (err: unknown) => err instanceof MlsSyncHostError,
    );

    const markerPath = join(dir, "marker");
    writeFileSync(markerPath, "sync-mac\n");
    assert.doesNotThrow(() =>
      assertMlsSyncExecutionHost({ MLS_SYNC_HOST_MARKER: markerPath }),
    );
    rmSync(dir, { recursive: true, force: true });

    await assert.rejects(
      async () => {
        assertMlsSyncExecutionHost({ MLS_SYNC_HOST_MARKER: "1" });
      },
      (err: unknown) => err instanceof MlsSyncHostError,
    );

    const hostSrc = read("src/lib/proptx/mls-sync-host.ts");
    assert.equal(hostSrc.includes("ALLOW_UNSAFE"), false);
    assert.equal(hostSrc.includes("SKIP_HOST"), false);
    assert.equal(/allowUnsafe/i.test(hostSrc), false);
    console.log("[1] host marker blocks before fetch/write; temp marker passes... PASS");
  }

  {
    const route = read("src/app/api/admin/mls/sync/route.ts");
    assert.equal(route.includes("runPropTxMlsSync"), false);
    assert.ok(route.includes("getPropTxSyncHealth"));
    assert.ok(route.includes("status: 410"));
    const { POST } = await import("../src/app/api/admin/mls/sync/route");
    const res = await POST();
    assert.equal(res.status, 410);
    const body = (await res.json()) as { error?: string };
    assert.match(body.error ?? "", /Sync Mac/);
    console.log("[2] admin POST is 410; GET stays a health read... PASS");
  }

  {
    const workflowsDir = join(root, ".github/workflows");
    const files = readdirSync(workflowsDir).filter((name) => name.endsWith(".yml"));
    const joined = files
      .map((name) => readFileSync(join(workflowsDir, name), "utf8"))
      .join("\n");
    for (const banned of [
      "pnpm mls:sync",
      "pnpm mls:media",
      "pnpm mls:geocode",
      "MLS_SYNC_ACTIVE_INVENTORY",
    ]) {
      assert.equal(joined.includes(banned), false, banned);
    }
    for (const name of [
      "mls-sync.yml",
      "mls-media.yml",
      "mls-inventory.yml",
      "mls-geocode.yml",
    ]) {
      const src = readFileSync(join(workflowsDir, name), "utf8");
      assert.equal(src.includes("workflow_dispatch"), false, name);
      assert.equal(src.includes("schedule:"), false, name);
      assert.equal(src.includes("PROPTX_"), false, name);
      assert.equal(src.includes("secrets."), false, name);
    }
    console.log("[3] GitHub MLS workflows cannot execute sync/media/geocode... PASS");
  }

  {
    const lookup = read("src/lib/proptx/on-demand-lookup.ts");
    assert.equal(lookup.includes("upsertPropTxPropertiesOnDemand"), false);
    assert.equal(lookup.includes("prisma.listing"), false);
    const card = listingCardFromPropTx(sampleRow);
    assert.ok(card);
    assert.equal(card.mlsNumber, "W1234567");
    assert.equal(card.status, "ACTIVE");
    const search = read("src/app/api/listings/search/route.ts");
    assert.ok(search.includes("lookupPropTxOnDemand"));
    assert.ok(search.includes("pulled.cards"));
    assert.equal(search.includes("upsertPropTxPropertiesOnDemand"), false);
    const autocomplete = read("src/app/api/listings/autocomplete/route.ts");
    assert.equal(autocomplete.includes("lookupPropTxOnDemand"), false);
    assert.equal(autocomplete.includes("lookupAndUpsertOnDemand"), false);
    assert.equal(autocomplete.includes("upsertPropTxPropertiesOnDemand"), false);
    console.log("[4] search miss is a live card; autocomplete does not persist... PASS");
  }

  {
    const listing = await loadListingForDetailPage("W1234567", {
      entitlementFilteringEnabled: false,
      getByMlsForDetailPage: async () => null,
      onDemandLookup: async () => ({
        mlsNumbers: ["W1234567"],
        rows: [sampleRow],
      }),
    });
    assert.ok(listing);
    assert.equal(listing.mlsNumber, "W1234567");
    assert.equal(listing.id.startsWith("live:"), true);
    assert.equal(listing.media.length, 0);
    const loader = read("src/lib/listings/load-listing-for-detail.ts");
    assert.equal(loader.includes("upsertPropTxPropertiesOnDemand"), false);
    assert.equal(loader.includes("prisma.listing.upsert"), false);
    console.log("[5] listing-detail miss stays usable and is not persisted... PASS");
  }

  {
    const rows = historyRowsWithLiveAddressSiblings(
      {
        mlsNumber: "W1234567",
        addressLine: "1 King Street",
        city: "Toronto",
        listPrice: 900000,
        listedAt: new Date("2026-08-01T00:00:00Z"),
        status: "ACTIVE",
        transactionType: "SALE",
        history: [],
      },
      [],
      [
        {
          ...sampleRow,
          ListingId: "W7654321",
          ListPrice: 800000,
          StandardStatus: "Closed",
        },
      ],
    );
    assert.ok(rows.some((row) => row.listingId === "W7654321" || row.externalMls === "W7654321" || JSON.stringify(row).includes("W7654321")));
    const enrich = read("src/lib/proptx/address-history-enrich.ts");
    const preview = sliceFn(
      enrich,
      "export async function previewAddressListingHistory",
      "export async function enrichAddressListingHistory",
    );
    assert.equal(preview.includes("prisma.listing.update"), false);
    assert.equal(preview.includes("addressHistoryEnrichedAt:"), false);
    assert.equal(preview.includes("upsertPropTxPropertiesOnDemand"), false);
    const writer = sliceFn(
      enrich,
      "export async function enrichAddressListingHistory",
      "export async function loadListingForAddressHistory",
    );
    const guardAt = writer.indexOf("assertMlsSyncExecutionHost");
    const fetchAt = writer.indexOf("fetchAllPropertiesAtExactAddress");
    const stampAt = writer.indexOf("addressHistoryEnrichedAt:");
    assert.ok(guardAt >= 0 && fetchAt > guardAt && stampAt > guardAt);
    const route = read(
      "src/app/api/listings/[mlsNumber]/address-history/enrich/route.ts",
    );
    assert.ok(route.includes("previewAddressListingHistory"));
    assert.equal(route.includes("enrichAddressListingHistory"), false);
    console.log("[6] address-history panel reads; nightly writer is guarded... PASS");
  }

  {
    const gallery = read("src/app/api/listings/[mlsNumber]/gallery/route.ts");
    assert.ok(gallery.includes("fetchListingPhotosFromPropTx"));
    assert.equal(gallery.includes("listingMedia.create"), false);
    assert.equal(gallery.includes("prisma.listing.update"), false);
    const photo = read("src/app/api/listings/photo/route.ts");
    assert.equal(photo.includes("prisma.listing.update"), false);
    assert.equal(photo.includes("listingMedia.create"), false);
    console.log("[7] gallery and photo proxy stay read-only... PASS");
  }

  {
    const overlaid = applyNeonListingStatuses(
      [
        {
          mlsNumber: "W1234567",
          status: "ACTIVE",
          transactionType: "SALE",
        },
      ],
      new Map([
        [
          "W1234567",
          {
            id: "listing-1",
            mlsNumber: "W1234567",
            status: "SOLD",
            transactionType: "SALE",
          },
        ],
      ]),
    );
    assert.equal(overlaid[0]?.status, "SOLD");
    const hydrate = read("src/lib/typesense/hydrate-status.ts");
    assert.equal(hydrate.includes("syncListingToTypesense"), false);
    assert.equal(hydrate.includes("scheduleWorkerSideEffect"), false);
    console.log("[8] status overlay does not write Typesense... PASS");
  }

  {
    const health = [
      "src/lib/mls-health/evaluate.ts",
      "src/lib/mls-health/run.ts",
      "src/lib/mls-health/load-snapshot.ts",
      "src/lib/mls-health/alert.ts",
      "scripts/mls-health-check.ts",
    ]
      .map(read)
      .join("\n");
    assert.equal(health.includes("runPropTxMlsSync"), false);
    assert.equal(health.includes("proptxFetch"), false);
    assert.equal(health.includes("proptxJson"), false);
    assert.equal(existsSync(join(root, ".github/workflows/mls-health.yml")), false);
    console.log("[9] health engine has no PropTx/sync dependency and is unscheduled... PASS");
  }

  {
    const guarded = [
      "src/lib/proptx/sync.ts",
      "src/lib/proptx/mls-on-market-reconcile.ts",
      "src/lib/proptx/address-history-enrich.ts",
      "src/lib/typesense/backfill-provenance.ts",
      "scripts/mls-sync.ts",
      "scripts/mls-media-backfill.ts",
      "scripts/mls-rooms-backfill.ts",
      "scripts/mls-history-backfill.ts",
      "scripts/mls-address-history-enrich.ts",
      "scripts/mls-on-market-reconcile.ts",
      "scripts/mls-geocode.ts",
      "scripts/mls-geocode-loop.ts",
      "scripts/mls-refresh.ts",
      "scripts/backfill-sold-at.ts",
      "scripts/backfill-conditional-inventory.ts",
      "scripts/audit-status-consistency.ts",
      "scripts/audit-status-sale-heal.ts",
      "scripts/typesense-backfill-open-houses.ts",
      "scripts/typesense-import-listings.ts",
      "scripts/typesense-backfill-provenance.ts",
    ];
    for (const path of guarded) {
      assert.ok(read(path).includes("assertMlsSyncExecutionHost"), path);
    }

    const sync = read("src/lib/proptx/sync.ts");
    const run = sliceFn(
      sync,
      "export async function runPropTxMlsSync",
      "function emptyStats",
    );
    const runGuard = run.indexOf("assertMlsSyncExecutionHost");
    assert.ok(runGuard >= 0);
    assert.ok(run.indexOf("getPropTxSyncConfig") > runGuard);
    assert.ok(run.indexOf("prisma.mlsSyncRun.create") > runGuard);

    const upsert = sliceFn(
      sync,
      "export async function upsertPropTxPropertiesOnDemand",
      "async function syncJustListedProperties",
    );
    const upsertGuard = upsert.indexOf("assertMlsSyncExecutionHost");
    assert.ok(upsertGuard >= 0);
    assert.ok(upsert.indexOf("createPropTxProvenanceSession") > upsertGuard);
    assert.ok(upsert.indexOf("prisma.listing") > upsertGuard || upsert.includes("upsertPropertyRow"));

    const reconcile = sliceFn(
      read("src/lib/proptx/mls-on-market-reconcile.ts"),
      "export async function executeOnMarketReconciliation",
      "function createProductionDeps",
    );
    const reconcileGuard = reconcile.indexOf("assertMlsSyncExecutionHost");
    assert.ok(reconcileGuard >= 0);
    assert.ok(reconcile.indexOf("getPropTxVowConfig") > reconcileGuard);

    for (const path of [
      "src/app/api/cron/digests/route.ts",
      "src/app/api/cron/sms-automations/route.ts",
      "src/app/api/cron/monitors/route.ts",
      ".github/workflows/digests.yml",
      ".github/workflows/sms-automations.yml",
    ]) {
      assert.equal(read(path).includes("MLS_SYNC_SECRET"), false, path);
    }
    console.log("[10] writers are guarded; MLS_SYNC_SECRET is not a cron fallback... PASS");
  }

  assert.equal(existsSync(homeMarker), homeMarkerExisted);
  console.log("mls-execution-lockdown-selftest: all cases passed");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
