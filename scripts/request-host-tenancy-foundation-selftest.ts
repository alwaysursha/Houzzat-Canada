/**
 * Stage 3K.5.2 — request-host tenancy + auth origin foundation selftests.
 * Run: pnpm request-host-tenancy-foundation:selftest
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
  AUTH_ORIGIN_FOUNDATION_DOC,
  resolveAuthRedirectUrl,
} from "../src/lib/tenancy/auth-origin";
import {
  readEnvPinnedAuthOrigin,
  readEnvPinnedSiteOrigin,
} from "../src/lib/tenancy/env-pinned-origin";
import {
  absoluteUrlForOrigin,
  absoluteUrlForRequest,
  normalizeTrustedAbsolutePath,
  resolveTrustedRequestOrigin,
} from "../src/lib/tenancy/resolve-trusted-request-origin";
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
  RequestWorkspaceAuthError,
} from "../src/lib/tenancy/request-workspace-auth";
import {
  detectClientWorkspaceOverride,
  resolvePublicLeadWorkspaceIdFromRequest,
} from "../src/lib/tenancy/public-lead-workspace";
import { buildLegacyHouzzatBrand } from "../src/lib/tenancy/legacy-houzzat-brand";
import {
  TENANT_B_TEST_BRANDING_ROW,
  TENANT_B_TEST_DISPLAY_NAME,
  TENANT_B_TEST_WORKSPACE_ID,
} from "../src/lib/tenancy/test-fixtures/tenant-b-brand";
import { workspaceBrandingRowToBrand } from "../src/lib/tenancy/resolve-workspace-brand";
import { HOUZZATPRO_PLATFORM_URL } from "../src/lib/tenancy/platform-footer";
import { blocksTenantHostnameResolution } from "../src/lib/tenancy/reserved-domains";
import {
  parseTenantAdminHostLock,
  parseTenantBrandingScope,
  parseTenantDomainScope,
  parseTenantPublicLeadScope,
} from "../src/lib/tenancy/tenant-scope-flags";

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
    hostname: "www.houzzat.com",
    kind: "CUSTOM",
    role: "ALIAS",
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

function fixtureDeps() {
  return createFixtureHostResolutionDeps(
    FIXTURE_ROWS,
    { workspaceId: WS_HOUZZAT, workspaceSlug: "houzzat" },
  );
}

function brandDeps() {
  const houzzatBrand = buildLegacyHouzzatBrand(WS_HOUZZAT);
  const tenantBBrand = workspaceBrandingRowToBrand(
    WS_B,
    TENANT_B_TEST_BRANDING_ROW,
  );
  return {
    ...fixtureDeps(),
    resolveBrand: async (workspaceId: string) => {
      if (workspaceId === WS_B) return tenantBBrand;
      return houzzatBrand;
    },
  };
}

function req(host: string, path = "/"): Request {
  return new Request(`https://${host}${path}`);
}

async function withWorkspaceDomainScope<T>(fn: () => Promise<T>): Promise<T> {
  const keys = [
    "TENANT_DOMAIN_SCOPE",
    "TENANT_BRANDING_SCOPE",
    "TENANT_PUBLIC_LEAD_SCOPE",
  ] as const;
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

async function withLegacyScope<T>(fn: () => Promise<T>): Promise<T> {
  const keys = [
    "TENANT_DOMAIN_SCOPE",
    "TENANT_BRANDING_SCOPE",
    "TENANT_PUBLIC_LEAD_SCOPE",
  ] as const;
  const prev: Record<string, string | undefined> = {};
  for (const key of keys) {
    prev[key] = process.env[key];
    process.env[key] = "legacy";
  }
  clearHostResolutionCacheForTests();
  try {
    return await fn();
  } finally {
    for (const key of keys) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
    clearHostResolutionCacheForTests();
  }
}

async function testHostResolutionMatrix() {
  await withWorkspaceDomainScope(async () => {
    const deps = brandDeps();
    const cases: Array<[string, boolean, string | null]> = [
      ["houzzat.com", true, WS_HOUZZAT],
      ["www.houzzat.com", true, WS_HOUZZAT],
      ["houzzat.houzzatpro.com", true, WS_HOUZZAT],
      ["tenant-canary.houzzatpro.com", true, WS_B],
      ["unknown.houzzatpro.com", false, null],
      ["houzzatpro.com", false, null],
      ["www.houzzatpro.com", false, null],
    ];

    for (const [host, expectOk, workspaceId] of cases) {
      const result = await resolveRequestTenancy(req(host), deps);
      assert.equal(result.ok, expectOk, host);
      if (expectOk) {
        assert.equal(result.ok && result.workspaceId, workspaceId, host);
      }
    }
  });
}

function testAuthOriginPerHost() {
  const tenantB = resolveTrustedRequestOrigin(req("tenant-canary.houzzatpro.com"));
  assert.ok(tenantB.ok);
  assert.equal(tenantB.origin, "https://tenant-canary.houzzatpro.com");
  assert.notEqual(tenantB.origin, readEnvPinnedSiteOrigin());

  const houzzat = resolveTrustedRequestOrigin(req("houzzat.com"));
  assert.ok(houzzat.ok);
  assert.equal(houzzat.origin, "https://houzzat.com");

  const platform = resolveTrustedRequestOrigin(req("houzzat.houzzatpro.com"));
  assert.ok(platform.ok);
  assert.equal(platform.origin, "https://houzzat.houzzatpro.com");
}

function testHostileHostOrigin() {
  assert.equal(normalizeTrustedAbsolutePath("//evil.example/admin"), null);
  assert.equal(
    absoluteUrlForOrigin("https://tenant-canary.houzzatpro.com", "//evil.example/admin"),
    null,
  );
  assert.equal(
    absoluteUrlForRequest(req("tenant-canary.houzzatpro.com"), "//evil.example/pwn"),
    null,
  );
  assert.equal(
    absoluteUrlForRequest(req("tenant-canary.houzzatpro.com"), "https://evil.example/pwn"),
    null,
  );

  const malformed = resolveTrustedRequestOrigin(
    new Request("https://not-a-host!!!/"),
  );
  assert.equal(malformed.ok, false);
}

function testStaffCsrf() {
  const tenantHost = "tenant-canary.houzzatpro.com";
  const good = req(tenantHost, "/api/agent/workspace");
  good.headers.set("Origin", `https://${tenantHost}`);
  assert.equal(isTrustedStaffMutationOriginForRequest(good), true);

  const bad = req(tenantHost, "/api/agent/workspace");
  bad.headers.set("Origin", "https://houzzat.com");
  assert.equal(isTrustedStaffMutationOriginForRequest(bad), false);

  const houzzatGood = req("houzzat.com", "/api/agent/workspace");
  houzzatGood.headers.set("Origin", "https://houzzat.com");
  assert.equal(isTrustedStaffMutationOrigin(houzzatGood, "https://houzzat.com"), true);

  const houzzatBad = req("houzzat.com", "/api/agent/workspace");
  houzzatBad.headers.set("Origin", `https://${tenantHost}`);
  assert.equal(isTrustedStaffMutationOrigin(houzzatBad, "https://houzzat.com"), false);
}

async function testAdminMembershipPrimitives() {
  const authMod = read("src/lib/tenancy/request-workspace-auth.ts");
  assert.ok(authMod.includes("requireStaffAccessForRequestWorkspace"));
  assert.ok(authMod.includes("isPlatformAdmin"));
  assert.ok(authMod.includes("workspace_membership_required"));

  const err = new RequestWorkspaceAuthError("workspace_membership_required");
  assert.equal(err.reason, "workspace_membership_required");
}

async function testPublicLeadPlumbing() {
  await withWorkspaceDomainScope(async () => {
    const deps = fixtureDeps();
    const tenantWs = await resolvePublicLeadWorkspaceIdFromRequest(
      req("tenant-canary.houzzatpro.com"),
      deps,
    );
    assert.equal(tenantWs, WS_B);

    const houzzatWs = await resolvePublicLeadWorkspaceIdFromRequest(
      req("houzzat.com"),
      deps,
    );
    assert.equal(houzzatWs, WS_HOUZZAT);
    assert.notEqual(tenantWs, houzzatWs);
  });

  await withLegacyScope(async () => {
    const leadMod = read("src/lib/agent/lead-intake.ts");
    assert.ok(leadMod.includes("resolvePublicLeadWorkspaceIdFromRequest"));
    assert.ok(leadMod.includes("resolveLeadDeskAssignmentForRequest"));
  });

  const override = detectClientWorkspaceOverride({
    name: "Test",
    workspaceId: WS_HOUZZAT,
    workspaceSlug: "houzzat",
  });
  assert.ok(override?.rejected);
  assert.ok(override!.keys.includes("workspaceId"));
}

async function testBrandComposition() {
  await withWorkspaceDomainScope(async () => {
    const deps = brandDeps();
    const houzzat = await resolveRequestTenancy(req("houzzat.com"), deps);
    assert.ok(houzzat.ok);
    assert.equal(houzzat.brand.displayName, "Houzzat");

    const tenantB = await resolveRequestTenancy(
      req("tenant-canary.houzzatpro.com"),
      deps,
    );
    assert.ok(tenantB.ok);
    assert.equal(tenantB.brand.displayName, TENANT_B_TEST_DISPLAY_NAME);
    assert.equal(tenantB.brand.poweredByHouzzatPro, true);
  });
}

function testPoweredByInvariant() {
  const brand = workspaceBrandingRowToBrand(WS_B, {
    ...TENANT_B_TEST_BRANDING_ROW,
    poweredByHouzzatPro: false,
  });
  assert.equal(brand.poweredByHouzzatPro, true);
  assert.equal(HOUZZATPRO_PLATFORM_URL, "https://houzzatpro.com");
}

async function testCacheIsolation() {
  await withWorkspaceDomainScope(async () => {
    clearHostResolutionCacheForTests();
    clearBrandCacheForTests();
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
      if (host.startsWith("tenant")) {
        assert.equal(result.workspaceId, WS_B);
        assert.equal(result.brand.displayName, TENANT_B_TEST_DISPLAY_NAME);
      } else {
        assert.equal(result.workspaceId, WS_HOUZZAT);
        assert.equal(result.brand.displayName, "Houzzat");
      }
    }

    const houzzatBrand = buildLegacyHouzzatBrand(WS_HOUZZAT);
    writeBrandCache(houzzatBrand);
    const tenantBrand = workspaceBrandingRowToBrand(WS_B, TENANT_B_TEST_BRANDING_ROW);
    writeBrandCache(tenantBrand);
    assert.notEqual(
      readBrandCache(WS_HOUZZAT, houzzatBrand.version)?.displayName,
      readBrandCache(WS_B, tenantBrand.version)?.displayName,
    );
  });
}

function testAbsoluteUrl() {
  assert.equal(
    absoluteUrlForRequest(req("tenant-canary.houzzatpro.com"), "/admin"),
    "https://tenant-canary.houzzatpro.com/admin",
  );
  assert.equal(
    absoluteUrlForRequest(req("houzzat.com"), "/search"),
    "https://houzzat.com/search",
  );
  const tenantUrl = absoluteUrlForRequest(req("tenant-canary.houzzatpro.com"), "/admin");
  assert.ok(tenantUrl);
  assert.ok(!tenantUrl.includes("houzzat.com"));
}

function testHouzzatProRootProtection() {
  assert.ok(blocksTenantHostnameResolution("houzzatpro.com"));
  assert.ok(blocksTenantHostnameResolution("www.houzzatpro.com"));
}

function testAuthCookieRegression() {
  assert.ok(authCookieOptionsAreHostOnly(authConfig.cookies));
  const configText = read("src/lib/auth.config.ts");
  assert.ok(!configText.includes("Domain="));
  assert.ok(!configText.includes("domain:"));
  assert.ok(authConfig.cookies.sessionToken.name.includes("__Secure-") || authConfig.cookies.sessionToken.name.includes("authjs"));
  assert.equal(AUTH_ORIGIN_FOUNDATION_DOC.cookiesHostOnly, true);
}

function testAuthRedirectFoundation() {
  const tenantOrigin = "https://tenant-canary.houzzatpro.com";
  assert.equal(
    resolveAuthRedirectUrl("/admin", tenantOrigin),
    "https://tenant-canary.houzzatpro.com/admin",
  );
  assert.equal(
    resolveAuthRedirectUrl("https://evil.com/admin", tenantOrigin),
    tenantOrigin,
  );
  assert.notEqual(readEnvPinnedAuthOrigin(), tenantOrigin);
}

function testProductionSafetyFlags() {
  assert.equal(parseTenantDomainScope(), "legacy");
  assert.equal(parseTenantBrandingScope(), "legacy");
  assert.equal(parseTenantPublicLeadScope(), "legacy");
  assert.equal(parseTenantAdminHostLock(), "off");
}

async function testLegacyScopeUnchanged() {
  await withLegacyScope(async () => {
    const result = await resolveRequestTenancy(
      req("tenant-canary.houzzatpro.com"),
      brandDeps(),
    );
    assert.ok(result.ok);
    assert.equal(result.workspaceId, WS_HOUZZAT);
    assert.equal(result.resolutionMode, "legacy");
    assert.equal(result.verifiedHostname, false);
  });
}

function testModuleWiring() {
  assert.ok(read("src/lib/auth.ts").includes("resolveAuthRedirectUrl"));
  assert.ok(read("src/lib/active-workspace.ts").includes("isTrustedStaffMutationOriginForRequest"));
  assert.ok(read("src/lib/tenancy/resolve-request-tenancy.ts").includes("resolveRequestTenancy"));
}

async function main() {
  testProductionSafetyFlags();
  testModuleWiring();
  testHouzzatProRootProtection();
  testAuthCookieRegression();
  testAuthRedirectFoundation();
  testHostileHostOrigin();
  testAuthOriginPerHost();
  testStaffCsrf();
  testPoweredByInvariant();
  testAbsoluteUrl();
  await testHostResolutionMatrix();
  await testBrandComposition();
  await testCacheIsolation();
  await testPublicLeadPlumbing();
  await testAdminMembershipPrimitives();
  await testLegacyScopeUnchanged();
  console.log("request-host-tenancy-foundation:selftest passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
