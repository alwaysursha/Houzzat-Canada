/**
 * Mobile Filters Back is a same-URL history entry, not a query param.
 * Run: node --import tsx scripts/search-filters-sheet-history-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sheet = readFileSync(
  "src/components/listings/SearchFiltersSheet.tsx",
  "utf8",
);
const experience = readFileSync(
  "src/components/listings/SearchExperience.tsx",
  "utf8",
);

assert.match(sheet, /houzzatSearchFilters/);
assert.match(sheet, /addEventListener\("popstate", onPopState, true\)/);
assert.match(sheet, /stopImmediatePropagation/);
assert.match(sheet, /history\.back\(\)/);
assert.doesNotMatch(sheet, /filtersOpen/);
assert.doesNotMatch(sheet, /searchParams\.set\(["']filters/);

assert.match(experience, /height:\s*38vh/);
assert.match(experience, /width:\s*48%/);
assert.match(experience, /\["split", Columns2, "Split"\]/);
assert.doesNotMatch(experience, /setView\("cards"\)/);
assert.match(experience, /Adjust your filters or search this map area\./);

const pane = readFileSync(
  "src/components/listings/SearchResultsPane.tsx",
  "utf8",
);
assert.match(pane, /No listings match this search\./);
assert.match(pane, /search-result-grid-wide/);
assert.match(pane, /SearchResultsHeading/);

console.log("search-filters-sheet-history-selftest: ok");
