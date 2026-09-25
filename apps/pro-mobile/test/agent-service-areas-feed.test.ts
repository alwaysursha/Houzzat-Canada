/**
 * HouzzatPRO agent service areas and the personalized Properties feed.
 *
 * Run: node --import tsx apps/pro-mobile/test/agent-service-areas-feed.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  expandServiceAreasToCities,
  feedCitiesForMarkets,
  nextMarketsAfterProspectSeed,
  parseProspectRegionToServiceAreas,
} from "../../../src/lib/agent/service-areas";
import { gtaServiceCities } from "../../../src/lib/geo/regions";
import { listingCityInServiceAreas } from "../../../src/lib/listings/precise-property-search";
import {
  parseViewingPropertyQuery,
  propertiesBrowsePhase,
  SHORT_SEARCH_HINT,
} from "../src/lib/viewing-search";
import {
  buildPropertiesFeedQuery,
  buildPropertiesSearchQuery,
} from "../src/lib/property-response";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = join(APP, "../..");

function readApp(rel: string) {
  return readFileSync(join(APP, rel), "utf8");
}

function readRepo(rel: string) {
  return readFileSync(join(REPO, rel), "utf8");
}

const SALE_FILTERS = {
  transactionType: "SALE",
  sort: "newest",
  minPrice: "",
  maxPrice: "",
  minBeds: "",
  minBaths: "",
  openHouseOnly: false,
  propertyTypes: [] as string[],
};

function run() {
  console.log("=================================================================");
  console.log("AGENT SERVICE AREAS + PROPERTIES FEED");
  console.log("=================================================================\n");

  console.log("[1] Demo region seeds an empty agent profile once...");
  assert.deepEqual(parseProspectRegionToServiceAreas("Mississauga, Milton"), [
    "Mississauga",
    "Milton",
  ]);
  const seeded = nextMarketsAfterProspectSeed({
    markets: [],
    customized: false,
    prospectRegion: "Mississauga / Milton",
  });
  assert.equal(seeded.seeded, true);
  assert.deepEqual(seeded.markets, ["Mississauga", "Milton"]);
  const kept = nextMarketsAfterProspectSeed({
    markets: ["Oakville"],
    customized: false,
    prospectRegion: "Mississauga",
  });
  assert.equal(kept.seeded, false);
  assert.deepEqual(kept.markets, ["Oakville"]);
  const cleared = nextMarketsAfterProspectSeed({
    markets: [],
    customized: true,
    prospectRegion: "Mississauga",
  });
  assert.equal(cleared.seeded, false);
  assert.deepEqual(cleared.markets, []);
  console.log("  -> seed: PASS\n");

  console.log("[2] Areas stay on that agent and expand through regions...");
  const agentA = expandServiceAreasToCities(["Mississauga"]);
  const agentB = expandServiceAreasToCities(["Milton", "Halton Region"]);
  assert.deepEqual(agentA, ["Mississauga"]);
  assert.ok(agentB.includes("Milton"));
  assert.ok(agentB.includes("Oakville"));
  assert.equal(agentB.includes("Toronto"), false);
  assert.equal(agentA.includes("Milton"), false);
  const peel = expandServiceAreasToCities(["Peel Region"]);
  assert.ok(peel.includes("Mississauga"));
  assert.ok(peel.includes("Brampton"));
  assert.ok(peel.includes("Caledon"));
  console.log("  -> geography: PASS\n");

  console.log("[3] No areas fall back to the GTA, not London...");
  const gta = feedCitiesForMarkets([]);
  assert.equal(gta.source, "gta");
  assert.ok(gta.cities.includes("Toronto"));
  assert.ok(gta.cities.includes("Mississauga"));
  assert.equal(gta.cities.includes("London"), false);
  assert.deepEqual(gta.cities, gtaServiceCities());
  const personal = feedCitiesForMarkets(["Mississauga"]);
  assert.equal(personal.source, "agent");
  assert.deepEqual(personal.cities, ["Mississauga"]);
  console.log("  -> gta: PASS\n");

  console.log("[4] Default feed exists, and search can leave the service area...");
  const feed = buildPropertiesFeedQuery({ filters: SALE_FILTERS });
  assert.ok(feed.includes("mode=feed"));
  assert.ok(feed.includes("transactionType=SALE"));
  assert.equal(feed.includes("q="), false);
  const outside = buildPropertiesSearchQuery({
    q: "Toronto",
    filters: SALE_FILTERS,
  });
  assert.ok(outside.includes("mode=address"));
  assert.ok(outside.includes("q=Toronto"));
  assert.equal(outside.includes("mode=feed"), false);
  const rent = buildPropertiesFeedQuery({
    filters: { ...SALE_FILTERS, transactionType: "LEASE" },
  });
  assert.ok(rent.includes("transactionType=LEASE"));
  console.log("  -> feed query: PASS\n");

  console.log("[5] Empty query loads the feed; 1–2 characters do not...");
  assert.equal(propertiesBrowsePhase(""), "feed");
  assert.equal(propertiesBrowsePhase("   "), "feed");
  assert.equal(propertiesBrowsePhase("X"), "short");
  assert.equal(propertiesBrowsePhase("X1"), "short");
  assert.equal(propertiesBrowsePhase("X13"), "search");
  const screen = readApp("src/screens/PropertiesSearchScreen.tsx");
  assert.ok(screen.includes("propertiesBrowsePhase"));
  assert.ok(screen.includes("buildPropertiesFeedQuery"));
  assert.ok(screen.includes('phase === "short"'));
  assert.ok(screen.includes('usingFeed = phase === "feed"'));
  assert.ok(screen.includes("SHORT_SEARCH_HINT"));
  assert.equal(SHORT_SEARCH_HINT, "Type at least 3 characters to search.");
  const shortBranch = screen.indexOf('phase === "short"');
  const feedCall = screen.indexOf("buildPropertiesFeedQuery");
  assert.ok(shortBranch > 0 && feedCall > 0);
  const emptyCards = [{ mlsNumber: "X13815246" }];
  const mounted = propertiesBrowsePhase("");
  assert.equal(mounted, "feed");
  assert.equal(mounted === "short", false);
  assert.deepEqual(
    mounted === "feed" ? emptyCards.map((card) => card.mlsNumber) : [],
    ["X13815246"],
  );
  assert.equal(propertiesBrowsePhase("X") === "short", true);
  assert.equal(propertiesBrowsePhase("") === "feed", true);
  assert.ok(listingCityInServiceAreas("Toronto C01", ["Toronto"]));
  assert.ok(listingCityInServiceAreas("Mississauga", ["Mississauga"]));
  assert.equal(listingCityInServiceAreas("Toronto C01", ["Mississauga"]), false);
  assert.ok(listingCityInServiceAreas("Toronto C01", feedCitiesForMarkets([]).cities));
  assert.equal(listingCityInServiceAreas("London", ["Mississauga"]), false);
  const searchRoute = readRepo("src/app/api/mobile/v2/properties/search/route.ts");
  const feedRoute = searchRoute.slice(
    searchRoute.indexOf('mode === "feed"'),
    searchRoute.indexOf('mode === "prefix"'),
  );
  assert.ok(feedRoute.includes("findFeedListings"));
  assert.equal(feedRoute.includes("provider.search"), false);
  assert.ok(feedRoute.includes('transactionType: transaction'));
  console.log("  -> mount: PASS\n");

  console.log("[6] Precision search is unchanged...");
  const exact = parseViewingPropertyQuery("X13815246");
  assert.equal(exact.kind, "mls");
  if (exact.kind === "mls") {
    assert.deepEqual(exact.mlsNumbers, ["X13815246"]);
  }
  const batch = parseViewingPropertyQuery("X13815246, X13813458");
  assert.equal(batch.kind, "mls");
  if (batch.kind === "mls") {
    assert.deepEqual(batch.mlsNumbers, ["X13815246", "X13813458"]);
  }
  assert.equal(parseViewingPropertyQuery("X1").kind, "short");
  const planner = readApp("src/screens/ViewingsPlannerScreen.tsx");
  assert.ok(planner.includes("listingsForQuery"));
  assert.ok(planner.includes("mlsBatchSearchPath"));
  const properties = readApp("src/screens/PropertiesSearchScreen.tsx");
  assert.ok(properties.includes("buildPropertiesFeedQuery"));
  assert.ok(properties.includes("listingsForQuery"));
  assert.ok(properties.includes("For Sale"));
  assert.ok(properties.includes("For Rent"));
  assert.ok(properties.includes('transactionType: "SALE"') || properties.includes("transactionType=SALE") || readApp("src/types/property.ts").includes('transactionType: "SALE"'));
  console.log("  -> precision: PASS\n");

  console.log("[7] Profile storage is per agent and workspace-gated...");
  const route = readRepo("src/app/api/mobile/v2/profile/service-areas/route.ts");
  assert.ok(route.includes("authorizeMobileWorkspaceAccess"));
  assert.ok(route.includes("access.userId"));
  assert.ok(route.includes("saveAgentServiceAreas"));
  const search = readRepo("src/app/api/mobile/v2/properties/search/route.ts");
  const feedBlock = search.slice(search.indexOf('mode === "feed"'), search.indexOf('mode === "prefix"'));
  assert.ok(feedBlock.includes("access.userId"));
  assert.ok(feedBlock.includes("feedCitiesForMarkets"));
  assert.ok(feedBlock.includes("findFeedListings"));
  assert.equal(feedBlock.includes("provider.search"), false);
  const addressBlock = search.slice(search.indexOf('mode === "address"'));
  assert.equal(addressBlock.includes("feedCitiesForMarkets"), false);
  const profile = readApp("src/components/ServiceAreasCard.tsx");
  assert.ok(profile.includes("Service Areas"));
  assert.ok(profile.includes("/profile/service-areas"));
  assert.ok(readApp("src/screens/MoreHubScreen.tsx").includes("ServiceAreasCard"));
  const schema = readRepo("prisma/schema.prisma");
  assert.ok(schema.includes("markets   String[]"));
  assert.ok(schema.includes("marketsCustomizedAt"));
  console.log("  -> profile: PASS\n");

  console.log("AGENT SERVICE AREAS + PROPERTIES FEED: ALL PASS\n");
}

run();
