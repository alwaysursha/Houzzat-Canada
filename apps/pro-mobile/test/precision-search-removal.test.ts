/**
 * Device failures: viewing removal persistence and precise property search.
 *
 * Run: node --import tsx apps/pro-mobile/test/precision-search-removal.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeExactMlsTokens,
  normalizeMlsPrefix,
  preciseAddressWhere,
} from "../../../src/lib/listings/precise-property-search";
import { proTourFieldPatch } from "../../../src/lib/mobile/v2/viewings-planner";
import {
  acceptSearchResponse,
  listingsForQuery,
  missingMlsNumbers,
  mlsPrefixSearchPath,
  parseViewingPropertyQuery,
} from "../src/lib/viewing-search";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = join(APP, "../..");

const POOL = [
  { mlsNumber: "X13815246", addressLine: "33 Ellen Street", city: "Toronto", community: null },
  { mlsNumber: "X13813458", addressLine: "40 Oak Avenue", city: "Toronto", community: null },
  { mlsNumber: "X13819999", addressLine: "9 King Street", city: "Toronto", community: null },
  { mlsNumber: "W5555555", addressLine: "100 Queen Street", city: "Mississauga", community: null },
  { mlsNumber: "C1000001", addressLine: "12 River Trail", city: "Brampton", community: null },
];

function readApp(rel: string) {
  return readFileSync(join(APP, rel), "utf8");
}

function readRepo(rel: string) {
  return readFileSync(join(REPO, rel), "utf8");
}

function run() {
  console.log("=================================================================");
  console.log("PRECISION SEARCH + VIEWING REMOVAL");
  console.log("=================================================================\n");

  console.log("[1] 1 and 2 characters return no listings...");
  for (const raw of ["X", "X1", "33", "ab"]) {
    const parsed = parseViewingPropertyQuery(raw);
    assert.equal(parsed.kind, "short");
    assert.deepEqual(listingsForQuery(parsed, POOL), []);
  }
  assert.equal(parseViewingPropertyQuery("").kind, "empty");
  assert.deepEqual(listingsForQuery(parseViewingPropertyQuery(""), POOL), []);
  console.log("  -> length: PASS\n");

  console.log("[2] 3-character MLS prefix keeps only matching MLS numbers...");
  const prefix = parseViewingPropertyQuery("X13");
  assert.equal(prefix.kind, "mls-prefix");
  if (prefix.kind !== "mls-prefix") return;
  assert.equal(prefix.prefix, "X13");
  const prefixCards = listingsForQuery(prefix, POOL);
  assert.ok(prefixCards.length >= 1);
  assert.ok(prefixCards.every((card) => card.mlsNumber.startsWith("X13")));
  assert.equal(prefixCards.some((card) => card.mlsNumber === "W5555555"), false);
  const narrower = listingsForQuery(parseViewingPropertyQuery("X1381"), POOL);
  assert.ok(narrower.every((card) => card.mlsNumber.startsWith("X1381")));
  assert.equal(narrower.some((card) => card.mlsNumber === "W5555555"), false);
  assert.ok(mlsPrefixSearchPath("X13").includes("mode=prefix"));
  assert.equal(normalizeMlsPrefix("X13"), "X13");
  console.log("  -> prefix: PASS\n");

  console.log("[3] Partial address keeps only matching addresses...");
  const address = parseViewingPropertyQuery("33 Ellen");
  assert.equal(address.kind, "address");
  const addressCards = listingsForQuery(address, POOL);
  assert.deepEqual(addressCards.map((card) => card.mlsNumber), ["X13815246"]);
  const where = preciseAddressWhere("33 Ellen");
  assert.ok(where && "AND" in where);
  console.log("  -> address: PASS\n");

  console.log("[4] Complete MLS renders the one matching listing...");
  const exact = parseViewingPropertyQuery("X13815246");
  assert.equal(exact.kind, "mls");
  const exactCards = listingsForQuery(exact, POOL);
  assert.deepEqual(exactCards.map((card) => card.mlsNumber), ["X13815246"]);
  const missingExact = listingsForQuery(parseViewingPropertyQuery("X13810000"), POOL);
  assert.deepEqual(missingExact, []);
  assert.deepEqual(normalizeExactMlsTokens("X13810000"), ["X13810000"]);
  console.log("  -> exact: PASS\n");

  console.log("[5] Two MLS numbers render exactly those two...");
  const both = parseViewingPropertyQuery("X13815246, X13813458");
  const bothCards = listingsForQuery(both, POOL);
  assert.deepEqual(bothCards.map((card) => card.mlsNumber), ["X13815246", "X13813458"]);
  console.log("  -> batch: PASS\n");

  console.log("[6] A missing MLS is named and not replaced...");
  const partial = parseViewingPropertyQuery("X13815246, X13810000");
  const partialCards = listingsForQuery(partial, POOL);
  assert.deepEqual(partialCards.map((card) => card.mlsNumber), ["X13815246"]);
  assert.deepEqual(missingMlsNumbers(partial, partialCards), ["X13810000"]);
  assert.equal(partialCards.some((card) => card.mlsNumber === "W5555555"), false);
  console.log("  -> missing: PASS\n");

  console.log("[7] A stale earlier response cannot replace the newer exact search...");
  let latest = 1;
  const earlier = latest;
  latest = 2;
  assert.equal(acceptSearchResponse(earlier, latest), false);
  assert.equal(acceptSearchResponse(latest, latest), true);
  const stalePrefixDump = listingsForQuery(parseViewingPropertyQuery("X13815246"), POOL);
  assert.deepEqual(stalePrefixDump.map((card) => card.mlsNumber), ["X13815246"]);
  const planner = readApp("src/screens/ViewingsPlannerScreen.tsx");
  const properties = readApp("src/screens/PropertiesSearchScreen.tsx");
  assert.ok(planner.includes("acceptSearchResponse"));
  assert.ok(planner.includes("listingsForQuery"));
  assert.ok(properties.includes("acceptSearchResponse"));
  assert.ok(properties.includes("listingsForQuery"));
  assert.ok(properties.includes("mlsPrefixSearchPath"));
  assert.ok(planner.includes("No property found"));
  assert.ok(properties.includes("No property found"));
  console.log("  -> stale: PASS\n");

  console.log("[8] Remove-only PATCH does not send an empty tour update...");
  assert.deepEqual(
    proTourFieldPatch({
      startAddress: undefined,
      startLat: undefined,
      startLng: undefined,
      startAt: undefined,
      viewingDate: undefined,
    }),
    {},
  );
  const plannerLib = readRepo("src/lib/mobile/v2/viewings-planner.ts");
  assert.ok(plannerLib.includes("if (Object.keys(patch).length === 0) return;"));
  assert.ok(plannerLib.includes('code !== "P2025"'));
  const route = readRepo("src/app/api/mobile/v2/leads/[leadId]/viewings-planner/route.ts");
  assert.ok(route.indexOf("removeProTourStops") < route.indexOf("updateProTourFields"));
  assert.ok(planner.includes("removeStopIds: [stop.id]"));
  assert.ok(planner.indexOf("styles.removeAllBtn") > 0);
  assert.ok(planner.indexOf("styles.removeAllBtn") < planner.indexOf('label="Viewing date"'));
  assert.ok(planner.includes("Remove all properties from this viewing day?"));
  const searchRoute = readRepo("src/app/api/mobile/v2/properties/search/route.ts");
  assert.ok(searchRoute.indexOf('mode === "prefix"') < searchRoute.indexOf("provider.search"));
  assert.ok(searchRoute.indexOf('mode === "exact"') < searchRoute.indexOf("provider.search"));
  assert.ok(searchRoute.includes("findListingsByPreciseAddress"));
  console.log("  -> removal: PASS\n");

  console.log("PRECISION SEARCH + VIEWING REMOVAL: ALL PASS\n");
}

run();
