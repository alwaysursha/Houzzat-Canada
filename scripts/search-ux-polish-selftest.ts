/**
 * Search UX polish + location-aware homepage rails contracts.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  dedupeRecentSearches,
  normalizeRecentSearchHref,
  recentSearchesStorageKey,
  type LocalRecentSearch,
} from "../src/lib/listings/recent-searches-local";
import {
  isGenericSavedSearchName,
  resolveSavedSearchName,
  savedSearchDisplayName,
  savedSearchDisplayNameFromQuery,
  SAVED_SEARCH_NAME_MAX_LENGTH,
} from "../src/lib/listings/saved-search-query";
import type { SearchFilters } from "../src/components/listings/SearchFilterChips";

const root = process.cwd();
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const base = {
  segment: "RESIDENTIAL",
  transactionType: "SALE",
  dataSource: "",
  city: "",
  community: "",
  propertyTypes: [],
  minPrice: "",
  maxPrice: "",
  minBeds: "",
  minBaths: "",
  openHouseOnly: false,
  statuses: ["ACTIVE"],
  sort: "newest",
} satisfies SearchFilters;

// --- Naming ---
assert.equal(
  savedSearchDisplayName(
    {
      ...base,
      minPrice: "750000",
      maxPrice: "1200000",
    },
    { cities: ["Markham", "Pickering"] },
  ),
  "Markham & Pickering Listings · $750K–$1.2M",
);

assert.equal(
  savedSearchDisplayName(
    { ...base, minBeds: "3", maxPrice: "750000" },
    { cities: ["Milton"] },
  ),
  "Milton Listings · 3+ Beds · Under $750K",
);

assert.equal(
  savedSearchDisplayName(
    {
      ...base,
      propertyTypes: ["CONDO_APT"],
      minBeds: "2",
    },
    { cities: ["Mississauga"] },
  ),
  "Mississauga Condos · 2+ Beds",
);

assert.equal(
  savedSearchDisplayName(
    {
      ...base,
      transactionType: "LEASE",
      maxPrice: "3000",
    },
    { cities: ["Oakville"] },
  ),
  "Oakville Homes for Lease · Under $3K/mo",
);

assert.ok(isGenericSavedSearchName("Home Search 1"));
assert.ok(isGenericSavedSearchName("My home search"));
assert.ok(isGenericSavedSearchName("My homes search"));
assert.equal(isGenericSavedSearchName("Ali’s Oakville picks"), false);

assert.equal(
  resolveSavedSearchName({
    existingName: "Family shortlist",
    filters: { ...base, minBeds: "3" },
    cities: ["Milton"],
  }),
  "Family shortlist",
);

assert.equal(
  resolveSavedSearchName({
    existingName: "Home Search 2",
    filters: { ...base, minBeds: "3" },
    cities: ["Milton"],
  }),
  "Milton Listings · 3+ Beds",
);

const long = savedSearchDisplayName(
  {
    ...base,
    minBeds: "2",
    minBaths: "2",
    minPrice: "500000",
    maxPrice: "2500000",
    propertyTypes: ["DETACHED", "SEMI_DETACHED", "TOWNHOUSE"],
  },
  { cities: ["Toronto", "Mississauga", "Brampton", "Markham", "Vaughan"] },
);
assert.ok(long.length <= SAVED_SEARCH_NAME_MAX_LENGTH);

assert.equal(
  savedSearchDisplayNameFromQuery({
    city: "Milton",
    minBeds: "3",
    maxPrice: "750000",
  }),
  "Milton Listings · 3+ Beds · Under $750K",
);

// --- Recent searches storage ---
assert.match(recentSearchesStorageKey("ws_abc"), /houzzat:recent-searches-v1:ws_abc/);
assert.equal(
  normalizeRecentSearchHref("/search?view=cards&city=Milton&minBeds=3"),
  normalizeRecentSearchHref("/search?minBeds=3&city=milton"),
);

const deduped = dedupeRecentSearches([
  { label: "Milton Listings · 3+ Beds", href: "/search?city=Milton&minBeds=3", at: 3 },
  { label: "Milton Listings · 3+ Beds", href: "/search?city=milton&minBeds=3&view=cards", at: 2 },
  { label: "Oakville Condos", href: "/search?city=Oakville&propertyTypes=CONDO_APT", at: 1 },
] satisfies LocalRecentSearch[]);
assert.equal(deduped.length, 2);
assert.equal(deduped[0]!.label, "Milton Listings · 3+ Beds");

// Same display label + different criteria must NOT collapse (href identity).
const sameLabelDifferentCriteria = dedupeRecentSearches([
  {
    label: "Milton Listings · 3+ Beds",
    href: "/search?city=Milton&minBeds=3&sort=newest",
    at: 2,
  },
  {
    label: "Milton Listings · 3+ Beds",
    href: "/search?city=Milton&minBeds=3&sort=price_asc",
    at: 1,
  },
]);
assert.equal(sameLabelDifferentCriteria.length, 2);

const recentSrc = read("src/lib/listings/recent-searches-local.ts");
assert.ok(recentSrc.includes("Bare /search with no criteria"));
assert.ok(recentSrc.includes("normalizeRecentSearchHref(a.href)"));
assert.equal(recentSrc.includes("normalizeLabel"), false);

const committedHook = read(
  "src/lib/listings/search-state/use-committed-search.ts",
);
assert.ok(committedHook.includes("urlHasExplicitSearchCriteria(relative)"));
assert.ok(committedHook.includes("rememberRecentCommittedSearch"));

const railsApi = read("src/app/api/listings/home-rails/route.ts");
assert.ok(railsApi.includes("typesenseHomeRails"));
assert.ok(railsApi.includes("cities,"));
assert.ok(railsApi.includes('status: "ACTIVE"'));
assert.ok(railsApi.includes('status: "SOLD"'));
assert.ok(railsApi.includes('transactionType: "LEASE"'));
assert.ok(railsApi.includes('segment: "COMMERCIAL"'));
assert.ok(railsApi.includes("openHouses"));
assert.ok(railsApi.includes("resolveListingEntitlementContextForRequest"));
assert.ok(railsApi.includes("mlsClientGate"));

// --- Toolbar / dropdown wiring ---
const experience = read("src/components/listings/SearchExperience.tsx");
assert.ok(experience.includes("SearchesDropdown"));
assert.ok(experience.includes("leading="));
// Mobile secondary Plan/Watch/Save row removed (desktop keeps them).
assert.equal((experience.match(/idleLabel="Watch"/g) ?? []).length, 0);
assert.equal((experience.match(/>\s*Plan\s*</g) ?? []).length, 0);

const dropdown = read("src/components/listings/SearchesDropdown.tsx");
assert.ok(dropdown.includes("Recent Searches"));
assert.ok(dropdown.includes("Saved Searches"));
assert.ok(dropdown.includes("Save this search"));
assert.ok(dropdown.includes("savedQueryToSearchHref"));
assert.ok(dropdown.includes("readLocalRecentSearches"));

const strip = read("src/components/listings/SearchActiveFilterStrip.tsx");
assert.ok(strip.includes("leading"));
assert.ok(strip.includes("Clear all"));

// --- Homepage modal VV + safe area ---
const modal = read("src/components/home/PersonalizeHomepageModal.tsx");
assert.ok(modal.includes("visualViewportOverlayStyle"));
assert.ok(modal.includes("safe-area-inset-top"));
assert.ok(modal.includes("safe-area-inset-bottom"));
assert.ok(modal.includes("acquireScrollLock"));
assert.ok(modal.includes("resolveSavedSearchName"));
assert.ok(modal.includes("overscroll-contain"));

// --- Homepage bar ---
const bar = read("src/components/home/PersonalizeHomepageBar.tsx");
assert.ok(bar.includes("Edit homepage search"));
assert.ok(bar.includes("View results"));
assert.ok(bar.includes("from-canopy/[0.14]"));
assert.equal(bar.includes(">Edit<"), false);
assert.equal(bar.includes("md:hidden"), false);

// --- Rails city-only scope ---
const rails = read("src/components/home/HomepageMarketRails.tsx");
assert.ok(rails.includes("useHomepageSearchSource"));
assert.ok(rails.includes("scopedCities"));
assert.equal(rails.includes("minPrice: personalization"), false);
assert.equal(rails.includes("propertyTypes: personalization"), false);
assert.ok(rails.includes("homeRailsUrl(cities)"));
assert.ok(rails.includes('title="New Listings"'));
assert.ok(rails.includes('title="For lease"'));
assert.ok(rails.includes("Commercial"));

const recentLocal = read("src/lib/listings/recent-searches-local.ts");
assert.ok(recentLocal.includes("recentSearchesScope"));
assert.ok(recentLocal.includes("workspaceId"));
assert.ok(recentLocal.includes("LEGACY_STORAGE_KEY"));

console.log("search-ux-polish selftest: PASS");
