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

assert.match(experience, /--search-sheet:\s*61%/);
assert.match(experience, /--search-sheet:\s*89%/);
assert.match(experience, /width:\s*48%/);
assert.match(experience, /\["split", Columns2, "Split"\]/);
assert.doesNotMatch(experience, /setView\("cards"\)/);
assert.match(experience, /Adjust your filters or search this map area\./);
assert.match(experience, /prefers-reduced-motion: reduce/);
assert.doesNotMatch(experience, /Show listings/);

const card = readFileSync(
  "src/components/listings/SearchResultCard.tsx",
  "utf8",
);
assert.match(card, /justify-self-end self-start/);
assert.match(card, /isolate z-0/);
assert.doesNotMatch(card, /absolute right-2 top-2/);

const heading = readFileSync(
  "src/components/listings/SearchResultsContext.tsx",
  "utf8",
);
assert.match(heading, /sticky top-0 z-20/);

const pane = readFileSync(
  "src/components/listings/SearchResultsPane.tsx",
  "utf8",
);
assert.match(pane, /No listings match this search\./);
assert.match(pane, /search-result-grid-wide/);
assert.match(pane, /SearchResultsHeading/);

console.log("search-filters-sheet-history-selftest: ok");
