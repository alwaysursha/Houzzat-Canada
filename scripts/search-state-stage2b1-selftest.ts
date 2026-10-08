/**
 * Search Experience V2 — Stage 2B-1 unified filter draft + active chips.
 *
 * Distinguishes RUNTIME (pure reducer / helpers) from STATIC (source wiring).
 * Not claimed: live browser UI, live Typesense, or production network.
 *
 * Run: node --import tsx scripts/search-state-stage2b1-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  applyCommitPatch,
  buildActiveChips,
  buildCriteriaKey,
  buildListingsQuery,
  commitPatchFromFilters,
  committedToSearchFilters,
  createSearchStateFromUrl,
  defaultCommittedSearch,
  rebaseDraftPreservingEdits,
  rebaseFilterDraftPreservingEdits,
  reduceSearch,
  serializeSearchUrl,
  withPlaceAwareMapArea,
} from "../src/lib/listings/search-state";
import type { SearchFilters } from "../src/components/listings/SearchFilterChips";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function paramsOf(qs: string): URLSearchParams {
  return new URLSearchParams(qs);
}

let failed = 0;
function check(label: string, kind: "RUNTIME" | "STATIC", fn: () => void) {
  try {
    fn();
    console.log(`PASS [${kind}] ${label}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL [${kind}] ${label}`);
    console.error(err);
  }
}

const experience = read("src/components/listings/SearchExperience.tsx");
const menu = read("src/components/listings/SearchFiltersMenu.tsx");
const sheet = read("src/components/listings/SearchFiltersSheet.tsx");
const reduceSrc = read("src/lib/listings/search-state/reduce.ts");

// ---------------------------------------------------------------------------
// 1. Open filters seeds draft from committed; no listings request id bump
// ---------------------------------------------------------------------------
check("OPEN_FILTERS seeds draft; committed unchanged", "RUNTIME", () => {
  let state = createSearchStateFromUrl(
    "cities=Mississauga%7COakville&minBeds=3&minPrice=750000&maxPrice=1200000&transactionType=SALE",
  );
  const beforeId = state.lastIssuedRequestId;
  const beforeSeq = state.requestSeq;
  state = reduceSearch(state, { type: "BEGIN_DRAFT" });
  assert.ok(state.draft);
  assert.deepEqual(state.draft?.cities, ["Mississauga", "Oakville"]);
  assert.equal(state.draft?.minBeds, "3");
  assert.equal(state.committed.minBeds, "3");
  assert.equal(state.lastIssuedRequestId, beforeId);
  assert.equal(state.requestSeq, beforeSeq);
});

// ---------------------------------------------------------------------------
// 2. Cancel discards three draft fields
// ---------------------------------------------------------------------------
check("CANCEL_FILTERS discards draft edits", "RUNTIME", () => {
  let state = createSearchStateFromUrl(
    "city=Mississauga&minBeds=2&transactionType=SALE",
  );
  state = reduceSearch(state, { type: "BEGIN_DRAFT" });
  state = reduceSearch(state, {
    type: "PATCH_DRAFT",
    patch: { minBeds: "4", minBaths: "2", minPrice: "750000" },
  });
  state = reduceSearch(state, { type: "DISCARD_DRAFT" });
  assert.equal(state.draft, null);
  assert.equal(state.committed.minBeds, "2");
  assert.equal(state.committed.minBaths, "");
  assert.equal(state.committed.minPrice, "");
});

// ---------------------------------------------------------------------------
// 3. Apply commits three draft fields atomically
// ---------------------------------------------------------------------------
check("APPLY_FILTERS commits complete draft", "RUNTIME", () => {
  let state = createSearchStateFromUrl(
    "city=Mississauga&transactionType=SALE",
  );
  state = reduceSearch(state, { type: "BEGIN_DRAFT" });
  state = reduceSearch(state, {
    type: "PATCH_DRAFT",
    patch: {
      minBeds: "3",
      minBaths: "2",
      propertyTypes: ["DETACHED"],
      minPrice: "750000",
      maxPrice: "1200000",
    },
  });
  state = reduceSearch(state, { type: "APPLY_DRAFT" });
  assert.equal(state.draft, null);
  assert.equal(state.committed.minBeds, "3");
  assert.equal(state.committed.minBaths, "2");
  assert.deepEqual(state.committed.propertyTypes, ["DETACHED"]);
  const q = paramsOf(buildListingsQuery(state.committed));
  assert.equal(q.get("minBeds"), "3");
  assert.equal(q.get("minBaths"), "2");
  assert.equal(q.get("propertyTypes"), "DETACHED");
  assert.equal(q.get("minPrice"), "750000");
});

// ---------------------------------------------------------------------------
// 4–6. Clear property type / price / beds+baths via REMOVE_CHIP
// ---------------------------------------------------------------------------
check("Remove property-type chip clears types only", "RUNTIME", () => {
  let state = createSearchStateFromUrl(
    "city=Mississauga&propertyTypes=DETACHED&minBeds=3&transactionType=SALE",
  );
  const chips = buildActiveChips(state.committed);
  const typeChip = chips.find((c) => c.key === "types");
  assert.ok(typeChip, `expected types chip, got ${JSON.stringify(chips)}`);
  state = reduceSearch(state, { type: "REMOVE_CHIP", chip: typeChip! });
  assert.deepEqual(state.committed.propertyTypes, []);
  assert.equal(state.committed.minBeds, "3");
  assert.deepEqual(state.committed.cities, ["Mississauga"]);
});

check("Clear price chip clears min and max", "RUNTIME", () => {
  let state = createSearchStateFromUrl(
    "city=Mississauga&minPrice=750000&maxPrice=1200000&minBeds=3&transactionType=SALE",
  );
  const priceChip = buildActiveChips(state.committed).find((c) => c.key === "price");
  assert.ok(priceChip);
  state = reduceSearch(state, { type: "REMOVE_CHIP", chip: priceChip! });
  assert.equal(state.committed.minPrice, "");
  assert.equal(state.committed.maxPrice, "");
  assert.equal(state.committed.minBeds, "3");
});

check("Clear beds and baths chips independently", "RUNTIME", () => {
  let state = createSearchStateFromUrl(
    "city=Mississauga&minBeds=3&minBaths=2&transactionType=SALE",
  );
  const beds = buildActiveChips(state.committed).find((c) => c.key === "beds");
  const baths = buildActiveChips(state.committed).find((c) => c.key === "baths");
  assert.ok(beds && baths);
  state = reduceSearch(state, { type: "REMOVE_CHIP", chip: beds! });
  assert.equal(state.committed.minBeds, "");
  assert.equal(state.committed.minBaths, "2");
  state = reduceSearch(state, { type: "REMOVE_CHIP", chip: baths! });
  assert.equal(state.committed.minBaths, "");
});

// ---------------------------------------------------------------------------
// 7–8. Multi-city chip removal
// ---------------------------------------------------------------------------
check("Remove one city preserves the other", "RUNTIME", () => {
  let state = createSearchStateFromUrl(
    "cities=Mississauga%7COakville&minBeds=3&transactionType=SALE",
  );
  const oak = buildActiveChips(state.committed).find(
    (c) => c.key === "city" && c.city === "Oakville",
  );
  assert.ok(oak);
  state = reduceSearch(state, { type: "REMOVE_CHIP", chip: oak! });
  assert.deepEqual(state.committed.cities, ["Mississauga"]);
  assert.equal(state.committed.minBeds, "3");
});

check("Remove all cities clears place", "RUNTIME", () => {
  let state = createSearchStateFromUrl(
    "cities=Mississauga%7COakville&transactionType=SALE",
  );
  for (const city of ["Mississauga", "Oakville"]) {
    const chip = buildActiveChips(state.committed).find(
      (c) => c.key === "city" && c.city === city,
    );
    assert.ok(chip);
    state = reduceSearch(state, { type: "REMOVE_CHIP", chip: chip! });
  }
  assert.deepEqual(state.committed.cities, []);
  assert.equal(paramsOf(buildListingsQuery(state.committed)).get("cities"), null);
});

// ---------------------------------------------------------------------------
// 9. Rapid desktop-style commits stack
// ---------------------------------------------------------------------------
check("Rapid functional commits stack beds+price+baths+type", "RUNTIME", () => {
  let ref = defaultCommittedSearch({ cities: ["Mississauga"] });
  const stack = (updater: (f: SearchFilters) => SearchFilters) => {
    const resolved = updater(committedToSearchFilters(ref));
    ref = applyCommitPatch(ref, commitPatchFromFilters(ref, resolved));
  };
  stack((f) => ({ ...f, minBeds: "3" }));
  stack((f) => ({ ...f, minPrice: "750000", maxPrice: "1200000" }));
  stack((f) => ({ ...f, minBaths: "2" }));
  stack((f) => ({ ...f, propertyTypes: ["DETACHED"] }));
  assert.equal(ref.minBeds, "3");
  assert.equal(ref.minPrice, "750000");
  assert.equal(ref.maxPrice, "1200000");
  assert.equal(ref.minBaths, "2");
  assert.deepEqual(ref.propertyTypes, ["DETACHED"]);
  assert.deepEqual(ref.cities, ["Mississauga"]);
});

// ---------------------------------------------------------------------------
// 10. Stale-draft conflict: live commit while draft open, then Apply
// ---------------------------------------------------------------------------
check("Live chip removal during draft survives Apply (three-way)", "RUNTIME", () => {
  let state = createSearchStateFromUrl(
    "cities=Mississauga%7COakville&minBeds=2&transactionType=SALE",
  );
  const base = state.committed;
  state = reduceSearch(state, { type: "BEGIN_DRAFT" });
  state = reduceSearch(state, {
    type: "PATCH_DRAFT",
    patch: { minBeds: "4", minBaths: "2" },
  });
  // Live: remove Oakville
  const oak = buildActiveChips(state.committed).find(
    (c) => c.key === "city" && c.city === "Oakville",
  );
  assert.ok(oak);
  state = reduceSearch(state, { type: "REMOVE_CHIP", chip: oak! });
  assert.deepEqual(state.committed.cities, ["Mississauga"]);
  // Draft rebased: cities follow live; beds/baths edits kept
  assert.deepEqual(state.draft?.cities, ["Mississauga"]);
  assert.equal(state.draft?.minBeds, "4");
  assert.equal(state.draft?.minBaths, "2");

  // Simulate Menu Apply payload that still had both cities (stale local)
  const remote = state.committed;
  const local = applyCommitPatch(
    base,
    commitPatchFromFilters(base, {
      ...committedToSearchFilters(base),
      minBeds: "4",
      minBaths: "2",
      city: "",
    }, { cities: ["Mississauga", "Oakville"] }),
  );
  const merged = rebaseDraftPreservingEdits(base, local, remote);
  assert.deepEqual(merged.cities, ["Mississauga"]);
  assert.equal(merged.minBeds, "4");
  assert.equal(merged.minBaths, "2");

  state = reduceSearch(state, { type: "BEGIN_DRAFT" });
  state = reduceSearch(state, {
    type: "PATCH_DRAFT",
    patch: {
      cities: merged.cities,
      minBeds: merged.minBeds,
      minBaths: merged.minBaths,
    },
  });
  state = reduceSearch(state, { type: "APPLY_DRAFT" });
  assert.deepEqual(state.committed.cities, ["Mississauga"]);
  assert.equal(state.committed.minBeds, "4");
});

check("APPLY_DRAFT preserves view from committed chrome", "RUNTIME", () => {
  let state = createSearchStateFromUrl(
    "city=Mississauga&transactionType=SALE&view=cards",
  );
  state = reduceSearch(state, { type: "BEGIN_DRAFT" });
  state = reduceSearch(state, { type: "SET_VIEW", view: "map" });
  state = reduceSearch(state, {
    type: "PATCH_DRAFT",
    patch: { minBeds: "3" },
  });
  assert.equal(state.draft?.view, "cards");
  state = reduceSearch(state, { type: "APPLY_DRAFT" });
  assert.equal(state.committed.view, "map");
  assert.equal(state.committed.minBeds, "3");
});

// ---------------------------------------------------------------------------
// 11. View switching does not clear criteria or save
// ---------------------------------------------------------------------------
check("Cards→Map→Split→Cards keeps criteria key", "RUNTIME", () => {
  let state = createSearchStateFromUrl(
    "city=Mississauga&minBeds=3&minPrice=750000&transactionType=SALE&view=cards",
  );
  const key = buildCriteriaKey(state.committed);
  for (const view of ["map", "split", "cards"] as const) {
    state = reduceSearch(state, { type: "SET_VIEW", view });
    assert.equal(buildCriteriaKey(state.committed), key);
  }
});

// ---------------------------------------------------------------------------
// 12–13. Refresh / Back-Forward shape (serialize round-trip)
// ---------------------------------------------------------------------------
check("URL round-trip restores applied filters", "RUNTIME", () => {
  const committed = defaultCommittedSearch({
    cities: ["Mississauga", "Oakville"],
    minPrice: "750000",
    maxPrice: "1200000",
    minBeds: "3",
    minBaths: "2",
    propertyTypes: ["DETACHED"],
    statuses: ["ACTIVE"],
    view: "map",
  });
  const href = serializeSearchUrl(committed);
  const again = createSearchStateFromUrl(href).committed;
  assert.deepEqual(again.cities, committed.cities);
  assert.equal(again.minBeds, "3");
  assert.equal(again.minBaths, "2");
  assert.deepEqual(again.propertyTypes, ["DETACHED"]);
  const chips = buildActiveChips(again);
  assert.ok(chips.some((c) => c.key === "city" && c.city === "Mississauga"));
  assert.ok(chips.some((c) => c.key === "price"));
  assert.ok(chips.some((c) => c.key === "beds"));
  assert.ok(chips.some((c) => c.key === "types"));
});

// ---------------------------------------------------------------------------
// Active chips taxonomy
// ---------------------------------------------------------------------------
check("buildActiveChips covers place/price/beds/baths/type/status", "RUNTIME", () => {
  const chips = buildActiveChips(
    defaultCommittedSearch({
      cities: ["Mississauga"],
      minPrice: "750000",
      maxPrice: "1200000",
      minBeds: "3",
      minBaths: "2",
      propertyTypes: ["DETACHED"],
      transactionType: "SALE",
      statuses: ["ACTIVE"],
    }),
  );
  const keys = chips.map((c) => c.key);
  assert.ok(keys.includes("city"));
  assert.ok(keys.includes("price"));
  assert.ok(keys.includes("beds"));
  assert.ok(keys.includes("baths"));
  assert.ok(keys.includes("types"));
  assert.ok(keys.includes("transaction"));
  assert.equal(chips.filter((c) => c.key === "price").length, 1);
});

check("Filter-draft rebase helper matches committed policy", "RUNTIME", () => {
  const base = {
    filters: {
      ...committedToSearchFilters(defaultCommittedSearch()),
      minBeds: "2",
    },
    cities: ["Mississauga", "Oakville"],
  };
  const draft = {
    filters: { ...base.filters, minBeds: "4" },
    cities: ["Mississauga", "Oakville"],
  };
  const next = {
    filters: { ...base.filters, minBeds: "2" },
    cities: ["Mississauga"],
  };
  const rebased = rebaseFilterDraftPreservingEdits(base, draft, next);
  assert.equal(rebased.filters.minBeds, "4");
  assert.deepEqual(rebased.cities, ["Mississauga"]);
});

// ---------------------------------------------------------------------------
// STATIC: Experience / Menu / Sheet wiring + Save Search order preserved
// ---------------------------------------------------------------------------
check("Experience wires draft open/cancel + APPLY path", "STATIC", () => {
  assert.match(experience, /onDraftOpen=\{beginFiltersDraft\}/);
  assert.match(experience, /onDraftCancel=\{discardFiltersDraft\}/);
  assert.match(experience, /function beginFiltersDraft/);
  assert.match(experience, /function discardFiltersDraft/);
  assert.match(experience, /type: "BEGIN_DRAFT"/);
  assert.match(experience, /type: "APPLY_DRAFT"/);
  assert.match(experience, /type: "DISCARD_DRAFT"/);
  assert.match(experience, /rebaseDraftPreservingEdits/);
  assert.match(experience, /buildActiveChips\(committed/);
  assert.match(experience, /chips=\{activeChips\}/);
  assert.match(experience, /onCommitFilters=\{commitFiltersWithCities\}/);
});

check("Menu/Sheet keep Apply→persist Save Search order", "STATIC", () => {
  assert.match(
    menu,
    /commitDraft\(nextCities\);\s*\n\s*const ok = await persist\(false, nextCities\)/s,
  );
  assert.match(menu, /openGuestSaveSearchIntent/);
  assert.match(menu, /savePrimarySearch/);
  assert.match(menu, /onDraftOpen/);
  assert.match(menu, /onDraftCancel/);
  assert.match(menu, /rebaseFilterDraftPreservingEdits/);
  assert.match(sheet, /commitDraft\(nextCities\);\s*\n\s*await persist\(confirmReplace, nextCities\)/s);
  assert.match(sheet, /openGuestSaveSearchIntent/);
  assert.match(sheet, /savePrimarySearch/);
  assert.match(sheet, /onDraftOpen/);
  assert.match(sheet, /onDraftCancel/);
});

check("Reducer rebases draft on COMMIT/REMOVE_CHIP (not null)", "STATIC", () => {
  assert.match(reduceSrc, /withRebasedDraft/);
  assert.match(reduceSrc, /rebaseDraftPreservingEdits/);
  // COMMIT case must not force draft: null
  const commitCase = reduceSrc.slice(
    reduceSrc.indexOf('case "COMMIT"'),
    reduceSrc.indexOf('case "SET_VIEW"'),
  );
  assert.match(commitCase, /withRebasedDraft/);
  assert.doesNotMatch(commitCase, /draft: null/);
});

check("Desktop panel still live-commits via onChange", "STATIC", () => {
  assert.match(experience, /SearchDesktopFilterPanel/);
  assert.match(experience, /onChange=\{updateFilters\}/);
  const desktop = read("src/components/listings/SearchDesktopFilterPanel.tsx");
  assert.match(desktop, /onChange\(\(current\) =>/);
});

// place-aware apply helper still reachable
check("withPlaceAwareMapArea used on Apply path", "STATIC", () => {
  assert.match(experience, /withPlaceAwareMapArea/);
  void withPlaceAwareMapArea;
});

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nStage 2B-1 selftest: all checks passed");
