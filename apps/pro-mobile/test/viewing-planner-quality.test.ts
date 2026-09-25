/**
 * Property detail spacing, compact shortlist, and viewing planner quality.
 *
 * Run: node --import tsx apps/pro-mobile/test/viewing-planner-quality.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { planProStopMerge, planProStopRemoval } from "../../../src/lib/mobile/v2/viewings-planner";
import { listingSearchCards, mlsBatchSearchPath, parseViewingPropertyQuery } from "../src/lib/viewing-search";
import { clockFromIso, viewingInstantIso } from "../src/lib/viewing-stop-times";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = join(APP, "../..");

function readApp(rel: string) {
  return readFileSync(join(APP, rel), "utf8");
}

function readRepo(rel: string) {
  return readFileSync(join(REPO, rel), "utf8");
}

function run() {
  console.log("=================================================================");
  console.log("VIEWING PLANNER + PROPERTY DETAIL QUALITY");
  console.log("=================================================================\n");

  console.log("[1] Property header has no second status inset...");
  const detail = readApp("src/components/PropertyDetailModal.tsx");
  assert.equal(detail.includes("paddingTop: 52"), false);
  assert.ok(detail.includes("paddingTop: 10"));
  const button = readApp("src/components/ShortlistButton.tsx");
  assert.ok(button.includes('alignSelf: "flex-start"'));
  assert.ok(button.includes("Add to shortlist"));
  console.log("  -> property: PASS\n");

  console.log("[2] Viewings opens the existing planner from More...");
  const drawer = readApp("src/lib/drawer-nav-items.ts");
  assert.ok(drawer.includes('id: "viewings"'));
  assert.ok(drawer.includes('label: "Viewings"'));
  const shell = readApp("src/screens/AgentShell.tsx");
  assert.ok(shell.includes('item.id === "viewings"'));
  assert.ok(shell.includes("setViewingsLeadPicker"));
  assert.ok(shell.includes("embeddedInShell"));
  assert.ok(shell.includes("viewingsPlannerPane"));
  assert.equal(shell.includes("viewingsPlannerOverlay"), false);
  assert.ok(shell.includes("OnBackPressedCallback") === false);
  console.log("  -> menu: PASS\n");

  console.log("[3] Remove rewrites sort order and persists through PATCH...");
  const kept = planProStopRemoval(
    [
      { id: "a", sortOrder: 0 },
      { id: "b", sortOrder: 1 },
      { id: "c", sortOrder: 2 },
    ],
    ["b"],
  );
  assert.deepEqual(kept, [
    { id: "a", sortOrder: 0 },
    { id: "c", sortOrder: 1 },
  ]);
  const route = readRepo("src/app/api/mobile/v2/leads/[leadId]/viewings-planner/route.ts");
  assert.ok(route.includes("removeStopIds"));
  assert.ok(route.includes("removeProTourStops"));
  const planner = readApp("src/screens/ViewingsPlannerScreen.tsx");
  assert.ok(planner.includes("Remove property"));
  assert.ok(planner.includes("removeStopIds"));
  console.log("  -> remove: PASS\n");

  console.log("[4] Arrive/leave uses a local clock and Update Viewings flushes it...");
  const day = new Date(2026, 8, 25, 9, 0, 0, 0);
  const clock = new Date(2026, 0, 1, 14, 30, 0, 0);
  const iso = viewingInstantIso(day, clock);
  const back = clockFromIso(iso);
  assert.ok(back);
  assert.equal(back.getFullYear(), 2026);
  assert.equal(back.getMonth(), 8);
  assert.equal(back.getDate(), 25);
  assert.equal(back.getHours(), 14);
  assert.equal(back.getMinutes(), 30);
  assert.ok(planner.includes("flushStopTimes"));
  assert.ok(planner.includes("viewings-planner/save"));
  assert.ok(planner.includes("viewings-planner/optimize"));
  assert.equal(planner.includes("datetimeLocalToIso"), false);
  console.log("  -> times: PASS\n");

  console.log("[5] Address vs MLS parsing...");
  assert.deepEqual(parseViewingPropertyQuery("  12 river trail "), {
    kind: "address",
    q: "12 river trail",
  });
  assert.deepEqual(parseViewingPropertyQuery("w1234567"), {
    kind: "mls",
    mlsNumbers: ["W1234567"],
    rejected: [],
  });
  assert.deepEqual(
    parseViewingPropertyQuery("W1234567, X2345678\nC3456789, W1234567"),
    {
      kind: "mls",
      mlsNumbers: ["W1234567", "X2345678", "C3456789"],
      rejected: [],
    },
  );
  assert.equal(parseViewingPropertyQuery("   ").kind, "empty");
  console.log("  -> parse: PASS\n");

  console.log("[6] One search route batches MLS and ignores duplicates...");
  const search = readRepo("src/app/api/mobile/v2/properties/search/route.ts");
  assert.ok(search.includes("enrichTourStops"));
  assert.ok(search.includes("notFound"));
  assert.ok(search.includes("authorizeMobileWorkspaceAccess"));
  assert.ok(planner.includes("searchGenRef"));
  assert.ok(planner.includes("}, 350)"));
  assert.ok(planner.includes("Add all"));
  const merged = planProStopMerge({
    existingMls: ["W1234567"],
    requestedMls: ["w1234567", "X2345678"],
    maxStops: 10,
  });
  assert.deepEqual(merged.toAdd, ["X2345678"]);
  console.log("  -> search: PASS\n");

  console.log("[7] Android back bridge stays untouched...");
  const activity = readApp("android/app/src/main/java/com/houzzat/pro/MainActivity.kt");
  assert.ok(activity.includes("OnBackPressedCallback"));
  assert.equal(planner.match(/BackHandler\.addEventListener/g)?.length ?? 0, 1);
  console.log("  -> back: PASS\n");

  console.log("[8] Add Property is the first block on the Agent planner...");
  assert.ok(shell.includes("<ViewingsPlannerScreen"));
  assert.ok(planner.indexOf("Add Property") < planner.indexOf('label="Viewing date"'));
  assert.ok(planner.includes("searchResults.map"));
  assert.ok(planner.includes('"+ Add"') || planner.includes('already ? "Added" : "+ Add"'));
  assert.ok(planner.includes("Add all"));
  console.log("  -> visible search: PASS\n");

  console.log("[9] X13815246, X13813458 is two cards, shared by Properties...");
  const examples = [
    "X13815246, X13813458",
    "X13815246 X13813458",
    "X13815246\nX13813458",
    "x13815246, X13815246, X13813458",
  ];
  for (const raw of examples) {
    const parsed = parseViewingPropertyQuery(raw);
    assert.equal(parsed.kind, "mls");
    if (parsed.kind !== "mls") continue;
    assert.deepEqual(parsed.mlsNumbers, ["X13815246", "X13813458"]);
  }
  const cards = listingSearchCards([
    { mlsNumber: "X13815246", addressLine: "33 Ellen Street" },
    { mlsNumber: "X13813458", addressLine: "40 Oak Avenue" },
  ]);
  assert.equal(cards.length, 2);
  assert.deepEqual(
    cards.map((card) => card.mlsNumber),
    ["X13815246", "X13813458"],
  );
  const batchPath = mlsBatchSearchPath(["X13815246", "X13813458"]);
  assert.ok(batchPath.includes("mode=exact"));
  assert.ok(batchPath.includes("mls=X13815246%2CX13813458"));
  const properties = readApp("src/screens/PropertiesSearchScreen.tsx");
  assert.ok(properties.includes("parseViewingPropertyQuery"));
  assert.ok(properties.includes("mlsBatchSearchPath"));
  assert.ok(properties.includes("listingsForQuery"));
  assert.ok(properties.includes("data={listings}"));
  assert.ok(planner.includes("listingsForQuery"));
  const partial = parseViewingPropertyQuery("X13815246, NOTFOUND9, X13813458");
  assert.equal(partial.kind, "mls");
  if (partial.kind === "mls") {
    assert.deepEqual(partial.mlsNumbers, ["X13815246", "X13813458"]);
    assert.deepEqual(partial.rejected, ["NOTFOUND9"]);
  }
  const five = parseViewingPropertyQuery(
    "X13815246, X13813458, W1234567, C3456789, N5555555",
  );
  assert.equal(five.kind, "mls");
  if (five.kind === "mls") assert.equal(five.mlsNumbers.length, 5);
  console.log("  -> multi mls: PASS\n");

  console.log("[10] Remove All confirms, and Cancel does not remove...");
  const alert = planner.slice(
    planner.indexOf("const removeAllStops"),
    planner.indexOf("const travelWarnings"),
  );
  assert.ok(alert.includes("Remove all properties from this viewing day?"));
  assert.ok(alert.includes('{ text: "Cancel", style: "cancel" }'));
  assert.ok(alert.indexOf("Cancel") < alert.indexOf("removeStopIds: stopIds"));
  assert.ok(planner.includes("removeStopIds: [stop.id]"));
  assert.ok(planner.indexOf("styles.removeAllBtn") < planner.indexOf('label="Viewing date"'));
  assert.ok(planner.includes("tour.stops.length > 0"));
  assert.equal(
    planProStopRemoval(
      [
        { id: "a", sortOrder: 0 },
        { id: "b", sortOrder: 1 },
      ],
      ["a", "b"],
    ).length,
    0,
  );
  console.log("  -> remove all: PASS\n");

  console.log("VIEWING PLANNER QUALITY: ALL PASS\n");
}

run();
