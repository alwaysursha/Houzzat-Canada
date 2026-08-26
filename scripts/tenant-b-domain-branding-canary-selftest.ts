/**
 * Stage 3K.4 — Tenant B domain + branding canary dry-run + fixture proofs.
 * Run: pnpm tenant-b-domain-branding-canary:selftest
 */
import { config } from "dotenv";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  TENANT_B_CANARY_BRANDING_SEED,
  TENANT_B_CANARY_DISPLAY_NAME,
  TENANT_B_CANARY_PRIMARY_HOSTNAME,
  TENANT_B_LEGACY_INTERIM_HOSTNAME,
  TENANT_B_PLATFORM_HOSTNAME,
  TENANT_B_CANARY_OWNERSHIP_EVIDENCE,
  TENANT_B_CANARY_CLOUDFLARE_REQUIREMENTS,
  TENANT_B_DOMAIN_BRANDING_CONFIRM,
  TENANT_B_DOMAIN_BRANDING_ROLLBACK_CONFIRM,
  buildTenantBDomainBrandingPlan,
  formatTenantBDomainBrandingReport,
  parseTenantBDomainBrandingArgs,
  validateTenantBDomainBrandingConfirmation,
  verifyTenantScopeGatesLegacy,
} from "./lib/tenant-b-domain-branding-canary";
import {
  HOUZZAT_PLATFORM_HOSTNAME,
  HOUZZAT_PRIMARY_HOSTNAME,
  HOUZZAT_WWW_ALIAS_HOSTNAME,
} from "./lib/tenant-branding-foundation";
import { CANARY_SLUG } from "./lib/tenant-canary-provision";
import {
  clearBrandCacheForTests,
  readBrandCache,
  writeBrandCache,
} from "../src/lib/tenancy/brand-cache";
import {
  clearHostResolutionCacheForTests,
  createFixtureHostResolutionDeps,
  resolveWorkspaceFromHostname,
  type DomainLookupRow,
} from "../src/lib/tenancy/resolve-workspace-host";
import { buildLegacyHouzzatBrand } from "../src/lib/tenancy/legacy-houzzat-brand";
import { workspaceBrandingRowToBrand } from "../src/lib/tenancy/resolve-workspace-brand";
import {
  TENANT_B_TEST_BRANDING_ROW,
  TENANT_B_TEST_WORKSPACE_ID,
} from "../src/lib/tenancy/test-fixtures/tenant-b-brand";
import { blocksTenantHostnameResolution } from "../src/lib/tenancy/reserved-domains";
import { findWorkspaceDomainForWorkspaceHostForProbe } from "../src/lib/tenancy/workspace-domain-probe";
import type { WorkspaceBranding } from "@prisma/client";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS_HOUZZAT = "ws_houzzat_fixture";
const WS_B = TENANT_B_TEST_WORKSPACE_ID;

const HOST_FIXTURE_ROWS: DomainLookupRow[] = [
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
    hostname: TENANT_B_PLATFORM_HOSTNAME,
    kind: "PLATFORM",
    role: "PRIMARY",
    workspaceId: WS_B,
    workspaceSlug: CANARY_SLUG,
    domainStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
  },
];

function tenantBBrandingRow(): WorkspaceBranding {
  return {
    ...TENANT_B_TEST_BRANDING_ROW,
    ...TENANT_B_CANARY_BRANDING_SEED,
    workspaceId: WS_B,
    createdAt: TENANT_B_TEST_BRANDING_ROW.createdAt,
    updatedAt: TENANT_B_TEST_BRANDING_ROW.updatedAt,
  };
}

async function withWorkspaceDomainScope<T>(fn: () => Promise<T>): Promise<T> {
  const prev = process.env.TENANT_DOMAIN_SCOPE;
  process.env.TENANT_DOMAIN_SCOPE = "workspace";
  return fn().finally(() => {
    if (prev === undefined) delete process.env.TENANT_DOMAIN_SCOPE;
    else process.env.TENANT_DOMAIN_SCOPE = prev;
  });
}

