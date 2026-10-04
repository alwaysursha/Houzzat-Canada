/**
 * About This Home Quick Facts: PropTx mapping + compact pills + omit-empty.
 * Run: pnpm listing-about-property-facts:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildAboutHomePropertyFacts,
  formatAboutHomeOwnershipValue,
} from "../src/lib/listings/facts";
import { mapListingFacts } from "../src/lib/proptx/map-listing";

function read(rel: string) {
  return readFileSync(rel, "utf8");
}

const MOCK_VALUES = [
  "$5,420",
  "$5,420 / year",
  "29 ft",
  "2 Storey",
  "2,000–2,500 sq ft",
  "$7,578",
  "$7,981",
  "2,000–2,500",
  "2,500–3,000",
];

for (const file of [
  "src/components/listings/ListingNarrative.tsx",
  "src/components/listings/ListingAboutPropertyFacts.tsx",
  "src/components/listings/ListingDetailView.tsx",
]) {
  const src = read(file);
  for (const value of MOCK_VALUES) {
    assert.equal(
      src.includes(value),
      false,
      `${file} must not hardcode mock fact ${value}`,
    );
  }
}

const mapped = mapListingFacts({
  PropertyType: "Residential Freehold",
  PropertyClass: "ShouldNotWin",
  PropertySubType: "Detached",
  ArchitecturalStyle: ["2-Storey", "Contemporary"],
  Basement: ["Finished", "Walk-out"],
  FrontageLength: 41.25,
  TaxYear: 2019,
  LivingAreaRange: "1100-1500",
});
assert.ok(mapped);
assert.equal(mapped.propertyClass, "Residential Freehold");
assert.equal(mapped.propertySubType, "Detached");
assert.deepEqual(mapped.architecturalStyle, ["2-Storey", "Contemporary"]);
assert.deepEqual(mapped.basement, ["Finished", "Walk-out"]);
assert.equal(mapped.frontageLength, 41.25);
assert.equal(mapped.taxYear, 2019);
assert.equal(mapped.livingAreaRange, "1100-1500");

const tiles = buildAboutHomePropertyFacts({
  facts: mapped,
  propertyType: "DETACHED",
  taxes: 9876,
  taxesLabel: "$9,876 / 2019",
  sqft: 999_999,
});

assert.deepEqual(
  tiles.map((t) => t.id),
  ["ownership", "taxes", "basement", "frontage", "storeys", "livingSpace"],
);
assert.equal(tiles.find((t) => t.id === "ownership")?.value, "Freehold");
assert.equal(
  buildAboutHomePropertyFacts({
    facts: {
      propertyClass: "Residential Freehold",
      propertySubType: "Att/Row/Townhouse",
    },
    propertyType: "TOWNHOUSE",
  }).find((t) => t.id === "ownership")?.value,
  "Freehold Townhouse",
);
assert.equal(
  buildAboutHomePropertyFacts({
    facts: {
      propertySubType: "Condo Townhouse",
    },
    propertyType: "CONDO_TOWNHOUSE",
  }).find((t) => t.id === "ownership")?.value,
  "Condo Townhouse",
);
assert.equal(
  buildAboutHomePropertyFacts({
    facts: {
      propertySubType: "Att/Row/Townhouse",
    },
    propertyType: "TOWNHOUSE",
  }).find((t) => t.id === "ownership"),
  undefined,
);
assert.equal(
  tiles.find((t) => t.id === "taxes")?.value,
  "$9,876 taxes · 2019",
);
assert.equal(
  tiles.find((t) => t.id === "basement")?.value,
  "Finished, Walk-out basement",
);
assert.equal(tiles.find((t) => t.id === "frontage")?.value, "41.25 frontage");
assert.equal(tiles.find((t) => t.id === "storeys")?.value, "2-Storey");
assert.equal(
  tiles.find((t) => t.id === "livingSpace")?.value,
  "1,100–1,500 sqft",
);

const longBasement = buildAboutHomePropertyFacts({
  facts: {
    basement: ["Full", "Separate Entrance", "Finished"],
  },
});
assert.equal(
  longBasement.find((t) => t.id === "basement")?.value,
  "Full, Separate Entrance, Finished basement",
);

assert.equal(
  formatAboutHomeOwnershipValue({
    propertyClass: "Residential Condo & Other",
    propertyType: "CONDO_APT",
  }),
  "Condo",
);
assert.equal(
  formatAboutHomeOwnershipValue({
    propertyType: "TOWNHOUSE",
  }),
  null,
);
assert.equal(
  formatAboutHomeOwnershipValue({
    propertyType: "DETACHED",
  }),
  null,
);
assert.equal(
  formatAboutHomeOwnershipValue({
    propertyType: "SEMI_DETACHED",
  }),
  null,
);
assert.equal(
  formatAboutHomeOwnershipValue({
    propertyType: "MULTIPLEX",
  }),
  null,
);
assert.equal(
  formatAboutHomeOwnershipValue({
    propertyType: "VACANT_LAND",
  }),
  null,
);
assert.equal(
  formatAboutHomeOwnershipValue({
    propertyType: "CONDO_APT",
  }),
  null,
);
assert.equal(
  formatAboutHomeOwnershipValue({
    propertyType: "CONDO_TOWNHOUSE",
  }),
  null,
);
assert.equal(
  formatAboutHomeOwnershipValue({
    propertySubType: "Detached",
    propertyType: "DETACHED",
  }),
  null,
);
assert.equal(
  formatAboutHomeOwnershipValue({
    propertySubType: "Att/Row/Twnhouse",
    propertyType: "TOWNHOUSE",
  }),
  null,
);
assert.equal(
  formatAboutHomeOwnershipValue({
    propertySubType: "Condo Apt",
    propertyType: "CONDO_APT",
  }),
  "Condo",
);
assert.equal(
  formatAboutHomeOwnershipValue({
    propertySubType: "Condo Townhouse",
    propertyType: "CONDO_TOWNHOUSE",
  }),
  "Condo Townhouse",
);
assert.equal(
  formatAboutHomeOwnershipValue({
    propertySubType: "Freehold Townhouse",
    propertyType: "TOWNHOUSE",
  }),
  "Freehold Townhouse",
);
assert.equal(
  formatAboutHomeOwnershipValue({
    propertyClass: "Residential Freehold",
    propertySubType: "Att/Row/Twnhouse",
    propertyType: "TOWNHOUSE",
  }),
  "Freehold Townhouse",
);
assert.equal(
  formatAboutHomeOwnershipValue({
    propertyClass: "Residential Condo & Other",
    propertySubType: "Att/Row/Townhouse",
    propertyType: "TOWNHOUSE",
  }),
  "Condo Townhouse",
);
assert.equal(
  formatAboutHomeOwnershipValue({
    propertyClass: "Residential Freehold",
    propertySubType: "Detached",
    propertyType: "DETACHED",
  }),
  "Freehold",
);
assert.equal(
  formatAboutHomeOwnershipValue({
    propertyType: "OFFICE",
  }),
  "Office",
);
assert.equal(
  formatAboutHomeOwnershipValue({
    propertyType: "RETAIL",
  }),
  "Retail",
);

const omitted = buildAboutHomePropertyFacts({
  facts: { basement: [], frontageLength: 0, architecturalStyle: ["Contemporary"] },
  propertyType: null,
  taxes: 0,
  taxesLabel: "$0",
  sqft: 0,
});
assert.deepEqual(omitted, []);
assert.equal(
  omitted.some((t) => /n\/a|unknown|null|undefined/i.test(t.value)),
  false,
);

const narrative = read("src/components/listings/ListingNarrative.tsx");
assert.ok(narrative.includes("ExpandableDescription"));
assert.ok(narrative.includes("Broker remarks from the listing."));
assert.ok(narrative.includes("lg:flex-row"));
assert.ok(narrative.includes("ListingAboutPropertyFacts"));
assert.ok(narrative.includes("stripApproxPinNote"));

const factsUi = read("src/components/listings/ListingAboutPropertyFacts.tsx");
assert.ok(factsUi.includes("Quick facts"));
assert.ok(factsUi.includes("flex flex-wrap"));
assert.equal(factsUi.includes("Property facts"), false);
assert.equal(factsUi.includes("grid-cols"), false);
assert.equal(factsUi.includes("rounded-2xl border border-canopy"), false);
assert.ok(factsUi.includes("rounded-full"));
assert.ok(factsUi.includes("bg-canopy/[0.08]"));

const detail = read("src/components/listings/ListingDetailView.tsx");
assert.ok(detail.includes("taxesLabel={taxesLabel}"));
assert.ok(detail.includes("sqft={listing.sqft}"));
assert.ok(detail.includes("facts={listing.facts}"));

const expand = read("src/components/listings/ExpandableDescription.tsx");
assert.ok(expand.includes("Full description"));
assert.ok(expand.includes("line-clamp-4"));

const insights = read(
  "src/components/listings/insights/HouzzatInsights.tsx",
);
assert.equal(insights.includes("How the home is laid out"), false);
assert.equal(insights.includes('eyebrow="Space"'), false);

const mapper = read("src/lib/proptx/map-listing.ts");
assert.ok(mapper.includes('propertyClass: str(row, "PropertyType", "PropertyClass")'));

const ownershipSrc = read("src/lib/listings/facts.ts");
assert.ok(ownershipSrc.includes("ownershipTokenFromStructuredText"));
assert.ok(ownershipSrc.includes("commercialPropertyTypeFact"));
assert.ok(ownershipSrc.includes("TOWNHOUSE or DETACHED"));
assert.equal(
  /isResidentialFreeholdPropertyType|isCondoPropertyType/.test(ownershipSrc),
  false,
);

console.log("listing-about-property-facts selftest ok");
