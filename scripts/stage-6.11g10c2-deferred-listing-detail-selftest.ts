/**
 * Stage 6.11G.10C2 — deferred / raw listing-detail API entitlement selftest.
 * Run: pnpm stage-6.11g10c2-deferred-listing-detail:selftest
 *
 * Production G5_ENTITLEMENT_FILTERING_ENABLED stays OFF.
 * Web deferred APIs force-enable; mobile remains outside this slice.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateWebListingDetailInventoryAccess,
  isWebListingDetailEntitlementEnforcementEnabled,
  listingDetailCapabilityForStatus,
  type WorkspaceListingEntitlement,
} from "@/lib/tenancy/listing-entitlement";
import { mayInvokePropTxOnDemandForDetail } from "@/lib/listings/load-listing-for-detail";
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

const activeMedia: WorkspaceListingEntitlement = {
  workspaceId: "ws_media",
  authorities: [
    {
      organizationId: TRREB,
      providerKey: "proptx",
      sourceAuthorityKey: SAK_TRREB,
      capabilities: ["ACTIVE_LISTINGS", "MEDIA"],
    },
  ],
};

const activeOh: WorkspaceListingEntitlement = {
  workspaceId: "ws_oh",
  authorities: [
    {
      organizationId: TRREB,
      providerKey: "proptx",
      sourceAuthorityKey: SAK_TRREB,
      capabilities: ["ACTIVE_LISTINGS", "OPEN_HOUSES"],
    },
  ],
};

const activeHistory: WorkspaceListingEntitlement = {
  workspaceId: "ws_hist",
  authorities: [
    {
      organizationId: TRREB,
      providerKey: "proptx",
      sourceAuthorityKey: SAK_TRREB,
      capabilities: ["ACTIVE_LISTINGS", "HISTORY"],
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
  additionalCapabilities?: readonly (
    | "MEDIA"
    | "HISTORY"
    | "OPEN_HOUSES"
    | "ACTIVE_LISTINGS"
    | "SOLD"
  )[],
) {
  return evaluateWebListingDetailInventoryAccess({
    entitlement,
    entitlementFilteringEnabled: forceEnable,
    organizationId: listing.organizationId,
    providerKey: listing.providerKey,
    dataSource: listing.dataSource,
    status: listing.status,
    additionalCapabilities,
  });
}

const mlsActive: FakeListing = {
  organizationId: TRREB,
  providerKey: "proptx",
  dataSource: "mls",
  status: "ACTIVE",
};

const mlsSold: FakeListing = {
  organizationId: TRREB,
  providerKey: "proptx",
  dataSource: "mls",
  status: "SOLD",
};

async function main() {
  console.log("\n=== STAGE 6.11G.10C2 — DEFERRED / RAW LISTING DETAIL APIs ===\n");

  assert.equal(G5_ENTITLEMENT_FILTERING_ENABLED, false);
  console.log("[0] G5 remains false... PASS");

  // --- Base body: ACTIVE / SOLD ---
  {
    assert.equal(gate(mlsActive, fullEntitlement, true).allowed, true);
    assert.equal(gate(mlsSold, fullEntitlement, true).allowed, true);
    assert.equal(gate(mlsSold, soldOnly, true).allowed, true);
    assert.equal(gate(mlsActive, soldOnly, true).allowed, false);
    assert.equal(gate(mlsSold, activeOnly, true).allowed, false);
    console.log("[1] entitled ACTIVE/SOLD base body... PASS");
  }

  // --- Wrong org / empty / missing provenance / unknown host (empty) ---
  {
    assert.equal(
      gate(
        {
          organizationId: ORG_B,
          providerKey: "proptx",
          dataSource: "mls",
          status: "ACTIVE",
        },
        fullEntitlement,
        true,
      ).allowed,
      false,
    );
    assert.equal(gate(mlsActive, emptyEntitlement, true).allowed, false);
    assert.equal(gate(mlsActive, null, true).allowed, false);
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
    console.log("[2] wrong/empty/missing provenance denied... PASS");
  }

  // --- Gallery MEDIA ---
  {
    assert.equal(
      gate(mlsActive, activeOnly, true, ["MEDIA"]).allowed,
      false,
    );
    assert.equal(
      gate(mlsActive, activeMedia, true, ["MEDIA"]).allowed,
      true,
    );
    assert.equal(
      gate(mlsActive, fullEntitlement, true, ["MEDIA"]).allowed,
      true,
    );
    console.log("[3] gallery MEDIA capability... PASS");
  }

  // --- Rooms / open houses OPEN_HOUSES ---
  {
    assert.equal(
      gate(mlsActive, activeOnly, true, ["OPEN_HOUSES"]).allowed,
      false,
    );
    assert.equal(
      gate(mlsActive, activeOh, true, ["OPEN_HOUSES"]).allowed,
      true,
    );
    console.log("[4] OPEN_HOUSES capability... PASS");
  }

  // --- History HISTORY ---
  {
    assert.equal(
      gate(mlsActive, activeOnly, true, ["HISTORY"]).allowed,
      false,
    );
    assert.equal(
      gate(mlsActive, activeHistory, true, ["HISTORY"]).allowed,
      true,
    );
    console.log("[5] HISTORY capability... PASS");
  }

  // --- MEDIA alone does not skip base provenance (ACTIVE without ACTIVE_LISTINGS) ---
  {
    const mediaOnlySoldCap: WorkspaceListingEntitlement = {
      workspaceId: "ws_media_sold",
      authorities: [
        {
          organizationId: TRREB,
          providerKey: "proptx",
          sourceAuthorityKey: SAK_TRREB,
          capabilities: ["SOLD", "MEDIA"],
        },
      ],
    };
    assert.equal(
      gate(mlsActive, mediaOnlySoldCap, true, ["MEDIA"]).allowed,
      false,
      "MEDIA must not authorize without base ACTIVE_LISTINGS",
    );
    console.log("[6] capability-only without provenance base denied... PASS");
  }

  // --- FSBO preserved; preview denied; force-off mobile-safe ---
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
        ["MEDIA"],
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
    assert.equal(
      isWebListingDetailEntitlementEnforcementEnabled(false),
      false,
    );
    assert.equal(
      gate(mlsActive, emptyEntitlement, false).allowed,
      true,
    );
    console.log("[7] FSBO / preview / mobile force-off... PASS");
  }

  // --- PropTx exact pre-auth still required for MEDIA / HISTORY ---
  {
    assert.equal(
      mayInvokePropTxOnDemandForDetail({
        entitlementFilteringEnabled: true,
        entitlement: activeOnly,
        requiredCapability: "MEDIA",
        propTxOrganizationId: TRREB,
      }),
      false,
    );
    assert.equal(
      mayInvokePropTxOnDemandForDetail({
        entitlementFilteringEnabled: true,
        entitlement: activeMedia,
        requiredCapability: "MEDIA",
        propTxOrganizationId: TRREB,
      }),
      true,
    );
    assert.equal(
      mayInvokePropTxOnDemandForDetail({
        entitlementFilteringEnabled: true,
        entitlement: emptyEntitlement,
        requiredCapability: "HISTORY",
        propTxOrganizationId: TRREB,
      }),
      false,
    );
    assert.equal(
      mayInvokePropTxOnDemandForDetail({
        entitlementFilteringEnabled: true,
        entitlement: activeHistory,
        requiredCapability: "HISTORY",
        propTxOrganizationId: TRREB,
      }),
      true,
    );
    assert.equal(
      mayInvokePropTxOnDemandForDetail({
        entitlementFilteringEnabled: true,
        entitlement: fullEntitlement,
        requiredCapability: "MEDIA",
        propTxOrganizationId: ORG_B,
      }),
      false,
      "wrong org must not pre-auth PropTx",
    );
    console.log("[8] PropTx MEDIA/HISTORY exact pre-auth... PASS");
  }

  // --- Shared choke point ordering ---
  {
    const access = read("src/lib/listings/listing-detail-api-access.ts");
    assert.ok(access.includes("resolveListingEntitlementContextForRequest"));
    assert.ok(access.includes("evaluateWebListingDetailInventoryAccess"));
    assert.ok(access.includes("entitlementFilteringEnabled"));
    assert.ok(access.includes("additionalCapabilities"));
    // Board entitlement before VOW
    const boardIdx = access.indexOf("evaluateWebListingDetailInventoryAccess({");
    const vowIdx = access.indexOf("resolveListingDetailAccess(user");
    assert.ok(boardIdx > 0 && vowIdx > boardIdx, "board entitlement before VOW");
    assert.ok(!access.includes('searchParams.get("workspaceId")'));
    assert.ok(!access.includes('searchParams.get("organizationId")'));
    console.log("[9] loadListingDetailApiAccess board→VOW... PASS");
  }

  // --- Raw GET ---
  {
    const raw = read("src/app/api/listings/[mlsNumber]/route.ts");
    assert.ok(raw.includes("resolveListingEntitlementContextForRequest"));
    assert.ok(raw.includes("entitlementFilteringEnabled: true"));
    assert.ok(raw.includes('additionalCapabilities: ["MEDIA"]'));
    assert.ok(raw.includes('additionalCapabilities: ["HISTORY"]'));
    assert.ok(raw.includes('status: 404'));
    assert.ok(!raw.includes("lookupAndUpsertOnDemand"));
    assert.ok(!raw.includes("fetchListingPhotosFromPropTx"));
    assert.ok(!raw.includes('searchParams.get("workspaceId")'));
    console.log("[10] raw GET entitlement + MEDIA/HISTORY strip... PASS");
  }

  // --- Gallery: MEDIA + no PropTx without pre-auth ---
  {
    const gallery = read("src/app/api/listings/[mlsNumber]/gallery/route.ts");
    assert.ok(gallery.includes('additionalCapabilities: ["MEDIA"]'));
    assert.ok(gallery.includes("mayInvokePropTxOnDemandForDetail"));
    assert.ok(gallery.includes('requiredCapability: "MEDIA"'));
    const accessCall = gallery.indexOf("loadListingDetailApiAccess(raw");
    const mayInvoke = gallery.indexOf("mayInvokePropTxOnDemandForDetail({");
    const propTxCall = gallery.indexOf("await fetchListingPhotosFromPropTx");
    assert.ok(accessCall >= 0 && mayInvoke > accessCall && propTxCall > mayInvoke);
    assert.ok(!gallery.includes('searchParams.get("workspaceId")'));
    console.log("[11] gallery MEDIA + PropTx ordering... PASS");
  }

  // --- OH route ---
  {
    const oh = read(
      "src/app/api/listings/[mlsNumber]/rooms-open-houses/route.ts",
    );
    assert.ok(oh.includes('additionalCapabilities: ["OPEN_HOUSES"]'));
    assert.ok(oh.includes("entitlementFilteringEnabled: true"));
    assert.ok(!oh.includes("fetchListingPhotosFromPropTx"));
    console.log("[12] rooms-open-houses OPEN_HOUSES... PASS");
  }

  // --- History enrich: HISTORY before PropTx / writes ---
  {
    const hist = read(
      "src/app/api/listings/[mlsNumber]/address-history/enrich/route.ts",
    );
    assert.ok(hist.includes('additionalCapabilities: ["HISTORY"]'));
    assert.ok(hist.includes("mayInvokePropTxOnDemandForDetail"));
    assert.ok(hist.includes('requiredCapability: "HISTORY"'));
    const accessIdx = hist.indexOf("loadListingDetailApiAccess(raw");
    const mayIdx = hist.indexOf("mayInvokePropTxOnDemandForDetail({");
    const enrichIdx = hist.indexOf("await enrichAddressListingHistory");
    assert.ok(accessIdx >= 0 && mayIdx > accessIdx && enrichIdx > mayIdx);
    console.log("[13] history HISTORY + no enrich without pre-auth... PASS");
  }

  // --- Insights / ask ---
  {
    const insights = read("src/app/api/listings/[mlsNumber]/insights/route.ts");
    const ask = read("src/app/api/listings/[mlsNumber]/ask/route.ts");
    assert.ok(insights.includes("evaluateWebListingDetailInventoryAccess"));
    assert.ok(insights.includes("resolveListingEntitlementContextForRequest"));
    assert.ok(insights.includes("entitlementFilteringEnabled: true"));
    const insightsGate = insights.indexOf(
      "evaluateWebListingDetailInventoryAccess({",
    );
    const insightsBuild = insights.indexOf("buildListingInsights({");
    assert.ok(insightsGate >= 0 && insightsBuild > insightsGate);

    assert.ok(ask.includes("evaluateWebListingDetailInventoryAccess"));
    assert.ok(ask.includes("resolveListingEntitlementContextForRequest"));
    const askGate = ask.indexOf("evaluateWebListingDetailInventoryAccess({");
    const askAnswer = ask.indexOf("answerListingQuestion(listing");
    assert.ok(askGate >= 0 && askAnswer > askGate);
    assert.ok(!ask.includes('searchParams.get("workspaceId")'));
    console.log("[14] insights + ask base entitlement before context... PASS");
  }

  // --- VOW cannot substitute (board before VOW in shared helper) ---
  {
    const access = read("src/lib/listings/listing-detail-api-access.ts");
    assert.ok(access.includes("Board entitlement") || access.includes("board"));
    assert.ok(
      access.indexOf("evaluateWebListingDetailInventoryAccess({") <
        access.indexOf("resolveListingDetailAccess(user"),
    );
    console.log("[15] VOW after board entitlement... PASS");
  }

  // --- related / by-mls owned by G.10C3; mobile unchanged ---
  {
    const related = read("src/app/api/listings/related/route.ts");
    const byMls = read("src/app/api/listings/by-mls/route.ts");
    const mobile = read(
      "src/app/api/mobile/v2/properties/[mlsNumber]/route.ts",
    );
    assert.ok(related.includes("buildPrismaEntitledInventoryWhere"));
    assert.ok(byMls.includes("buildPrismaEntitledInventoryWhere"));
    assert.ok(mobile.includes("loadListingForDetailPage"));
    assert.ok(!mobile.includes("entitlementFilteringEnabled"));
    console.log("[16] related/by-mls C3 + mobile outside C2... PASS");
  }

  // --- Status mapping still aligned ---
  {
    assert.equal(
      listingDetailCapabilityForStatus("SOLD_CONDITIONAL"),
      "ACTIVE_LISTINGS",
    );
    assert.equal(listingDetailCapabilityForStatus("LEASED"), "SOLD");
    console.log("[17] status→capability mapping... PASS");
  }

  console.log("\nG.10C2 selftest OK\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
