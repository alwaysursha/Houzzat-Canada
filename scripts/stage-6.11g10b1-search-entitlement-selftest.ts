/**
 * Stage 6.11G.10B1 — search entitlement enforcement foundation selftest.
 * Run: pnpm stage-6.11g10b1-search-entitlement:selftest
 *
 * Production G5_ENTITLEMENT_FILTERING_ENABLED stays OFF.
 * Tests use entitlementFilteringEnabled: true to exercise enforcement.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPrismaCapabilityScopedStatusWhere,
  buildPrismaEntitledInventoryWhere,
  buildPrismaListingAuthorityWhere,
  buildTypesenseCapabilityScopedStatusFilter,
  buildTypesenseListingAuthorityFilter,
  composeTypesenseFilterWithAuthority,
  G10B1_HOME_RAILS_OUTSIDE_ENTITLEMENT_ENFORCEMENT,
  isListingEntitlementEnforcementEnabled,
  normalizeListingSearchStatuses,
  quoteTypesenseFilterValue,
  resolveListingEntitlementEnforcementEnabled,
  type WorkspaceListingEntitlement,
} from "@/lib/tenancy/listing-entitlement";
import { G5_ENTITLEMENT_FILTERING_ENABLED } from "@/lib/tenancy/listing-provenance";
import { buildEntitledTypesenseFilterBy } from "@/lib/typesense/search";
import { buildListingSourceAuthorityKey } from "@/lib/typesense/listing-document";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const TRREB = "cmtrdf23t000091u0cw3a5zu9";
const ORG_B = "org_board_b";
const SAK_TRREB = `${TRREB}:proptx`;
const SAK_B = `${ORG_B}:proptx`;

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

const multiCapabilityEntitlement: WorkspaceListingEntitlement = {
  workspaceId: "ws_multi",
  authorities: [
    {
      organizationId: TRREB,
      providerKey: "proptx",
      sourceAuthorityKey: SAK_TRREB,
      capabilities: ["ACTIVE_LISTINGS", "OPEN_HOUSES"],
    },
    {
      organizationId: ORG_B,
      providerKey: "proptx",
      sourceAuthorityKey: SAK_B,
      capabilities: ["SOLD"],
    },
  ],
};

const emptyEntitlement: WorkspaceListingEntitlement = {
  workspaceId: "ws_empty",
  authorities: [],
};

async function main() {
  console.log("\n=== STAGE 6.11G.10B1 — SEARCH ENTITLEMENT FOUNDATION ===\n");

  // --- Flag compatibility + monotonic gate truth table ---
  {
    assert.equal(G5_ENTITLEMENT_FILTERING_ENABLED, false);
    assert.equal(G10B1_HOME_RAILS_OUTSIDE_ENTITLEMENT_ENFORCEMENT, false);

    // Pure helper truth table (does not flip production G5 constant).
    const truth: Array<{
      productionEnabled: boolean;
      forceEnable?: boolean;
      expected: boolean;
    }> = [
      { productionEnabled: false, forceEnable: undefined, expected: false },
      { productionEnabled: false, forceEnable: false, expected: false },
      { productionEnabled: false, forceEnable: true, expected: true },
      { productionEnabled: true, forceEnable: undefined, expected: true },
      { productionEnabled: true, forceEnable: false, expected: true },
      { productionEnabled: true, forceEnable: true, expected: true },
    ];
    for (const row of truth) {
      assert.equal(
        resolveListingEntitlementEnforcementEnabled({
          productionEnabled: row.productionEnabled,
          forceEnable: row.forceEnable,
        }),
        row.expected,
        `gate production=${row.productionEnabled} forceEnable=${String(row.forceEnable)}`,
      );
    }

    // Production wrapper with live G5=false
    assert.equal(isListingEntitlementEnforcementEnabled(), false);
    assert.equal(isListingEntitlementEnforcementEnabled(false), false);
    assert.equal(isListingEntitlementEnforcementEnabled(true), true);

    // Client/server downgrade protection: once production ON, false cannot disable.
    assert.equal(
      resolveListingEntitlementEnforcementEnabled({
        productionEnabled: true,
        forceEnable: false,
      }),
      true,
    );

    const offNoEnt = buildEntitledTypesenseFilterBy({
      status: "ACTIVE",
      city: "Toronto",
    });
    assert.equal(offNoEnt.kind, "passthrough");
    if (offNoEnt.kind === "passthrough") {
      assert.ok(offNoEnt.filterBy?.includes("status:="));
      assert.ok(offNoEnt.filterBy?.includes("city:="));
      assert.ok(!offNoEnt.filterBy?.includes("sourceAuthorityKey"));
    }

    const offWithEnt = buildEntitledTypesenseFilterBy({
      status: "ACTIVE",
      entitlement: houzzatEntitlement,
    });
    assert.equal(offWithEnt.kind, "passthrough");
    if (offWithEnt.kind === "passthrough") {
      assert.ok(!offWithEnt.filterBy?.includes("sourceAuthorityKey"));
    }

    // forceEnable false while G5 OFF → still OFF (passthrough)
    const forceFalse = buildEntitledTypesenseFilterBy({
      status: "ACTIVE",
      entitlementFilteringEnabled: false,
      entitlement: emptyEntitlement,
    });
    assert.equal(forceFalse.kind, "passthrough");

    const onMissing = buildEntitledTypesenseFilterBy({
      status: "ACTIVE",
      entitlementFilteringEnabled: true,
    });
    assert.equal(onMissing.kind, "empty");

    const onEmpty = buildEntitledTypesenseFilterBy({
      status: "ACTIVE",
      entitlementFilteringEnabled: true,
      entitlement: emptyEntitlement,
    });
    assert.equal(onEmpty.kind, "empty");

    console.log("[0] monotonic gate truth table + flag OFF... PASS");
  }

  // --- Houzzat / Typesense SAK quoting ---
  {
    assert.equal(
      buildListingSourceAuthorityKey(TRREB, "proptx"),
      SAK_TRREB,
    );
    assert.equal(
      quoteTypesenseFilterValue(SAK_TRREB),
      `\`${SAK_TRREB}\``,
    );

    const active = buildTypesenseListingAuthorityFilter(
      houzzatEntitlement,
      "ACTIVE_LISTINGS",
    );
    assert.equal(active.kind, "filter");
    if (active.kind === "filter") {
      assert.equal(
        active.filterBy,
        `sourceAuthorityKey:=\`${SAK_TRREB}\``,
      );
    }

    const sold = buildTypesenseListingAuthorityFilter(
      houzzatEntitlement,
      "SOLD",
    );
    assert.equal(sold.kind, "filter");

    const oh = buildTypesenseListingAuthorityFilter(
      houzzatEntitlement,
      "OPEN_HOUSES",
    );
    assert.equal(oh.kind, "filter");

    const composed = composeTypesenseFilterWithAuthority(
      "city:=Toronto && listPrice:>=100000",
      active,
    );
    assert.equal(composed.kind, "filter");
    if (composed.kind === "filter") {
      assert.ok(composed.filterBy.startsWith("city:=Toronto"));
      assert.ok(composed.filterBy.includes("&&"));
      assert.ok(composed.filterBy.includes("sourceAuthorityKey:="));
    }

    console.log("[1] Houzzat Typesense SAK + compose... PASS");
  }

  // --- Empty / multi / cross-product ---
  {
    assert.equal(
      buildTypesenseListingAuthorityFilter(emptyEntitlement, "ACTIVE_LISTINGS")
        .kind,
      "empty",
    );
    assert.equal(
      buildPrismaListingAuthorityWhere(emptyEntitlement, "ACTIVE_LISTINGS")
        .kind,
      "empty",
    );

    const multi = buildTypesenseListingAuthorityFilter(
      {
        workspaceId: "ws",
        authorities: [
          {
            organizationId: TRREB,
            providerKey: "proptx",
            sourceAuthorityKey: SAK_TRREB,
            capabilities: ["ACTIVE_LISTINGS"],
          },
          {
            organizationId: ORG_B,
            providerKey: "proptx",
            sourceAuthorityKey: SAK_B,
            capabilities: ["ACTIVE_LISTINGS"],
          },
        ],
      },
      "ACTIVE_LISTINGS",
    );
    assert.equal(multi.kind, "filter");
    if (multi.kind === "filter") {
      assert.ok(multi.filterBy.startsWith("sourceAuthorityKey:=["));
      assert.ok(multi.filterBy.includes(`\`${SAK_TRREB}\``));
      assert.ok(multi.filterBy.includes(`\`${SAK_B}\``));
      assert.ok(!multi.filterBy.includes("organizationId:="));
      assert.ok(!multi.filterBy.includes("providerKey:="));
    }

    const prismaPairs = buildPrismaListingAuthorityWhere(
      houzzatEntitlement,
      "ACTIVE_LISTINGS",
    );
    assert.equal(prismaPairs.kind, "where");
    if (prismaPairs.kind === "where") {
      const json = JSON.stringify(prismaPairs.where);
      assert.ok(json.includes(TRREB));
      assert.ok(json.includes("proptx"));
      assert.ok(json.includes('"dataSource":"mls"'));
      assert.ok(json.includes('"isMock":false'));
    }

    console.log("[2] empty + multi exact pairs (no cross-product)... PASS");
  }

  // --- Capability isolation / mixed status ---
  {
    const activeOnly = buildTypesenseCapabilityScopedStatusFilter(
      multiCapabilityEntitlement,
      ["ACTIVE", "SOLD_CONDITIONAL"],
    );
    assert.equal(activeOnly.kind, "filter");
    if (activeOnly.kind === "filter") {
      assert.ok(activeOnly.filterBy.includes(`\`${SAK_TRREB}\``));
      assert.ok(!activeOnly.filterBy.includes(`\`${SAK_B}\``));
      assert.ok(activeOnly.filterBy.includes("ACTIVE"));
    }

    const soldOnly = buildTypesenseCapabilityScopedStatusFilter(
      multiCapabilityEntitlement,
      ["SOLD"],
    );
    assert.equal(soldOnly.kind, "filter");
    if (soldOnly.kind === "filter") {
      assert.ok(soldOnly.filterBy.includes(`\`${SAK_B}\``));
      assert.ok(!soldOnly.filterBy.includes(`\`${SAK_TRREB}\``));
    }

    const mixed = buildTypesenseCapabilityScopedStatusFilter(
      multiCapabilityEntitlement,
      ["ACTIVE", "SOLD"],
    );
    assert.equal(mixed.kind, "filter");
    if (mixed.kind === "filter") {
      assert.ok(mixed.filterBy.includes("||"));
      assert.ok(mixed.filterBy.includes(`\`${SAK_TRREB}\``));
      assert.ok(mixed.filterBy.includes(`\`${SAK_B}\``));
      // Must not be a flat union of all keys with all statuses
      assert.ok(
        !mixed.filterBy.match(
          /sourceAuthorityKey:=\[.*proptx.*\].*status:=\[ACTIVE,SOLD\]/,
        ),
      );
    }

    const prismaMixed = buildPrismaCapabilityScopedStatusWhere(
      multiCapabilityEntitlement,
      ["ACTIVE", "SOLD"],
    );
    assert.equal(prismaMixed.kind, "where");
    if (prismaMixed.kind === "where") {
      const json = JSON.stringify(prismaMixed.where);
      assert.ok(json.includes(TRREB));
      assert.ok(json.includes(ORG_B));
      assert.ok(json.includes("ACTIVE") || json.includes("SOLD_CONDITIONAL"));
      assert.ok(json.includes("SOLD"));
    }

    // ACTIVE_LISTINGS alone cannot satisfy OPEN_HOUSES
    assert.equal(
      buildTypesenseListingAuthorityFilter(
        {
          workspaceId: "ws",
          authorities: [
            {
              organizationId: TRREB,
              providerKey: "proptx",
              sourceAuthorityKey: SAK_TRREB,
              capabilities: ["ACTIVE_LISTINGS"],
            },
          ],
        },
        "OPEN_HOUSES",
      ).kind,
      "empty",
    );

    console.log("[3] capability-scoped mixed status isolation... PASS");
  }

  // --- Neon FSBO coexistence ---
  {
    const fsboOnly = buildPrismaEntitledInventoryWhere({
      entitlement: undefined,
      dataSource: "fsbo",
      statuses: ["ACTIVE"],
    });
    assert.equal(fsboOnly.kind, "where");
    if (fsboOnly.kind === "where") {
      const json = JSON.stringify(fsboOnly.where);
      assert.ok(json.includes('"dataSource":"fsbo"'));
      assert.ok(!json.includes(TRREB));
    }

    const mlsMissing = buildPrismaEntitledInventoryWhere({
      entitlement: undefined,
      dataSource: "mls",
      statuses: ["ACTIVE"],
    });
    assert.equal(mlsMissing.kind, "empty");

    const mixedEmptyMls = buildPrismaEntitledInventoryWhere({
      entitlement: emptyEntitlement,
      dataSource: undefined,
      statuses: ["ACTIVE"],
    });
    assert.equal(mixedEmptyMls.kind, "where");
    if (mixedEmptyMls.kind === "where") {
      const json = JSON.stringify(mixedEmptyMls.where);
      assert.ok(json.includes('"dataSource":"fsbo"'));
      assert.ok(!json.includes(TRREB));
    }

    const mixedAuth = buildPrismaEntitledInventoryWhere({
      entitlement: houzzatEntitlement,
      dataSource: undefined,
      statuses: ["ACTIVE"],
    });
    assert.equal(mixedAuth.kind, "where");
    if (mixedAuth.kind === "where") {
      const json = JSON.stringify(mixedAuth.where);
      assert.ok(json.includes(TRREB));
      assert.ok(json.includes('"dataSource":"fsbo"'));
    }

    console.log("[4] FSBO coexistence + null provenance MLS deny... PASS");
  }

  // --- Status normalization parity ---
  {
    assert.deepEqual(normalizeListingSearchStatuses({ status: "ACTIVE" }), [
      "ACTIVE",
      "SOLD_CONDITIONAL",
    ]);
    assert.equal(normalizeListingSearchStatuses({ status: "ALL" }), null);
    assert.deepEqual(normalizeListingSearchStatuses({ status: "SOLD" }), [
      "SOLD",
    ]);
    console.log("[5] status normalization preserved... PASS");
  }

  // --- Special-character quoting ---
  {
    const weird = quoteTypesenseFilterValue("org:provider`x");
    assert.equal(weird, "`org:providerx`");
    console.log("[6] defensive Typesense quoting... PASS");
  }

  // --- Architecture guards ---
  {
    const homeRails = read("src/app/api/listings/home-rails/route.ts");
    assert.ok(homeRails.includes("typesenseHomeRails"));
    // G.10B3B: web force-enable; must never come from client params.
    assert.ok(
      homeRails.includes("entitlementFilteringEnabled: true") ||
        homeRails.includes("entitlementFilteringEnabled,"),
    );
    assert.ok(
      !homeRails.includes('searchParams.get("entitlementFilteringEnabled")'),
    );
    assert.ok(homeRails.includes("resolveListingEntitlementContextForRequest"));

    const searchTs = read("src/lib/typesense/search.ts");
    assert.ok(searchTs.includes("planTypesenseHomeRailsSearches"));
    assert.ok(searchTs.includes("buildEntitledTypesenseFilterBy"));

    const provider = read("src/lib/listings/provider.ts");
    assert.ok(provider.includes("isListingEntitlementEnforcementEnabled"));
    assert.ok(provider.includes("buildPrismaEntitledInventoryWhere"));
    assert.ok(!provider.includes("extractTrustedRequestHostname"));
    assert.ok(!provider.includes("resolveListingEntitlementForHostname"));

    const contract = read(
      "src/lib/tenancy/listing-provenance/contract.ts",
    );
    assert.ok(
      contract.includes("G5_ENTITLEMENT_FILTERING_ENABLED = false"),
    );

    // Places / static geo not wired to entitlement
    const places = read("src/app/api/places/autocomplete/route.ts");
    assert.ok(!places.includes("listing-entitlement"));

    console.log("[7] home-rails wired + web force-enable (not client)... PASS");
  }

  // --- ON path via buildEntitledTypesenseFilterBy ---
  {
    const onHouzzat = buildEntitledTypesenseFilterBy({
      status: "ACTIVE",
      city: "Toronto",
      minPrice: 100000,
      entitlement: houzzatEntitlement,
      entitlementFilteringEnabled: true,
    });
    assert.equal(onHouzzat.kind, "filter");
    if (onHouzzat.kind === "filter") {
      assert.ok(onHouzzat.filterBy.includes("sourceAuthorityKey:="));
      assert.ok(onHouzzat.filterBy.includes("Toronto"));
      assert.ok(onHouzzat.filterBy.includes("listPrice:>=100000"));
      assert.ok(onHouzzat.filterBy.includes("&&"));
    }
    console.log("[8] Typesense AND-compose with product filters... PASS");
  }

  console.log("\nstage-6.11g10b1-search-entitlement:selftest ok\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
