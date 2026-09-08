/**
 * Stage 6.11G.10C3 — related + by-mls entitlement enforcement selftest.
 * Run: pnpm stage-6.11g10c3-related-by-mls:selftest
 *
 * Production G5_ENTITLEMENT_FILTERING_ENABLED stays OFF.
 * Web related/by-mls force-enable via evaluate + Prisma inventory helpers.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPrismaEntitledInventoryWhere,
  buildPrismaListingAuthorityWhere,
  evaluateWebListingDetailInventoryAccess,
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
const SAK_B = buildListingSourceAuthorityKey(ORG_B, "proptx")!;

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

const orgBOnly: WorkspaceListingEntitlement = {
  workspaceId: "ws_b",
  authorities: [
    {
      organizationId: ORG_B,
      providerKey: "proptx",
      sourceAuthorityKey: SAK_B,
      capabilities: ["ACTIVE_LISTINGS", "SOLD"],
    },
  ],
};

function subjectAllowed(
  listing: {
    organizationId: string | null;
    providerKey: string | null;
    dataSource: string;
    status: string;
  },
  entitlement: WorkspaceListingEntitlement | null,
) {
  return evaluateWebListingDetailInventoryAccess({
    entitlement,
    entitlementFilteringEnabled: true,
    organizationId: listing.organizationId,
    providerKey: listing.providerKey,
    dataSource: listing.dataSource,
    status: listing.status,
  }).allowed;
}

/** Simulate by-mls / related inventory inclusion for one Neon row. */
function inventoryIncludesRow(
  entitlement: WorkspaceListingEntitlement,
  row: {
    dataSource: string;
    organizationId: string | null;
    providerKey: string | null;
    status: string;
    ownerStatus?: string;
  },
  statuses: ("ACTIVE" | "SOLD" | "LEASED" | "SOLD_CONDITIONAL")[] | null,
): boolean {
  const where = buildPrismaEntitledInventoryWhere({ entitlement, statuses });
  if (where.kind === "empty") return false;

  // Evaluate the same rules the Prisma helper encodes (exact pairs + caps).
  if (row.dataSource === "fsbo") {
    return (row.ownerStatus ?? "ACTIVE") === "ACTIVE";
  }
  if (row.dataSource === "preview" || row.dataSource === "manual") {
    return false;
  }
  if (row.dataSource !== "mls") return false;
  if (!row.organizationId || !row.providerKey) return false;

  const status = row.status;
  const need =
    status === "SOLD" || status === "LEASED"
      ? ("SOLD" as const)
      : ("ACTIVE_LISTINGS" as const);

  if (statuses) {
    if (!statuses.includes(status as never)) return false;
  }

  const auth = buildPrismaListingAuthorityWhere(entitlement, need);
  if (auth.kind === "empty") return false;
  return entitlement.authorities.some(
    (a) =>
      a.organizationId === row.organizationId &&
      a.providerKey === row.providerKey &&
      a.capabilities.includes(need),
  );
}

