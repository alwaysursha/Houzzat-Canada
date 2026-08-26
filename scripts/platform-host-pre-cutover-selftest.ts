/**
 * Stage 3K.5.1 — platform host pre-cutover audit selftests.
 * Run: pnpm platform-host-pre-cutover:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { authConfig } from "../src/lib/auth.config";
import {
  clearHostResolutionCacheForTests,
  createFixtureHostResolutionDeps,
  resolveWorkspaceFromHostname,
} from "../src/lib/tenancy/resolve-workspace-host";
import { workspaceBrandingRowToBrand } from "../src/lib/tenancy/resolve-workspace-brand";
import {
  blocksTenantHostnameResolution,
  isReservedPlatformHostname,
} from "../src/lib/tenancy/reserved-domains";
import {
  parsePlatformTenantHostname,
} from "../src/lib/tenancy/platform-hostname";
import {
  TENANT_B_TEST_BRANDING_ROW,
  TENANT_B_TEST_WORKSPACE_ID,
} from "../src/lib/tenancy/test-fixtures/tenant-b-brand";
import { buildLegacyHouzzatBrand } from "../src/lib/tenancy/legacy-houzzat-brand";
import { isTrustedStaffMutationOrigin } from "../src/lib/active-workspace";
import { resolveDefaultWorkspaceIdForRouting } from "../src/lib/workspace-routing";
import {
  clearBrandCacheForTests,
  readBrandCache,
  writeBrandCache,
} from "../src/lib/tenancy/brand-cache";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS_HOUZZAT = "ws_houzzat_fixture";
const WS_B = TENANT_B_TEST_WORKSPACE_ID;

const FIXTURE_ROWS = [
  {
    hostname: "houzzat.houzzatpro.com",
    kind: "PLATFORM" as const,
    role: "PRIMARY" as const,
    workspaceId: WS_HOUZZAT,
    workspaceSlug: "houzzat",
    domainStatus: "ACTIVE" as const,
    workspaceStatus: "ACTIVE" as const,
  },
  {
    hostname: "houzzat.com",
    kind: "CUSTOM" as const,
    role: "PRIMARY" as const,
    workspaceId: WS_HOUZZAT,
    workspaceSlug: "houzzat",
    domainStatus: "ACTIVE" as const,
    workspaceStatus: "ACTIVE" as const,
  },
  {
    hostname: "tenant-canary.houzzatpro.com",
    kind: "PLATFORM" as const,
    role: "PRIMARY" as const,
    workspaceId: WS_B,
    workspaceSlug: "tenant-canary",
    domainStatus: "ACTIVE" as const,
    workspaceStatus: "ACTIVE" as const,
  },
];

async function withWorkspaceScope<T>(fn: () => Promise<T>): Promise<T> {
  const prev = process.env.TENANT_DOMAIN_SCOPE;
  process.env.TENANT_DOMAIN_SCOPE = "workspace";
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.TENANT_DOMAIN_SCOPE;
    else process.env.TENANT_DOMAIN_SCOPE = prev;
  }
}

function testHostIsolation() {
  return withWorkspaceScope(async () => {
    clearHostResolutionCacheForTests();
    const deps = createFixtureHostResolutionDeps(FIXTURE_ROWS);

    const houzzatCustom = await resolveWorkspaceFromHostname("houzzat.com", deps);
    const houzzatPlatform = await resolveWorkspaceFromHostname(
      "houzzat.houzzatpro.com",
      deps,
    );
    const tenantB = await resolveWorkspaceFromHostname(
      "tenant-canary.houzzatpro.com",
      deps,
    );
    const unknown = await resolveWorkspaceFromHostname("unknown.houzzatpro.com", deps);
    const root = await resolveWorkspaceFromHostname("houzzatpro.com", deps);

    assert.ok(houzzatCustom.ok && houzzatCustom.workspaceSlug === "houzzat");
    assert.ok(houzzatPlatform.ok && houzzatPlatform.workspaceSlug === "houzzat");
    assert.ok(tenantB.ok && tenantB.workspaceSlug === "tenant-canary");
    assert.equal(unknown.ok, false);
    assert.equal(root.ok, false);
    if (!unknown.ok) assert.equal(unknown.reason, "domain_not_found");
    if (!root.ok) assert.equal(root.reason, "platform_surface");
  });
}

function testSubdomainParseIsNotAuthority() {
  const parsed = parsePlatformTenantHostname("evil-or-unknown.houzzatpro.com");
  assert.ok(parsed);
  assert.equal(parsed.slug, "evil-or-unknown");
  assert.equal(blocksTenantHostnameResolution("evil-or-unknown.houzzatpro.com"), null);
}

function testBrandIsolation() {
  clearBrandCacheForTests();
  const houzzat = buildLegacyHouzzatBrand(WS_HOUZZAT);
  houzzat.version = 1;
  writeBrandCache(houzzat);

  const tenantB = workspaceBrandingRowToBrand(WS_B, TENANT_B_TEST_BRANDING_ROW);
  writeBrandCache(tenantB);

  assert.equal(readBrandCache(WS_HOUZZAT, 1)?.displayName, "Houzzat");
  assert.equal(readBrandCache(WS_B, 1)?.displayName, "Tenant Canary");
  assert.notEqual(
    readBrandCache(WS_HOUZZAT, 1)?.colors.primary,
    readBrandCache(WS_B, 1)?.colors.primary,
  );
}

function testAuthCookieHostOnly() {
  assert.equal(authConfig.trustHost, true);
  const sessionOpts = authConfig.cookies?.sessionToken?.options;
  const csrfOpts = authConfig.cookies?.csrfToken?.options;
  assert.equal(sessionOpts?.domain, undefined);
  assert.equal(csrfOpts?.domain, undefined);
  const configSource = read("src/lib/auth.config.ts");
  assert.ok(configSource.includes("__Host-authjs.csrf-token"));
  assert.ok(configSource.includes("__Secure-authjs.session-token"));
  assert.equal(configSource.includes("Domain:"), false);
}

function testStaffOriginGateUsesStaticSiteUrl() {
  const configuredSite = "https://houzzat.com";
  const tenantOrigin = new Request("https://tenant-canary.houzzatpro.com/api/agent/workspace", {
    method: "POST",
    headers: { origin: "https://tenant-canary.houzzatpro.com" },
  });
  assert.equal(isTrustedStaffMutationOrigin(tenantOrigin, configuredSite), false);
  const houzzatOrigin = new Request("https://houzzat.com/api/agent/workspace", {
    method: "POST",
    headers: { origin: "https://houzzat.com" },
  });
  assert.equal(isTrustedStaffMutationOrigin(houzzatOrigin, configuredSite), true);
}

function testPublicLeadDefaultWorkspaceIsHouzzatSlug() {
  const routing = read("src/lib/workspace-routing.ts");
  assert.ok(routing.includes('slug: HOUZZAT_WORKSPACE_SLUG'));
  assert.ok(routing.includes("resolveDefaultWorkspaceIdForRouting"));
}

function testResolverNotWiredToMiddleware() {
  const middleware = read("src/middleware.ts");
  assert.equal(middleware.includes("resolveWorkspaceFromRequest"), false);
  assert.equal(middleware.includes("resolveWorkspaceBrand"), false);
}

function testPlatformRootReserved() {
  assert.ok(isReservedPlatformHostname("houzzatpro.com").reserved);
  assert.ok(isReservedPlatformHostname("www.houzzatpro.com").reserved);
  assert.equal(blocksTenantHostnameResolution("houzzatpro.com"), "platform_houzzatpro_root");
}

function testWranglerPinsHouzzatOrigin() {
  const wrangler = read("wrangler.jsonc");
  assert.ok(wrangler.includes('"NEXTAUTH_URL": "https://houzzat.com"'));
  assert.ok(wrangler.includes('"NEXT_PUBLIC_SITE_URL": "https://houzzat.com"'));
}

async function main() {
  await testHostIsolation();
  testSubdomainParseIsNotAuthority();
  testBrandIsolation();
  testAuthCookieHostOnly();
  testStaffOriginGateUsesStaticSiteUrl();
  testPublicLeadDefaultWorkspaceIsHouzzatSlug();
  testResolverNotWiredToMiddleware();
  testPlatformRootReserved();
  testWranglerPinsHouzzatOrigin();
  void resolveDefaultWorkspaceIdForRouting;
  console.log("platform-host-pre-cutover:selftest OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
