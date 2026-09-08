/**
 * Stage 6.11G.10C0 — listing detail entitlement foundation selftest.
 * Run: pnpm stage-6.11g10c0-detail-entitlement:selftest
 *
 * Production G5_ENTITLEMENT_FILTERING_ENABLED stays OFF.
 * No route/loader/PropTx wiring in this stage.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  G10C0_DETAIL_ENTITLEMENT_FOUNDATION,
  G10C_PROPTX_ON_DEMAND_REQUIRES_PRIOR_ENTITLEMENT_ALLOW,
  classifyListingInventoryChannel,
  decideMlsListingDetailEntitlement,
  isWebListingDetailEntitlementEnforcementEnabled,
  listingDetailCapabilityForStatus,
  normalizeRecognizedListingProviderKey,
  resolveListingEntitlementEnforcementEnabled,
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

const activeOnlyEntitlement: WorkspaceListingEntitlement = {
  workspaceId: "ws_active_only",
  authorities: [
    {
      organizationId: TRREB,
      providerKey: "proptx",
      sourceAuthorityKey: SAK_TRREB,
      capabilities: ["ACTIVE_LISTINGS"],
    },
  ],
};

/** Org A has ACTIVE; Org B has proptx SOLD — cross-pair must not allow. */
const splitEntitlement: WorkspaceListingEntitlement = {
  workspaceId: "ws_split",
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
      capabilities: ["SOLD", "HISTORY"],
    },
  ],
};

const emptyEntitlement: WorkspaceListingEntitlement = {
  workspaceId: "ws_empty",
  authorities: [],
};

function decideMls(input: {
  entitlement?: WorkspaceListingEntitlement | null;
  organizationId?: string | null;
  providerKey?: string | null;
  dataSource?: string | null;
  requiredCapability: "ACTIVE_LISTINGS" | "SOLD" | "HISTORY" | "OPEN_HOUSES" | "MEDIA";
}) {
  return decideMlsListingDetailEntitlement({
    entitlement: input.entitlement === undefined ? fullEntitlement : input.entitlement,
    organizationId: input.organizationId === undefined ? TRREB : input.organizationId,
    providerKey: input.providerKey === undefined ? "proptx" : input.providerKey,
    dataSource: input.dataSource === undefined ? "mls" : input.dataSource,
    requiredCapability: input.requiredCapability,
  });
}