async function main() {
  console.log("\n=== STAGE 6.11G.10C3 — RELATED + BY-MLS ENTITLEMENT ===\n");

  assert.equal(G5_ENTITLEMENT_FILTERING_ENABLED, false);
  console.log("[0] G5 remains false... PASS");

  // --- RELATED subject gating ---
  {
    assert.equal(
      subjectAllowed(
        {
          organizationId: TRREB,
          providerKey: "proptx",
          dataSource: "mls",
          status: "ACTIVE",
        },
        fullEntitlement,
      ),
      true,
    );
    assert.equal(
      subjectAllowed(
        {
          organizationId: TRREB,
          providerKey: "proptx",
          dataSource: "mls",
          status: "ACTIVE",
        },
        soldOnly,
      ),
      false,
    );
    assert.equal(
      subjectAllowed(
        {
          organizationId: TRREB,
          providerKey: "proptx",
          dataSource: "mls",
          status: "SOLD",
        },
        activeOnly,
      ),
      false,
    );
    assert.equal(
      subjectAllowed(
        {
          organizationId: ORG_B,
          providerKey: "proptx",
          dataSource: "mls",
          status: "ACTIVE",
        },
        fullEntitlement,
      ),
      false,
    );
    assert.equal(
      subjectAllowed(
        {
          organizationId: TRREB,
          providerKey: "proptx",
          dataSource: "mls",
          status: "ACTIVE",
        },
        emptyEntitlement,
      ),
      false,
    );
    assert.equal(
      subjectAllowed(
        {
          organizationId: null,
          providerKey: "proptx",
          dataSource: "mls",
          status: "ACTIVE",
        },
        fullEntitlement,
      ),
      false,
    );
    console.log("[1] related subject ACTIVE/SOLD/wrong/empty/missing... PASS");
  }

  // --- RELATED result filtering (independent of subject) ---
  {
    assert.equal(
      inventoryIncludesRow(
        fullEntitlement,
        {
          dataSource: "mls",
          organizationId: TRREB,
          providerKey: "proptx",
          status: "ACTIVE",
        },
        ["ACTIVE"],
      ),
      true,
    );
    // Authorized subject board, unauthorized related org → omitted
    assert.equal(
      inventoryIncludesRow(
        fullEntitlement,
        {
          dataSource: "mls",
          organizationId: ORG_B,
          providerKey: "proptx",
          status: "ACTIVE",
        },
        ["ACTIVE"],
      ),
      false,
    );
    // ACTIVE related without ACTIVE_LISTINGS
    assert.equal(
      inventoryIncludesRow(
        soldOnly,
        {
          dataSource: "mls",
          organizationId: TRREB,
          providerKey: "proptx",
          status: "ACTIVE",
        },
        ["ACTIVE"],
      ),
      false,
    );
    // SOLD related with SOLD only
    assert.equal(
      inventoryIncludesRow(
        soldOnly,
        {
          dataSource: "mls",
          organizationId: TRREB,
          providerKey: "proptx",
          status: "SOLD",
        },
        ["SOLD"],
      ),
      true,
    );
    // Missing provenance
    assert.equal(
      inventoryIncludesRow(
        fullEntitlement,
        {
          dataSource: "mls",
          organizationId: null,
          providerKey: null,
          status: "ACTIVE",
        },
        ["ACTIVE"],
      ),
      false,
    );
    console.log("[2] related result independent entitlement filter... PASS");
  }

  // --- Mixed ACTIVE/SOLD capability isolation (no union borrow) ---
  {
    const mixed = buildPrismaEntitledInventoryWhere({
      entitlement: activeOnly,
      statuses: null,
    });
    assert.equal(mixed.kind, "where");
    // activeOnly must not authorize SOLD rows
    assert.equal(
      inventoryIncludesRow(
        activeOnly,
        {
          dataSource: "mls",
          organizationId: TRREB,
          providerKey: "proptx",
          status: "SOLD",
        },
        null,
      ),
      false,
    );
    assert.equal(
      inventoryIncludesRow(
        activeOnly,
        {
          dataSource: "mls",
          organizationId: TRREB,
          providerKey: "proptx",
          status: "ACTIVE",
        },
        null,
      ),
      true,
    );
    // Cross-pair: TRREB+ACTIVE and ORG_B+SOLD cannot authorize TRREB SOLD
    const cross: WorkspaceListingEntitlement = {
      workspaceId: "ws_cross",
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
          capabilities: ["SOLD"],
        },
      ],
    };
    assert.equal(
      inventoryIncludesRow(
        cross,
        {
          dataSource: "mls",
          organizationId: TRREB,
          providerKey: "proptx",
          status: "SOLD",
        },
        null,
      ),
      false,
    );
    assert.equal(
      inventoryIncludesRow(
        cross,
        {
          dataSource: "mls",
          organizationId: ORG_B,
          providerKey: "proptx",
          status: "ACTIVE",
        },
        null,
      ),
      false,
    );
    console.log("[3] mixed-status / cross-pair isolation... PASS");
  }

  // --- BY-MLS batch ---
  {
    assert.equal(
      inventoryIncludesRow(
        fullEntitlement,
        {
          dataSource: "mls",
          organizationId: TRREB,
          providerKey: "proptx",
          status: "ACTIVE",
        },
        null,
      ),
      true,
    );
    assert.equal(
      inventoryIncludesRow(
        soldOnly,
        {
          dataSource: "mls",
          organizationId: TRREB,
          providerKey: "proptx",
          status: "SOLD",
        },
        null,
      ),
      true,
    );
    assert.equal(
      inventoryIncludesRow(
        activeOnly,
        {
          dataSource: "mls",
          organizationId: TRREB,
          providerKey: "proptx",
          status: "SOLD",
        },
        null,
      ),
      false,
    );
    assert.equal(
      inventoryIncludesRow(
        orgBOnly,
        {
          dataSource: "mls",
          organizationId: TRREB,
          providerKey: "proptx",
          status: "ACTIVE",
        },
        null,
      ),
      false,
    );
    const emptyInv = buildPrismaEntitledInventoryWhere({
      entitlement: emptyEntitlement,
      statuses: null,
    });
    // Empty authorities → FSBO-only (zero MLS)
    assert.equal(emptyInv.kind, "where");
    assert.equal(
      inventoryIncludesRow(
        emptyEntitlement,
        {
          dataSource: "mls",
          organizationId: TRREB,
          providerKey: "proptx",
          status: "ACTIVE",
        },
        null,
      ),
      false,
    );
    console.log("[4] by-mls batch capability / empty → zero MLS... PASS");
  }

  // --- FSBO preserved; preview denied ---
  {
    assert.equal(
      subjectAllowed(
        {
          organizationId: null,
          providerKey: null,
          dataSource: "fsbo",
          status: "ACTIVE",
        },
        emptyEntitlement,
      ),
      true,
    );
    assert.equal(
      inventoryIncludesRow(
        emptyEntitlement,
        {
          dataSource: "fsbo",
          organizationId: null,
          providerKey: null,
          status: "ACTIVE",
          ownerStatus: "ACTIVE",
        },
        null,
      ),
      true,
    );
    assert.equal(
      subjectAllowed(
        {
          organizationId: TRREB,
          providerKey: "proptx",
          dataSource: "preview",
          status: "ACTIVE",
        },
        fullEntitlement,
      ),
      false,
    );
    assert.equal(
      inventoryIncludesRow(
        fullEntitlement,
        {
          dataSource: "preview",
          organizationId: TRREB,
          providerKey: "proptx",
          status: "ACTIVE",
        },
        null,
      ),
      false,
    );
    console.log("[5] FSBO preserved; preview denied... PASS");
  }

  // --- Route wiring ---
  {
    const related = read("src/app/api/listings/related/route.ts");
    const byMls = read("src/app/api/listings/by-mls/route.ts");

    assert.ok(related.includes("resolveListingEntitlementContextForRequest"));
    assert.ok(related.includes("evaluateWebListingDetailInventoryAccess"));
    assert.ok(related.includes("buildPrismaEntitledInventoryWhere"));
    assert.ok(related.includes("entitlementFilteringEnabled: true"));
    assert.ok(related.includes('error: "Listing not found."'));
    assert.ok(!related.includes("lookupAndUpsertOnDemand"));
    assert.ok(!related.includes("fetchListingPhotosFromPropTx"));
    assert.ok(!related.includes('searchParams.get("workspaceId")'));
    assert.ok(!related.includes('searchParams.get("organizationId")'));

    const subjectGate = related.indexOf(
      "evaluateWebListingDetailInventoryAccess({",
    );
    const findMany = related.indexOf("prisma.listing.findMany");
    assert.ok(subjectGate >= 0 && findMany > subjectGate);

    assert.ok(byMls.includes("resolveListingEntitlementContextForRequest"));
    assert.ok(byMls.includes("buildPrismaEntitledInventoryWhere"));
    assert.ok(byMls.includes("statuses: null"));
    assert.ok(byMls.includes("mlsNumbers"));
    assert.ok(!byMls.includes("lookupAndUpsertOnDemand"));
    assert.ok(!byMls.includes('searchParams.get("workspaceId")'));
    // Ordering: map over input mlsNumbers after filter
    assert.ok(byMls.includes(".map((mls) => byMls.get(mls))"));

    const byEnt = byMls.indexOf("resolveListingEntitlementContextForRequest");
    const byFind = byMls.indexOf("prisma.listing.findMany");
    assert.ok(byEnt >= 0 && byFind > byEnt);

    console.log("[6] related + by-mls route wiring... PASS");
  }

  // --- Mobile / address-history helpers / G5 ---
  {
    const mobile = read(
      "src/app/api/mobile/v2/properties/[mlsNumber]/route.ts",
    );
    assert.ok(!mobile.includes("entitlementFilteringEnabled"));
    const related = read("src/app/api/listings/related/route.ts");
    assert.ok(!related.includes("findSiblingListingsAtAddress"));
    assert.ok(!related.includes("enrichAddressListingHistory"));
    console.log("[7] mobile unchanged; no PropTx/sibling helper on related... PASS");
  }

  console.log("\nG.10C3 selftest OK\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
