/**
 * Stage 6.10B — CREATE_PLATFORM_DOMAIN provisioning selftest.
 * Run: pnpm stage-6.10b-platform-domain-provisioning:selftest
 *
 * No real DB writes. Fake Prisma + ensureWorkspacePlatformDomain unit cases.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import {
  PROVISIONING_STEP_KEYS,
  ensureWorkspacePlatformDomain,
} from "../src/lib/platform/provisioning";
import {
  assertHostnameClaimable,
  assertPlatformDomainMatchesSlug,
  blocksTenantHostnameResolution,
} from "../src/lib/tenancy/reserved-domains";
import { platformHostnameForWorkspaceSlug } from "../src/lib/tenancy/platform-hostname";
import {
  clearHostResolutionCacheForTests,
  createFixtureHostResolutionDeps,
  resolveWorkspaceFromHostname,
} from "../src/lib/tenancy/resolve-workspace-host";

const root = process.cwd();
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

type DomainRow = {
  id: string;
  workspaceId: string;
  hostname: string;
  kind: "PLATFORM" | "CUSTOM";
  role: "PRIMARY" | "ALIAS";
  status: "PENDING" | "ACTIVE" | "DISABLED";
  verifiedAt: Date | null;
  verificationToken: string | null;
};

function createDomainPrisma(state: {
  workspaces: Map<string, { id: string; slug: string }>;
  domains: DomainRow[];
  nextId: number;
}): PrismaClient {
  const id = (prefix: string) => `${prefix}_${state.nextId++}`;
  return {
    workspace: {
      async findUnique({ where }: { where: { id: string } }) {
        const ws = state.workspaces.get(where.id);
        return ws ? { ...ws } : null;
      },
    },
    workspaceDomain: {
      async findUnique({ where }: { where: { hostname: string } }) {
        const hit = state.domains.find((d) => d.hostname === where.hostname);
        return hit ? { ...hit } : null;
      },
      async findFirst({
        where,
      }: {
        where: { workspaceId: string; kind: string };
      }) {
        const hit = state.domains.find(
          (d) =>
            d.workspaceId === where.workspaceId && d.kind === where.kind,
        );
        return hit ? { ...hit } : null;
      },
      async create({ data }: { data: Record<string, unknown> }) {
        const hostname = String(data.hostname);
        if (state.domains.some((d) => d.hostname === hostname)) {
          const err = new Error("Unique") as Error & { code: string };
          err.code = "P2002";
          throw err;
        }
        const row: DomainRow = {
          id: id("dom"),
          workspaceId: String(data.workspaceId),
          hostname,
          kind: data.kind as DomainRow["kind"],
          role: data.role as DomainRow["role"],
          status: data.status as DomainRow["status"],
          verifiedAt: (data.verifiedAt as Date | null) ?? null,
          verificationToken: (data.verificationToken as string | null) ?? null,
        };
        state.domains.push(row);
        return { ...row };
      },
    },
  } as unknown as PrismaClient;
}

async function main() {
  console.log("\n=== STAGE 6.10B — PLATFORM DOMAIN PROVISIONING ===\n");

  // 0. Source / sequence guards
  {
    const constants = read("src/lib/platform/provisioning/constants.ts");
    const steps = read("src/lib/platform/provisioning/steps.ts");
    const helper = read("src/lib/platform/provisioning/create-platform-domain.ts");
    assert.equal(PROVISIONING_STEP_KEYS.length, 12);
    assert.ok(PROVISIONING_STEP_KEYS.includes("CREATE_PLATFORM_DOMAIN"));
    assert.ok(steps.includes("CREATE_PLATFORM_DOMAIN: stepCreatePlatformDomain"));
    assert.ok(steps.includes("ensureWorkspacePlatformDomain"));
    assert.ok(!/\$transaction\s*\(/.test(helper));
    assert.ok(!/\.updateMany\s*\(/.test(helper));
    assert.ok(!/\$transaction\s*\(/.test(steps));
    assert.ok(helper.includes("trustedPlatformSeed: true"));
    assert.ok(helper.includes('kind: "PLATFORM"'));
    assert.ok(helper.includes('role: "PRIMARY"'));
    assert.ok(helper.includes('status: "ACTIVE"'));
    assert.ok(constants.includes("WORKSPACE_PLATFORM_DOMAIN_CREATED"));
    const brandingIdx = PROVISIONING_STEP_KEYS.indexOf(
      "CREATE_BRANDING_FOUNDATION",
    );
    const domainIdx = PROVISIONING_STEP_KEYS.indexOf("CREATE_PLATFORM_DOMAIN");
    const activeIdx = PROVISIONING_STEP_KEYS.indexOf("MARK_WORKSPACE_ACTIVE");
    assert.equal(domainIdx, brandingIdx + 1);
    assert.ok(domainIdx < activeIdx);
    console.log("[0] Step sequence + Neon HTTP guards... PASS");
  }

  // 1. Happy path create
  {
    const state = {
      workspaces: new Map([
        ["ws_new", { id: "ws_new", slug: "rivera-brokerage" }],
      ]),
      domains: [] as DomainRow[],
      nextId: 1,
    };
    const prisma = createDomainPrisma(state);
    const result = await ensureWorkspacePlatformDomain({
      prisma,
      workspaceId: "ws_new",
      now: new Date("2026-09-05T00:00:00.000Z"),
    });
    assert.equal(result.outcome, "created");
    if (result.outcome !== "created") throw new Error("expected created");
    assert.equal(result.hostname, "rivera-brokerage.houzzatpro.com");
    const row = state.domains[0]!;
    assert.equal(row.kind, "PLATFORM");
    assert.equal(row.role, "PRIMARY");
    assert.equal(row.status, "ACTIVE");
    assert.equal(row.verifiedAt?.toISOString(), "2026-09-05T00:00:00.000Z");
    assert.equal(row.verificationToken, null);
    console.log("[1] Creates PLATFORM/PRIMARY/ACTIVE domain... PASS");
  }

  // 2. Idempotent retry
  {
    const state = {
      workspaces: new Map([
        ["ws_new", { id: "ws_new", slug: "rivera-brokerage" }],
      ]),
      domains: [] as DomainRow[],
      nextId: 1,
    };
    const prisma = createDomainPrisma(state);
    const first = await ensureWorkspacePlatformDomain({
      prisma,
      workspaceId: "ws_new",
    });
    const second = await ensureWorkspacePlatformDomain({
      prisma,
      workspaceId: "ws_new",
    });
    assert.equal(first.outcome, "created");
    assert.equal(second.outcome, "already_matches");
    assert.equal(state.domains.length, 1);
    console.log("[2] Retry same workspace/hostname is idempotent... PASS");
  }

  // 3. Hostname owned by another workspace
  {
    const state = {
      workspaces: new Map([
        ["ws_a", { id: "ws_a", slug: "alpha-realty" }],
        ["ws_b", { id: "ws_b", slug: "alpha-realty-x" }],
      ]),
      domains: [
        {
          id: "dom_taken",
          workspaceId: "ws_other",
          hostname: "alpha-realty.houzzatpro.com",
          kind: "PLATFORM" as const,
          role: "PRIMARY" as const,
          status: "ACTIVE" as const,
          verifiedAt: new Date(),
          verificationToken: null,
        },
      ],
      nextId: 1,
    };
    // Force slug hostname collision: workspace ws_a wants alpha-realty.houzzatpro.com
    const prisma = createDomainPrisma(state);
    const result = await ensureWorkspacePlatformDomain({
      prisma,
      workspaceId: "ws_a",
    });
    assert.equal(result.outcome, "failed");
    if (result.outcome === "failed") {
      assert.ok(result.error.includes("another workspace"));
    }
    assert.equal(state.domains.length, 1);
    console.log("[3] Foreign hostname ownership fails... PASS");
  }

  // 4. Different PLATFORM already on workspace
  {
    const state = {
      workspaces: new Map([
        ["ws_new", { id: "ws_new", slug: "beta-team" }],
      ]),
      domains: [
        {
          id: "dom_other",
          workspaceId: "ws_new",
          hostname: "legacy-beta.houzzatpro.com",
          kind: "PLATFORM" as const,
          role: "PRIMARY" as const,
          status: "ACTIVE" as const,
          verifiedAt: new Date(),
          verificationToken: null,
        },
      ],
      nextId: 1,
    };
    const prisma = createDomainPrisma(state);
    const result = await ensureWorkspacePlatformDomain({
      prisma,
      workspaceId: "ws_new",
    });
    assert.equal(result.outcome, "failed");
    if (result.outcome === "failed") {
      assert.ok(result.error.includes("different PLATFORM"));
    }
    assert.equal(state.domains.length, 1);
    console.log("[4] Different PLATFORM on workspace fails... PASS");
  }

  // 5. Reserved slug rejected
  {
    const reserved = platformHostnameForWorkspaceSlug("app");
    assert.equal(reserved.ok, false);
    const claim = assertHostnameClaimable({
      hostname: "app.houzzatpro.com",
      kind: "PLATFORM",
      workspaceSlug: "app",
      trustedPlatformSeed: true,
    });
    assert.ok(claim);
    const state = {
      workspaces: new Map([["ws_bad", { id: "ws_bad", slug: "app" }]]),
      domains: [] as DomainRow[],
      nextId: 1,
    };
    const result = await ensureWorkspacePlatformDomain({
      prisma: createDomainPrisma(state),
      workspaceId: "ws_bad",
    });
    assert.equal(result.outcome, "failed");
    console.log("[5] Reserved slug/hostname rejected... PASS");
  }

  // 6. Incomplete/wrong existing row fails without mutation
  {
    const state = {
      workspaces: new Map([
        ["ws_new", { id: "ws_new", slug: "gamma-group" }],
      ]),
      domains: [
        {
          id: "dom_wrong",
          workspaceId: "ws_new",
          hostname: "gamma-group.houzzatpro.com",
          kind: "PLATFORM" as const,
          role: "PRIMARY" as const,
          status: "PENDING" as const,
          verifiedAt: null,
          verificationToken: "tok",
        },
      ],
      nextId: 1,
    };
    const before = { ...state.domains[0]! };
    const result = await ensureWorkspacePlatformDomain({
      prisma: createDomainPrisma(state),
      workspaceId: "ws_new",
    });
    assert.equal(result.outcome, "failed");
    assert.deepEqual(state.domains[0], before);
    console.log("[6] Wrong existing row fails without mutation... PASS");
  }

  // 7. Slug match helpers
  {
    const ok = assertPlatformDomainMatchesSlug({
      hostname: "ok-team.houzzatpro.com",
      workspaceSlug: "ok-team",
    });
    assert.equal(ok, null);
    const bad = assertPlatformDomainMatchesSlug({
      hostname: "other.houzzatpro.com",
      workspaceSlug: "ok-team",
    });
    assert.ok(bad);
    console.log("[7] Platform hostname/slug match helpers... PASS");
  }

  // 8. Unknown wildcard hostname still fail-closed (resolver)
  {
    clearHostResolutionCacheForTests();
    const prev = process.env.TENANT_DOMAIN_SCOPE;
    process.env.TENANT_DOMAIN_SCOPE = "workspace";
    try {
      const deps = createFixtureHostResolutionDeps([
        {
          hostname: "tenant-canary.houzzatpro.com",
          kind: "PLATFORM",
          role: "PRIMARY",
          workspaceId: "ws_canary",
          workspaceSlug: "tenant-canary",
          domainStatus: "ACTIVE",
          workspaceStatus: "ACTIVE",
        },
      ]);
      const unknown = await resolveWorkspaceFromHostname(
        "wildcard-security-test-xyz.houzzatpro.com",
        deps,
      );
      assert.equal(unknown.ok, false);
      if (!unknown.ok) assert.equal(unknown.reason, "domain_not_found");
      assert.equal(
        blocksTenantHostnameResolution("app.houzzatpro.com"),
        "platform_houzzatpro_app_bootstrap",
      );
    } finally {
      if (prev === undefined) delete process.env.TENANT_DOMAIN_SCOPE;
      else process.env.TENANT_DOMAIN_SCOPE = prev;
      clearHostResolutionCacheForTests();
    }
    console.log("[8] Unknown wildcard hostname fails closed... PASS");
  }

  // 9. New domain create leaves Houzzat/Canary/RE-MAX rows untouched
  {
    const remMaxId = "cmtn5glsq0005psp7z8wk891q";
    const state = {
      workspaces: new Map([
        ["ws_new", { id: "ws_new", slug: "delta-homes" }],
        [remMaxId, { id: remMaxId, slug: "re-max-realty" }],
        ["ws_houzzat", { id: "ws_houzzat", slug: "houzzat" }],
        ["ws_canary", { id: "ws_canary", slug: "tenant-canary" }],
      ]),
      domains: [
        {
          id: "dom_houzzat",
          workspaceId: "ws_houzzat",
          hostname: "houzzat.houzzatpro.com",
          kind: "PLATFORM" as const,
          role: "PRIMARY" as const,
          status: "ACTIVE" as const,
          verifiedAt: new Date("2026-01-01T00:00:00.000Z"),
          verificationToken: null,
        },
        {
          id: "dom_canary",
          workspaceId: "ws_canary",
          hostname: "tenant-canary.houzzatpro.com",
          kind: "PLATFORM" as const,
          role: "PRIMARY" as const,
          status: "ACTIVE" as const,
          verifiedAt: new Date("2026-01-01T00:00:00.000Z"),
          verificationToken: null,
        },
      ] as DomainRow[],
      nextId: 10,
    };
    const beforeProtected = JSON.stringify(
      state.domains.filter(
        (d) => d.id === "dom_houzzat" || d.id === "dom_canary",
      ),
    );
    const created = await ensureWorkspacePlatformDomain({
      prisma: createDomainPrisma(state),
      workspaceId: "ws_new",
    });
    assert.equal(created.outcome, "created");
    assert.equal(
      state.domains.some(
        (d) =>
          d.workspaceId === remMaxId ||
          d.hostname === "re-max-realty.houzzatpro.com",
      ),
      false,
    );
    assert.equal(
      JSON.stringify(
        state.domains.filter(
          (d) => d.id === "dom_houzzat" || d.id === "dom_canary",
        ),
      ),
      beforeProtected,
    );
    const helperSrc = read(
      "src/lib/platform/provisioning/create-platform-domain.ts",
    );
    const stepsSrc = read("src/lib/platform/provisioning/steps.ts");
    assert.ok(!helperSrc.includes(remMaxId));
    assert.ok(!stepsSrc.includes(remMaxId));
    assert.ok(!helperSrc.includes("re-max-realty"));
    console.log(
      "[9] New domain create leaves RE/MAX + protected domains untouched... PASS",
    );
  }

  // 10. Cloudflare/config freeze guards
  {
    assert.ok(!read("wrangler.houzzatpro.jsonc").includes("*.houzzatpro.com"));
    assert.ok(!read("wrangler.jsonc").includes("CREATE_PLATFORM_DOMAIN"));
    console.log("[10] No Cloudflare config changes in repo... PASS");
  }

  console.log("\nSTAGE 6.10B SELFTEST PASSED\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