async function main() {
  console.log("\n=== STAGE 6.11G.10C0 — DETAIL ENTITLEMENT FOUNDATION ===\n");

  // --- Markers + G5 untouched ---
  {
    assert.equal(G10C0_DETAIL_ENTITLEMENT_FOUNDATION, true);
    assert.equal(G10C_PROPTX_ON_DEMAND_REQUIRES_PRIOR_ENTITLEMENT_ALLOW, true);
    assert.equal(G5_ENTITLEMENT_FILTERING_ENABLED, false);
    console.log("[1] foundation markers + G5 OFF... PASS");
  }

  // --- Monotonic gate truth table (same as G.10B1) ---
  {
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
        `gate production=${row.productionEnabled} force=${String(row.forceEnable)}`,
      );
    }

    // production OFF + no force = disabled
    assert.equal(isWebListingDetailEntitlementEnforcementEnabled(), false);
    // production OFF + force false = disabled
    assert.equal(isWebListingDetailEntitlementEnforcementEnabled(false), false);
    // production OFF + force true = enabled
    assert.equal(isWebListingDetailEntitlementEnforcementEnabled(true), true);
    // Simulated production ON + force false = STILL enabled
    assert.equal(
      resolveListingEntitlementEnforcementEnabled({
        productionEnabled: true,
        forceEnable: false,
      }),
      true,
    );
    console.log("[2] monotonic web-detail gate truth table... PASS");
  }

  // --- Exact org/provider/capability allow ---
  {
    const d = decideMls({ requiredCapability: "ACTIVE_LISTINGS" });
    assert.equal(d.allowed, true);
    if (d.allowed) {
      assert.equal(d.organizationId, TRREB);
      assert.equal(d.providerKey, "proptx");
      assert.equal(d.capability, "ACTIVE_LISTINGS");
    }
    console.log("[3] exact org/provider/capability allow... PASS");
  }

  // --- Wrong organization deny ---
  {
    const d = decideMls({
      organizationId: ORG_B,
      requiredCapability: "ACTIVE_LISTINGS",
    });
    assert.deepEqual(d, {
      allowed: false,
      reason: "authority_pair_mismatch",
    });
    console.log("[4] wrong organization deny... PASS");
  }

  // --- Wrong provider deny (recognized but not on this org row as sole match) ---
  // Only proptx is recognized; use wrong org+provider pair via split entitlement.
  {
    const d = decideMlsListingDetailEntitlement({
      entitlement: activeOnlyEntitlement,
      organizationId: TRREB,
      providerKey: "proptx",
      dataSource: "mls",
      requiredCapability: "SOLD",
    });
    assert.deepEqual(d, { allowed: false, reason: "missing_capability" });
    console.log("[5] missing capability deny... PASS");
  }

  // --- Cross-pair false-positive impossible ---
  // Org TRREB has ACTIVE only; Org B has SOLD. Asking SOLD for TRREB+proptx → missing_capability.
  // Asking ACTIVE for ORG_B+proptx → missing_capability (B has SOLD not ACTIVE).
  // Asking SOLD for ORG_B → allow. Never ORG_B org + TRREB caps via cross product.
  {
    const soldOnTrreb = decideMlsListingDetailEntitlement({
      entitlement: splitEntitlement,
      organizationId: TRREB,
      providerKey: "proptx",
      dataSource: "mls",
      requiredCapability: "SOLD",
    });
    assert.deepEqual(soldOnTrreb, {
      allowed: false,
      reason: "missing_capability",
    });

    const activeOnB = decideMlsListingDetailEntitlement({
      entitlement: splitEntitlement,
      organizationId: ORG_B,
      providerKey: "proptx",
      dataSource: "mls",
      requiredCapability: "ACTIVE_LISTINGS",
    });
    assert.deepEqual(activeOnB, {
      allowed: false,
      reason: "missing_capability",
    });

    const soldOnB = decideMlsListingDetailEntitlement({
      entitlement: splitEntitlement,
      organizationId: ORG_B,
      providerKey: "proptx",
      dataSource: "mls",
      requiredCapability: "SOLD",
    });
    assert.equal(soldOnB.allowed, true);

    // History on B is allowed; history on TRREB is not (TRREB row has no HISTORY).
    const histTrreb = decideMlsListingDetailEntitlement({
      entitlement: splitEntitlement,
      organizationId: TRREB,
      providerKey: "proptx",
      dataSource: "mls",
      requiredCapability: "HISTORY",
    });
    assert.deepEqual(histTrreb, {
      allowed: false,
      reason: "missing_capability",
    });
    console.log("[6] cross-pair false-positive impossible... PASS");
  }

  // --- Missing organization / provider ---
  {
    assert.deepEqual(
      decideMls({ organizationId: null, requiredCapability: "ACTIVE_LISTINGS" }),
      { allowed: false, reason: "missing_organization_id" },
    );
    assert.deepEqual(
      decideMls({ organizationId: "  ", requiredCapability: "ACTIVE_LISTINGS" }),
      { allowed: false, reason: "missing_organization_id" },
    );
    assert.deepEqual(
      decideMls({ providerKey: null, requiredCapability: "ACTIVE_LISTINGS" }),
      { allowed: false, reason: "missing_provider_key" },
    );
    assert.deepEqual(
      decideMls({ providerKey: "   ", requiredCapability: "ACTIVE_LISTINGS" }),
      { allowed: false, reason: "missing_provider_key" },
    );
    console.log("[7] missing organization/provider deny... PASS");
  }

  // --- Empty / missing entitlement ---
  {
    assert.deepEqual(
      decideMls({ entitlement: null, requiredCapability: "ACTIVE_LISTINGS" }),
      { allowed: false, reason: "missing_entitlement" },
    );
    assert.deepEqual(
      decideMls({
        entitlement: emptyEntitlement,
        requiredCapability: "ACTIVE_LISTINGS",
      }),
      { allowed: false, reason: "empty_authorities" },
    );
    console.log("[8] empty/missing entitlement deny... PASS");
  }

  // --- Unrecognized provider ---
  {
    assert.deepEqual(
      decideMls({
        providerKey: "unknown-feed",
        requiredCapability: "ACTIVE_LISTINGS",
      }),
      { allowed: false, reason: "unrecognized_provider_key" },
    );
    console.log("[9] unrecognized provider deny... PASS");
  }

  // --- Wrong provider on matching org (authority_pair_mismatch via different org) ---
  {
    const d = decideMlsListingDetailEntitlement({
      entitlement: splitEntitlement,
      organizationId: "org_unknown",
      providerKey: "proptx",
      dataSource: "mls",
      requiredCapability: "ACTIVE_LISTINGS",
    });
    assert.deepEqual(d, {
      allowed: false,
      reason: "authority_pair_mismatch",
    });
    console.log("[10] wrong organization pair mismatch... PASS");
  }

  // --- Status → capability mapping ---
  {
    assert.equal(listingDetailCapabilityForStatus("ACTIVE"), "ACTIVE_LISTINGS");
    assert.equal(
      listingDetailCapabilityForStatus("SOLD_CONDITIONAL"),
      "ACTIVE_LISTINGS",
    );
    assert.equal(listingDetailCapabilityForStatus("SOLD"), "SOLD");
    assert.equal(listingDetailCapabilityForStatus("LEASED"), "SOLD");
    // Explicit caps never inferred from status helper
    assert.notEqual(listingDetailCapabilityForStatus("ACTIVE"), "HISTORY");
    assert.notEqual(listingDetailCapabilityForStatus("ACTIVE"), "MEDIA");
    assert.notEqual(listingDetailCapabilityForStatus("ACTIVE"), "OPEN_HOUSES");
    console.log("[11] ACTIVE / SOLD_CONDITIONAL / SOLD / LEASED mapping... PASS");
  }

  // --- FSBO / manual / preview not authorized by MLS helper ---
  {
    assert.equal(classifyListingInventoryChannel("fsbo"), "fsbo");
    assert.equal(classifyListingInventoryChannel("manual"), "manual");
    assert.equal(classifyListingInventoryChannel("preview"), "preview");
    assert.equal(classifyListingInventoryChannel("mls"), "mls");

    assert.deepEqual(
      decideMls({ dataSource: "fsbo", requiredCapability: "ACTIVE_LISTINGS" }),
      { allowed: false, reason: "non_mls_channel_fsbo" },
    );
    assert.deepEqual(
      decideMls({ dataSource: "manual", requiredCapability: "ACTIVE_LISTINGS" }),
      { allowed: false, reason: "non_mls_channel_manual" },
    );
    assert.deepEqual(
      decideMls({
        dataSource: "preview",
        requiredCapability: "ACTIVE_LISTINGS",
      }),
      { allowed: false, reason: "non_mls_channel_preview" },
    );
    // Even with perfect provenance, non-MLS channels stay denied
    assert.deepEqual(
      decideMlsListingDetailEntitlement({
        entitlement: fullEntitlement,
        organizationId: TRREB,
        providerKey: "proptx",
        dataSource: "fsbo",
        requiredCapability: "ACTIVE_LISTINGS",
      }),
      { allowed: false, reason: "non_mls_channel_fsbo" },
    );
    console.log("[12] FSBO / manual / preview not MLS-authorized... PASS");
  }

  // --- Provider case / normalization matches G.10A policy ---
  {
    assert.equal(normalizeRecognizedListingProviderKey(" PropTx "), "proptx");
    const d = decideMls({
      providerKey: " PropTx ",
      requiredCapability: "MEDIA",
    });
    assert.equal(d.allowed, true);
    if (d.allowed) assert.equal(d.providerKey, "proptx");
    console.log("[13] provider case/normalization (G.10A policy)... PASS");
  }

  // --- Source invariants: foundation docs + G5 OFF; G.10C1 may wire loaders ---
  {
    const detail = read(
      "src/lib/tenancy/listing-entitlement/detail-entitlement.ts",
    );
    assert.ok(detail.includes("PROPTX_ON_DEMAND_REQUIRES_PRIOR_ENTITLEMENT"));
    assert.ok(detail.includes("decideMlsListingDetailEntitlement"));

    const contract = read("src/lib/tenancy/listing-provenance/contract.ts");
    assert.match(
      contract,
      /G5_ENTITLEMENT_FILTERING_ENABLED\s*=\s*false/,
    );

    assert.equal(G10C_PROPTX_ON_DEMAND_REQUIRES_PRIOR_ENTITLEMENT_ALLOW, true);

    console.log("[14] foundation invariants + G5 OFF... PASS");
  }

  // --- Exhaustive denial reasons are stable strings ---
  {
    const reasons = [
      decideMls({ dataSource: "fsbo", requiredCapability: "ACTIVE_LISTINGS" }),
      decideMls({ entitlement: null, requiredCapability: "ACTIVE_LISTINGS" }),
      decideMls({
        entitlement: emptyEntitlement,
        requiredCapability: "ACTIVE_LISTINGS",
      }),
      decideMls({ organizationId: null, requiredCapability: "ACTIVE_LISTINGS" }),
      decideMls({ providerKey: null, requiredCapability: "ACTIVE_LISTINGS" }),
      decideMls({
        providerKey: "nope",
        requiredCapability: "ACTIVE_LISTINGS",
      }),
      decideMls({
        organizationId: "x",
        requiredCapability: "ACTIVE_LISTINGS",
      }),
      decideMlsListingDetailEntitlement({
        entitlement: activeOnlyEntitlement,
        organizationId: TRREB,
        providerKey: "proptx",
        dataSource: "mls",
        requiredCapability: "HISTORY",
      }),
    ];
    for (const r of reasons) {
      assert.equal(r.allowed, false);
      if (!r.allowed) assert.equal(typeof r.reason, "string");
    }
    console.log("[15] denial reason shape... PASS");
  }

  console.log("\nG.10C0 selftest OK\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
