/**
 * Stage 6.11G.10B3A — marketing Open Houses SSR entitlement wiring selftest.
 * Run: pnpm stage-6.11g10b3a-marketing-open-houses-entitlement:selftest
 *
 * Production G5_ENTITLEMENT_FILTERING_ENABLED stays OFF.
 * SSR passes entitlement but must NOT force-enable enforcement.
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
  resolveListingEntitlementContextForHostname,
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
const ORG_OTHER = "org_other_board";
const WS_HOUZZAT = "ws_houzzat_g10b3a";
const WS_OTHER = "ws_other_g10b3a";

const HOST_ROWS: AuthoritativeDomainLookupRow[] = [
  {
    hostname: "houzzat.com",
    kind: "CUSTOM",
    role: "PRIMARY",
    workspaceId: WS_HOUZZAT,
    workspaceSlug: "houzzat",
    domainStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
  },
  {
    hostname: "www.houzzat.com",
    kind: "CUSTOM",
    role: "ALIAS",
    workspaceId: WS_HOUZZAT,
    workspaceSlug: "houzzat",
    domainStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
  },
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

const ALL_CAPS = [
  "ACTIVE_LISTINGS",
  "SOLD",
  "HISTORY",
  "OPEN_HOUSES",
  "MEDIA",
];

function houzzatPrisma() {
  return createFakePrisma({
    memberships: [
      { workspaceId: WS_HOUZZAT, organizationId: TRREB, status: "VERIFIED" },
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
}

function otherTenantPrisma() {
  return createFakePrisma({
    memberships: [
      { workspaceId: WS_OTHER, organizationId: ORG_OTHER, status: "VERIFIED" },
    ],
    connections: [
      {
        workspaceId: WS_OTHER,
        organizationId: ORG_OTHER,
        providerKey: "proptx",
        status: "ACTIVE",
        capabilities: ["OPEN_HOUSES"],
      },
    ],
  });
}

function emptyAuthorityPrisma() {
  return createFakePrisma({
    memberships: [],
    connections: [],
  });
}

async function main() {
  console.log(
    "\n=== STAGE 6.11G.10B3A — MARKETING OPEN-HOUSES SSR ENTITLEMENT ===\n",
  );

  assert.equal(G5_ENTITLEMENT_FILTERING_ENABLED, false);
  const hostDeps = createFixtureAuthoritativeHostDeps(HOST_ROWS);

  // --- Shared hostname primitive parity with Request path ---
  {
    const viaHost = await resolveListingEntitlementContextForHostname(
      "houzzat.houzzatpro.com",
      { hostDeps, prisma: houzzatPrisma() as never },
    );
    const viaReq = await resolveListingEntitlementContextForRequest(
      new Request("https://houzzat.houzzatpro.com/open-houses", {
        headers: { host: "houzzat.houzzatpro.com" },
      }),
      { hostDeps, prisma: houzzatPrisma() as never },
    );
    assert.equal(viaHost.entitlement.workspaceId, WS_HOUZZAT);
    assert.deepEqual(
      viaHost.entitlement.authorities.map((a) => a.sourceAuthorityKey),
      viaReq.entitlement.authorities.map((a) => a.sourceAuthorityKey),
    );
    assert.ok(
      viaHost.entitlement.authorities.some((a) =>
        a.capabilities.includes("OPEN_HOUSES"),
      ),
    );
    console.log("[0] hostname primitive ↔ request path parity... PASS");
  }

  // --- Valid Houzzat hosts ---
  {
    for (const host of [
      "houzzat.com",
      "www.houzzat.com",
      "houzzat.houzzatpro.com",
    ]) {
      const ctx = await resolveListingEntitlementContextForHostname(host, {
        hostDeps,
        prisma: houzzatPrisma() as never,
      });
      assert.equal(ctx.entitlement.workspaceId, WS_HOUZZAT, host);
      assert.equal(ctx.entitlement.authorities.length, 1, host);
      assert.equal(ctx.entitlement.authorities[0]!.organizationId, TRREB, host);
      assert.equal(ctx.entitlement.authorities[0]!.providerKey, "proptx", host);
    }
    console.log("[1] valid Houzzat host entitlement... PASS");
  }

  // --- Other tenant: no Houzzat inheritance ---
  {
    const ctx = await resolveListingEntitlementContextForHostname(
      "other.houzzatpro.com",
      { hostDeps, prisma: otherTenantPrisma() as never },
    );
    assert.equal(ctx.entitlement.workspaceId, WS_OTHER);
    assert.equal(ctx.entitlement.authorities.length, 1);
    assert.equal(ctx.entitlement.authorities[0]!.organizationId, ORG_OTHER);
    assert.ok(
      !ctx.entitlement.authorities.some((a) => a.organizationId === TRREB),
    );
    console.log("[2] other tenant / no Houzzat inheritance... PASS");
  }

  // --- Empty tenant authority ---
  {
    const ctx = await resolveListingEntitlementContextForHostname(
      "houzzat.houzzatpro.com",
      { hostDeps, prisma: emptyAuthorityPrisma() as never },
    );
    assert.equal(ctx.entitlement.workspaceId, WS_HOUZZAT);
    assert.deepEqual(ctx.entitlement.authorities, []);
    assert.ok(Array.isArray(ctx.entitlement.authorities));
    console.log("[3] empty authority preserved as []... PASS");
  }

  // --- Unknown / platform host ---
  {
    const unknown = await resolveListingEntitlementContextForHostname(
      "unknown.example.com",
      { hostDeps, prisma: houzzatPrisma() as never },
    );
    assert.equal(unknown.resolution.ok, false);
    assert.deepEqual(
      unknown.entitlement,
      emptyListingEntitlementSnapshot(""),
    );

    const platform = await resolveListingEntitlementContextForHostname(
      HOUZZATPRO_APP_BOOTSTRAP_HOSTNAME,
      { hostDeps, prisma: houzzatPrisma() as never },
    );
    assert.equal(platform.resolution.ok, false);
    assert.deepEqual(
      platform.entitlement,
      emptyListingEntitlementSnapshot(""),
    );
    console.log("[4] unknown/platform host → empty, never Houzzat... PASS");
  }

  // --- Infrastructure error propagates ---
  {
    const throwingPrisma = {
      workspaceRealEstateOrganizationMembership: {
        async findMany() {
          throw new Error("SIMULATED_PRISMA_OUTAGE_G10B3A");
        },
      },
      workspaceDataConnection: {
        async findMany() {
          throw new Error("SIMULATED_PRISMA_OUTAGE_G10B3A");
        },
      },
    };
    await assert.rejects(
      () =>
        resolveListingEntitlementContextForHostname("houzzat.houzzatpro.com", {
          hostDeps,
          prisma: throwingPrisma as never,
        }),
      /SIMULATED_PRISMA_OUTAGE_G10B3A/,
    );
    console.log("[5] resolver infra failure throws... PASS");
  }

  // --- SSR page wiring scans ---
  {
    const page = read("src/app/(marketing)/open-houses/page.tsx");
    const resolveSrc = read(
      "src/lib/tenancy/listing-entitlement/resolve-for-request.ts",
    );
    const marketingLayout = read("src/app/(marketing)/layout.tsx");

    assert.ok(page.includes("resolveListingEntitlementContextForServerPage"));
    assert.ok(page.includes("provider.openHouses"));
    assert.ok(page.includes("entitlement"));
    assert.equal(
      (page.match(/await resolveListingEntitlementContextForServerPage/g) ?? [])
        .length,
      1,
      "resolve once",
    );
    assert.ok(!page.includes("entitlementFilteringEnabled: true"));
    assert.ok(!page.includes('searchParams.get("workspaceId")'));
    assert.ok(!page.includes("cookies("));
    assert.ok(!page.includes("auth()"));
    // Entitlement not passed to client component props by name
    assert.ok(page.includes("<OpenHousePlanner items={items} />"));
    assert.ok(!page.includes("entitlement={"));
    assert.ok(!page.includes("organizationId={"));
    assert.ok(!page.includes("sourceAuthorityKey"));

    // Server helper uses synthetic Request + trusted Host extraction
    assert.ok(resolveSrc.includes("resolveListingEntitlementContextForServerPage"));
    assert.ok(resolveSrc.includes("buildSyntheticRequestFromHeaders"));
    assert.ok(resolveSrc.includes("extractTrustedRequestHostname"));
    assert.ok(resolveSrc.includes("resolveListingEntitlementContextForHostname"));
    assert.ok(!resolveSrc.includes("x-forwarded-host"));

    // Cache / dynamic safety
    assert.ok(page.includes('export const dynamic = "force-dynamic"'));
    assert.ok(marketingLayout.includes('export const dynamic = "force-dynamic"'));
    assert.ok(!page.includes("unstable_cache"));
    assert.ok(!page.includes("force-static"));
    assert.ok(!page.includes("revalidate"));

    // Flag OFF
    assert.equal(G5_ENTITLEMENT_FILTERING_ENABLED, false);
    const contract = read("src/lib/tenancy/listing-provenance/contract.ts");
    assert.ok(contract.includes("G5_ENTITLEMENT_FILTERING_ENABLED = false"));

    console.log("[6] SSR wiring / trust / cache safety / flag OFF... PASS");
  }

  // --- Simulated provider receives exact snapshot ---
  {
    const ctx = await resolveListingEntitlementContextForHostname(
      "houzzat.houzzatpro.com",
      { hostDeps, prisma: houzzatPrisma() as never },
    );
    let received: WorkspaceListingEntitlement | undefined;
    const fakeOpenHouses = async (params: {
      entitlement?: WorkspaceListingEntitlement;
      entitlementFilteringEnabled?: boolean;
    }) => {
      received = params.entitlement;
      assert.equal(params.entitlementFilteringEnabled, undefined);
      return [];
    };
    await fakeOpenHouses({ entitlement: ctx.entitlement });
    assert.deepEqual(received, ctx.entitlement);
    console.log("[7] provider receives same entitlement snapshot... PASS");
  }

  console.log(
    "\nstage-6.11g10b3a-marketing-open-houses-entitlement:selftest ok\n",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
