/**
 * Public search heading copy. The URL filters stay authoritative.
 * Run: pnpm search-results-copy:selftest
 */
import assert from "node:assert/strict";
import { searchResultsCopy, type SearchResultsCopyInput } from "../src/lib/listings/search-results-copy";

function input(overrides: Partial<SearchResultsCopyInput> = {}): SearchResultsCopyInput {
  return {
    transactionType: "SALE",
    segment: "RESIDENTIAL",
    city: "",
    community: "",
    cities: "",
    communities: "",
    q: "",
    minPrice: "",
    maxPrice: "",
    minBeds: "",
    minBaths: "",
    propertyTypes: [],
    openHouseOnly: false,
    statuses: ["ACTIVE"],
    total: 57,
    pending: false,
    ...overrides,
  };
}

const kitchener = searchResultsCopy(
  input({
    city: "Kitchener",
    maxPrice: "750000",
    minBeds: "2",
    minBaths: "2",
  }),
);
assert.equal(kitchener.title, "Homes Under $750K in Kitchener");
assert.equal(kitchener.supporting, "57 homes match your search");
assert.deepEqual(
  kitchener.chips.map((chip) => chip.label),
  ["For Sale", "Under $750K", "2+ Beds", "2+ Baths", "Kitchener"],
);
assert.equal(kitchener.title.includes("Houzzat"), false);

const queryOnly = searchResultsCopy(input({ q: "Kitchener", total: 12 }));
assert.equal(queryOnly.title, "Homes matching “Kitchener”");
assert.equal(queryOnly.title.includes(" in "), false);
assert.equal(
  queryOnly.chips.some((chip) => chip.label === "Kitchener"),
  false,
);

const manyCities = searchResultsCopy(
  input({ cities: "Kitchener|Waterloo|Cambridge", city: "Ignored" }),
);
assert.equal(
  manyCities.title,
  "Homes in Kitchener, Waterloo, and Cambridge",
);
assert.equal(manyCities.title.includes("Ignored"), false);

const fourCities = searchResultsCopy(
  input({ cities: "A|B|C|D", total: 4 }),
);
assert.equal(fourCities.title, "Homes across 4 cities");

const nowhere = searchResultsCopy(input({ total: 0 }));
assert.equal(nowhere.title, "Homes for sale");
assert.equal(nowhere.supporting, "0 homes match your search");
assert.equal(nowhere.title.includes(" in "), false);

const lease = searchResultsCopy(
  input({
    transactionType: "LEASE",
    maxPrice: "2000",
    total: 1,
  }),
);
assert.equal(lease.title, "Rentals Under $2K/mo");
assert.equal(lease.supporting, "1 rental matches your search");
assert.equal(lease.chips[0]?.label, "For Lease");

const range = searchResultsCopy(
  input({ minPrice: "500000", maxPrice: "750000", city: "Kitchener" }),
);
assert.equal(range.title, "Homes $500K–$750K in Kitchener");

assert.equal(
  searchResultsCopy(input({ pending: true })).supporting,
  "Updating results",
);

console.log("search results copy selftest ok");
