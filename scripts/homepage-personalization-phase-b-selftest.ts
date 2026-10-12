/**
 * Homepage personalization + Active Search source precedence (Phase B).
 * Run: node --import tsx scripts/homepage-personalization-phase-b-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildHomepageCriteriaChipLabels,
  committedFromActiveSearchHref,
  committedFromHomepagePersonalizationQuery,
  homepagePersonalizationQueryFromCommitted,
  isMeaningfulActiveSearchHref,
  savedSearchQueryFromCommitted,
} from "../src/lib/listings/homepage-search-source";
import { serializeSearchUrl } from "../src/lib/listings/search-state/serialize";
import { parseSearchUrl } from "../src/lib/listings/search-state/parse";

function read(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

assert.equal(isMeaningfulActiveSearchHref("/search"), false);
assert.equal(isMeaningfulActiveSearchHref("/search?view=cards"), false);
assert.equal(
  isMeaningfulActiveSearchHref("/search?city=Toronto&view=cards"),
  true,
);
assert.equal(
  isMeaningfulActiveSearchHref(
    "/search?cities=Toronto%7CMississauga&minBeds=3",
  ),
  true,
);

const multi = parseSearchUrl(
  "cities=Toronto%7CMississauga&propertyTypes=DETACHED&minBeds=3&minBaths=2&minPrice=700000&maxPrice=1000000&view=cards",
);
const labels = buildHomepageCriteriaChipLabels(multi);
assert.ok(labels.some((l) => l.includes("Toronto") && l.includes("Mississauga")));
assert.ok(labels.some((l) => /Detached/i.test(l)));
assert.ok(labels.some((l) => l.includes("3+ Beds")));
assert.ok(labels.some((l) => l.includes("2+ Baths")));
assert.ok(labels.some((l) => l.includes("–") || l.includes("-")));

const cleared = parseSearchUrl("transactionType=SALE&view=cards");
assert.equal(isMeaningfulActiveSearchHref(serializeSearchUrl(cleared)), false);
assert.deepEqual(buildHomepageCriteriaChipLabels(cleared), []);

const fromHref = committedFromActiveSearchHref(
  serializeSearchUrl(multi, { pathname: "/search" }),
);
assert.ok(fromHref);
assert.deepEqual(fromHref!.cities, ["Toronto", "Mississauga"]);

const q = homepagePersonalizationQueryFromCommitted(multi);
assert.deepEqual(q.cities, ["Toronto", "Mississauga"]);
assert.equal(q.minBeds, "3");
const roundTrip = committedFromHomepagePersonalizationQuery(q);
assert.deepEqual(roundTrip.cities, ["Toronto", "Mississauga"]);
assert.equal(roundTrip.minBeds, "3");

const saved = savedSearchQueryFromCommitted(multi);
assert.ok(Array.isArray(saved.cities));
assert.equal(saved.minBeds, "3");

const bar = read("src/components/home/PersonalizeHomepageBar.tsx");
assert.ok(bar.includes("useHomepageSearchSource"));
assert.ok(bar.includes("HomepagePersonalizedListings"));
assert.ok(bar.includes("buildHomepageCriteriaChipLabels"));
assert.ok(bar.includes("sourceKind={source.kind}"));
assert.ok(bar.includes("Recommended for you"));
assert.equal(bar.includes("View results"), false);
assert.equal(bar.includes("Your home search"), false);
// Chips + Edit homepage search share one row (button not full-width stack).
assert.ok(bar.includes("flex-wrap items-center"));
assert.ok(bar.includes("sm:ml-auto"));
assert.equal(bar.includes("w-full items-center justify-center"), false);

const sortedRails = read("src/components/home/HomepageSortedRails.tsx");
assert.ok(sortedRails.includes('id: "personalize-homepage"'));
assert.ok(sortedRails.includes("rails.push(personalizeRail)"));
assert.ok(sortedRails.includes("rails.push(section)"));
assert.ok(sortedRails.includes("rails.push(nearMeRail)"));
// Recommended must be inserted before Recently viewed (not after).
{
  const insertBlock = sortedRails.slice(
    sortedRails.indexOf('section.id === "recently-viewed"'),
    sortedRails.indexOf("nearMeInserted = true"),
  );
  assert.ok(insertBlock.indexOf("personalizeRail") < insertBlock.indexOf("rails.push(section)"));
}

const modal = read("src/components/home/PersonalizeHomepageModal.tsx");
assert.ok(modal.includes("seededOpenRef"));
assert.ok(modal.includes("saveActiveSearchMemory"));
assert.ok(modal.includes("minBeds"));
assert.ok(modal.includes("minBaths"));
assert.ok(modal.includes("openGuestSaveSearchIntent"));
assert.ok(modal.includes("withHomepageApplyCaptureFlag"));
assert.ok(modal.includes("retainSaveSearchIntentHandler"));

const listings = read("src/components/home/HomepagePersonalizedListings.tsx");
assert.ok(listings.includes("buildListingsQuery"));
assert.equal(listings.includes("appendPersonalizationToUrlSearchParams"), false);
assert.equal(listings.includes("Homes for you"), false);
assert.ok(listings.includes('href={href}'));

const saveIntent = read("src/lib/auth/save-search-intent.ts");
assert.ok(saveIntent.includes("HOMEPAGE_APPLY_CAPTURE_PARAM"));
assert.ok(saveIntent.includes("callbackRequestsHomepageApply"));
assert.ok(saveIntent.includes("applyToHomepage"));

const memory = read("src/lib/listings/search-state/active-search-memory.ts");
assert.ok(memory.includes("ACTIVE_SEARCH_CHANGED_EVENT"));
assert.ok(memory.includes("emitActiveSearchChanged"));

const agent = read(
  "src/components/templates/agent-signature/AgentSignatureHome.tsx",
);
const team = read(
  "src/components/templates/team-signature/TeamSignatureHome.tsx",
);
assert.ok(agent.includes("PersonalizeHomepageBar"));
assert.ok(team.includes("PersonalizeHomepageBar"));

const funnel = read("src/components/auth/lead-funnel/LeadCaptureFunnel.tsx");
assert.ok(funnel.includes("Is this search correct?"));
assert.ok(funnel.includes("Yes, That&apos;s right"));
assert.ok(funnel.includes("No, Edit Search"));

const marketingLayout = read("src/app/(marketing)/layout.tsx");
assert.ok(marketingLayout.includes("flex min-h-dvh flex-col"));
const belowHeader = read("src/components/site/MarketingBelowHeader.tsx");
assert.ok(belowHeader.includes("flex min-h-0 flex-1 flex-col"));
assert.ok(belowHeader.includes("min-h-0 flex-1"));

console.log("homepage-personalization-phase-b selftest: PASS");