function testStructuralSafety() {
  const lib = read("scripts/lib/tenant-b-domain-branding-canary.ts");
  const cli = read("scripts/workspace-tenant-b-domain-branding-canary.ts");
  const middleware = read("src/middleware.ts");
  const layout = read("src/app/layout.tsx");

  assert.equal(TENANT_B_PLATFORM_HOSTNAME, "tenant-canary.houzzatpro.com");
  assert.equal(TENANT_B_LEGACY_INTERIM_HOSTNAME, "canary.houzzat.com");
  assert.ok(TENANT_B_CANARY_OWNERSHIP_EVIDENCE.length >= 3);
  assert.ok(TENANT_B_CANARY_CLOUDFLARE_REQUIREMENTS.length >= 3);
  assert.ok(!lib.includes('"alisyed.com"'));
  assert.ok(!lib.includes("'alisyed.com'"));
  assert.ok(lib.includes("DRIFT_STOP"));
  assert.ok(lib.includes("PRESERVE"));
  assert.ok(lib.includes(TENANT_B_DOMAIN_BRANDING_CONFIRM));
  assert.ok(lib.includes(TENANT_B_DOMAIN_BRANDING_ROLLBACK_CONFIRM));
  assert.ok(cli.includes("CANARY_ACK_PRODUCTION_SCOPES"));
  assert.ok(!middleware.includes("resolveWorkspaceFromRequest"));
  assert.ok(!layout.includes("resolveWorkspaceBrand"));
  assert.equal(blocksTenantHostnameResolution("houzzatpro.com"), "platform_houzzatpro_root");
  assert.equal(blocksTenantHostnameResolution(TENANT_B_PLATFORM_HOSTNAME), null);
}

function testCliGates() {
  assert.equal(
    validateTenantBDomainBrandingConfirmation({
      apply: true,
      rollback: false,
      confirm: "wrong",
    }),
    `--apply requires --confirm=${TENANT_B_DOMAIN_BRANDING_CONFIRM}`,
  );
  assert.equal(
    validateTenantBDomainBrandingConfirmation({
      apply: false,
      rollback: false,
      confirm: null,
    }),
    null,
  );
  assert.equal(
    validateTenantBDomainBrandingConfirmation({
      apply: true,
      rollback: true,
      confirm: TENANT_B_DOMAIN_BRANDING_ROLLBACK_CONFIRM,
    }),
    null,
  );

  const args = parseTenantBDomainBrandingArgs([
    "--apply",
    "--rollback",
    `--confirm=${TENANT_B_DOMAIN_BRANDING_ROLLBACK_CONFIRM}`,
  ]);
  assert.equal(args.apply, true);
  assert.equal(args.rollback, true);
}

function testTenantScopeGatesDefaultLegacy() {
  delete process.env.TENANT_DOMAIN_SCOPE;
  delete process.env.TENANT_BRANDING_SCOPE;
  delete process.env.TENANT_PUBLIC_LEAD_SCOPE;
  delete process.env.TENANT_ADMIN_HOST_LOCK;
  delete process.env.CANARY_ACK_PRODUCTION_SCOPES;

  const gates = verifyTenantScopeGatesLegacy();
  assert.equal(gates.ok, true);
  assert.equal(gates.flags.TENANT_DOMAIN_SCOPE, "legacy");
  assert.equal(gates.flags.TENANT_BRANDING_SCOPE, "legacy");
  assert.equal(gates.flags.TENANT_PUBLIC_LEAD_SCOPE, "legacy");
  assert.equal(gates.flags.TENANT_ADMIN_HOST_LOCK, "off");
}

