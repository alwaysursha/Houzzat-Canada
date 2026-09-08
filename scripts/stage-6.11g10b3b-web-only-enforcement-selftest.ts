/**
 * Stage 6.11G.10B3B — web-only MLS entitlement enforcement activation selftest.
 * Run: pnpm stage-6.11g10b3b-web-only-enforcement:selftest
 *
 * Global G5_ENTITLEMENT_FILTERING_ENABLED stays OFF.
 * Approved web surfaces hardcode entitlementFilteringEnabled: true server-side.
 * Mobile must NOT force-enable.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildTypesenseCapabilityScopedStatusFilter,
  buildTypesenseListingAuthorityFilter,
  isListingEntitlementEnforcementEnabled,
  type WorkspaceListingEntitlement,
} from "@/lib/tenancy/listing-entitlement";
import { G5_ENTITLEMENT_FILTERING_ENABLED } from "@/lib/tenancy/listing-provenance";
import { buildListingSourceAuthorityKey } from "@/lib/typesense/listing-document";
import {
  buildEntitledTypesenseFilterBy,
  planTypesenseHomeRailsSearches,
} from "@/lib/typesense/search";

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

const emptyEntitlement: WorkspaceListingEntitlement = {
  workspaceId: "ws_empty",
  authorities: [],
};

const splitEntitlement: WorkspaceListingEntitlement = {
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

function assertsWebForceEnable(name: string, src: string) {
  assert.ok(
    src.includes("entitlementFilteringEnabled: true") ||
      src.includes("entitlementFilteringEnabled = true"),
    `${name} must hardcode force-enable`,
  );
  assert.ok(
    !src.includes('searchParams.get("entitlementFilteringEnabled")'),
    `${name} must not read force-enable from client`,
  );
  assert.ok(
    !src.includes('searchParams.get("workspaceId")'),
    `${name} must not trust client workspaceId`,
  );
}

async function main() {
  console.log("\n=== STAGE 6.11G.10B3B — WEB-ONLY MLS ENFORCEMENT ===\n");

  // --- Global flag OFF; monotonic force-ON works ---
  {
    assert.equal(G5_ENTITLEMENT_FILTERING_ENABLED, false);
    assert.equal(isListingEntitlementEnforcementEnabled(), false);
    assert.equal(isListingEntitlementEnforcementEnabled(false), false);
    assert.equal(isListingEntitlementEnforcementEnabled(true), true);
    const contract = read("src/lib/tenancy/listing-provenance/contract.ts");
    assert.ok(contract.includes("G5_ENTITLEMENT_FILTERING_ENABLED = false"));
    console.log("[0] global G5 OFF; monotonic force-ON... PASS");
  }

  // --- Six web surfaces force-enable ---
  {
    const search = read("src/app/api/listings/search/route.ts");
    const autocomplete = read("src/app/api/listings/autocomplete/route.ts");
    const openHouses = read("src/app/api/listings/open-houses/route.ts");
    const nearby = read("src/app/api/listings/nearby/route.ts");
    const homeRails = read("src/app/api/listings/home-rails/route.ts");
    const marketingOh = read("src/app/(marketing)/open-houses/page.tsx");

    for (const [name, src] of [
      ["search", search],
      ["autocomplete", autocomplete],
      ["open-houses", openHouses],
      ["nearby", nearby],
      ["home-rails", homeRails],
      ["marketing-open-houses", marketingOh],
    ] as const) {
      assert.ok(
        src.includes("resolveListingEntitlementContextForRequest") ||
          src.includes("resolveListingEntitlementContextForServerPage"),
        `${name} must resolve entitlement`,
      );
      assert.ok(src.includes("entitlement"), `${name} must pass entitlement`);
      assertsWebForceEnable(name, src);
    }

    // Nearby: force-enable on shared base reused by all searches
    assert.ok(nearby.includes("entitlementFilteringEnabled: true"));
    assert.ok(nearby.includes("...base"));

    // Home rails: Typesense + every fallback receives force-enable
    assert.ok(homeRails.includes("entitlementFilteringEnabled = true"));
    assert.ok(
      (homeRails.match(/entitlementFilteringEnabled,/g) ?? []).length >= 6,
    );

    // Search body reused for on-demand retry still carries force-enable
    assert.ok(search.includes("entitlementFilteringEnabled: true"));
    assert.ok(search.includes("provider.search(searchParamsBody)"));

    console.log("[1] six web surfaces force-enable server-side... PASS");
  }

  // --- Mobile unchanged ---
  {
    const mobile = read("src/app/api/mobile/v2/properties/search/route.ts");
    const lead = read("src/lib/mobile/v2/load-lead-engagement.ts");
    assert.ok(mobile.includes("OUTSIDE request-boundary entitlement"));
    assert.ok(!mobile.includes("entitlementFilteringEnabled"));
    assert.ok(!mobile.includes("resolveListingEntitlementContextForRequest"));
    assert.ok(mobile.includes("provider.search(params)"));
    assert.ok(!lead.includes("entitlementFilteringEnabled"));
    assert.ok(!lead.includes("resolveListingEntitlementContextForRequest"));
    assert.ok(lead.includes("provider.search({"));
    console.log("[2] mobile search + lead-engagement unchanged... PASS");
  }

  // --- Valid Houzzat with force-ON → MLS queries allowed ---
  {
    const active = buildEntitledTypesenseFilterBy({
      status: "ACTIVE",
      entitlement: houzzatEntitlement,
      entitlementFilteringEnabled: true,
    });
    assert.equal(active.kind, "filter");
    if (active.kind === "filter") {
      assert.ok(active.filterBy.includes(SAK_TRREB));
      assert.ok(active.filterBy.includes("sourceAuthorityKey"));
    }

    const sold = buildEntitledTypesenseFilterBy({
      status: "SOLD",
      entitlement: houzzatEntitlement,
      entitlementFilteringEnabled: true,
    });
    assert.equal(sold.kind, "filter");

    const oh = buildTypesenseListingAuthorityFilter(
      houzzatEntitlement,
      "OPEN_HOUSES",
    );
    assert.equal(oh.kind, "filter");

    const rails = planTypesenseHomeRailsSearches({
      entitlement: houzzatEntitlement,
      entitlementFilteringEnabled: true,
    });
    assert.ok(rails.every((p) => p.kind === "query"));
    console.log("[3] Houzzat force-ON → ACTIVE/SOLD/OH allowed... PASS");
  }

  // --- Unauthorized / empty + force-ON → zero MLS ---
  {
    const denied = buildEntitledTypesenseFilterBy({
      status: "ACTIVE",
      entitlement: emptyEntitlement,
      entitlementFilteringEnabled: true,
    });
    assert.equal(denied.kind, "empty");

    const missing = buildEntitledTypesenseFilterBy({
      status: "ACTIVE",
      entitlementFilteringEnabled: true,
    });
    assert.equal(missing.kind, "empty");

    const rails = planTypesenseHomeRailsSearches({
      entitlement: emptyEntitlement,
      entitlementFilteringEnabled: true,
    });
    assert.ok(rails.every((p) => p.kind === "empty"));
    console.log("[4] empty/unknown force-ON → zero MLS... PASS");
  }

  // --- Capability separation under force-ON ---
  {
    const rails = planTypesenseHomeRailsSearches({
      entitlement: splitEntitlement,
      entitlementFilteringEnabled: true,
    });
    const byRail = Object.fromEntries(rails.map((p) => [p.rail, p]));
    assert.equal(byRail.newListings!.kind, "query");
    assert.ok(byRail.newListings!.filterBy!.includes(SAK_A));
    assert.ok(!byRail.newListings!.filterBy!.includes(SAK_B));
    assert.equal(byRail.sold!.kind, "query");
    assert.ok(byRail.sold!.filterBy!.includes(SAK_B));
    assert.ok(!byRail.sold!.filterBy!.includes(SAK_A));
    assert.equal(byRail.openHouses!.kind, "query");
    assert.ok(byRail.openHouses!.filterBy!.includes(SAK_C));

    const mixed = buildTypesenseCapabilityScopedStatusFilter(
      splitEntitlement,
      null,
    );
    assert.equal(mixed.kind, "filter");
    if (mixed.kind === "filter") {
      assert.ok(mixed.filterBy.includes(SAK_A));
      assert.ok(mixed.filterBy.includes(SAK_B));
      assert.ok(mixed.filterBy.includes("||"));
    }
    console.log("[5] capability isolation under force-ON... PASS");
  }

  // --- Fallback force-enable survives (source) ---
  {
    const homeRails = read("src/app/api/listings/home-rails/route.ts");
    assert.ok(homeRails.includes("if (fromTypesense) return fromTypesense"));
    assert.ok(
      homeRails.includes("same entitlement + force-enable") ||
        homeRails.includes("entitlementFilteringEnabled,"),
    );

    const search = read("src/app/api/listings/search/route.ts");
    // On-demand retry reuses same body with force-enable
    assert.ok(search.includes("result = await provider.search(searchParamsBody)"));

    const autocomplete = read("src/app/api/listings/autocomplete/route.ts");
    assert.ok(autocomplete.includes("entitlementFilteringEnabled: true"));
    // Provider autocomplete passes force into typesenseOpenHouses path via options

    const openHouses = read("src/app/api/listings/open-houses/route.ts");
    assert.ok(openHouses.includes("entitlementFilteringEnabled: true"));

    const provider = read("src/lib/listings/provider.ts");
    assert.ok(
      provider.includes(
        "entitlementFilteringEnabled: params.entitlementFilteringEnabled",
      ) ||
        provider.includes("params.entitlementFilteringEnabled"),
    );
    console.log("[6] fallback paths retain force-enable... PASS");
  }

  // --- Related/by-mls remain outside G.10B3B; detail is G.10C1 ---
  {
    const related = read("src/app/api/listings/related/route.ts");
    const byMls = read("src/app/api/listings/by-mls/route.ts");
    assert.ok(!related.includes("entitlementFilteringEnabled"));
    assert.ok(!byMls.includes("entitlementFilteringEnabled"));
    console.log("[7] related/by-mls remain outside G.10B3B... PASS");
  }

  // --- Flag-OFF without force still passthrough (mobile path semantics) ---
  {
    const off = buildEntitledTypesenseFilterBy({
      status: "ACTIVE",
      entitlement: houzzatEntitlement,
    });
    assert.equal(off.kind, "passthrough");
    if (off.kind === "passthrough") {
      assert.ok(!off.filterBy?.includes("sourceAuthorityKey"));
    }
    console.log("[8] no force-enable → legacy passthrough (mobile-safe)... PASS");
  }

  console.log("\nstage-6.11g10b3b-web-only-enforcement:selftest ok\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
