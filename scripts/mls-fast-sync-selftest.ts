/**
 * MLS Fast Sync bounds: just-listed + recent only, no cursor, no heal.
 * Run: pnpm mls:fast-sync:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gateMlsTypesenseDocument } from "@/lib/typesense/mls-write-gate";
import type { TypesenseListingDocument } from "@/lib/typesense/listing-document";
import {
  assertMlsSyncCursorAccess,
  MLS_FAST_JUST_LISTED_DAYS,
  MLS_FAST_JUST_LISTED_PAGES,
  MLS_FAST_RECENT_DAYS,
  MLS_FAST_RECENT_PAGES,
  MLS_FAST_SYNC_LOCK_NAME,
  MLS_FAST_SYNC_MODE,
  MLS_FULL_SYNC_MODE,
  MLS_SLOW_SYNC_LOCK_NAME,
  resolveMlsSyncMode,
} from "@/lib/proptx/mls-fast-sync";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function extractBetween(src: string, start: string, end: string): string {
  const a = src.indexOf(start);
  const b = src.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `missing block ${start} .. ${end}`);
  return src.slice(a, b);
}

async function main() {
  console.log("\n=== MLS FAST SYNC SELFTEST ===\n");

  const syncTs = read("src/lib/proptx/sync.ts");
  const mlsSyncTs = read("scripts/mls-sync.ts");
  const fastSh = read("scripts/mac-mls-fast-sync.sh");
  const slowSh = read("scripts/mac-mls-sync.sh");
  const fastPlist = read("scripts/mac/com.houzzat.mls-fast-sync.plist");
  const slowPlist = read("scripts/mac/com.houzzat.mls-sync.plist");
  const writeGate = read("src/lib/typesense/mls-write-gate.ts");
  const syncListing = read("src/lib/typesense/sync-listing.ts");
  const searchSrc = read("src/lib/typesense/search.ts");
  const entitlementFilters = read(
    "src/lib/tenancy/listing-entitlement/search-authority-filters.ts",
  );
  const fastFn = extractBetween(
    syncTs,
    "async function runMlsFastPropertyPasses",
    "export async function runPropTxMlsSync",
  );
  const justListedFn = extractBetween(
    syncTs,
    "async function syncJustListedProperties",
    "async function syncRecentProperties",
  );
  const recentFn = extractBetween(
    syncTs,
    "async function syncRecentProperties",
    "async function syncActiveInventory",
  );
  const runFn = extractBetween(
    syncTs,
    "export async function runPropTxMlsSync",
    "function emptyStats",
  );

  {
    assert.equal(MLS_FAST_JUST_LISTED_DAYS, 1);
    assert.ok(MLS_FAST_JUST_LISTED_PAGES >= 5 && MLS_FAST_JUST_LISTED_PAGES <= 8);
    assert.ok(justListedFn.includes("OriginalEntryTimestamp"));
    assert.ok(justListedFn.includes("OriginalEntryTimestamp desc"));
    assert.ok(fastFn.includes("syncJustListedProperties"));
    assert.ok(fastFn.includes("MLS_FAST_JUST_LISTED_DAYS"));
    assert.ok(fastFn.includes("MLS_FAST_JUST_LISTED_PAGES"));
    console.log("[A] Fast mode runs just-listed... PASS");
  }

  {
    assert.equal(MLS_FAST_RECENT_DAYS, 1);
    assert.ok(MLS_FAST_RECENT_PAGES >= 8 && MLS_FAST_RECENT_PAGES <= 12);
    assert.ok(recentFn.includes("ModificationTimestamp desc"));
    assert.ok(fastFn.includes("syncRecentProperties"));
    assert.ok(fastFn.includes("MLS_FAST_RECENT_DAYS"));
    assert.ok(fastFn.includes("MLS_FAST_RECENT_PAGES"));
    console.log("[B] Fast mode runs recent modifications... PASS");
  }

  {
    assert.ok(!fastFn.includes("syncProperties("));
    assert.ok(runFn.includes("if (isFast)"));
    assert.ok(runFn.includes("await runMlsFastPropertyPasses"));
    assert.ok(runFn.includes('else if (resources.includes("property"))'));
    assert.ok(runFn.includes("await syncProperties("));
    console.log("[C] Fast mode does NOT run backlog... PASS");
  }

  {
    assert.throws(
      () => assertMlsSyncCursorAccess(MLS_FAST_SYNC_MODE, "Property", "get"),
      /must not get MlsSyncCursor resource=Property/,
    );
    assert.throws(
      () => assertMlsSyncCursorAccess(MLS_FAST_SYNC_MODE, "Property", "set"),
      /must not set MlsSyncCursor resource=Property/,
    );
    assert.throws(
      () => assertMlsSyncCursorAccess(MLS_FAST_SYNC_MODE, "Media", "get"),
    );
    assert.throws(
      () => assertMlsSyncCursorAccess(MLS_FAST_SYNC_MODE, "Media", "set"),
    );
    assert.doesNotThrow(() =>
      assertMlsSyncCursorAccess(MLS_FULL_SYNC_MODE, "Property", "get"),
    );
    assert.doesNotThrow(() =>
      assertMlsSyncCursorAccess(MLS_FULL_SYNC_MODE, "Property", "set"),
    );
    assert.ok(!fastFn.includes("getCursor"));
    assert.ok(!fastFn.includes("setCursor"));
    assert.ok(
      syncTs.includes(
        'assertMlsSyncCursorAccess(activeMlsSyncMode, resource, "get")',
      ),
    );
    assert.ok(
      syncTs.includes(
        'assertMlsSyncCursorAccess(activeMlsSyncMode, resource, "set")',
      ),
    );
    console.log("[D] Fast mode never advances Property cursor... PASS");
  }

  {
    assert.ok(!fastFn.includes("syncSoldAtBackfill"));
    assert.ok(runFn.includes("await syncSoldAtBackfill"));
    assert.ok(runFn.includes("if (isFast)"));
    console.log("[E] Fast mode skips sold-date heal... PASS");
  }

  {
    assert.ok(!fastFn.includes("syncMediaBackfill"));
    assert.ok(runFn.includes("await syncMediaBackfill"));
    console.log("[F] Fast mode skips media gap-fill... PASS");
  }

  {
    assert.ok(fastFn.includes("skipGeocode: true"));
    assert.ok(syncTs.includes("options.skipGeocode !== true"));
    assert.ok(!fastFn.includes("geocodeListing"));
    console.log("[G] Fast mode skips geocode drain... PASS");
  }

  {
    assert.ok(!fastFn.includes("syncOpenHouses"));
    assert.ok(runFn.includes('if (!isFast && resources.includes("openHouse"))'));
    assert.ok(runFn.includes("await syncOpenHouses"));
    assert.ok(!syncTs.includes("getCursor(RESOURCE_OPEN_HOUSE)"));
    console.log("[H] Fast mode skips full OH sync... PASS");
  }

  {
    assert.ok(mlsSyncTs.includes("mode=fast skip Typesense provenance heal"));
    assert.ok(mlsSyncTs.includes("if (isFast)"));
    assert.ok(mlsSyncTs.includes("backfillTypesenseListingProvenance"));
    const healIdx = mlsSyncTs.indexOf("backfillTypesenseListingProvenance");
    const skipIdx = mlsSyncTs.indexOf(
      "mode=fast skip Typesense provenance heal",
    );
    assert.ok(skipIdx >= 0 && skipIdx < healIdx);
    console.log("[I] Fast mode skips 7-day Typesense provenance heal... PASS");
  }

  {
    const gate = gateMlsTypesenseDocument({
      dataSource: "mls",
      organizationId: null,
      providerKey: null,
      document: { sourceAuthorityKey: undefined } as TypesenseListingDocument,
    });
    assert.equal(gate.allow, false);
    assert.ok(writeGate.includes("missing_provenance"));
    assert.ok(syncListing.includes("gateMlsTypesenseDocument"));
    assert.ok(syncTs.includes("pushListingToTypesense"));
    assert.ok(entitlementFilters.includes("sourceAuthorityKey:="));
    assert.ok(!searchSrc.includes("organizationId:="));
    console.log("[J] MLS Typesense writes still require SAK... PASS");
  }

  {
    assert.equal(resolveMlsSyncMode({ argv: [], env: {} }), MLS_FULL_SYNC_MODE);
    assert.equal(
      resolveMlsSyncMode({ argv: ["30", "7", "property,openHouse"] }),
      MLS_FULL_SYNC_MODE,
    );
    assert.ok(runFn.includes("await syncProperties("));
    assert.ok(runFn.includes("await syncSoldAtBackfill"));
    assert.ok(runFn.includes("await syncMediaBackfill"));
    assert.ok(runFn.includes("await syncOpenHouses"));
    assert.ok(runFn.includes("await syncRecentProperties"));
    assert.ok(runFn.includes("getPropTxSoldSyncConfig"));
    assert.ok(slowSh.includes("houzzat-mls-sync.lock"));
    assert.ok(slowPlist.includes("<integer>3600</integer>"));
    assert.ok(!slowPlist.includes("com.houzzat.mls-fast-sync"));
    console.log("[K] Slow mode behavior remains intact... PASS");
  }

  {
    assert.equal(MLS_FAST_SYNC_LOCK_NAME, "houzzat-mls-fast-sync.lock");
    assert.equal(MLS_SLOW_SYNC_LOCK_NAME, "houzzat-mls-sync.lock");
    assert.notEqual(MLS_FAST_SYNC_LOCK_NAME, MLS_SLOW_SYNC_LOCK_NAME);
    assert.ok(fastSh.includes("houzzat-mls-fast-sync.lock"));
    assert.ok(!fastSh.includes('houzzat-mls-sync.lock"'));
    assert.ok(slowSh.includes("houzzat-mls-sync.lock"));
    assert.ok(!slowSh.includes("houzzat-mls-fast-sync.lock"));
    assert.ok(fastPlist.includes("com.houzzat.mls-fast-sync"));
    assert.ok(fastPlist.includes("<integer>600</integer>"));
    assert.ok(fastPlist.includes("/Users/Ali/Houzzat-Canada"));
    assert.ok(fastPlist.includes("mac-mls-fast-sync.sh"));
    assert.equal(
      resolveMlsSyncMode({ argv: ["--fast"] }),
      MLS_FAST_SYNC_MODE,
    );
    assert.equal(
      resolveMlsSyncMode({ env: { MLS_SYNC_MODE: "fast" } }),
      MLS_FAST_SYNC_MODE,
    );
    assert.ok(runFn.includes('resource: isFast ? "fast" : "all"'));
    assert.ok(runFn.includes("mode=${mode}"));
    console.log("[L] Fast/slow locks are distinct... PASS");
  }

  console.log("\nmls-fast-sync:selftest ok\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
