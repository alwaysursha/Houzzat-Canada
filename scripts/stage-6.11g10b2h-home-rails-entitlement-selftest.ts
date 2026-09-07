/**
 * Stage 6.11G.10B2H — home-rails MLS entitlement enforcement selftest.
 * Run: pnpm stage-6.11g10b2h-home-rails-entitlement:selftest
 *
 * Production G5_ENTITLEMENT_FILTERING_ENABLED stays OFF.
 * Tests use entitlementFilteringEnabled: true to exercise enforcement.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  G10B1_HOME_RAILS_OUTSIDE_ENTITLEMENT_ENFORCEMENT,
  G10B2H_HOME_RAILS_ENTITLEMENT_WIRED,
  buildPrismaEntitledInventoryWhere,
  buildPrismaListingAuthorityWhere,
  normalizeListingSearchStatuses,
  type WorkspaceListingEntitlement,
} from "@/lib/tenancy/listing-entitlement";
import { G5_ENTITLEMENT_FILTERING_ENABLED } from "@/lib/tenancy/listing-provenance";
import {
  planTypesenseHomeRailsSearches,
  reassembleTypesenseHomeRailsResults,
  type HomeRailsRailKey,
  type HomeRailsSearchPlan,
} from "@/lib/typesense/search";
import { buildListingSourceAuthorityKey } from "@/lib/typesense/listing-document";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const TRREB = "cmtrdf23t000091u0cw3a5zu9";
const ORG_A = "org_active_only";
const ORG_B = "org_sold_only";
const ORG_C = "org_oh_only";

const SAK_TRREB = buildListingSourceAuthorityKey(TRREB, "proptx")!;
const SAK_A = buildListingSourceAuthorityKey(ORG_A, "proptx")!;
const SAK_B = buildListingSourceAuthorityKey(ORG_B, "proptx")!;
const SAK_C = buildListingSourceAuthorityKey(ORG_C, "proptx")!;

const houzzatEntitlement: WorkspaceListingEntitlement = {
  workspaceId: "ws_houzzat",
  authorities: [
    {
      organizationId: TRREB,
      providerKey: "proptx",
      sourceAuthorityKey: SAK_TRREB,
      capabilities: [
        "ACTIVE_LISTINGS",
        "SOLD",
        "HISTORY",
        "OPEN_HOUSES",
        "MEDIA",
      ],
    },
  ],
};

const splitCapabilityEntitlement: WorkspaceListingEntitlement = {
  workspaceId: "ws_split",
  authorities: [
    {
      organizationId: ORG_A,
      providerKey: "proptx",
      sourceAuthorityKey: SAK_A,
      capabilities: ["ACTIVE_LISTINGS"],
    },
    {
      organizationId: ORG_B,
      providerKey: "proptx",
      sourceAuthorityKey: SAK_B,
      capabilities: ["SOLD"],
    },
    {
      organizationId: ORG_C,
      providerKey: "proptx",
      sourceAuthorityKey: SAK_C,
      capabilities: ["OPEN_HOUSES"],
    },
  ],
};

const emptyEntitlement: WorkspaceListingEntitlement = {
  workspaceId: "ws_empty",
  authorities: [],
};

const unauthorizedEntitlement: WorkspaceListingEntitlement = {
  workspaceId: "ws_no_board",
  authorities: [],
};

function filterByFor(rail: HomeRailsRailKey, plans: ReturnType<typeof planTypesenseHomeRailsSearches>) {
  const plan = plans.find((p) => p.rail === rail);
  assert.ok(plan, `missing plan for ${rail}`);
  return plan;
}

async function main() {
  console.log("\n=== STAGE 6.11G.10B2H — HOME-RAILS ENTITLEMENT ===\n");

  // --- Request authority wiring (source scan) ---
  {
    const route = read("src/app/api/listings/home-rails/route.ts");
    assert.ok(route.includes("resolveListingEntitlementContextForRequest"));
    assert.ok(route.includes("typesenseHomeRails"));
    assert.ok(route.includes("entitlement"));
    // Resolve once — import + single call site
    assert.ok(
      route.includes(
        "await resolveListingEntitlementContextForRequest(request)",
      ),
    );
    assert.equal(
      (route.match(/await resolveListingEntitlementContextForRequest/g) ?? [])
        .length,
      1,
      "must await resolve once",
    );
    // No client-supplied authority / force-enable
    assert.ok(!route.includes('searchParams.get("workspaceId")'));
    assert.ok(!route.includes('searchParams.get("organizationId")'));
    assert.ok(!route.includes('searchParams.get("sourceAuthorityKey")'));
    assert.ok(!route.includes('searchParams.get("entitlementFilteringEnabled")'));
    // G.10B3B: web force-enable via local const (not client-controlled)
    assert.ok(route.includes("entitlementFilteringEnabled = true"));
    assert.ok(route.includes("entitlementFilteringEnabled,"));
    // Fallback passes same entitlement + force-enable
    assert.ok(route.includes("provider.search({"));
    assert.ok(route.includes("provider.openHouses({"));
    const entitlementPassCount = (route.match(/entitlement,/g) ?? []).length;
    assert.ok(
      entitlementPassCount >= 6,
      "typesense + 5 provider calls must receive entitlement",
    );
    const forcePassCount = (
      route.match(/entitlementFilteringEnabled,/g) ?? []
    ).length;
    assert.ok(
      forcePassCount >= 6,
      "typesense + 5 provider calls must receive force-enable",
    );
    // No Houzzat special-case
    assert.ok(!route.includes("houzzat.com"));
    assert.ok(!route.includes("HOUZZAT"));
    console.log("[0] request authority / resolve-once / no client trust... PASS");
  }

  // --- Flag OFF parity ---
  {
    assert.equal(G5_ENTITLEMENT_FILTERING_ENABLED, false);
    assert.equal(G10B2H_HOME_RAILS_ENTITLEMENT_WIRED, true);
    assert.equal(G10B1_HOME_RAILS_OUTSIDE_ENTITLEMENT_ENFORCEMENT, false);

    const offNoEnt = planTypesenseHomeRailsSearches({ limit: 12 });
    assert.equal(offNoEnt.length, 5);
    for (const plan of offNoEnt) {
      assert.equal(plan.kind, "query");
      assert.ok(plan.filterBy);
      assert.ok(
        !plan.filterBy!.includes("sourceAuthorityKey"),
        `${plan.rail} flag-OFF must not include SAK`,
      );
    }

    const offWithEnt = planTypesenseHomeRailsSearches({
      limit: 12,
      entitlement: houzzatEntitlement,
    });
    for (const plan of offWithEnt) {
      assert.equal(plan.kind, "query");
      assert.ok(!plan.filterBy!.includes("sourceAuthorityKey"));
    }

    // Product semantics preserved (status / segment / transaction / OH)
    const byRail = Object.fromEntries(
      offNoEnt.map((p) => [p.rail, p.filterBy!]),
    ) as Record<HomeRailsRailKey, string>;
    assert.ok(byRail.newListings.includes("status:="));
    assert.ok(byRail.newListings.includes("RESIDENTIAL"));
    assert.ok(byRail.newListings.includes("transactionType:=SALE"));
    assert.ok(byRail.sold.includes("status:=SOLD"));
    assert.ok(byRail.forLease.includes("transactionType:=LEASE"));
    assert.ok(byRail.commercial.includes("COMMERCIAL"));
    assert.ok(byRail.openHouses.includes("nextOpenHouseStartsAt:>="));
    assert.ok(byRail.openHouses.includes("RESIDENTIAL"));

    // Order of rails preserved
    assert.deepEqual(
      offNoEnt.map((p) => p.rail),
      ["newListings", "sold", "forLease", "commercial", "openHouses"],
    );

    console.log("[1] flag-OFF parity (no SAK; rail semantics)... PASS");
  }

  // --- ON + missing / empty entitlement → zero MLS rails ---
  {
    const missing = planTypesenseHomeRailsSearches({
      entitlementFilteringEnabled: true,
    });
    for (const plan of missing) {
      assert.equal(plan.kind, "empty", `${plan.rail} missing entitlement`);
    }

    const empty = planTypesenseHomeRailsSearches({
      entitlement: emptyEntitlement,
      entitlementFilteringEnabled: true,
    });
    for (const plan of empty) {
      assert.equal(plan.kind, "empty", `${plan.rail} empty entitlement`);
    }

    const unauthorized = planTypesenseHomeRailsSearches({
      entitlement: unauthorizedEntitlement,
      entitlementFilteringEnabled: true,
    });
    for (const plan of unauthorized) {
      assert.equal(plan.kind, "empty", `${plan.rail} unauthorized tenant`);
    }

    console.log("[2] ON + missing/empty → zero MLS rail queries... PASS");
  }

  // --- Capability isolation (A=ACTIVE, B=SOLD, C=OH) ---
  {
    const plans = planTypesenseHomeRailsSearches({
      entitlement: splitCapabilityEntitlement,
      entitlementFilteringEnabled: true,
      cities: ["Toronto"],
    });

    const activeRails: HomeRailsRailKey[] = [
      "newListings",
      "forLease",
      "commercial",
    ];
    for (const rail of activeRails) {
      const plan = filterByFor(rail, plans);
      assert.equal(plan.kind, "query");
      assert.equal(plan.requiredCapability, "ACTIVE_LISTINGS");
      assert.ok(plan.filterBy!.includes(SAK_A));
      assert.ok(!plan.filterBy!.includes(SAK_B));
      assert.ok(!plan.filterBy!.includes(SAK_C));
      assert.ok(plan.filterBy!.includes("sourceAuthorityKey"));
      assert.ok(plan.filterBy!.includes("Toronto"));
    }

    const sold = filterByFor("sold", plans);
    assert.equal(sold.kind, "query");
    assert.equal(sold.requiredCapability, "SOLD");
    assert.ok(sold.filterBy!.includes(SAK_B));
    assert.ok(!sold.filterBy!.includes(SAK_A));
    assert.ok(!sold.filterBy!.includes(SAK_C));

    const oh = filterByFor("openHouses", plans);
    assert.equal(oh.kind, "query");
    assert.equal(oh.requiredCapability, "OPEN_HOUSES");
    assert.ok(oh.filterBy!.includes(SAK_C));
    assert.ok(!oh.filterBy!.includes(SAK_A));
    assert.ok(!oh.filterBy!.includes(SAK_B));

    // No cross-product: each query filter is independently scoped
    for (const plan of plans) {
      assert.equal(plan.kind, "query");
      const sakMatches = plan.filterBy!.match(/sourceAuthorityKey:=/g) ?? [];
      assert.ok(sakMatches.length >= 1);
    }

    console.log("[3] capability isolation (no borrowing / no cross-product)... PASS");
  }

  // --- Partial authority: only ACTIVE → sold/OH empty ---
  {
    const activeOnly: WorkspaceListingEntitlement = {
      workspaceId: "ws_active",
      authorities: [
        {
          organizationId: ORG_A,
          providerKey: "proptx",
          sourceAuthorityKey: SAK_A,
          capabilities: ["ACTIVE_LISTINGS"],
        },
      ],
    };
    const plans = planTypesenseHomeRailsSearches({
      entitlement: activeOnly,
      entitlementFilteringEnabled: true,
    });
    assert.equal(filterByFor("newListings", plans).kind, "query");
    assert.equal(filterByFor("forLease", plans).kind, "query");
    assert.equal(filterByFor("commercial", plans).kind, "query");
    assert.equal(filterByFor("sold", plans).kind, "empty");
    assert.equal(filterByFor("openHouses", plans).kind, "empty");
    console.log("[4] partial authority → unauthorized rails empty... PASS");
  }

  // --- Houzzat canonical TRREB/proptx ---
  {
    const plans = planTypesenseHomeRailsSearches({
      entitlement: houzzatEntitlement,
      entitlementFilteringEnabled: true,
    });
    for (const plan of plans) {
      assert.equal(plan.kind, "query", `${plan.rail} should populate`);
      assert.ok(plan.filterBy!.includes(SAK_TRREB));
      assert.ok(plan.filterBy!.includes("sourceAuthorityKey"));
    }
    console.log("[5] Houzzat TRREB/proptx keeps all rails queryable... PASS");
  }

  // --- Typesense multi-search: no unfiltered empty rail ---
  {
    const searchTs = read("src/lib/typesense/search.ts");
    assert.ok(searchTs.includes("planTypesenseHomeRailsSearches"));
    assert.ok(searchTs.includes("queryPlans.length === 0"));
    assert.ok(searchTs.includes("emptyHomeRailsPayload"));
    assert.ok(searchTs.includes('plan.kind === "empty"'));
    // Must not post-filter hits by entitlement
    assert.ok(!searchTs.includes("filter((card) => entitlement"));
    assert.ok(!searchTs.includes("entitlementAllowsProvenance"));

    const mixed = planTypesenseHomeRailsSearches({
      entitlement: splitCapabilityEntitlement,
      entitlementFilteringEnabled: true,
    });
    const queryCount = mixed.filter((p) => p.kind === "query").length;
    assert.equal(queryCount, 5);
    // Empty capability rail never carries a filterBy for unfiltered execution
    const denied = planTypesenseHomeRailsSearches({
      entitlement: emptyEntitlement,
      entitlementFilteringEnabled: true,
    });
    for (const plan of denied) {
      assert.equal(plan.kind, "empty");
      assert.equal(plan.filterBy, undefined);
    }

    console.log("[6] multi-search isolation / no post-filter / no unfiltered empty... PASS");
  }

  // --- Multi-search reassembly / index-shift (production helper) ---
  {
    const markers: Partial<Record<HomeRailsRailKey, string>> = {
      newListings: "NEW-1",
      sold: "SOLD-1",
      forLease: "LEASE-1",
      commercial: "COMM-1",
      openHouses: "OH-1",
    };

    function simulateMultiSearchResults(plans: HomeRailsSearchPlan[]) {
      const queryPlans = plans.filter((p) => p.kind === "query");
      const results = queryPlans.map((p) => ({
        hits: [markers[p.rail]!],
      }));
      return { queryPlans, results };
    }

    // ACTIVE + OH authorized; SOLD denied — OH must not land in sold
    {
      const entitlement: WorkspaceListingEntitlement = {
        workspaceId: "ws_reassembly_a",
        authorities: [
          {
            organizationId: ORG_A,
            providerKey: "proptx",
            sourceAuthorityKey: SAK_A,
            capabilities: ["ACTIVE_LISTINGS"],
          },
          {
            organizationId: ORG_C,
            providerKey: "proptx",
            sourceAuthorityKey: SAK_C,
            capabilities: ["OPEN_HOUSES"],
          },
        ],
      };
      const plans = planTypesenseHomeRailsSearches({
        entitlement,
        entitlementFilteringEnabled: true,
      });
      assert.equal(filterByFor("newListings", plans).kind, "query");
      assert.equal(filterByFor("sold", plans).kind, "empty");
      assert.equal(filterByFor("forLease", plans).kind, "query");
      assert.equal(filterByFor("commercial", plans).kind, "query");
      assert.equal(filterByFor("openHouses", plans).kind, "query");

      const { queryPlans, results } = simulateMultiSearchResults(plans);
      const { byRail, consumedResultCount } =
        reassembleTypesenseHomeRailsResults(plans, results);

      assert.equal(consumedResultCount, queryPlans.length);
      assert.equal(consumedResultCount, 4);
      assert.deepEqual(byRail.newListings, ["NEW-1"]);
      assert.deepEqual(byRail.sold, []);
      assert.deepEqual(byRail.forLease, ["LEASE-1"]);
      assert.deepEqual(byRail.commercial, ["COMM-1"]);
      assert.deepEqual(byRail.openHouses, ["OH-1"]);
      assert.ok(!byRail.sold.includes("OH-1"));
      assert.ok(!byRail.sold.includes("LEASE-1"));
      assert.ok(!byRail.sold.includes("NEW-1"));
    }

    // ACTIVE denied; SOLD + OH authorized — different omitted-index position
    {
      const entitlement: WorkspaceListingEntitlement = {
        workspaceId: "ws_reassembly_b",
        authorities: [
          {
            organizationId: ORG_B,
            providerKey: "proptx",
            sourceAuthorityKey: SAK_B,
            capabilities: ["SOLD"],
          },
          {
            organizationId: ORG_C,
            providerKey: "proptx",
            sourceAuthorityKey: SAK_C,
            capabilities: ["OPEN_HOUSES"],
          },
        ],
      };
      const plans = planTypesenseHomeRailsSearches({
        entitlement,
        entitlementFilteringEnabled: true,
      });
      assert.equal(filterByFor("newListings", plans).kind, "empty");
      assert.equal(filterByFor("sold", plans).kind, "query");
      assert.equal(filterByFor("forLease", plans).kind, "empty");
      assert.equal(filterByFor("commercial", plans).kind, "empty");
      assert.equal(filterByFor("openHouses", plans).kind, "query");

      const { queryPlans, results } = simulateMultiSearchResults(plans);
      const { byRail, consumedResultCount } =
        reassembleTypesenseHomeRailsResults(plans, results);

      assert.equal(consumedResultCount, queryPlans.length);
      assert.equal(consumedResultCount, 2);
      assert.deepEqual(byRail.newListings, []);
      assert.deepEqual(byRail.sold, ["SOLD-1"]);
      assert.deepEqual(byRail.forLease, []);
      assert.deepEqual(byRail.commercial, []);
      assert.deepEqual(byRail.openHouses, ["OH-1"]);
      assert.ok(!byRail.sold.includes("OH-1"));
      assert.ok(!byRail.openHouses.includes("SOLD-1"));
    }

    // All denied — no results consumed
    {
      const plans = planTypesenseHomeRailsSearches({
        entitlement: emptyEntitlement,
        entitlementFilteringEnabled: true,
      });
      assert.ok(plans.every((p) => p.kind === "empty"));
      const { byRail, consumedResultCount } =
        reassembleTypesenseHomeRailsResults(plans, [
          { hits: ["SHOULD_NOT_CONSUME"] },
        ]);
      assert.equal(consumedResultCount, 0);
      assert.deepEqual(byRail.newListings, []);
      assert.deepEqual(byRail.sold, []);
      assert.deepEqual(byRail.forLease, []);
      assert.deepEqual(byRail.commercial, []);
      assert.deepEqual(byRail.openHouses, []);
    }

    console.log("[6b] multi-search reassembly / index-shift invariant... PASS");
  }

  // --- Fallback parity (Neon/provider helpers + route) ---
  {
    const route = read("src/app/api/listings/home-rails/route.ts");
    assert.ok(route.includes("if (fromTypesense) return fromTypesense"));
    assert.ok(route.includes("Typesense miss/error → same entitlement"));
    assert.ok(route.includes("provider.search({"));
    assert.ok(route.includes("provider.openHouses({"));
    // Every provider fallback call receives entitlement (5 search/OH + typesense)
    assert.equal((route.match(/^\s+entitlement,$/gm) ?? []).length, 6);

    // Neon inventory: empty entitlement → MLS empty; FSBO coexistence preserved
    const mlsEmpty = buildPrismaEntitledInventoryWhere({
      entitlement: emptyEntitlement,
      statuses: normalizeListingSearchStatuses({ status: "ACTIVE" }),
    });
    // Default mix with empty MLS → FSBO-only branch (existing G.10B1 policy)
    assert.equal(mlsEmpty.kind, "where");
    if (mlsEmpty.kind === "where") {
      assert.ok(JSON.stringify(mlsEmpty.where).includes("fsbo"));
    }

    const ohEmpty = buildPrismaListingAuthorityWhere(
      emptyEntitlement,
      "OPEN_HOUSES",
    );
    assert.equal(ohEmpty.kind, "empty");

    const ohHouzzat = buildPrismaListingAuthorityWhere(
      houzzatEntitlement,
      "OPEN_HOUSES",
    );
    assert.equal(ohHouzzat.kind, "where");

    // Provenance-null MLS is not authorized by pair filters (organizationId+providerKey required)
    const authWhere = buildPrismaListingAuthorityWhere(
      houzzatEntitlement,
      "ACTIVE_LISTINGS",
    );
    assert.equal(authWhere.kind, "where");
    if (authWhere.kind === "where") {
      const s = JSON.stringify(authWhere.where);
      assert.ok(s.includes('"dataSource":"mls"'));
      assert.ok(s.includes(TRREB));
      assert.ok(s.includes("proptx"));
    }

    console.log("[7] fallback entitlement + FSBO policy + null MLS denied... PASS");
  }

  // --- Unknown host behavior (request context → empty snapshot) ---
  {
    const resolveSrc = read(
      "src/lib/tenancy/listing-entitlement/resolve-for-request.ts",
    );
    assert.ok(resolveSrc.includes("emptyListingEntitlementSnapshot"));
    assert.ok(resolveSrc.includes("extractTrustedRequestHostname"));
    assert.ok(!resolveSrc.includes("houzzat.com") || resolveSrc.includes("Never invents"));

    // Empty snapshot under enforcement → zero rails (already covered); confirm route uses helper
    const route = read("src/app/api/listings/home-rails/route.ts");
    assert.ok(route.includes("resolveListingEntitlementContextForRequest"));

    console.log("[8] unknown-host → empty snapshot / no Houzzat inheritance... PASS");
  }

  // --- Mobile / out-of-scope guards ---
  {
    const mobile = read("src/app/api/mobile/v2/properties/search/route.ts");
    assert.ok(mobile.includes("OUTSIDE request-boundary entitlement"));
    assert.ok(!mobile.includes("resolveListingEntitlementContextForRequest"));

    const contract = read("src/lib/tenancy/listing-provenance/contract.ts");
    assert.ok(contract.includes("G5_ENTITLEMENT_FILTERING_ENABLED = false"));

    console.log("[9] mobile outside + production flag OFF... PASS");
  }

  console.log("\nstage-6.11g10b2h-home-rails-entitlement:selftest ok\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
