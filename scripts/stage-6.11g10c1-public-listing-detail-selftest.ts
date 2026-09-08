/**
 * Stage 6.11G.10C1 — public listing detail enforcement selftest.
 * Run: pnpm stage-6.11g10c1-public-listing-detail:selftest
 *
 * Production G5_ENTITLEMENT_FILTERING_ENABLED stays OFF.
 * Web detail force-enables; mobile loader call without force stays legacy.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  decideMlsListingDetailEntitlement,
  isWebListingDetailEntitlementEnforcementEnabled,
  listingDetailCapabilityForStatus,
  type WorkspaceListingEntitlement,
} from "@/lib/tenancy/listing-entitlement";
import { G5_ENTITLEMENT_FILTERING_ENABLED } from "@/lib/tenancy/listing-provenance";
import { buildListingSourceAuthorityKey } from "@/lib/typesense/listing-document";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const TRREB = "cmtrdf23t000091u0cw3a5zu9";
const ORG_B = "org_board_b";
const SAK_TRREB = buildListingSourceAuthorityKey(TRREB, "proptx")!;

const fullEntitlement: WorkspaceListingEntitlement = {
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

const activeOnly: WorkspaceListingEntitlement = {
  workspaceId: "ws_active",
  authorities: [
    {
      organizationId: TRREB,
      providerKey: "proptx",
      sourceAuthorityKey: SAK_TRREB,
      capabilities: ["ACTIVE_LISTINGS"],
    },
  ],
};

const soldOnly: WorkspaceListingEntitlement = {
  workspaceId: "ws_sold",
  authorities: [
    {
      organizationId: TRREB,
      providerKey: "proptx",
      sourceAuthorityKey: SAK_TRREB,
      capabilities: ["SOLD"],
    },
  ],
};

const emptyEntitlement: WorkspaceListingEntitlement = {
  workspaceId: "ws_empty",
  authorities: [],
};

type FakeListing = {
  organizationId: string | null;
  providerKey: string | null;
  dataSource: string;
  status: string;
};

function gate(
  listing: FakeListing,
  entitlement: WorkspaceListingEntitlement | null | undefined,
  forceEnable: boolean,
) {
  if (!isWebListingDetailEntitlementEnforcementEnabled(forceEnable)) {
    return { allowed: true as const, reason: "enforcement_off" as const };
  }
  if (listing.dataSource === "fsbo") {
    return { allowed: true as const, reason: "fsbo_passthrough" as const };
  }
  if (listing.dataSource === "manual") {
    return { allowed: true as const, reason: "manual_passthrough" as const };
  }
  if (listing.dataSource === "preview") {
    return { allowed: false as const, reason: "preview_denied" as const };
  }
  const capability = listingDetailCapabilityForStatus(listing.status);
  if (!capability) {
    return { allowed: false as const, reason: "unmapped_status" as const };
  }
  const d = decideMlsListingDetailEntitlement({
    entitlement,
    organizationId: listing.organizationId,
    providerKey: listing.providerKey,
    dataSource: "mls",
    requiredCapability: capability,
  });
  return d;
}

async function main() {
  console.log("\n=== STAGE 6.11G.10C1 — PUBLIC LISTING DETAIL ENFORCEMENT ===\n");

  assert.equal(G5_ENTITLEMENT_FILTERING_ENABLED, false);
  console.log("[0] G5 remains false... PASS");

  // --- Entitled ACTIVE → allowed ---
  {
    const d = gate(
      {
        organizationId: TRREB,
        providerKey: "proptx",
        dataSource: "mls",
        status: "ACTIVE",
      },
      fullEntitlement,
      true,
    );
    assert.equal(d.allowed, true);
    console.log("[1] entitled ACTIVE → allowed... PASS");
  }

  // --- Entitled SOLD with SOLD cap → allowed (VOW is later layer) ---
  {
    const d = gate(
      {
        organizationId: TRREB,
        providerKey: "proptx",
        dataSource: "mls",
        status: "SOLD",
      },
      fullEntitlement,
      true,
    );
    assert.equal(d.allowed, true);
    const soldCap = gate(
      {
        organizationId: TRREB,
        providerKey: "proptx",
        dataSource: "mls",
        status: "SOLD",
      },
      soldOnly,
      true,
    );
    assert.equal(soldCap.allowed, true);
    console.log("[2] entitled SOLD with SOLD cap → allowed... PASS");
  }

  // --- ACTIVE but only SOLD cap → denied ---
  {
    const d = gate(
      {
        organizationId: TRREB,
        providerKey: "proptx",
        dataSource: "mls",
        status: "ACTIVE",
      },
      soldOnly,
      true,
    );
    assert.equal(d.allowed, false);
    console.log("[3] ACTIVE with only SOLD cap → denied... PASS");
  }

  // --- SOLD but only ACTIVE_LISTINGS → denied ---
  {
    const d = gate(
      {
        organizationId: TRREB,
        providerKey: "proptx",
        dataSource: "mls",
        status: "SOLD",
      },
      activeOnly,
      true,
    );
    assert.equal(d.allowed, false);
    console.log("[4] SOLD with only ACTIVE_LISTINGS → denied... PASS");
  }

  // --- Wrong org/provider ---
  {
    const wrongOrg = gate(
      {
        organizationId: ORG_B,
        providerKey: "proptx",
        dataSource: "mls",
        status: "ACTIVE",
      },
      fullEntitlement,
      true,
    );
    assert.equal(wrongOrg.allowed, false);
    const wrongProv = decideMlsListingDetailEntitlement({
      entitlement: fullEntitlement,
      organizationId: TRREB,
      providerKey: "unknown-feed",
      dataSource: "mls",
      requiredCapability: "ACTIVE_LISTINGS",
    });
    assert.equal(wrongProv.allowed, false);
    console.log("[5] wrong org/provider → denied... PASS");
  }

  // --- Empty authorities / missing entitlement / missing provenance ---
  {
    assert.equal(
      gate(
        {
          organizationId: TRREB,
          providerKey: "proptx",
          dataSource: "mls",
          status: "ACTIVE",
        },
        emptyEntitlement,
        true,
      ).allowed,
      false,
    );
    assert.equal(
      gate(
        {
          organizationId: TRREB,
          providerKey: "proptx",
          dataSource: "mls",
          status: "ACTIVE",
        },
        null,
        true,
      ).allowed,
      false,
    );
    assert.equal(
      gate(
        {
          organizationId: null,
          providerKey: "proptx",
          dataSource: "mls",
          status: "ACTIVE",
        },
        fullEntitlement,
        true,
      ).allowed,
      false,
    );
    assert.equal(
      gate(
        {
          organizationId: TRREB,
          providerKey: null,
          dataSource: "mls",
          status: "ACTIVE",
        },
        fullEntitlement,
        true,
      ).allowed,
      false,
    );
    console.log("[6] empty/missing entitlement/provenance → denied... PASS");
  }

  // --- FSBO preserved; preview denied ---
  {
    assert.equal(
      gate(
        {
          organizationId: null,
          providerKey: null,
          dataSource: "fsbo",
          status: "ACTIVE",
        },
        emptyEntitlement,
        true,
      ).allowed,
      true,
    );
    assert.equal(
      gate(
        {
          organizationId: TRREB,
          providerKey: "proptx",
          dataSource: "preview",
          status: "ACTIVE",
        },
        fullEntitlement,
        true,
      ).allowed,
      false,
    );
    console.log("[7] FSBO preserved; preview denied... PASS");
  }

  // --- Force-off (mobile) skips MLS gate ---
  {
    const d = gate(
      {
        organizationId: ORG_B,
        providerKey: "proptx",
        dataSource: "mls",
        status: "ACTIVE",
      },
      emptyEntitlement,
      false,
    );
    assert.equal(d.allowed, true);
    assert.equal(d.reason, "enforcement_off");
    console.log("[8] force-off → MLS gate skipped (mobile-safe)... PASS");
  }

  // --- Loader PropTx PRE-LOOKUP: exact TRREB/proptx/capability only ---
  {
    const loader = read("src/lib/listings/load-listing-for-detail.ts");
    assert.ok(loader.includes("decideMlsListingDetailEntitlement"));
    assert.ok(loader.includes("mayInvokePropTxOnDemandForDetail"));
    assert.ok(loader.includes("resolvePropTxListingProvenance"));
    assert.ok(loader.includes("PROPTX_LISTING_PROVIDER_KEY"));
    assert.ok(!loader.includes("authorities.length === 0) > 0"));

    const {
      loadListingForDetailPage,
      mayInvokePropTxOnDemandForDetail,
    } = await import("../src/lib/listings/load-listing-for-detail");

    const TRREB_ORG = TRREB;
    const OTHER_ORG = ORG_B;

    // 1) empty / unknown entitlement → no PropTx
    assert.equal(
      mayInvokePropTxOnDemandForDetail({
        entitlementFilteringEnabled: true,
        entitlement: emptyEntitlement,
        propTxOrganizationId: TRREB_ORG,
      }),
      false,
    );
    assert.equal(
      mayInvokePropTxOnDemandForDetail({
        entitlementFilteringEnabled: true,
        entitlement: null,
        propTxOrganizationId: TRREB_ORG,
      }),
      false,
    );

    // 2) unrelated org/provider authority → no PropTx
    const unrelatedOrg: WorkspaceListingEntitlement = {
      workspaceId: "ws_other",
      authorities: [
        {
          organizationId: OTHER_ORG,
          providerKey: "proptx",
          sourceAuthorityKey: buildListingSourceAuthorityKey(OTHER_ORG, "proptx")!,
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
    assert.equal(
      mayInvokePropTxOnDemandForDetail({
        entitlementFilteringEnabled: true,
        entitlement: unrelatedOrg,
        propTxOrganizationId: TRREB_ORG,
        requiredCapability: "ACTIVE_LISTINGS",
      }),
      false,
      "unrelated org must not authorize PropTx",
    );

    // 3–4) cross-pair: TRREB+wrong provider is unrecognized; wrong org+proptx denied above
    assert.equal(
      mayInvokePropTxOnDemandForDetail({
        entitlementFilteringEnabled: true,
        entitlement: {
          workspaceId: "ws_cross",
          authorities: [
            {
              organizationId: TRREB_ORG,
              providerKey: "proptx",
              sourceAuthorityKey: SAK_TRREB,
              capabilities: ["ACTIVE_LISTINGS"],
            },
            {
              organizationId: OTHER_ORG,
              providerKey: "proptx",
              sourceAuthorityKey: buildListingSourceAuthorityKey(
                OTHER_ORG,
                "proptx",
              )!,
              capabilities: ["SOLD"],
            },
          ],
        },
        propTxOrganizationId: OTHER_ORG,
        requiredCapability: "ACTIVE_LISTINGS",
      }),
      false,
      "cross-pair: OTHER org cannot use TRREB ACTIVE for PropTx pre-auth",
    );

    // 5) exact TRREB+proptx but missing capability → no PropTx
    assert.equal(
      mayInvokePropTxOnDemandForDetail({
        entitlementFilteringEnabled: true,
        entitlement: soldOnly,
        propTxOrganizationId: TRREB_ORG,
        requiredCapability: "ACTIVE_LISTINGS",
      }),
      false,
    );

    // 6) exact TRREB+proptx+capability → may PropTx
    assert.equal(
      mayInvokePropTxOnDemandForDetail({
        entitlementFilteringEnabled: true,
        entitlement: fullEntitlement,
        propTxOrganizationId: TRREB_ORG,
        requiredCapability: "ACTIVE_LISTINGS",
      }),
      true,
    );
    assert.equal(
      mayInvokePropTxOnDemandForDetail({
        entitlementFilteringEnabled: true,
        entitlement: activeOnly,
        propTxOrganizationId: TRREB_ORG,
        requiredCapability: "ACTIVE_LISTINGS",
      }),
      true,
    );

    // Behavioral: empty authorities must not invoke onDemand
    let onDemandCalls = 0;
    const resultEmpty = await loadListingForDetailPage("ZZZZNOEXIST999", {
      entitlement: emptyEntitlement,
      entitlementFilteringEnabled: true,
      propTxOrganizationId: TRREB_ORG,
      getByMlsForDetailPage: async () => null,
      onDemandLookup: async () => {
        onDemandCalls += 1;
        return { mlsNumbers: ["ZZZZNOEXIST999"] };
      },
    });
    assert.equal(resultEmpty, null);
    assert.equal(onDemandCalls, 0);

    // Unrelated authority must not invoke onDemand
    onDemandCalls = 0;
    await loadListingForDetailPage("ZZZZNOEXIST996", {
      entitlement: unrelatedOrg,
      entitlementFilteringEnabled: true,
      propTxOrganizationId: TRREB_ORG,
      getByMlsForDetailPage: async () => null,
      onDemandLookup: async () => {
        onDemandCalls += 1;
        return { mlsNumbers: [] };
      },
    });
    assert.equal(onDemandCalls, 0, "unrelated authority must not call PropTx");

    // Missing capability must not invoke
    onDemandCalls = 0;
    await loadListingForDetailPage("ZZZZNOEXIST995", {
      entitlement: soldOnly,
      entitlementFilteringEnabled: true,
      requiredCapability: "ACTIVE_LISTINGS",
      propTxOrganizationId: TRREB_ORG,
      getByMlsForDetailPage: async () => null,
      onDemandLookup: async () => {
        onDemandCalls += 1;
        return { mlsNumbers: [] };
      },
    });
    assert.equal(onDemandCalls, 0, "missing capability must not call PropTx");

    // Exact TRREB/proptx/capability may invoke
    onDemandCalls = 0;
    await loadListingForDetailPage("ZZZZNOEXIST998", {
      entitlement: fullEntitlement,
      entitlementFilteringEnabled: true,
      propTxOrganizationId: TRREB_ORG,
      getByMlsForDetailPage: async () => null,
      onDemandLookup: async () => {
        onDemandCalls += 1;
        return { mlsNumbers: [] };
      },
    });
    assert.equal(onDemandCalls, 1, "exact TRREB/proptx/cap may call PropTx");

    // POST-LOOKUP: returned listing still gated (wrong org after pull)
    onDemandCalls = 0;
    let getCalls = 0;
    const postGated = await loadListingForDetailPage("NPOSTGATE1", {
      entitlement: fullEntitlement,
      entitlementFilteringEnabled: true,
      propTxOrganizationId: TRREB_ORG,
      getByMlsForDetailPage: async () => {
        getCalls += 1;
        if (getCalls === 1) return null; // Neon miss
        return {
          id: "1",
          mlsNumber: "NPOSTGATE1",
          organizationId: OTHER_ORG,
          providerKey: "proptx",
          dataSource: "mls",
          status: "ACTIVE",
          media: [],
          openHouses: [],
          history: [],
          rooms: [],
        } as never;
      },
      onDemandLookup: async () => {
        onDemandCalls += 1;
        return { mlsNumbers: ["NPOSTGATE1"] };
      },
    });
    assert.equal(onDemandCalls, 1);
    assert.equal(postGated, null, "post-lookup must still deny wrong provenance");

    // Unauthorized Neon-hit still never calls PropTx
    onDemandCalls = 0;
    const deniedHit = await loadListingForDetailPage("NDENIED1", {
      entitlement: emptyEntitlement,
      entitlementFilteringEnabled: true,
      propTxOrganizationId: TRREB_ORG,
      getByMlsForDetailPage: async () =>
        ({
          id: "1",
          mlsNumber: "NDENIED1",
          organizationId: TRREB,
          providerKey: "proptx",
          dataSource: "mls",
          status: "ACTIVE",
          media: [],
          openHouses: [],
          history: [],
          rooms: [],
        }) as never,
      onDemandLookup: async () => {
        onDemandCalls += 1;
        return { mlsNumbers: [] };
      },
    });
    assert.equal(deniedHit, null);
    assert.equal(onDemandCalls, 0);

    // Mobile / no force: may on-demand even with empty entitlement
    assert.equal(
      mayInvokePropTxOnDemandForDetail({
        entitlement: emptyEntitlement,
        propTxOrganizationId: TRREB_ORG,
      }),
      true,
    );

    console.log("[9] PropTx exact TRREB/proptx pre-auth + post-gate... PASS");
  }

  // --- Page + metadata share cached entitlement-aware loader ---
  {
    const page = read("src/app/(marketing)/listing/[...parts]/page.tsx");
    assert.ok(page.includes("resolveListingEntitlementContextForServerPage"));
    assert.ok(page.includes("resolveListingDetailEntitlementCached"));
    assert.ok(page.includes("loadListingByMlsCached"));
    assert.ok(page.includes("entitlementFilteringEnabled: true"));
    assert.ok(
      page.includes('if (!listing) return { title: "Listing" }'),
      "denied metadata must stay generic",
    );
    assert.ok(
      page.includes("Board entitlement already applied") ||
        page.includes("never substitutes for board"),
    );
    // No client authority trust
    assert.ok(!page.includes('searchParams.get("workspaceId")'));
    assert.ok(!page.includes('searchParams.get("organizationId")'));
    assert.ok(!page.includes('searchParams.get("sourceAuthorityKey")'));
    console.log("[10] page + metadata cached entitlement loader... PASS");
  }

  // --- Panel same enforcement ---
  {
    const panel = read("src/app/api/listings/[mlsNumber]/panel/route.ts");
    assert.ok(panel.includes("resolveListingEntitlementContextForRequest"));
    assert.ok(panel.includes("entitlementFilteringEnabled: true"));
    assert.ok(panel.includes("loadListingForDetailPage(mlsNumber,"));
    assert.ok(!panel.includes('searchParams.get("workspaceId")'));
    assert.ok(panel.includes('status: 404'));
    assert.ok(!panel.includes("status: 403"));
    console.log("[11] panel hostname entitlement + 404... PASS");
  }

  // --- Mobile unchanged (no force-enable) ---
  {
    const mobile = read(
      "src/app/api/mobile/v2/properties/[mlsNumber]/route.ts",
    );
    assert.ok(mobile.includes("loadListingForDetailPage"));
    assert.ok(!mobile.includes("entitlementFilteringEnabled"));
    assert.ok(!mobile.includes("resolveListingEntitlementContextForRequest"));
    console.log("[12] mobile loader call unchanged... PASS");
  }

  // --- related / by-mls owned by G.10C3 (outside G.10C1 detail loader) ---
  {
    const related = read("src/app/api/listings/related/route.ts");
    const byMls = read("src/app/api/listings/by-mls/route.ts");
    assert.ok(related.includes("resolveListingEntitlementContextForRequest"));
    assert.ok(byMls.includes("buildPrismaEntitledInventoryWhere"));
    assert.ok(!related.includes("loadListingForDetailPage"));
    assert.ok(!byMls.includes("loadListingForDetailPage"));
    console.log("[13] related/by-mls owned by G.10C3 (not C1 loader)... PASS");
  }

  // --- SOLD_CONDITIONAL maps to ACTIVE_LISTINGS ---
  {
    assert.equal(
      listingDetailCapabilityForStatus("SOLD_CONDITIONAL"),
      "ACTIVE_LISTINGS",
    );
    assert.equal(listingDetailCapabilityForStatus("LEASED"), "SOLD");
    console.log("[14] SOLD_CONDITIONAL / LEASED mapping... PASS");
  }

  console.log("\nG.10C1 selftest OK\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
