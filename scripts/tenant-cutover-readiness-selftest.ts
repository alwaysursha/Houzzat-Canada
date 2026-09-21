/**
 * Stage 3K.5.6 — Tenant B cutover readiness (SEO, auth, lead routing).
 * Run: pnpm tenant-cutover-readiness:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  detectClientWorkspaceOverride,
  resolvePublicLeadWorkspaceIdFromRequest,
} from "../src/lib/tenancy/public-lead-workspace";
import {
  PUBLIC_LEAD_CUTOVER_BLOCKERS,
  PUBLIC_LEAD_WRITE_PATHS,
} from "../src/lib/tenancy/public-lead-write-paths";
import { buildMarketingRootMetadata } from "../src/lib/tenancy/tenant-seo";
import { workspaceBrandingRowToBrand } from "../src/lib/tenancy/resolve-workspace-brand";
import { buildLegacyHouzzatBrand } from "../src/lib/tenancy/legacy-houzzat-brand";
import {
  createFixtureHostResolutionDeps,
  clearHostResolutionCacheForTests,
  type DomainLookupRow,
} from "../src/lib/tenancy/resolve-workspace-host";
import { blocksTenantHostnameResolution } from "../src/lib/tenancy/reserved-domains";
import {
  TENANT_B_TEST_BRANDING_ROW,
  TENANT_B_TEST_DISPLAY_NAME,
  TENANT_B_TEST_WORKSPACE_ID,
} from "../src/lib/tenancy/test-fixtures/tenant-b-brand";
import {
  authCookieOptionsAreHostOnly,
  AUTH_ORIGIN_FOUNDATION_DOC,
} from "../src/lib/tenancy/auth-origin";
import { authConfig } from "../src/lib/auth.config";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS_HOUZZAT = "ws_houzzat_fixture";

const FIXTURE_ROWS: DomainLookupRow[] = [
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
    workspaceId: TENANT_B_TEST_WORKSPACE_ID,
    workspaceSlug: "tenant-canary",
    domainStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
  },
];

function req(host: string, path = "/") {
  return new Request(`https://${host}${path}`, {
    headers: { host, "x-forwarded-proto": "https" },
  });
}

function tenantBTenancy() {
  return {
    ok: true as const,
    hostname: "tenant-canary.houzzatpro.com",
    origin: "https://tenant-canary.houzzatpro.com",
    workspaceId: TENANT_B_TEST_WORKSPACE_ID,
    workspaceSlug: "tenant-canary",
    verifiedHostname: true,
    brand: workspaceBrandingRowToBrand(
      TENANT_B_TEST_WORKSPACE_ID,
      TENANT_B_TEST_BRANDING_ROW,
    ),
    resolutionMode: "workspace" as const,
  };
}

function houzzatTenancy() {
  return {
    ok: true as const,
    hostname: "houzzat.com",
    origin: "https://houzzat.com",
    workspaceId: "ws_houzzat",
    workspaceSlug: "houzzat",
    verifiedHostname: true,
    brand: buildLegacyHouzzatBrand("ws_houzzat"),
    resolutionMode: "legacy" as const,
  };
}

function canonicalFromMeta(_meta: unknown) {
  return "";
}

async function testSecondaryPagesUseTenantMetadata() {
  const pages = [
    ["src/app/(marketing)/search/page.tsx", "buildMarketingPageMetadata"],
    ["src/app/(marketing)/open-houses/page.tsx", "buildMarketingPageMetadata"],
    ["src/app/(marketing)/areas/page.tsx", "buildMarketingPageMetadata"],
    ["src/app/(marketing)/home-valuation/page.tsx", "buildMarketingPageMetadata"],
    ["src/app/(marketing)/auth/sign-in/page.tsx", "buildMarketingAuthPageMetadata"],
    ["src/app/(marketing)/privacy/page.tsx", "buildMarketingPageMetadata"],
  ] as const;
  for (const [file, helper] of pages) {
    const src = read(file);
    assert.ok(src.includes(helper), file);
    assert.ok(!src.includes("publicPageMetadata("), file);
    assert.ok(!src.includes("alternates: { canonical: `${SITE_URL}"), file);
  }
}

function testTenantBSearchCanonicalWiring() {
  const search = read("src/app/(marketing)/search/page.tsx");
  assert.ok(search.includes("generateMetadata"));
}

async function testTenantBMetadataCanonical() {
  const meta = buildMarketingRootMetadata(
    tenantBTenancy(),
    "https://tenant-canary.houzzatpro.com",
  );
  const canonical = meta.alternates?.canonical?.toString() ?? "";
  assert.ok(canonical.includes("tenant-canary.houzzatpro.com"));
  assert.ok(!canonical.includes("houzzat.com"));
  const ogSite = meta.openGraph?.siteName;
  assert.equal(ogSite, TENANT_B_TEST_DISPLAY_NAME);
}

async function testHouzzatMetadataCanonical() {
  const meta = buildMarketingRootMetadata(
    houzzatTenancy(),
    "https://houzzat.com",
  );
  const canonical = meta.alternates?.canonical?.toString() ?? "";
  assert.ok(canonical.includes("houzzat.com"));
}

async function testRobotsSitemapTenantAware() {
  const robots = read("src/app/robots.ts");
  const sitemap = read("src/app/sitemap.ts");
  assert.ok(robots.includes("resolveMarketingCanonicalOrigin"));
  assert.ok(sitemap.includes("resolveMarketingCanonicalOrigin"));
  assert.ok(!robots.includes("sitemap: `${SITE_URL}/sitemap.xml`"));
}

async function testLeadRoutesPassRequest() {
  for (const file of [
    "src/app/api/leads/route.ts",
    "src/app/api/valuation/route.ts",
    "src/app/api/tools/affordability-lead/route.ts",
    "src/app/api/tools/seller-readiness/route.ts",
    "src/app/api/route-planner/request/route.ts",
    "src/app/api/pre-construction/inquiry/route.ts",
  ]) {
    const src = read(file);
    assert.ok(
      src.includes("resolvePublicLeadRoutingContext") ||
        src.includes("resolveLeadDeskAssignmentForRequest") ||
        src.includes("publicResolveOrCreateLead"),
      file,
    );
  }
  const signUp = read("src/app/api/auth/sign-up/route.ts");
  assert.ok(signUp.includes("captureWebsiteLead({"));
  assert.ok(signUp.includes("request,"));
}

async function testWorkspaceLeadResolverHarness() {
  const scopeKeys = [
    "TENANT_DOMAIN_SCOPE",
    "TENANT_BRANDING_SCOPE",
    "TENANT_PUBLIC_LEAD_SCOPE",
  ] as const;
  const prev: Record<string, string | undefined> = {};
  for (const key of scopeKeys) {
    prev[key] = process.env[key];
    process.env[key] = "workspace";
  }
  clearHostResolutionCacheForTests();
  try {
    const deps = createFixtureHostResolutionDeps(FIXTURE_ROWS, {
      workspaceId: WS_HOUZZAT,
      workspaceSlug: "houzzat",
    });

    const sequence = [
      ["houzzat.com", WS_HOUZZAT],
      ["tenant-canary.houzzatpro.com", TENANT_B_TEST_WORKSPACE_ID],
      ["houzzat.com", WS_HOUZZAT],
      ["tenant-canary.houzzatpro.com", TENANT_B_TEST_WORKSPACE_ID],
    ] as const;

    for (const [host, expectedWs] of sequence) {
      const ws = await resolvePublicLeadWorkspaceIdFromRequest(req(host), deps);
      assert.equal(ws, expectedWs, host);
    }

    const unknown = await resolvePublicLeadWorkspaceIdFromRequest(
      req("unknown.houzzatpro.com"),
      deps,
    );
    assert.equal(unknown, null);

    const platform = await resolvePublicLeadWorkspaceIdFromRequest(
      req("houzzatpro.com"),
      deps,
    );
    assert.equal(platform, null);
  } finally {
    for (const key of scopeKeys) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
    clearHostResolutionCacheForTests();
  }
}

function testClientWorkspaceOverrideRejected() {
  const rejection = detectClientWorkspaceOverride({
    workspaceId: "evil",
    tenantSlug: "evil",
  });
  assert.ok(rejection?.rejected);
  assert.ok(rejection.keys.includes("workspaceId"));
}

function testPlatformBoundary() {
  assert.ok(blocksTenantHostnameResolution("houzzatpro.com"));
  assert.ok(blocksTenantHostnameResolution("www.houzzatpro.com"));
  assert.equal(blocksTenantHostnameResolution("tenant-canary.houzzatpro.com"), null);
}

function testAuthReadinessWiring() {
  const canary = read("wrangler.tenant-canary.jsonc");
  assert.ok(!canary.includes("NEXTAUTH_URL"));
  assert.ok(!canary.includes("AUTH_URL"));
  assert.equal(AUTH_ORIGIN_FOUNDATION_DOC.trustHost, true);
  assert.equal(authConfig.trustHost, true);
  assert.ok(authCookieOptionsAreHostOnly({ sessionToken: { options: {} } }));
}

function testLeadWritePathInventory() {
  assert.ok(PUBLIC_LEAD_WRITE_PATHS.length >= 6);
  const inquiry = PUBLIC_LEAD_WRITE_PATHS.find((p) => p.id === "listing-inquiry");
  assert.ok(inquiry?.usesRequestTenancy);
  const signup = PUBLIC_LEAD_WRITE_PATHS.find((p) => p.id === "signup");
  assert.ok(signup);
  assert.equal(signup?.usesRequestTenancy, true);
  assert.ok(PUBLIC_LEAD_CUTOVER_BLOCKERS.length >= 3);
}

function testSecondarySurfaceBrandingWiring() {
  const share = read("src/app/(marketing)/share/homes/[token]/page.tsx");
  assert.ok(share.includes("resolveMarketingPresentationBrand"));
  assert.ok(!share.includes("SITE_NAME"));

  const lp = read("src/app/(marketing)/lp/[slug]/page.tsx");
  assert.ok(lp.includes("resolveMarketingCanonicalOrigin"));
  assert.ok(!lp.includes('"https://houzzat.com"'));
  assert.ok(lp.includes("--tenant-primary-rgb"));

  for (const file of [
    "src/app/(marketing)/privacy/page.tsx",
    "src/app/(marketing)/terms/page.tsx",
    "src/app/(marketing)/delete-account/page.tsx",
  ]) {
    const src = read(file);
    assert.ok(src.includes("resolveMarketingLegalSiteContext"), file);
    assert.ok(!src.includes("SITE_NAME"), file);
  }
}

function testHomeValuationNoHouzzatHero() {
  const page = read("src/app/(marketing)/home-valuation/page.tsx");
  assert.ok(page.includes("resolveMarketingPresentationBrand"));
  assert.ok(!page.includes("SITE_NAME"));
  assert.ok(page.includes("--tenant-primary-rgb"));
}

async function main() {
  await testSecondaryPagesUseTenantMetadata();
  testTenantBSearchCanonicalWiring();
  await testTenantBMetadataCanonical();
  await testHouzzatMetadataCanonical();
  await testRobotsSitemapTenantAware();
  await testLeadRoutesPassRequest();
  await testWorkspaceLeadResolverHarness();
  testClientWorkspaceOverrideRejected();
  testPlatformBoundary();
  testAuthReadinessWiring();
  testLeadWritePathInventory();
  testHomeValuationNoHouzzatHero();
  testSecondarySurfaceBrandingWiring();
  console.log("tenant-cutover-readiness:selftest passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