async function testHostWorkspaceBrandMatrix() {
  await withWorkspaceDomainScope(async () => {
    clearHostResolutionCacheForTests();
    clearBrandCacheForTests();

    const deps = createFixtureHostResolutionDeps(HOST_FIXTURE_ROWS);
    const houzzatHost = await resolveWorkspaceFromHostname("houzzat.com", deps);
    const bHost = await resolveWorkspaceFromHostname(
      TENANT_B_PLATFORM_HOSTNAME,
      deps,
    );
    const unknown = await resolveWorkspaceFromHostname("unknown-example.com", deps);
    const platform = await resolveWorkspaceFromHostname("houzzatpro.com", deps);

    assert.ok(houzzatHost.ok);
    assert.equal(houzzatHost.ok && houzzatHost.workspaceId, WS_HOUZZAT);
    assert.equal(houzzatHost.ok && houzzatHost.verifiedHostname, true);

    assert.ok(bHost.ok);
    assert.equal(bHost.ok && bHost.workspaceId, WS_B);
    assert.equal(bHost.ok && bHost.workspaceSlug, CANARY_SLUG);
    assert.notEqual(bHost.ok && bHost.workspaceId, WS_HOUZZAT);

    assert.equal(unknown.ok, false);
    assert.equal(platform.ok, false);
    if (!platform.ok) assert.equal(platform.reason, "platform_surface");

    const houzzatBrand = buildLegacyHouzzatBrand(WS_HOUZZAT);
    const tenantBBrand = workspaceBrandingRowToBrand(WS_B, tenantBBrandingRow());

    assert.equal(houzzatBrand.displayName, "Houzzat");
    assert.equal(tenantBBrand.displayName, TENANT_B_CANARY_DISPLAY_NAME);
    assert.notEqual(houzzatBrand.colors.primary, tenantBBrand.colors.primary);

    writeBrandCache(houzzatBrand);
    writeBrandCache(tenantBBrand);

    assert.equal(readBrandCache(WS_HOUZZAT, houzzatBrand.version)!.displayName, "Houzzat");
    assert.equal(readBrandCache(WS_B, tenantBBrand.version)!.displayName, TENANT_B_CANARY_DISPLAY_NAME);
    assert.notEqual(
      readBrandCache(WS_HOUZZAT, houzzatBrand.version)!.displayName,
      readBrandCache(WS_B, tenantBBrand.version)!.displayName,
    );

    const houzzatAgain = await resolveWorkspaceFromHostname("houzzat.com", deps);
    const bAgain = await resolveWorkspaceFromHostname(
      TENANT_B_PLATFORM_HOSTNAME,
      deps,
    );
    assert.equal(houzzatAgain.ok && houzzatAgain.workspaceId, WS_HOUZZAT);
    assert.equal(bAgain.ok && bAgain.workspaceId, WS_B);
    assert.notEqual(houzzatAgain.ok && houzzatAgain.workspaceId, WS_B);
  });
}

async function testProductionDryRunPlan() {
  if (!process.env.DATABASE_URL) {
    console.log("  production dry-run plan: SKIP (no DATABASE_URL)");
    return;
  }

  const { prisma } = await import("../src/lib/prisma");
  try {
    const plan = await buildTenantBDomainBrandingPlan(prisma);
    const scopeGates = verifyTenantScopeGatesLegacy();
    const report = formatTenantBDomainBrandingReport(plan, scopeGates, "dry-run");
    assert.ok(report.includes(TENANT_B_PLATFORM_HOSTNAME));
    assert.ok(report.includes("DRY RUN — NO PRODUCTION MUTATIONS"));

    const houzzatMutations = plan.steps.filter(
      (s) =>
        s.object.startsWith("Houzzat") &&
        (s.action === "CREATE" || s.action === "DELETE"),
    );
    assert.equal(houzzatMutations.length, 0, "Houzzat must not be mutated");

    for (const protectedRow of plan.houzzatProtected) {
      assert.ok(
        protectedRow.includes(HOUZZAT_PRIMARY_HOSTNAME) ||
          protectedRow.includes(HOUZZAT_WWW_ALIAS_HOSTNAME) ||
          protectedRow.includes(HOUZZAT_PLATFORM_HOSTNAME),
        `expected Houzzat domain in protected list: ${protectedRow}`,
      );
    }

    const canary = await prisma.workspace.findUnique({
      where: { slug: CANARY_SLUG },
      select: { id: true },
    });
    assert.ok(canary, "tenant-canary workspace must exist in production");

    const legacyDomain = await findWorkspaceDomainForWorkspaceHostForProbe(
      prisma,
      canary.id,
      CANARY_SLUG,
      TENANT_B_LEGACY_INTERIM_HOSTNAME,
    );
    assert.ok(legacyDomain, "legacy interim canary.houzzat.com should exist until migration");
    assert.equal(legacyDomain.kind, "CUSTOM");

    const platformDomain = await findWorkspaceDomainForWorkspaceHostForProbe(
      prisma,
      canary.id,
      CANARY_SLUG,
      TENANT_B_PLATFORM_HOSTNAME,
    );
    assert.ok(platformDomain, "platform hostname must be seeded post-3K.4.5");
    assert.equal(platformDomain.kind, "PLATFORM");
    assert.equal(platformDomain.status, "ACTIVE");
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  testStructuralSafety();
  testCliGates();
  testTenantScopeGatesDefaultLegacy();
  await testHostWorkspaceBrandMatrix();
  await testProductionDryRunPlan();
  console.log("tenant-b-domain-branding-canary:selftest ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
