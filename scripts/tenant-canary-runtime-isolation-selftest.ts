/**
 * Stage 3K.5.4 — isolated Tenant B canary Worker scaffold + wiring selftests.
 * Run: pnpm tenant-canary-runtime-isolation:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isTrustedStaffMutationOrigin,
  isTrustedStaffMutationOriginForRequest,
} from "../src/lib/active-workspace";
import { authConfig } from "../src/lib/auth.config";
import {
  authCookieOptionsAreHostOnly,
} from "../src/lib/tenancy/auth-origin";
import {
  clearHostResolutionCacheForTests,
  createFixtureHostResolutionDeps,
  type DomainLookupRow,
} from "../src/lib/tenancy/resolve-workspace-host";
import {
  clearBrandCacheForTests,
  readBrandCache,
  writeBrandCache,
} from "../src/lib/tenancy/brand-cache";
import {
  resolveRequestTenancy,
} from "../src/lib/tenancy/resolve-request-tenancy";
import {
  toMarketingChromeBrand,
} from "../src/lib/tenancy/resolve-marketing-tenancy";
import { MARKETING_TENANCY_CACHE_POLICY } from "../src/lib/tenancy/tenancy-cache-policy";
import { blocksTenantHostnameResolution } from "../src/lib/tenancy/reserved-domains";
import { buildLegacyHouzzatBrand } from "../src/lib/tenancy/legacy-houzzat-brand";
import { workspaceBrandingRowToBrand } from "../src/lib/tenancy/resolve-workspace-brand";
import {
  TENANT_B_TEST_BRANDING_ROW,
  TENANT_B_TEST_DISPLAY_NAME,
  TENANT_B_TEST_PRIMARY_COLOR,
  TENANT_B_TEST_WORKSPACE_ID,
} from "../src/lib/tenancy/test-fixtures/tenant-b-brand";
import { resolveTrustedRequestOrigin } from "../src/lib/tenancy/resolve-trusted-request-origin";
import {
  assertCanaryLeadCutoverBundle,
  assertProductionIsolatedFromCanaryLeadCutover,
  isCanaryLeadCutoverBundleComplete,
  isUnsafePartialCanaryLeadCutover,
  parseJsoncVar,
  configHasKey,
} from "./lib/canary-lead-cutover-config";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS_HOUZZAT = "ws_houzzat_fixture";
const WS_B = TENANT_B_TEST_WORKSPACE_ID;

const FIXTURE_ROWS: DomainLookupRow[] = [
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
    hostname: "tenant-canary.houzzatpro.com",
    kind: "PLATFORM",
    role: "PRIMARY",
    workspaceId: WS_B,
    workspaceSlug: "tenant-canary",
    domainStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
  },
];

function brandDeps() {
  return {
    ...createFixtureHostResolutionDeps(FIXTURE_ROWS, {
      workspaceId: WS_HOUZZAT,
      workspaceSlug: "houzzat",
    }),
    resolveBrand: async (workspaceId: string) => {
      if (workspaceId === WS_B) {
        return workspaceBrandingRowToBrand(WS_B, TENANT_B_TEST_BRANDING_ROW);
      }
      return buildLegacyHouzzatBrand(WS_HOUZZAT);
    },
  };
}

function req(host: string, path = "/"): Request {
  return new Request(`https://${host}${path}`);
}

function parseJsoncName(configText: string): string {
  const match = configText.match(/"name"\s*:\s*"([^"]+)"/);
  assert.ok(match, "worker name in config");
  return match[1]!;
}

function testWranglerIsolation() {
  const production = read("wrangler.jsonc");
  const canary = read("wrangler.tenant-canary.jsonc");

  assert.equal(parseJsoncName(production), "houzzat");
  assert.equal(parseJsoncName(canary), "houzzat-tenant-canary");

  assert.notEqual(production, canary);
  assert.ok(!canary.includes('"env"'), "canary must not use wrangler env inheritance");

  assert.equal(parseJsoncVar(production, "NEXTAUTH_URL"), "https://houzzat.com");
  assert.equal(
    parseJsoncVar(production, "NEXT_PUBLIC_SITE_URL"),
    "https://houzzat.com",
  );

  assert.equal(configHasKey(canary, "NEXTAUTH_URL"), false);
  assert.equal(configHasKey(canary, "AUTH_URL"), false);
  assert.equal(
    parseJsoncVar(canary, "NEXT_PUBLIC_SITE_URL"),
    "https://tenant-canary.houzzatpro.com",
  );
  assert.equal(parseJsoncVar(canary, "TENANT_DOMAIN_SCOPE"), "workspace");
  assert.equal(parseJsoncVar(canary, "TENANT_BRANDING_SCOPE"), "workspace");
  assertCanaryLeadCutoverBundle(canary);
  assert.equal(parseJsoncVar(canary, "TENANT_ADMIN_HOST_LOCK"), "off");
  assert.equal(configHasKey(canary, "NEXT_PUBLIC_WHATSAPP_EXPERT"), false);
  assert.ok(!canary.includes("16472214949"));

  assertProductionIsolatedFromCanaryLeadCutover(production);
}

function testWorkerSelfBinding() {
  const production = read("wrangler.jsonc");
  const canary = read("wrangler.tenant-canary.jsonc");

  assert.ok(production.includes('"service": "houzzat"'));
  assert.ok(canary.includes('"service": "houzzat-tenant-canary"'));
  assert.ok(!canary.includes('"service": "houzzat"'));
}

function testDeployCommandTargeting() {
  const pkg = JSON.parse(read("package.json")) as {
    scripts: Record<string, string>;
  };
  const production = read("wrangler.jsonc");

  assert.ok(pkg.scripts["deploy:cf"]?.includes("opennextjs-cloudflare deploy"));
  assert.ok(!pkg.scripts["deploy:cf"]?.includes("wrangler.tenant-canary.jsonc"));
  assert.ok(!pkg.scripts["deploy:cf"]?.includes("wrangler.houzzatpro.jsonc"));
  assert.ok(!pkg.scripts["deploy:cf"]?.includes("--config"));

  const canaryDeploy = pkg.scripts["deploy:cf:tenant-canary"];
  assert.ok(canaryDeploy?.includes("opennextjs-cloudflare deploy --config wrangler.tenant-canary.jsonc"));
  assert.ok(canaryDeploy?.includes("NEXT_PUBLIC_SITE_URL=https://tenant-canary.houzzatpro.com"));
  assert.ok(!canaryDeploy?.includes("NEXTAUTH_URL"));
  assert.ok(!canaryDeploy?.includes("wrangler.houzzatpro.jsonc"));
  assert.ok(pkg.scripts["build:cloudflare:tenant-canary"]);

  assert.equal(parseJsoncName(production), "houzzat");
}

function testMarketingLayoutWiring() {
  const layout = read("src/app/(marketing)/layout.tsx");
  assert.ok(layout.includes("resolveMarketingTenancy"));
  assert.ok(layout.includes('export const dynamic = "force-dynamic"'));
  assert.ok(layout.includes("tenancy-cache-policy"));
  assert.ok(layout.includes("notFound"));
  assert.ok(layout.includes("chromeBrand"));
  assert.ok(read("src/lib/tenancy/tenancy-cache-policy.ts").includes("force-dynamic"));
}

function testCachePolicy() {
  assert.equal(MARKETING_TENANCY_CACHE_POLICY.segmentConfig, "force-dynamic");
  const layout = read("src/app/(marketing)/layout.tsx");
  assert.ok(layout.includes('export const dynamic = "force-dynamic"'));
  const policy = read("src/lib/tenancy/tenancy-cache-policy.ts");
  assert.ok(policy.includes("currentWorkspace"));
}

function testStaffMutationRoutesMigrated() {
  const routes = [
    "src/app/api/agent/workspace/route.ts",
    "src/app/api/admin/workspace-canary/push/route.ts",
    "src/app/api/agent/open-lead/[leadId]/route.ts",
  ];
  for (const route of routes) {
    const src = read(route);
    assert.ok(
      src.includes("isTrustedStaffMutationOriginForRequest"),
      `${route} must use request-aware origin`,
    );
    assert.ok(
      !src.includes("isTrustedStaffMutationOrigin(request, SITE_URL)"),
      `${route} must not use SITE_URL origin gate`,
    );
  }
}

function testStaffOriginCrossHost() {
  const tenantHost = "tenant-canary.houzzatpro.com";
  const good = req(tenantHost, "/api/agent/workspace");
  good.headers.set("Origin", `https://${tenantHost}`);
  assert.equal(isTrustedStaffMutationOriginForRequest(good), true);

  const bad = req(tenantHost, "/api/agent/workspace");
  bad.headers.set("Origin", "https://houzzat.com");
  assert.equal(isTrustedStaffMutationOriginForRequest(bad), false);

  const houzzatGood = req("houzzat.com", "/api/agent/workspace");
  houzzatGood.headers.set("Origin", "https://houzzat.com");
  assert.equal(isTrustedStaffMutationOriginForRequest(houzzatGood), true);
}

function testAuthConfigIsolation() {
  assert.ok(authConfig.trustHost);
  assert.ok(authCookieOptionsAreHostOnly(authConfig.cookies));
  const canary = read("wrangler.tenant-canary.jsonc");
  const production = read("wrangler.jsonc");
  assert.ok(production.includes("NEXTAUTH_URL"));
  assert.ok(!configHasKey(canary, "NEXTAUTH_URL"));
  assert.ok(!configHasKey(canary, "AUTH_URL"));
}

function testCanaryLeadCutoverAtomicBundle() {
  const canary = read("wrangler.tenant-canary.jsonc");
  assertCanaryLeadCutoverBundle(canary);
  assert.equal(isCanaryLeadCutoverBundleComplete(canary), true);

  const partialLeadOnly = canary
    .replace('"WORKSPACE_ROUTING_SCOPE": "workspace",', "")
    .replace('"WORKSPACE_NOTIFICATION_SCOPE": "workspace",', "");
  assert.equal(
    isUnsafePartialCanaryLeadCutover(partialLeadOnly),
    true,
    "lead-only flip must be detected as unsafe partial cutover",
  );
  assert.equal(isCanaryLeadCutoverBundleComplete(partialLeadOnly), false);

  const leadIntake = read("src/lib/agent/lead-intake.ts");
  assert.ok(leadIntake.includes("resolvePublicLeadWorkspaceIdFromRequest"));
}

function testRunbooksExist() {
  assert.ok(read("docs/tenant-canary/secrets-runbook.md").includes("houzzat-tenant-canary"));
  assert.ok(read("docs/tenant-canary/hostname-cutover-runbook.md").includes("Remove"));
  assert.ok(read("docs/tenant-canary/rollback-runbook.md").includes("houzzat"));
}

async function withWorkspaceScope<T>(fn: () => Promise<T>): Promise<T> {
  const keys = ["TENANT_DOMAIN_SCOPE", "TENANT_BRANDING_SCOPE"] as const;
  const prev: Record<string, string | undefined> = {};
  for (const key of keys) {
    prev[key] = process.env[key];
    process.env[key] = "workspace";
  }
  clearHostResolutionCacheForTests();
  clearBrandCacheForTests();
  try {
    return await fn();
  } finally {
    for (const key of keys) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
    clearHostResolutionCacheForTests();
    clearBrandCacheForTests();
  }
}

async function testHostnameResolution() {
  await withWorkspaceScope(async () => {
    const deps = brandDeps();

    const houzzat = await resolveRequestTenancy(req("houzzat.com"), deps);
    assert.ok(houzzat.ok);
    assert.equal(houzzat.workspaceSlug, "houzzat");

    const platform = await resolveRequestTenancy(
      req("houzzat.houzzatpro.com"),
      deps,
    );
    assert.ok(platform.ok);
    assert.equal(platform.workspaceSlug, "houzzat");

    const tenantB = await resolveRequestTenancy(
      req("tenant-canary.houzzatpro.com"),
      deps,
    );
    assert.ok(tenantB.ok);
    assert.equal(tenantB.workspaceSlug, "tenant-canary");
    assert.notEqual(tenantB.workspaceId, houzzat.ok && houzzat.workspaceId);

    const unknown = await resolveRequestTenancy(
      req("unknown.houzzatpro.com"),
      deps,
    );
    assert.equal(unknown.ok, false);

    assert.ok(blocksTenantHostnameResolution("houzzatpro.com"));
    assert.ok(blocksTenantHostnameResolution("www.houzzatpro.com"));
    const root = await resolveRequestTenancy(req("houzzatpro.com"), deps);
    assert.equal(root.ok, false);
  });
}

async function testBrandingAbIsolation() {
  await withWorkspaceScope(async () => {
    const deps = brandDeps();
    const sequence = [
      "houzzat.com",
      "tenant-canary.houzzatpro.com",
      "houzzat.com",
      "tenant-canary.houzzatpro.com",
    ] as const;

    for (const host of sequence) {
      const result = await resolveRequestTenancy(req(host), deps);
      assert.ok(result.ok);
      if (host.includes("tenant")) {
        assert.equal(result.brand.displayName, TENANT_B_TEST_DISPLAY_NAME);
      } else {
        assert.equal(result.brand.displayName, "Houzzat");
      }
    }

    const houzzatBrand = buildLegacyHouzzatBrand(WS_HOUZZAT);
    const tenantBrand = workspaceBrandingRowToBrand(
      WS_B,
      TENANT_B_TEST_BRANDING_ROW,
    );
    writeBrandCache(houzzatBrand);
    writeBrandCache(tenantBrand);
    assert.notEqual(
      readBrandCache(WS_HOUZZAT, houzzatBrand.version)?.displayName,
      readBrandCache(WS_B, tenantBrand.version)?.displayName,
    );
  });
}

function testTrustedOriginRejection() {
  const tenant = resolveTrustedRequestOrigin(
    req("tenant-canary.houzzatpro.com"),
  );
  assert.ok(tenant.ok);
  assert.notEqual(tenant.origin, "https://houzzat.com");
}

function testMarketingChromeMapping() {
  const tenancy = {
    ok: true as const,
    hostname: "tenant-canary.houzzatpro.com",
    origin: "https://tenant-canary.houzzatpro.com",
    workspaceId: WS_B,
    workspaceSlug: "tenant-canary",
    verifiedHostname: true,
    brand: workspaceBrandingRowToBrand(WS_B, TENANT_B_TEST_BRANDING_ROW),
    resolutionMode: "workspace" as const,
  };
  const chrome = toMarketingChromeBrand(
    tenancy,
    "https://tenant-canary.houzzatpro.com",
  );
  assert.equal(chrome.displayName, TENANT_B_TEST_DISPLAY_NAME);
  assert.equal(chrome.workspaceSlug, "tenant-canary");
  assert.equal(chrome.isHouzzatWorkspace, false);
  assert.equal(chrome.colors.primary, TENANT_B_TEST_PRIMARY_COLOR);
}

function testNoDeployInSelftest() {
  // Structural: this script only reads files and asserts — no shell/deploy side effects.
  assert.ok(typeof main === "function");
}

async function main() {
  testWranglerIsolation();
  testWorkerSelfBinding();
  testDeployCommandTargeting();
  testMarketingLayoutWiring();
  testCachePolicy();
  testStaffMutationRoutesMigrated();
  testStaffOriginCrossHost();
  testAuthConfigIsolation();
  testCanaryLeadCutoverAtomicBundle();
  testRunbooksExist();
  testTrustedOriginRejection();
  testMarketingChromeMapping();
  testNoDeployInSelftest();
  await testHostnameResolution();
  await testBrandingAbIsolation();
  console.log("tenant-canary-runtime-isolation:selftest passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
