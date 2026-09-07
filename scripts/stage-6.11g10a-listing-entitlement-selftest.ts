/**
 * Stage 6.11G.10A — canonical listing entitlement resolver selftest.
 * Run: pnpm stage-6.11g10a-listing-entitlement:selftest
 * No production mutation / deploy / search filter changes.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createFixtureAuthoritativeHostDeps,
  type AuthoritativeDomainLookupRow,
} from "@/lib/tenancy/resolve-authoritative-workspace-host";
import {
  entitlementAllowsProvenance,
  entitlementHasCapability,
  normalizeRecognizedListingProviderKey,
  resolveListingEntitlementForHostname,
  resolveWorkspaceListingEntitlement,
  RECOGNIZED_LISTING_DATA_PROVIDER_KEYS,
  type ListingDataCapability,
} from "@/lib/tenancy/listing-entitlement";
import { buildListingSourceAuthorityKey } from "@/lib/typesense/listing-document";
import { G5_ENTITLEMENT_FILTERING_ENABLED } from "@/lib/tenancy/listing-provenance";
import { WORKSPACE_DATA_CONNECTION_CAPABILITY_KINDS } from "@/lib/tenancy/data-connection";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const TRREB = "cmtrdf23t000091u0cw3a5zu9";
const ORG_B = "org_board_b_fixture";
const WS_HOUZZAT = "ws_houzzat_entitlement";
const WS_OTHER = "ws_other_entitlement";
const HOUZZAT_PROD_ID = "cmt7kfcth0000gvu0bqsycsvz";

const ALL_CAPS: ListingDataCapability[] = [
  ...WORKSPACE_DATA_CONNECTION_CAPABILITY_KINDS,
];

type MemRow = {
  workspaceId: string;
  organizationId: string;
  status: string;
};

type ConnRow = {
  workspaceId: string;
  organizationId: string;
  providerKey: string;
  status: string;
  capabilities: ListingDataCapability[];
};

function createFakePrisma(state: { memberships: MemRow[]; connections: ConnRow[] }) {
  return {
    workspaceRealEstateOrganizationMembership: {
      async findMany({
        where,
      }: {
        where: { workspaceId: string; status: string };
      }) {
        return state.memberships
          .filter(
            (m) =>
              m.workspaceId === where.workspaceId &&
              m.status === where.status,
          )
          .map((m) => ({ organizationId: m.organizationId }));
      },
    },
    workspaceDataConnection: {
      async findMany({
        where,
      }: {
        where: {
          workspaceId: string;
          organizationId: { in: string[] };
          status: string;
        };
      }) {
        const orgSet = new Set(where.organizationId.in);
        return state.connections
          .filter(
            (c) =>
              c.workspaceId === where.workspaceId &&
              orgSet.has(c.organizationId) &&
              c.status === where.status,
          )
          .map((c) => ({
            organizationId: c.organizationId,
            providerKey: c.providerKey,
            capabilities: c.capabilities.map((capability) => ({ capability })),
          }));
      },
    },
  };
}

function createThrowingPrisma() {
  return {
    workspaceRealEstateOrganizationMembership: {
      async findMany() {
        throw new Error("SIMULATED_PRISMA_OUTAGE");
      },
    },
    workspaceDataConnection: {
      async findMany() {
        throw new Error("SIMULATED_PRISMA_OUTAGE");
      },
    },
  };
}

const HOST_ROWS: AuthoritativeDomainLookupRow[] = [
  {
    hostname: "houzzat.houzzatpro.com",
    kind: "PLATFORM",
    role: "PRIMARY",
    workspaceId: WS_HOUZZAT,
    workspaceSlug: "houzzat",
    domainStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
  },
  {
    hostname: "inactive-domain.houzzatpro.com",
    kind: "PLATFORM",
    role: "PRIMARY",
    workspaceId: WS_HOUZZAT,
    workspaceSlug: "houzzat",
    domainStatus: "PENDING",
    workspaceStatus: "ACTIVE",
  },
  {
    hostname: "inactive-ws.houzzatpro.com",
    kind: "PLATFORM",
    role: "PRIMARY",
    workspaceId: WS_HOUZZAT,
    workspaceSlug: "houzzat",
    domainStatus: "ACTIVE",
    workspaceStatus: "SUSPENDED",
  },
  {
    hostname: "other.houzzatpro.com",
    kind: "PLATFORM",
    role: "PRIMARY",
    workspaceId: WS_OTHER,
    workspaceSlug: "other",
    domainStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
  },
];

async function main() {
  console.log("\n=== STAGE 6.11G.10A — LISTING ENTITLEMENT RESOLVER ===\n");

  assert.equal(G5_ENTITLEMENT_FILTERING_ENABLED, false);

  // --- Provider validation ---
  {
    assert.deepEqual([...RECOGNIZED_LISTING_DATA_PROVIDER_KEYS], ["proptx"]);
    assert.equal(normalizeRecognizedListingProviderKey("proptx"), "proptx");
    assert.equal(normalizeRecognizedListingProviderKey(" PropTx "), "proptx");
    assert.equal(normalizeRecognizedListingProviderKey(""), null);
    assert.equal(normalizeRecognizedListingProviderKey("   "), null);
    assert.equal(normalizeRecognizedListingProviderKey(null), null);
    assert.equal(normalizeRecognizedListingProviderKey("unknown-feed"), null);
    console.log("[0] providerKey recognition... PASS");
  }

  // --- Houzzat explicit TRREB success ---
  {
    const prisma = createFakePrisma({
      memberships: [
        {
          workspaceId: WS_HOUZZAT,
          organizationId: TRREB,
          status: "VERIFIED",
        },
      ],
      connections: [
        {
          workspaceId: WS_HOUZZAT,
          organizationId: TRREB,
          providerKey: "proptx",
          status: "ACTIVE",
          capabilities: ALL_CAPS,
        },
      ],
    });
    const ent = await resolveWorkspaceListingEntitlement({
      trustedWorkspaceId: WS_HOUZZAT,
      prisma: prisma as never,
    });
    assert.equal(ent.workspaceId, WS_HOUZZAT);
    assert.equal(ent.authorities.length, 1);
    assert.equal(ent.authorities[0]!.organizationId, TRREB);
    assert.equal(ent.authorities[0]!.providerKey, "proptx");
    assert.equal(
      ent.authorities[0]!.sourceAuthorityKey,
      buildListingSourceAuthorityKey(TRREB, "proptx"),
    );
    assert.equal(
      ent.authorities[0]!.sourceAuthorityKey,
      `${TRREB}:proptx`,
    );
    assert.deepEqual([...ent.authorities[0]!.capabilities].sort(), [
      ...ALL_CAPS,
    ].sort());
    assert.equal(entitlementHasCapability(ent, "ACTIVE_LISTINGS"), true);
    assert.equal(entitlementHasCapability(ent, "MEDIA"), true);
    console.log("[1] Houzzat VERIFIED+ACTIVE proptx + caps... PASS");
  }

  // --- Membership statuses ---
  {
    for (const status of [
      "DECLARED",
      "PENDING_VERIFICATION",
      "REJECTED",
      "INACTIVE",
    ] as const) {
      const prisma = createFakePrisma({
        memberships: [
          { workspaceId: WS_HOUZZAT, organizationId: TRREB, status },
        ],
        connections: [
          {
            workspaceId: WS_HOUZZAT,
            organizationId: TRREB,
            providerKey: "proptx",
            status: "ACTIVE",
            capabilities: ALL_CAPS,
          },
        ],
      });
      const ent = await resolveWorkspaceListingEntitlement({
        trustedWorkspaceId: WS_HOUZZAT,
        prisma: prisma as never,
      });
      assert.deepEqual(ent.authorities, [], `membership ${status} must deny`);
    }
    console.log("[2] non-VERIFIED membership denied... PASS");
  }

  // --- Connection statuses ---
  {
    for (const status of [
      "PENDING",
      "FAILED",
      "SUSPENDED",
      "REVOKED",
      "DISCONNECTED",
    ] as const) {
      const prisma = createFakePrisma({
        memberships: [
          {
            workspaceId: WS_HOUZZAT,
            organizationId: TRREB,
            status: "VERIFIED",
          },
        ],
        connections: [
          {
            workspaceId: WS_HOUZZAT,
            organizationId: TRREB,
            providerKey: "proptx",
            status,
            capabilities: ALL_CAPS,
          },
        ],
      });
      const ent = await resolveWorkspaceListingEntitlement({
        trustedWorkspaceId: WS_HOUZZAT,
        prisma: prisma as never,
      });
      assert.deepEqual(ent.authorities, [], `connection ${status} must deny`);
    }

    // ACTIVE without VERIFIED
    {
      const prisma = createFakePrisma({
        memberships: [],
        connections: [
          {
            workspaceId: WS_HOUZZAT,
            organizationId: TRREB,
            providerKey: "proptx",
            status: "ACTIVE",
            capabilities: ALL_CAPS,
          },
        ],
      });
      const ent = await resolveWorkspaceListingEntitlement({
        trustedWorkspaceId: WS_HOUZZAT,
        prisma: prisma as never,
      });
      assert.deepEqual(ent.authorities, []);
    }

    // VERIFIED without ACTIVE connection
    {
      const prisma = createFakePrisma({
        memberships: [
          {
            workspaceId: WS_HOUZZAT,
            organizationId: TRREB,
            status: "VERIFIED",
          },
        ],
        connections: [],
      });
      const ent = await resolveWorkspaceListingEntitlement({
        trustedWorkspaceId: WS_HOUZZAT,
        prisma: prisma as never,
      });
      assert.deepEqual(ent.authorities, []);
    }
    console.log("[3] connection gates... PASS");
  }

  // --- Capabilities filter ---
  {
    const prisma = createFakePrisma({
      memberships: [
        {
          workspaceId: WS_HOUZZAT,
          organizationId: TRREB,
          status: "VERIFIED",
        },
      ],
      connections: [
        {
          workspaceId: WS_HOUZZAT,
          organizationId: TRREB,
          providerKey: "proptx",
          status: "ACTIVE",
          capabilities: ["ACTIVE_LISTINGS", "SOLD"],
        },
      ],
    });
    const sold = await resolveWorkspaceListingEntitlement({
      trustedWorkspaceId: WS_HOUZZAT,
      requiredCapability: "SOLD",
      prisma: prisma as never,
    });
    assert.equal(sold.authorities.length, 1);
    const media = await resolveWorkspaceListingEntitlement({
      trustedWorkspaceId: WS_HOUZZAT,
      requiredCapability: "MEDIA",
      prisma: prisma as never,
    });
    assert.equal(media.authorities.length, 0);
    console.log("[4] requiredCapability filter... PASS");
  }

  // --- Exact pairs / cross-product ---
  {
    const prisma = createFakePrisma({
      memberships: [
        { workspaceId: WS_HOUZZAT, organizationId: TRREB, status: "VERIFIED" },
        { workspaceId: WS_HOUZZAT, organizationId: ORG_B, status: "VERIFIED" },
      ],
      connections: [
        {
          workspaceId: WS_HOUZZAT,
          organizationId: TRREB,
          providerKey: "proptx",
          status: "ACTIVE",
          capabilities: ["ACTIVE_LISTINGS"],
        },
        {
          workspaceId: WS_HOUZZAT,
          organizationId: ORG_B,
          providerKey: "future-provider",
          status: "ACTIVE",
          capabilities: ["ACTIVE_LISTINGS"],
        },
      ],
    });
    // future-provider unrecognized → only TRREB/proptx
    const ent = await resolveWorkspaceListingEntitlement({
      trustedWorkspaceId: WS_HOUZZAT,
      prisma: prisma as never,
    });
    assert.equal(ent.authorities.length, 1);
    assert.equal(ent.authorities[0]!.organizationId, TRREB);
    assert.equal(ent.authorities[0]!.providerKey, "proptx");

    // Cross-product denial via helper (simulate two recognized pairs by
    // temporarily treating both as proptx-shaped authorities in memory)
    const multi = {
      workspaceId: WS_HOUZZAT,
      authorities: [
        {
          organizationId: TRREB,
          providerKey: "proptx",
          sourceAuthorityKey: `${TRREB}:proptx`,
          capabilities: ["ACTIVE_LISTINGS"] as const,
        },
        {
          organizationId: ORG_B,
          providerKey: "proptx",
          sourceAuthorityKey: `${ORG_B}:proptx`,
          capabilities: ["ACTIVE_LISTINGS"] as const,
        },
      ],
    };
    assert.equal(
      entitlementAllowsProvenance(
        multi,
        { organizationId: TRREB, providerKey: "proptx" },
        "ACTIVE_LISTINGS",
      ),
      true,
    );
    assert.equal(
      entitlementAllowsProvenance(
        multi,
        { organizationId: ORG_B, providerKey: "proptx" },
        "ACTIVE_LISTINGS",
      ),
      true,
    );
    // Cross product A/wrong: same providers appear, but wrong pairing denied
    // (ORG_B is not paired with a different provider key in this fixture;
    // deny wrong org+provider combo that isn't an exact row)
    assert.equal(
      entitlementAllowsProvenance(
        multi,
        { organizationId: TRREB, providerKey: "other" },
        "ACTIVE_LISTINGS",
      ),
      false,
    );
    console.log("[5] exact pairs + cross-product denial... PASS");
  }

  // Stronger cross-product: OrgA+P1 and OrgB+P2 where both keys appear
  {
    const multi = {
      workspaceId: WS_HOUZZAT,
      authorities: [
        {
          organizationId: "orgA",
          providerKey: "p1",
          sourceAuthorityKey: "orgA:p1",
          capabilities: ["ACTIVE_LISTINGS", "SOLD"] as ListingDataCapability[],
        },
        {
          organizationId: "orgB",
          providerKey: "p2",
          sourceAuthorityKey: "orgB:p2",
          capabilities: ["ACTIVE_LISTINGS", "SOLD"] as ListingDataCapability[],
        },
      ],
    };
    assert.equal(
      entitlementAllowsProvenance(
        multi,
        { organizationId: "orgA", providerKey: "p1" },
        "ACTIVE_LISTINGS",
      ),
      true,
    );
    assert.equal(
      entitlementAllowsProvenance(
        multi,
        { organizationId: "orgB", providerKey: "p2" },
        "SOLD",
      ),
      true,
    );
    assert.equal(
      entitlementAllowsProvenance(
        multi,
        { organizationId: "orgA", providerKey: "p2" },
        "ACTIVE_LISTINGS",
      ),
      false,
    );
    assert.equal(
      entitlementAllowsProvenance(
        multi,
        { organizationId: "orgB", providerKey: "p1" },
        "ACTIVE_LISTINGS",
      ),
      false,
    );
    console.log("[6] multi-authority cross-product impossible... PASS");
  }

  // --- Provenance helper edge cases ---
  {
    const ent = {
      workspaceId: WS_HOUZZAT,
      authorities: [
        {
          organizationId: TRREB,
          providerKey: "proptx",
          sourceAuthorityKey: `${TRREB}:proptx`,
          capabilities: ["ACTIVE_LISTINGS"] as ListingDataCapability[],
        },
      ],
    };
    assert.equal(
      entitlementAllowsProvenance(
        ent,
        { organizationId: null, providerKey: "proptx" },
        "ACTIVE_LISTINGS",
      ),
      false,
    );
    assert.equal(
      entitlementAllowsProvenance(
        ent,
        { organizationId: TRREB, providerKey: null },
        "ACTIVE_LISTINGS",
      ),
      false,
    );
    assert.equal(
      entitlementAllowsProvenance(
        ent,
        { organizationId: TRREB, providerKey: "proptx" },
        "MEDIA",
      ),
      false,
    );
    assert.equal(
      entitlementAllowsProvenance(
        ent,
        { organizationId: "wrong", providerKey: "proptx" },
        "ACTIVE_LISTINGS",
      ),
      false,
    );
    console.log("[7] provenance helper null/mismatch... PASS");
  }

  // --- Blank provider on connection ---
  {
    const prisma = createFakePrisma({
      memberships: [
        {
          workspaceId: WS_HOUZZAT,
          organizationId: TRREB,
          status: "VERIFIED",
        },
      ],
      connections: [
        {
          workspaceId: WS_HOUZZAT,
          organizationId: TRREB,
          providerKey: "   ",
          status: "ACTIVE",
          capabilities: ALL_CAPS,
        },
      ],
    });
    const ent = await resolveWorkspaceListingEntitlement({
      trustedWorkspaceId: WS_HOUZZAT,
      prisma: prisma as never,
    });
    assert.deepEqual(ent.authorities, []);
    console.log("[8] blank providerKey denied... PASS");
  }

  // --- Tenant isolation ---
  {
    const prisma = createFakePrisma({
      memberships: [
        {
          workspaceId: WS_HOUZZAT,
          organizationId: TRREB,
          status: "VERIFIED",
        },
      ],
      connections: [
        {
          workspaceId: WS_HOUZZAT,
          organizationId: TRREB,
          providerKey: "proptx",
          status: "ACTIVE",
          capabilities: ALL_CAPS,
        },
      ],
    });
    const other = await resolveWorkspaceListingEntitlement({
      trustedWorkspaceId: WS_OTHER,
      prisma: prisma as never,
    });
    assert.deepEqual(other.authorities, []);
    assert.notEqual(WS_OTHER, HOUZZAT_PROD_ID);
    console.log("[9] tenant isolation / no Houzzat inheritance... PASS");
  }

  // --- Adversarial: cross-workspace same-org isolation ---
  // Workspace A: VERIFIED Org X, no ACTIVE connection.
  // Workspace B: ACTIVE connection for Org X (same orgId).
  // A must not inherit B's connection.
  {
    const ORG_X = "org_shared_cross_workspace";
    const WS_A = "ws_adversarial_a";
    const WS_B = "ws_adversarial_b";
    const prisma = createFakePrisma({
      memberships: [
        { workspaceId: WS_A, organizationId: ORG_X, status: "VERIFIED" },
        // B may or may not be VERIFIED; connection alone must not authorize A
        { workspaceId: WS_B, organizationId: ORG_X, status: "VERIFIED" },
      ],
      connections: [
        {
          workspaceId: WS_B,
          organizationId: ORG_X,
          providerKey: "proptx",
          status: "ACTIVE",
          capabilities: ALL_CAPS,
        },
      ],
    });
    const forA = await resolveWorkspaceListingEntitlement({
      trustedWorkspaceId: WS_A,
      prisma: prisma as never,
    });
    assert.deepEqual(forA.authorities, []);
    const forB = await resolveWorkspaceListingEntitlement({
      trustedWorkspaceId: WS_B,
      prisma: prisma as never,
    });
    assert.equal(forB.authorities.length, 1);
    assert.equal(forB.authorities[0]!.organizationId, ORG_X);
    console.log("[9b] cross-workspace same-org isolation... PASS");
  }

  // --- Adversarial: same org / multi-provider capability ownership ---
  // Test-only normalizeProviderKey injection (production registry unchanged).
  {
    const ORG_X = "org_multi_provider";
    const PROVIDER_A = "provider-a";
    const PROVIDER_B = "provider-b";
    const testNormalize = (
      raw: string | null | undefined,
    ): string | null => {
      if (typeof raw !== "string") return null;
      const key = raw.trim().toLowerCase();
      if (key === PROVIDER_A || key === PROVIDER_B) return key;
      return null;
    };
    // Confirm production registry still rejects these keys
    assert.equal(normalizeRecognizedListingProviderKey(PROVIDER_A), null);
    assert.equal(normalizeRecognizedListingProviderKey(PROVIDER_B), null);

    const prisma = createFakePrisma({
      memberships: [
        {
          workspaceId: WS_HOUZZAT,
          organizationId: ORG_X,
          status: "VERIFIED",
        },
      ],
      connections: [
        {
          workspaceId: WS_HOUZZAT,
          organizationId: ORG_X,
          providerKey: PROVIDER_A,
          status: "ACTIVE",
          capabilities: ["ACTIVE_LISTINGS"],
        },
        {
          workspaceId: WS_HOUZZAT,
          organizationId: ORG_X,
          providerKey: PROVIDER_B,
          status: "ACTIVE",
          capabilities: ["SOLD"],
        },
      ],
    });

    const ent = await resolveWorkspaceListingEntitlement({
      trustedWorkspaceId: WS_HOUZZAT,
      prisma: prisma as never,
      normalizeProviderKey: testNormalize,
    });
    assert.equal(ent.authorities.length, 2);
    const authA = ent.authorities.find((a) => a.providerKey === PROVIDER_A);
    const authB = ent.authorities.find((a) => a.providerKey === PROVIDER_B);
    assert.ok(authA);
    assert.ok(authB);
    assert.deepEqual([...authA!.capabilities], ["ACTIVE_LISTINGS"]);
    assert.deepEqual([...authB!.capabilities], ["SOLD"]);

    // A cannot borrow SOLD; B cannot borrow ACTIVE_LISTINGS
    assert.equal(
      entitlementAllowsProvenance(
        ent,
        { organizationId: ORG_X, providerKey: PROVIDER_A },
        "SOLD",
      ),
      false,
    );
    assert.equal(
      entitlementAllowsProvenance(
        ent,
        { organizationId: ORG_X, providerKey: PROVIDER_B },
        "ACTIVE_LISTINGS",
      ),
      false,
    );
    assert.equal(
      entitlementAllowsProvenance(
        ent,
        { organizationId: ORG_X, providerKey: PROVIDER_A },
        "ACTIVE_LISTINGS",
      ),
      true,
    );
    assert.equal(
      entitlementAllowsProvenance(
        ent,
        { organizationId: ORG_X, providerKey: PROVIDER_B },
        "SOLD",
      ),
      true,
    );

    const onlyListings = await resolveWorkspaceListingEntitlement({
      trustedWorkspaceId: WS_HOUZZAT,
      requiredCapability: "ACTIVE_LISTINGS",
      prisma: prisma as never,
      normalizeProviderKey: testNormalize,
    });
    assert.equal(onlyListings.authorities.length, 1);
    assert.equal(onlyListings.authorities[0]!.providerKey, PROVIDER_A);

    const onlySold = await resolveWorkspaceListingEntitlement({
      trustedWorkspaceId: WS_HOUZZAT,
      requiredCapability: "SOLD",
      prisma: prisma as never,
      normalizeProviderKey: testNormalize,
    });
    assert.equal(onlySold.authorities.length, 1);
    assert.equal(onlySold.authorities[0]!.providerKey, PROVIDER_B);

    console.log("[9c] multi-provider capability ownership... PASS");
  }

  // --- Adversarial: provider case mismatch (fail-closed) ---
  // Authority stores normalized `proptx`; provenance `PropTx` is trimmed only
  // (no lowercase) → DENIED. Intentional fail-closed; do not soften.
  {
    const ent = {
      workspaceId: WS_HOUZZAT,
      authorities: [
        {
          organizationId: TRREB,
          providerKey: "proptx",
          sourceAuthorityKey: `${TRREB}:proptx`,
          capabilities: ["ACTIVE_LISTINGS"] as ListingDataCapability[],
        },
      ],
    };
    assert.equal(
      entitlementAllowsProvenance(
        ent,
        { organizationId: TRREB, providerKey: "PropTx" },
        "ACTIVE_LISTINGS",
      ),
      false,
    );
    assert.equal(
      entitlementAllowsProvenance(
        ent,
        { organizationId: TRREB, providerKey: "proptx" },
        "ACTIVE_LISTINGS",
      ),
      true,
    );
    console.log("[9d] provider case mismatch fail-closed... PASS");
  }

  // --- Adversarial: empty capability connection ---
  {
    const prisma = createFakePrisma({
      memberships: [
        {
          workspaceId: WS_HOUZZAT,
          organizationId: TRREB,
          status: "VERIFIED",
        },
      ],
      connections: [
        {
          workspaceId: WS_HOUZZAT,
          organizationId: TRREB,
          providerKey: "proptx",
          status: "ACTIVE",
          capabilities: [],
        },
      ],
    });
    const ent = await resolveWorkspaceListingEntitlement({
      trustedWorkspaceId: WS_HOUZZAT,
      prisma: prisma as never,
    });
    // Current contract: authority may exist with empty capabilities
    assert.equal(ent.authorities.length, 1);
    assert.deepEqual([...ent.authorities[0]!.capabilities], []);
    assert.equal(entitlementHasCapability(ent, "ACTIVE_LISTINGS"), false);
    assert.equal(
      entitlementAllowsProvenance(
        ent,
        { organizationId: TRREB, providerKey: "proptx" },
        "ACTIVE_LISTINGS",
      ),
      false,
    );
    const filtered = await resolveWorkspaceListingEntitlement({
      trustedWorkspaceId: WS_HOUZZAT,
      requiredCapability: "ACTIVE_LISTINGS",
      prisma: prisma as never,
    });
    assert.equal(filtered.authorities.length, 0);
    console.log("[9e] empty-capability connection... PASS");
  }

  // --- Host authority wrapper ---
  {
    const hostDeps = createFixtureAuthoritativeHostDeps(HOST_ROWS);
    const prisma = createFakePrisma({
      memberships: [
        {
          workspaceId: WS_HOUZZAT,
          organizationId: TRREB,
          status: "VERIFIED",
        },
      ],
      connections: [
        {
          workspaceId: WS_HOUZZAT,
          organizationId: TRREB,
          providerKey: "proptx",
          status: "ACTIVE",
          capabilities: ALL_CAPS,
        },
      ],
    });

    const ok = await resolveListingEntitlementForHostname({
      hostname: "houzzat.houzzatpro.com",
      hostDeps,
      prisma: prisma as never,
    });
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.host.workspaceId, WS_HOUZZAT);
      assert.equal(ok.entitlement.authorities.length, 1);
    }

    const unknown = await resolveListingEntitlementForHostname({
      hostname: "unknown.example.com",
      hostDeps,
      prisma: prisma as never,
    });
    assert.equal(unknown.ok, false);
    if (!unknown.ok) {
      assert.equal(unknown.reason, "domain_not_found");
      assert.notEqual(unknown.hostname, null);
    }

    const inactiveDomain = await resolveListingEntitlementForHostname({
      hostname: "inactive-domain.houzzatpro.com",
      hostDeps,
      prisma: prisma as never,
    });
    assert.equal(inactiveDomain.ok, false);
    if (!inactiveDomain.ok) {
      assert.equal(inactiveDomain.reason, "domain_inactive");
    }

    const inactiveWs = await resolveListingEntitlementForHostname({
      hostname: "inactive-ws.houzzatpro.com",
      hostDeps,
      prisma: prisma as never,
    });
    assert.equal(inactiveWs.ok, false);
    if (!inactiveWs.ok) {
      assert.equal(inactiveWs.reason, "workspace_suspended");
    }

    // No legacy Houzzat fallback for unknown
    assert.ok(
      !unknown.ok ||
        (unknown.ok && unknown.entitlement.workspaceId !== HOUZZAT_PROD_ID),
    );
    console.log("[10] hostname G.7C wrapper... PASS");
  }

  // --- Infra failure throws ---
  {
    await assert.rejects(
      () =>
        resolveWorkspaceListingEntitlement({
          trustedWorkspaceId: WS_HOUZZAT,
          prisma: createThrowingPrisma() as never,
        }),
      /SIMULATED_PRISMA_OUTAGE/,
    );
    console.log("[11] Prisma failure throws... PASS");
  }

  // --- Architecture independence scans ---
  {
    const resolveSrc = read(
      "src/lib/tenancy/listing-entitlement/resolve.ts",
    );
    const hostSrc = read(
      "src/lib/tenancy/listing-entitlement/resolve-for-hostname.ts",
    );
    const indexSrc = read("src/lib/tenancy/listing-entitlement/index.ts");
    const all = resolveSrc + hostSrc + indexSrc;
    assert.ok(resolveSrc.includes("trustedWorkspaceId"));
    assert.ok(resolveSrc.includes("INTERNAL"));
    assert.ok(hostSrc.includes("resolveAuthoritativeWorkspaceFromHostname"));
    assert.ok(!hostSrc.includes("resolveWorkspaceFromHostname"));
    assert.ok(!all.includes("WorkspaceMember"));
    assert.ok(!all.includes("WorkspaceTeamMember"));
    assert.ok(!all.includes("professionalIdentity"));
    assert.ok(!all.includes("typesenseSearch"));
    assert.ok(!all.includes("G5_ENTITLEMENT_FILTERING_ENABLED"));
    assert.ok(!resolveSrc.includes("$transaction"));
    assert.ok(!resolveSrc.includes("updateMany"));
    // Must not consult listing rows for authority
    assert.ok(!resolveSrc.includes("prisma.listing"));
    assert.ok(!resolveSrc.includes("db.listing"));

    const provider = read("src/lib/listings/provider.ts");
    assert.ok(!provider.includes("resolveWorkspaceListingEntitlement"));
    assert.ok(!provider.includes("resolveListingEntitlementForHostname"));
    const search = read("src/lib/typesense/search.ts");
    assert.ok(!search.includes("resolveWorkspaceListingEntitlement"));
    assert.ok(!search.includes("resolveListingEntitlementForHostname"));
    assert.ok(!search.includes("listing-entitlement"));

    console.log("[12] independence + no listing behavior change... PASS");
  }

  console.log("\nstage-6.11g10a-listing-entitlement:selftest ok\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
