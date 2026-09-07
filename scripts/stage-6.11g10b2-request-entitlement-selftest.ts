/**
 * Stage 6.11G.10B2 — request-boundary listing entitlement wiring selftest.
 * Run: pnpm stage-6.11g10b2-request-entitlement:selftest
 *
 * Production G5_ENTITLEMENT_FILTERING_ENABLED stays OFF.
 * Routes pass entitlement but must NOT force-enable enforcement.
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
  emptyListingEntitlementSnapshot,
  resolveListingEntitlementContextForRequest,
  type WorkspaceListingEntitlement,
} from "@/lib/tenancy/listing-entitlement";
import { G5_ENTITLEMENT_FILTERING_ENABLED } from "@/lib/tenancy/listing-provenance";
import { HOUZZATPRO_APP_BOOTSTRAP_HOSTNAME } from "@/lib/mobile/platform-bootstrap";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const TRREB = "cmtrdf23t000091u0cw3a5zu9";
const WS_HOUZZAT = "ws_houzzat_g10b2";
const WS_OTHER = "ws_other_g10b2";
const HOUZZAT_PROD = "cmt7kfcth0000gvu0bqsycsvz";

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
    hostname: "other.houzzatpro.com",
    kind: "PLATFORM",
    role: "PRIMARY",
    workspaceId: WS_OTHER,
    workspaceSlug: "other",
    domainStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
  },
];

type MemRow = { workspaceId: string; organizationId: string; status: string };
type ConnRow = {
  workspaceId: string;
  organizationId: string;
  providerKey: string;
  status: string;
  capabilities: string[];
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

function requestForHost(hostname: string): Request {
  return new Request(`https://${hostname}/api/listings/search`, {
    headers: { host: hostname },
  });
}

async function main() {
  console.log("\n=== STAGE 6.11G.10B2 — REQUEST-BOUNDARY ENTITLEMENT WIRING ===\n");

  assert.equal(G5_ENTITLEMENT_FILTERING_ENABLED, false);

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
        capabilities: ["ACTIVE_LISTINGS", "SOLD", "OPEN_HOUSES"],
      },
    ],
  });

  // --- Host wiring ---
  {
    const houzzat = await resolveListingEntitlementContextForRequest(
      requestForHost("houzzat.houzzatpro.com"),
      { hostDeps, prisma: prisma as never },
    );
    assert.equal(houzzat.resolution.ok, true);
    assert.equal(houzzat.entitlement.workspaceId, WS_HOUZZAT);
    assert.equal(houzzat.entitlement.authorities.length, 1);
    assert.equal(houzzat.entitlement.authorities[0]!.organizationId, TRREB);
    assert.notEqual(houzzat.entitlement.workspaceId, HOUZZAT_PROD);

    const other = await resolveListingEntitlementContextForRequest(
      requestForHost("other.houzzatpro.com"),
      { hostDeps, prisma: prisma as never },
    );
    assert.equal(other.resolution.ok, true);
    assert.equal(other.entitlement.workspaceId, WS_OTHER);
    assert.deepEqual(other.entitlement.authorities, []);
    assert.notEqual(other.entitlement.workspaceId, WS_HOUZZAT);

    const unknown = await resolveListingEntitlementContextForRequest(
      requestForHost("unknown.example.com"),
      { hostDeps, prisma: prisma as never },
    );
    assert.equal(unknown.resolution.ok, false);
    assert.ok(Array.isArray(unknown.entitlement.authorities));
    assert.equal(unknown.entitlement.authorities.length, 0);
    assert.equal(unknown.entitlement.workspaceId, "");
    assert.notEqual(unknown.entitlement.workspaceId, WS_HOUZZAT);
    assert.notEqual(unknown.entitlement.workspaceId, HOUZZAT_PROD);

    console.log("[0] host wiring / no Houzzat fallback... PASS");
  }

  // --- Empty authority preserved as [] ---
  {
    const empty = emptyListingEntitlementSnapshot("ws_x");
    assert.deepEqual(empty, { workspaceId: "ws_x", authorities: [] });
    assert.notEqual(empty.authorities, undefined);

    const other = await resolveListingEntitlementContextForRequest(
      requestForHost("other.houzzatpro.com"),
      { hostDeps, prisma: prisma as never },
    );
    assert.ok(other.entitlement.authorities !== undefined);
    assert.equal(other.entitlement.authorities.length, 0);
    console.log("[1] empty authorities stay [] not undefined... PASS");
  }

  // --- Resolve once semantics for nearby (helper is single-call; route reuses) ---
  {
    let resolveCount = 0;
    const countingPrisma = {
      workspaceRealEstateOrganizationMembership: {
        findMany: async (...args: unknown[]) => {
          resolveCount += 1;
          return prisma.workspaceRealEstateOrganizationMembership.findMany(
            ...(args as [never]),
          );
        },
      },
      workspaceDataConnection: prisma.workspaceDataConnection,
    };
    const ctx = await resolveListingEntitlementContextForRequest(
      requestForHost("houzzat.houzzatpro.com"),
      { hostDeps, prisma: countingPrisma as never },
    );
    // One context resolution → one membership query (connection only if memberships)
    assert.ok(resolveCount >= 1);
    const entitlementA = ctx.entitlement;
    const entitlementB = ctx.entitlement;
    assert.equal(entitlementA, entitlementB);
    // Nearby route source: entitlement in base reused by 3 searches
    const nearbySrc = read("src/app/api/listings/nearby/route.ts");
    assert.ok(
      nearbySrc.includes("resolveListingEntitlementContextForRequest"),
    );
    // Import + single call site (not three resolutions)
    const callSites = nearbySrc.match(
      /await resolveListingEntitlementContextForRequest\(/g,
    );
    assert.equal(callSites?.length, 1);
    assert.ok(nearbySrc.includes("entitlement,"));
    console.log("[2] nearby resolve-once + reuse... PASS");
  }

  // --- Infra failure propagates ---
  {
    const throwingPrisma = {
      workspaceRealEstateOrganizationMembership: {
        async findMany() {
          throw new Error("SIMULATED_PRISMA_OUTAGE_G10B2");
        },
      },
      workspaceDataConnection: {
        async findMany() {
          throw new Error("SIMULATED_PRISMA_OUTAGE_G10B2");
        },
      },
    };
    await assert.rejects(
      () =>
        resolveListingEntitlementContextForRequest(
          requestForHost("houzzat.houzzatpro.com"),
          { hostDeps, prisma: throwingPrisma as never },
        ),
      /SIMULATED_PRISMA_OUTAGE_G10B2/,
    );
    console.log("[3] resolver infra failure throws... PASS");
  }

  // --- Route wiring scans ---
  {
    const search = read("src/app/api/listings/search/route.ts");
    const autocomplete = read("src/app/api/listings/autocomplete/route.ts");
    const openHouses = read("src/app/api/listings/open-houses/route.ts");
    const nearby = read("src/app/api/listings/nearby/route.ts");
    const places = read("src/app/api/places/autocomplete/route.ts");
    const homeRails = read("src/app/api/listings/home-rails/route.ts");
    const mobile = read("src/app/api/mobile/v2/properties/search/route.ts");

    for (const [name, src] of [
      ["search", search],
      ["autocomplete", autocomplete],
      ["open-houses", openHouses],
      ["nearby", nearby],
    ] as const) {
      assert.ok(
        src.includes("resolveListingEntitlementContextForRequest"),
        `${name} must resolve entitlement`,
      );
      assert.ok(src.includes("entitlement"), `${name} must pass entitlement`);
      assert.ok(
        !src.includes("entitlementFilteringEnabled: true"),
        `${name} must not force-enable true`,
      );
      assert.ok(
        !src.includes('searchParams.get("entitlementFilteringEnabled")'),
        `${name} must not read force-enable from client`,
      );
    }

    // Client trust: routes do not read client authority params
    assert.ok(!search.includes('searchParams.get("workspaceId")'));
    assert.ok(!search.includes('searchParams.get("organizationId")'));
    assert.ok(!search.includes('searchParams.get("sourceAuthorityKey")'));
    assert.ok(!search.includes('searchParams.get("entitlementFilteringEnabled")'));

    // Autocomplete Places unaffected
    assert.ok(!places.includes("resolveListingEntitlementContextForRequest"));
    assert.ok(!places.includes("listing-entitlement"));

    // Home rails still unwired
    assert.ok(!homeRails.includes("resolveListingEntitlementContextForRequest"));
    assert.ok(homeRails.includes("typesenseHomeRails"));

    // Mobile explicitly outside G.10B2
    assert.ok(mobile.includes("OUTSIDE request-boundary entitlement"));
    assert.ok(
      !mobile.includes("resolveListingEntitlementContextForRequest"),
    );
    assert.ok(mobile.includes(HOUZZATPRO_APP_BOOTSTRAP_HOSTNAME) || mobile.includes("app.houzzatpro.com") || mobile.includes("platform bootstrap"));

    // Entitlement not serialized into API response payloads
    assert.ok(openHouses.includes("return NextResponse.json({ items, provider:"));
    assert.ok(!search.includes("entitlement: entitlement"));
    assert.ok(!search.includes("...entitlement"));
    assert.ok(!autocomplete.includes("NextResponse.json({ entitlement"));
    assert.ok(!nearby.includes("NextResponse.json({ entitlement"));

    console.log("[4] route wiring + trust boundary + mobile outside... PASS");
  }

  // --- Flag OFF confirmation ---
  {
    assert.equal(G5_ENTITLEMENT_FILTERING_ENABLED, false);
    const contract = read(
      "src/lib/tenancy/listing-provenance/contract.ts",
    );
    assert.ok(
      contract.includes("G5_ENTITLEMENT_FILTERING_ENABLED = false"),
    );
    console.log("[5] production flag remains OFF... PASS");
  }

  // --- Type: entitlement snapshot identity ---
  {
    const sample: WorkspaceListingEntitlement = {
      workspaceId: WS_HOUZZAT,
      authorities: [],
    };
    assert.ok(sample.authorities.length === 0);
    console.log("[6] entitlement type contract... PASS");
  }

  console.log("\nstage-6.11g10b2-request-entitlement:selftest ok\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
